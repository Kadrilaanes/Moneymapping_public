import { NextRequest, NextResponse } from "next/server";
import { categorise, markInternalTransfers, type Txn, type Account } from "@/lib/analysis";
import { parseIngNlCsv, csvAccountInfo as ingAccountInfo } from "@/lib/importers/ing-nl";
import { parseRaboNlCsv, csvAccountInfo as raboAccountInfo } from "@/lib/importers/rabo-nl";
import { getRules } from "@/lib/rules";
import { db } from "@/lib/db";

/** Add a new bank export format here: one parser + one balance reader. */
const IMPORTERS: Record<
  string,
  { parse: typeof parseIngNlCsv; accountInfo: typeof ingAccountInfo; label: string }
> = {
  "ing-nl": { parse: parseIngNlCsv, accountInfo: ingAccountInfo, label: "ING NL" },
  "rabo-nl": { parse: parseRaboNlCsv, accountInfo: raboAccountInfo, label: "Rabobank NL" },
};

/**
 * POST /api/transactions/import — manual statement upload, for when there's
 * no live bank sync set up (or as a one-off backfill). Same categorisation
 * and internal-transfer logic as /api/sync, just sourced from a file instead
 * of Enable Banking.
 */
export async function POST(req: NextRequest) {
  const { accountId, csv, bank } = await req.json();
  if (!accountId || !csv) {
    return NextResponse.json({ error: "accountId and csv are required" }, { status: 400 });
  }

  const importer = IMPORTERS[bank] ?? IMPORTERS["ing-nl"];

  const [rules, { rows: categoryRows }] = await Promise.all([
    getRules(),
    db.query(`select name, kind from category`),
  ]);
  const categoryKind = new Map<string, string>(categoryRows.map((c) => [c.name, c.kind]));

  let txns: Txn[];
  try {
    txns = importer.parse(csv, accountId);
  } catch (e) {
    return NextResponse.json({ error: `Couldn't parse CSV: ${(e as Error).message}` }, { status: 400 });
  }

  let inserted = 0;
  for (const t of txns) {
    const category = categorise(t, rules);
    const { rowCount } = await db.query(
      `insert into transaction
         (id, account_id, booking_date, amount, currency, counterparty, counterparty_iban, description, category, is_internal_transfer, raw)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (id) do nothing`,
      [
        t.id, t.accountId, t.date, t.amount, t.currency, t.counterparty, t.counterpartyIban ?? null,
        t.description, category, categoryKind.get(category) === "transfer", JSON.stringify(t),
      ],
    );
    inserted += rowCount ?? 0;
  }

  const { lastBalance } = importer.accountInfo(csv);
  await db.query(
    "update account set balance = $1, balance_synced_at = now() where id = $2",
    [lastBalance, accountId],
  );

  // Transfer detection needs every account in view at once, so it runs last
  // — same as /api/sync.
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

  return NextResponse.json({ ok: true, parsed: txns.length, inserted, skipped: txns.length - inserted });
}
