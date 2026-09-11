import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export async function POST(req: NextRequest) {
  const { accountId, ticker, shares, costBasis } = await req.json();

  if (!accountId || !ticker?.trim() || typeof shares !== "number" || shares <= 0) {
    return NextResponse.json(
      { error: "accountId, ticker, and a positive numeric shares are required" },
      { status: 400 },
    );
  }

  await db.query(
    "insert into holding (account_id, ticker, shares, cost_basis) values ($1, $2, $3, $4)",
    [accountId, ticker.trim().toUpperCase(), shares, costBasis ?? null],
  );

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
  await db.query("delete from holding where id = $1", [id]);
  return NextResponse.json({ ok: true });
}
