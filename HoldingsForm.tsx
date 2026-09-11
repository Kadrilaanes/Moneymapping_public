"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/analysis";
import type { HoldingInfo } from "@/lib/queries";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IE", { maximumFractionDigits: 8 }).format(n);
}

export function HoldingsForm({
  investmentAccounts,
  holdings,
}: {
  investmentAccounts: Account[];
  holdings: HoldingInfo[];
}) {
  const [accountId, setAccountId] = useState(investmentAccounts[0]?.id ?? "");
  const [ticker, setTicker] = useState("");
  const [shares, setShares] = useState("");
  const [costBasis, setCostBasis] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !ticker.trim() || !shares) return;
    setSaving(true);
    await fetch("/api/holdings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        accountId,
        ticker: ticker.trim(),
        shares: Number(shares),
        costBasis: costBasis ? Number(costBasis) : null,
      }),
    });
    setSaving(false);
    setTicker("");
    setShares("");
    setCostBasis("");
    router.refresh();
  }

  async function remove(id: number) {
    await fetch(`/api/holdings?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  if (investmentAccounts.length === 0) {
    return (
      <p className="text-sm text-muted">
        Register an investment-type account above first (e.g. Revolut), then add its holdings here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {holdings.length > 0 && (
        <ul className="divide-y divide-line rounded-lg border border-line bg-white">
          {holdings.map((h) => (
            <li key={h.id} className="flex items-center justify-between px-4 py-2.5">
              <div>
                <p className="text-sm text-ink">
                  {h.ticker} <span className="text-muted">· {fmt(h.shares)} shares</span>
                </p>
                <p className="text-xs text-muted">
                  {h.accountName}
                  {h.costBasis != null && ` · cost basis €${fmt(h.costBasis)}`}
                </p>
              </div>
              <button
                onClick={() => remove(h.id)}
                className="text-xs text-bad hover:underline"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={submit} className="space-y-2 rounded-md border border-line bg-white p-4">
        <div className="grid grid-cols-2 gap-2">
          <select
            value={accountId}
            onChange={(e) => setAccountId(e.target.value)}
            className="col-span-2 rounded border border-line px-2 py-1.5 text-sm"
          >
            {investmentAccounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>
          <input
            value={ticker}
            onChange={(e) => setTicker(e.target.value)}
            placeholder="Ticker (e.g. AAPL)"
            className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={shares}
            onChange={(e) => setShares(e.target.value)}
            placeholder="Shares"
            inputMode="decimal"
            className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
          <input
            value={costBasis}
            onChange={(e) => setCostBasis(e.target.value)}
            placeholder="Cost basis € (optional)"
            inputMode="decimal"
            className="col-span-2 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
          />
        </div>
        <button
          type="submit"
          disabled={saving || !ticker.trim() || !shares}
          className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add holding"}
        </button>
      </form>
    </div>
  );
}
