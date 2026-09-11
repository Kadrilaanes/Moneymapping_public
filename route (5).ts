import { NextRequest, NextResponse } from "next/server";
import { getQuotes } from "@/lib/stockprices";
import { db } from "@/lib/db";

export type PortfolioHolding = {
  ticker: string;
  shares: number;
  price: number;
  changePercent: number;
  value: number;
  costBasis: number | null;
};

/** GET /api/portfolio?accountId=... — live value of an account's holdings. */
export async function GET(req: NextRequest) {
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) return NextResponse.json({ error: "accountId required" }, { status: 400 });

  const { rows } = await db.query(
    "select ticker, shares::float, cost_basis::float as \"costBasis\" from holding where account_id = $1",
    [accountId],
  );
  if (!rows.length) return NextResponse.json({ holdings: [], total: 0 });

  let quotes;
  try {
    quotes = await getQuotes(rows.map((r) => r.ticker));
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 502 });
  }
  const priceByTicker = new Map(quotes.map((q) => [q.symbol, q]));

  const holdings: PortfolioHolding[] = rows.map((r) => {
    const q = priceByTicker.get(r.ticker);
    return {
      ticker: r.ticker,
      shares: r.shares,
      price: q?.price ?? 0,
      changePercent: q?.changePercent ?? 0,
      value: (q?.price ?? 0) * r.shares,
      costBasis: r.costBasis ?? null,
    };
  });

  return NextResponse.json({
    holdings,
    total: holdings.reduce((s, h) => s + h.value, 0),
  });
}
