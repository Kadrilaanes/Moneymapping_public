"use client";

import { useState } from "react";

type Bank = { name: string; logo: string };

export function LinkBankForm() {
  const [country, setCountry] = useState("PT");
  const [banks, setBanks] = useState<Bank[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function loadBanks() {
    setLoading(true);
    setError(null);
    setBanks(null);
    try {
      const res = await fetch(`/api/auth/start?country=${country}`);
      if (!res.ok) throw new Error(await res.text());
      setBanks(await res.json());
    } catch {
      setError("Couldn't load banks for this country.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <select
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          className="rounded-md border border-line bg-white px-2 py-1.5 text-sm"
        >
          <option value="PT">Portugal</option>
          <option value="NL">Netherlands</option>
        </select>
        <button
          onClick={loadBanks}
          disabled={loading}
          className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
        >
          {loading ? "Loading…" : "Find banks"}
        </button>
      </div>

      {error && <p className="text-sm text-bad">{error}</p>}

      {banks && (
        <ul className="divide-y divide-line rounded-md border border-line bg-white">
          {banks.map((b) => (
            <li key={b.name} className="flex items-center justify-between px-3 py-2">
              <span className="text-sm text-ink">{b.name}</span>
              <a
                href={`/api/auth/start?bank=${encodeURIComponent(b.name)}&country=${country}`}
                className="text-sm text-accent hover:underline"
              >
                Link
              </a>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
