import type { Recurring } from "@/lib/analysis";
import { Card, EmptyState } from "@/app/components/SpendingByCategory";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);
}

export function RecurringCharges({ recurring }: { recurring: Recurring[] }) {
  if (recurring.length === 0) {
    return (
      <Card title="Recurring charges">
        <EmptyState text="Nothing detected yet — needs at least 3 stable-amount charges on the same cadence." />
      </Card>
    );
  }

  const annualTotal = recurring.reduce((sum, r) => sum + r.annualCost, 0);

  return (
    <Card title="Recurring charges" subtitle={`${fmt(annualTotal)}/yr total`}>
      <ul className="divide-y divide-line">
        {recurring.map((r) => (
          <li key={r.merchant} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <p className="truncate text-sm capitalize text-ink">{r.merchant}</p>
              <p className="text-xs text-muted">
                {r.cadence} · {fmt(r.typicalAmount)}
                {r.priceIncrease && (
                  <span className="ml-1.5 text-bad">
                    ↑ {fmt(r.priceIncrease.from)} → {fmt(r.priceIncrease.to)}
                  </span>
                )}
                {r.dormant && <span className="ml-1.5 text-muted">· dormant</span>}
              </p>
            </div>
            <span className="shrink-0 text-sm tabular-nums text-ink">{fmt(r.annualCost)}/yr</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}
