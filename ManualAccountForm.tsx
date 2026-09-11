"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ManualAccountForm() {
  const [name, setName] = useState("");
  const [type, setType] = useState("savings");
  const [balance, setBalance] = useState("");
  const [liquid, setLiquid] = useState(true);
  const [interestRate, setInterestRate] = useState("");
  const [accruedInterest, setAccruedInterest] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !balance) return;
    setSaving(true);
    await fetch("/api/accounts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        type,
        balance: Number(balance),
        currency: "EUR",
        liquid,
        interestRate: interestRate ? Number(interestRate) : null,
        accruedInterest: accruedInterest ? Number(accruedInterest) : null,
      }),
    });
    setSaving(false);
    setName("");
    setBalance("");
    setInterestRate("");
    setAccruedInterest("");
    router.refresh();
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-line bg-white p-4">
      <div className="grid grid-cols-2 gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Account name (e.g. Revolut)"
          className="col-span-2 rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-line px-2 py-1.5 text-sm"
        >
          <option value="savings">Savings</option>
          <option value="investment">Investment</option>
          <option value="current">Current</option>
          <option value="card">Card</option>
          <option value="other">Other</option>
        </select>
        <input
          value={balance}
          onChange={(e) => setBalance(e.target.value)}
          placeholder="Balance (EUR)"
          inputMode="decimal"
          className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={interestRate}
          onChange={(e) => setInterestRate(e.target.value)}
          placeholder="Interest rate %/yr (optional)"
          inputMode="decimal"
          className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
        <input
          value={accruedInterest}
          onChange={(e) => setAccruedInterest(e.target.value)}
          placeholder="Interest earned so far (optional)"
          inputMode="decimal"
          className="rounded border border-line px-2 py-1.5 text-sm outline-none focus:border-accent"
        />
      </div>
      <label className="flex items-center gap-1.5 text-xs text-muted">
        <input type="checkbox" checked={liquid} onChange={(e) => setLiquid(e.target.checked)} />
        Reachable today (uncheck for a locked/fixed-term deposit)
      </label>
      <button
        type="submit"
        disabled={saving || !name.trim() || !balance}
        className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
      >
        {saving ? "Adding…" : "Add account"}
      </button>
    </form>
  );
}
