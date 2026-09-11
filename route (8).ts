import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { getBalances, getTransactions, getSession, EbTransaction } from "@/lib/enablebanking";
import { categorise, markInternalTransfers, normaliseMerchant, Txn, Account } from "@/lib/analysis";
import { getRules } from "@/lib/rules";
import { db } from "@/lib/db";

export const maxDuration = 60;

/**
 * POST /api/sync — run this from a cron, once or twice a day. Do NOT call it
 * on page load: most banks cap transaction fetches at ~4 per account per day
 * and will start returning 429 (or suspend the connection) if you hammer them.
 */
export async function POST() {
  const [{ rows: accounts }, rules, { rows: categoryRows }] = await Promise.all([
    db.query(
      `select a.*, s.valid_until, s.status
         from account a join bank_session s on s.id = a.session_id`,
    ),
    getRules(),
    db.query(`select name, kind from category`),
  ]);
  // A category learned as "transfer" kind (e.g. a corrected credit-card bill
  // payment) must exclude future matches from spending too, not just the one
  // transaction the user fixed by hand.
  const categoryKind = new Map<string, string>(categoryRows.map((c) => [c.name, c.kind]));

  const report: Record<string, unknown>[] = [];
  const allNew: Txn[] = [];

  for (const acc of accounts) {
    // Consent expires roughly every 90 days. Surface it rather than letting
    // sync silently stop and your dashboard quietly go stale.
    if (new Date(acc.valid_until) < new Date()) {
      report.push({ account: acc.name, status: "consent_expired", reauthorise: true });
      continue;
    }

    try {
      const session = await getSession(acc.session_id);
      if (session.status !== "AUTHORIZED") {
        report.push({ account: acc.name, status: session.status.toLowerCase() });
        continue;
      }

      const balances = await getBalances(acc.uid);
      // CLBD (closing booked) is the one that matches your banking app.
      const booked = balances.find((b) => b.balance_type === "CLBD") ?? balances[0];
      const balance = Number(booked.balance_amount.amount);

      await db.query(
        "update account set balance = $1, balance_synced_at = now() where id = $2",
        [balance, acc.id],
      );
      await db.query(
        `insert into balance_snapshot (account_id, taken_on, balance)
         values ($1, current_date, $2) on conflict do nothing`,
        [acc.id, balance],
      );

      // Overlap the window by a week: banks routinely backdate and amend
      // bookings for a few days after the fact.
      const { rows: [last] } = await db.query(
        "select max(booking_date) as d from transaction where account_id = $1",
        [acc.id],
      );
      const from = last?.d
        ? new Date(new Date(last.d).getTime() - 7 * 86_400_000)
        : new Date(Date.now() - 400 * 86_400_000);

      const raw = await getTransactions(acc.uid, from.toISOString().slice(0, 10));
      const txns = raw.map((t) => toTxn(t, acc.id));
      allNew.push(...txns);

      let inserted = 0;
      for (const t of txns) {
        const category = categorise(t, rules);
        const { rowCount } = await db.query(
          `insert into transaction
             (id, account_id, booking_date, amount, currency, counterparty,
              counterparty_iban, description, mcc, category, is_internal_transfer, raw)
           values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
           on conflict (id) do nothing`,
          [t.id, t.accountId, t.date, t.amount, t.currency, t.counterparty,
           t.counterpartyIban ?? null, t.description, t.mcc ?? null, category,
           categoryKind.get(category) === "transfer",
           JSON.stringify(raw.find((r) => toTxn(r, acc.id).id === t.id))],
        );
        inserted += rowCount ?? 0;
      }

      report.push({ account: acc.name, status: "ok", fetched: txns.length, inserted, balance });
    } catch (e) {
      report.push({ account: acc.name, status: "error", message: (e as Error).message });
    }
  }

  // Transfer detection needs every account in view at once, so it runs last.
  const { rows: recent } = await db.query(
    `select id, account_id as "accountId", booking_date::text as date, amount::float,
            currency, counterparty, counterparty_iban as "counterpartyIban", description
       from transaction where booking_date > current_date - interval '60 days'`,
  );
  const { rows: accts } = await db.query(`select id, iban from account`);

  for (const t of markInternalTransfers(recent as Txn[], accts as Account[])) {
    if (t.isInternalTransfer) {
      await db.query("update transaction set is_internal_transfer = true where id = $1", [t.id]);
    }
  }

  return NextResponse.json({ syncedAt: new Date().toISOString(), accounts: report });
}

function toTxn(t: EbTransaction, accountId: string): Txn {
  const outgoing = t.credit_debit_indicator === "DBIT";
  const amount = Number(t.transaction_amount.amount) * (outgoing ? -1 : 1);
  const counterparty = (outgoing ? t.creditor?.name : t.debtor?.name) ?? "";
  const description = (t.remittance_information ?? []).join(" ").trim();
  const date = t.booking_date ?? t.value_date ?? t.transaction_date!;

  // Not every bank returns entry_reference, and some reuse it across accounts.
  // Hash the immutable fields as a fallback so re-syncs never duplicate.
  const id =
    t.entry_reference ?? t.transaction_id ??
    createHash("sha256")
      .update([accountId, date, amount, normaliseMerchant(counterparty + description)].join("|"))
      .digest("hex")
      .slice(0, 32);

  return {
    id, accountId, date, amount,
    currency: t.transaction_amount.currency,
    counterparty,
    counterpartyIban: outgoing ? t.creditor_account?.iban : t.debtor_account?.iban,
    description,
    mcc: t.merchant_category_code,
  };
}
