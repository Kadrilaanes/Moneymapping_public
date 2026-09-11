import { NextRequest, NextResponse } from "next/server";
import { normaliseMerchant } from "@/lib/analysis";
import { db } from "@/lib/db";

/**
 * A manual correction from the UI. Writes the rule once, then re-applies it
 * to every other transaction from the same merchant — see CLAUDE.md's
 * correction loop: fix a merchant once, never fix it again.
 */
export async function POST(req: NextRequest) {
  const { transactionId, category, kind } = await req.json();
  if (!transactionId || !category || !["income", "expense", "transfer"].includes(kind)) {
    return NextResponse.json(
      { error: "transactionId, category and a valid kind are required" },
      { status: 400 },
    );
  }

  const { rows } = await db.query(
    "select counterparty, description from transaction where id = $1",
    [transactionId],
  );
  if (!rows[0]) return NextResponse.json({ error: "not found" }, { status: 404 });

  // The category's kind — not its name — decides whether this counts as
  // spending. "transfer" is excluded the same way a bank-detected internal
  // transfer is (see CLAUDE.md): moving money to savings is never spending.
  const isInternal = kind === "transfer";

  await db.query(
    `insert into category (name, kind) values ($1, $2)
     on conflict (name) do update set kind = excluded.kind`,
    [category, kind],
  );

  const pattern = normaliseMerchant(rows[0].counterparty || rows[0].description || "");
  if (!pattern) {
    await db.query(
      "update transaction set category = $1, is_internal_transfer = $2 where id = $3",
      [category, isInternal, transactionId],
    );
    return NextResponse.json({ ok: true, updated: 1 });
  }

  await db.query(
    `insert into category_rule (pattern, category, source)
     values ($1, $2, 'user')
     on conflict (pattern) do update set category = excluded.category, source = 'user'`,
    [pattern, category],
  );

  // Retroactive: every past transaction from this merchant was miscategorised
  // the same way, so fix them all rather than leaving the rest wrong.
  const { rows: candidates } = await db.query(
    "select id, counterparty, description from transaction where category is distinct from $1",
    [category],
  );
  const ids = candidates
    .filter((t) => normaliseMerchant(t.counterparty || t.description || "") === pattern)
    .map((t) => t.id);

  if (ids.length) {
    await db.query(
      "update transaction set category = $1, is_internal_transfer = $2 where id = any($3)",
      [category, isInternal, ids],
    );
  }

  return NextResponse.json({ ok: true, updated: ids.length });
}
