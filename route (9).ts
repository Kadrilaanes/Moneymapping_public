import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { db } from "@/lib/db";

const TYPES = ["current", "savings", "investment", "card", "other"];

/**
 * Register a holding that isn't reachable through Enable Banking sync —
 * e.g. a Revolut investment account, or a savings account at a bank you
 * haven't linked. `session_id` stays null: nothing here is ever auto-synced,
 * so update the balance by hand as it changes.
 */
export async function POST(req: NextRequest) {
  const { name, type, balance, currency, liquid, interestRate, accruedInterest } = await req.json();

  if (!name?.trim() || !TYPES.includes(type) || typeof balance !== "number") {
    return NextResponse.json(
      { error: `name, type (${TYPES.join("|")}), and numeric balance are required` },
      { status: 400 },
    );
  }

  const id = `manual-${randomUUID()}`;
  await db.query(
    `insert into account
       (id, session_id, name, type, liquid, balance, currency, balance_synced_at,
        interest_rate, accrued_interest)
     values ($1, null, $2, $3, $4, $5, $6, now(), $7, $8)`,
    [
      id,
      name.trim(),
      type,
      liquid ?? true,
      balance,
      currency ?? "EUR",
      interestRate ?? null,
      accruedInterest ?? null,
    ],
  );

  return NextResponse.json({ ok: true, id });
}
