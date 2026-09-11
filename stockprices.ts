/**
 * Finnhub quote client. Free tier: 60 calls/minute — enough to poll every
 * 30-60s for a handful of tickers without hitting limits.
 *
 * FINNHUB_API_KEY is server-only and must never reach the browser. Unlike
 * the bank sync (a hard 4-calls/day cap you must never exceed), stock quotes
 * are cheap and rate-generous, so this is called directly from an API route
 * on each client poll rather than cached in the DB.
 */

const API = "https://finnhub.io/api/v1";

export type Quote = {
  symbol: string;
  price: number;
  changePercent: number;
};

async function call<T>(path: string): Promise<T> {
  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) throw new Error("FINNHUB_API_KEY is not set");

  const url = new URL(API + path);
  url.searchParams.set("token", apiKey);

  const res = await fetch(url, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`Finnhub ${res.status} on ${path}: ${await res.text()}`);
  }
  return res.json() as Promise<T>;
}

/** Raw Finnhub /quote shape: c=current, d=change, dp=percent change. */
type FinnhubQuote = { c: number; d: number; dp: number };

let cachedRate: { rate: number; expires: number } | null = null;

/**
 * Finnhub's plain tickers (no exchange prefix) resolve to the primary US
 * listing, quoted in USD — but this app's accounts are EUR. Without this,
 * a €1,736 Revolut position showed as €2,008: the raw USD number displayed
 * with a euro sign. Frankfurter is free, keyless, ECB-sourced daily rates —
 * no second API key needed just to convert currencies.
 */
async function usdToEurRate(): Promise<number> {
  const now = Date.now();
  if (cachedRate && cachedRate.expires > now) return cachedRate.rate;

  const res = await fetch("https://api.frankfurter.app/latest?from=USD&to=EUR", {
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`FX rate fetch failed: ${res.status}`);
  const data = (await res.json()) as { rates: { EUR: number } };

  cachedRate = { rate: data.rates.EUR, expires: now + 60 * 60 * 1000 }; // 1h — FX doesn't need per-poll freshness
  return cachedRate.rate;
}

export async function getQuote(symbol: string): Promise<Quote> {
  const [q, fxRate] = await Promise.all([
    call<FinnhubQuote>(`/quote?symbol=${encodeURIComponent(symbol)}`),
    usdToEurRate(),
  ]);
  // changePercent is currency-agnostic (a relative move), so it's untouched.
  return { symbol, price: q.c * fxRate, changePercent: q.dp };
}

export async function getQuotes(symbols: string[]): Promise<Quote[]> {
  // Finnhub has no batch-quote endpoint on the free tier — one call per
  // symbol, run concurrently (still well under the 60/min limit for a
  // personal portfolio's worth of tickers).
  return Promise.all(symbols.map(getQuote));
}
