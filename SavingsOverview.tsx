"use client";

import { useEffect, useState } from "react";
import type { Account } from "@/lib/analysis";
import type { PortfolioHolding } from "@/app/api/portfolio/route";
import { Card, EmptyState } from "./SpendingByCategory";

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
}

/** Annual yield -> per-day. `balance` is the source of truth; this is display-only. */
function dailyRate(a: Account): number {
  if (!a.interestRate) return 0;
  return (a.balance * a.interestRate) / 100 / 365;
}

export function SavingsOverview({ accounts }: { accounts: Account[] }) {
  const relevant = accounts.filter((a) => a.type === "savings" || a.type === "investment");

  // Ticks once a second so accounts with a known yield visibly accrue —
  // purely a display animation; nothing here is written back to the DB.
  // Starts null so server-rendered HTML and the client's first render match
  // (Date.now() would differ between the two and fail hydration); the real
  // clock only starts after mount.
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Investment accounts report their live portfolio value up here so the
  // header total reflects real prices, not the stale stored balance.
  const [liveValues, setLiveValues] = useState<Record<string, number>>({});

  if (relevant.length === 0) {
    return (
      <Card title="Savings & investments">
        <EmptyState text="No savings or investment accounts yet — add one in Settings." />
      </Card>
    );
  }

  const total = relevant.reduce((s, a) => s + (liveValues[a.id] ?? a.balance), 0);
  const totalDaily = relevant.reduce((s, a) => s + dailyRate(a), 0);

  return (
    <Card title="Savings & investments" subtitle={fmt(total)}>
      {totalDaily > 0 && (
        <div className="mb-4 grid grid-cols-3 gap-3 border-b border-line pb-4 text-center">
          <Stat label="Per day" value={fmt(totalDaily)} />
          <Stat label="Per month" value={fmt(totalDaily * 30.44)} />
          <Stat label="Per year" value={fmt(totalDaily * 365)} />
        </div>
      )}
      <ul className="divide-y divide-line">
        {relevant.map((a) =>
          a.type === "investment" ? (
            <InvestmentRow
              key={a.id}
              account={a}
              onValue={(v) => setLiveValues((prev) => ({ ...prev, [a.id]: v }))}
            />
          ) : (
            <AccountRow key={a.id} account={a} now={now} />
          ),
        )}
      </ul>
    </Card>
  );
}

function InvestmentRow({ account, onValue }: { account: Account; onValue: (value: number) => void }) {
  const [data, setData] = useState<{ holdings: PortfolioHolding[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function poll() {
      try {
        const res = await fetch(`/api/portfolio?accountId=${account.id}`);
        const json = await res.json();
        if (cancelled) return;
        if (!res.ok) {
          setError(json.error ?? "Couldn't fetch live prices.");
        } else {
          setData(json);
          setError(null);
          if (json.holdings.length > 0) onValue(json.total);
        }
      } catch {
        if (!cancelled) setError("Couldn't fetch live prices.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    poll();
    const id = setInterval(poll, 30_000);
    return () => {
      cancelled = true;
      clearInterval(id);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [account.id]);

  const hasHoldings = !!data && data.holdings.length > 0;
  const displayValue = hasHoldings ? data.total : account.balance;

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink">
            {account.name} <span className="text-muted">· {account.type}</span>
          </p>
          <p className="text-xs text-muted">
            {loading
              ? "loading live price…"
              : error
                ? error
                : hasHoldings
                  ? "live"
                  : "fluctuates — updated manually"}
          </p>
        </div>
        <span className="text-sm tabular-nums text-ink">{fmt(displayValue, account.currency)}</span>
      </div>
      {hasHoldings && (
        <ul className="mt-1.5 space-y-0.5">
          {data.holdings.map((h) => (
            <li key={h.ticker} className="flex items-center justify-between text-xs">
              <span className="text-muted">
                {h.ticker} · {h.shares} sh @ {fmt(h.price, account.currency)}
              </span>
              <span className={h.changePercent >= 0 ? "text-good" : "text-bad"}>
                {h.changePercent >= 0 ? "+" : ""}
                {h.changePercent.toFixed(2)}% · {fmt(h.value, account.currency)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </li>
  );
}

function AccountRow({ account, now }: { account: Account; now: number | null }) {
  const daily = dailyRate(account);
  const since = account.balanceSyncedAt ? new Date(account.balanceSyncedAt).getTime() : now;
  const secondsElapsed = now != null && since != null ? Math.max(0, (now - since) / 1000) : 0;
  const live = (account.accruedInterest ?? 0) + (daily / 86_400) * secondsElapsed;

  return (
    <li className="py-3">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-ink">
            {account.name} <span className="text-muted">· {account.type}</span>
            {!account.liquid && <span className="text-muted"> · locked</span>}
          </p>
          <p className="text-xs text-muted">
            {account.interestRate != null ? `${account.interestRate}%/yr` : "fluctuates — updated manually"}
          </p>
        </div>
        <span className="text-sm tabular-nums text-ink">{fmt(account.balance, account.currency)}</span>
      </div>
      {account.interestRate != null && (
        <div className="mt-1.5 flex items-center justify-between text-xs">
          <span className="text-muted">
            {fmt(daily, account.currency)}/day · {fmt(daily * 30.44, account.currency)}/mo ·{" "}
            {fmt(daily * 365, account.currency)}/yr
          </span>
          <span className="tabular-nums text-good">+€{live.toFixed(6)} earned</span>
        </div>
      )}
    </li>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className="text-sm font-semibold tabular-nums text-ink">{value}</p>
    </div>
  );
}
