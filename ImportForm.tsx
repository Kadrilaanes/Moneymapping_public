"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Account } from "@/lib/analysis";

const BANK_FORMATS = [
  { value: "ing-nl", label: "ING NL" },
  { value: "rabo-nl", label: "Rabobank NL" },
];

export function ImportForm({ accounts }: { accounts: Account[] }) {
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [bank, setBank] = useState(BANK_FORMATS[0].value);
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!accountId || !file) return;
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const csv = await file.text();
      const res = await fetch("/api/transactions/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId, csv, bank }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? "Import failed.");
      } else {
        setResult(
          `Found ${json.parsed} transactions — ${json.inserted} new, ${json.skipped} already had it.`,
        );
        setFile(null);
        router.refresh();
      }
    } catch {
      setError("Import failed.");
    } finally {
      setUploading(false);
    }
  }

  if (accounts.length === 0) {
    return <p className="text-sm text-muted">Link or register an account above first.</p>;
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-md border border-line bg-white p-4">
      <select
        value={accountId}
        onChange={(e) => setAccountId(e.target.value)}
        className="w-full rounded border border-line px-2 py-1.5 text-sm"
      >
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </select>
      <select
        value={bank}
        onChange={(e) => setBank(e.target.value)}
        className="w-full rounded border border-line px-2 py-1.5 text-sm"
      >
        {BANK_FORMATS.map((b) => (
          <option key={b.value} value={b.value}>
            {b.label}
          </option>
        ))}
      </select>
      <input
        type="file"
        accept=".csv"
        onChange={(e) => setFile(e.target.files?.[0] ?? null)}
        className="w-full text-sm"
      />
      {error && <p className="text-xs text-bad">{error}</p>}
      {result && <p className="text-xs text-good">{result}</p>}
      <button
        type="submit"
        disabled={uploading || !file}
        className="rounded-md bg-ink px-3 py-1.5 text-sm text-paper disabled:opacity-50"
      >
        {uploading ? "Importing…" : "Import CSV"}
      </button>
    </form>
  );
}
