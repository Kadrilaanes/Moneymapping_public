import type { IncomeProjection } from "@/lib/analysis";
import { Card, EmptyState } from "./SpendingByCategory";

function fmt(n: number) {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency: "EUR" }).format(n);
}

export function ProjectedIncome({ projection }: { projection: IncomeProjection[] }) {
  const hasAnySource = projection.some((p) => p.sources.length > 0);

  if (!hasAnySource) {
    return (
      <Card title="Projected income">
        <EmptyState text="Not enough history yet — needs at least 3 same-cadence incoming payments from the same source." />
      </Card>
    );
  }

  const maxTotal = Math.max(...projection.map((p) => p.total), 1);

  return (
    <Card title="Projected income" subtitle={`next ${projection.length} months`}>
      <div className="space-y-4">
        {projection.map((p) => (
          <div key={p.month}>
            <div className="mb-1 flex items-center gap-3">
              <span className="w-16 shrink-0 text-sm text-ink">{p.month}</span>
              <div className="h-2 flex-1 rounded-full bg-line">
                <div
                  className="h-2 rounded-full bg-good"
                  style={{ width: `${(p.total / maxTotal) * 100}%` }}
                />
              </div>
              <span className="w-20 shrink-0 text-right text-sm font-medium tabular-nums text-good">
                {fmt(p.total)}
              </span>
            </div>
            <ul className="ml-[76px] space-y-0.5">
              {p.sources.map((s) => (
                <li key={s.merchant} className="flex justify-between text-xs text-muted">
                  <span className="capitalize">
                    {s.merchant} <span className="text-muted/70">· {s.cadence}</span>
                  </span>
                  <span className="tabular-nums">{fmt(s.amount)}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <p className="mt-4 border-t border-line pt-3 text-xs text-muted">
        Based on recurring income detected in your history, spread evenly per month — not exact pay
        dates. One-off or irregular income isn't included.
      </p>
    </Card>
  );
}
