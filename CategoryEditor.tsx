"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { CategoryInfo, CategoryKind } from "@/lib/queries";

const KIND_LABELS: Record<CategoryKind, string> = {
  expense: "Outgoing",
  income: "Income",
  transfer: "Transfer",
};

export function CategoryEditor({
  id,
  category,
  categories,
}: {
  id: string;
  category: string | null;
  categories: CategoryInfo[];
}) {
  const initial = categories.find((c) => c.name === category);
  const [kind, setKind] = useState<CategoryKind>(initial?.kind ?? "expense");
  const [name, setName] = useState(category ?? "Uncategorised");
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const router = useRouter();

  const options = categories.filter((c) => c.kind === kind);

  async function save(nextName: string, nextKind: CategoryKind) {
    if (!nextName.trim()) return;
    setSaving(true);
    await fetch("/api/transactions/categorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ transactionId: id, category: nextName.trim(), kind: nextKind }),
    });
    setSaving(false);
    router.refresh();
  }

  function onKindChange(next: CategoryKind) {
    setKind(next);
    setCreating(false);
    const firstMatch = categories.find((c) => c.kind === next);
    const nextName = firstMatch?.name ?? "";
    setName(nextName);
    if (nextName) save(nextName, next);
  }

  function onCategoryChange(value: string) {
    if (value === "__new__") {
      setCreating(true);
      setNewName("");
      return;
    }
    setCreating(false);
    setName(value);
    save(value, kind);
  }

  function submitNew() {
    if (!newName.trim()) {
      setCreating(false);
      return;
    }
    setName(newName.trim());
    setCreating(false);
    save(newName.trim(), kind);
  }

  return (
    <div className="flex items-center gap-1.5">
      <select
        value={kind}
        onChange={(e) => onKindChange(e.target.value as CategoryKind)}
        className="rounded border border-line bg-white px-1 py-0.5 text-xs text-muted"
      >
        {(Object.keys(KIND_LABELS) as CategoryKind[]).map((k) => (
          <option key={k} value={k}>
            {KIND_LABELS[k]}
          </option>
        ))}
      </select>

      {creating ? (
        <input
          autoFocus
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onBlur={submitNew}
          onKeyDown={(e) => e.key === "Enter" && submitNew()}
          placeholder="New category name"
          className="w-32 rounded border border-accent px-1.5 py-0.5 text-xs outline-none"
        />
      ) : (
        <select
          value={name}
          onChange={(e) => onCategoryChange(e.target.value)}
          className="w-32 rounded border border-line bg-white px-1 py-0.5 text-xs text-ink"
        >
          {!options.some((o) => o.name === name) && name && <option value={name}>{name}</option>}
          {options.map((o) => (
            <option key={o.name} value={o.name}>
              {o.name}
            </option>
          ))}
          <option value="__new__">+ New category…</option>
        </select>
      )}

      {saving && <span className="text-[10px] text-muted">saving…</span>}
    </div>
  );
}
