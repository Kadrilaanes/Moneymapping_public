import Link from "next/link";
import type { Cashflow } from "@/lib/analysis";
import type { CategoryInfo } from "@/lib/queries";

const CATEGORY_COLORS: Record<string, string> = {
  Groceries: "#1a7f4e",
  "Eating out": "#c77d1f",
  Transport: "#2954a3",
  Housing: "#5b3fa8",
  Utilities: "#0f7a8c",
  Health: "#b3261e",
  Childcare: "#a3348f",
  Subscriptions: "#6b5b3a",
  Shopping: "#8a4b08",
  "Cash withdrawal": "#4b5563",
  Uncategorised: "#9ca3af",
};

function colorFor(cat: string) {
  return CATEGORY_COLORS[cat] ?? "#6b7280";
}

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
}

export function SpendingByCategory({
  cashflow,
  selectedMonth,
  categories,
  prevMonth,
  nextMonth,
  expectedIncome = 0,
  isCurrentMonth = false,
}: {
  cashflow: Cashflow[];
  selectedMonth?: Cashflow;
  categories: CategoryInfo[];
  prevMonth?: string;
  nextMonth?: string;
  /** Recurring income expected this month — see CLAUDE.md: a partial current
   *  month looks falsely disastrous before salary/benefits land. */
  expectedIncome?: number;
  isCurrentMonth?: boolean;
}) {
  const trend = cashflow.slice(-6);

  if (!selectedMonth) {
    return (
      <Card title="Spending by category">
        <EmptyState text="No transactions synced yet. Once /api/sync has run, monthly spending shows up here." />
      </Card>
    );
  }

  // Only "expense" categories belong in a spending breakdown — income and
  // transfers are excluded by kind, not by hardcoding category names.
  const expenseNames = new Set(
    categories.filter((c) => c.kind === "expense").map((c) => c.name),
  );
  const rows = Object.entries(selectedMonth.byCategory)
    .filter(([cat]) => expenseNames.has(cat) || !categories.some((c) => c.name === cat))
    .sort((a, b) => b[1] - a[1]);
  const maxAmount = Math.max(...rows.map(([, v]) => v), 1);

  return (
    <Card
      title="Spending by category"
      nav={
        <div className="flex items-center gap-2 text-xs">
          <Link
            href={prevMonth ? `/?month=${prevMonth}` : "#"}
            className={prevMonth ? "text-accent hover:underline" : "pointer-events-none text-muted/40"}
          >
            ←
          </Link>
          <span className="text-muted">{selectedMonth.month}</span>
          <Link
            href={nextMonth ? `/?month=${nextMonth}` : "#"}
            className={nextMonth ? "text-accent hover:underline" : "pointer-events-none text-muted/40"}
          >
            →
          </Link>
        </div>
      }
    >
      <div className="mb-3 grid grid-cols-3 gap-3 border-b border-line pb-4">
        <Stat label={isCurrentMonth ? "Income (so far)" : "Income"} value={fmt(selectedMonth.income)} tone="good" />
        <Stat label="Spending" value={fmt(selectedMonth.spending)} />
        <Stat
          label={isCurrentMonth ? "Net (so far)" : "Net"}
          value={fmt(selectedMonth.net)}
          tone={selectedMonth.net >= 0 ? "good" : "bad"}
        />
      </div>

      {isCurrentMonth && expectedIncome > selectedMonth.income && (
        <p className="mb-4 rounded-md bg-paper px-3 py-2 text-xs text-muted">
          {selectedMonth.month} isn't over — recurring income (~{fmt(expectedIncome)}) likely hasn't
          all landed yet. Once it does, projected net:{" "}
          <span
            className={
              expectedIncome - selectedMonth.spending >= 0 ? "font-medium text-good" : "font-medium text-bad"
            }
          >
            {fmt(expectedIncome - selectedMonth.spending)}
          </span>
        </p>
      )}

      <div className="space-y-2">
        {rows.length === 0 && <EmptyState text="No spending recorded this month." />}
        {rows.map(([cat, amount]) => (
          <div key={cat} className="flex items-center gap-3">
            <span className="w-28 shrink-0 truncate text-sm text-ink">{cat}</span>
            <div className="h-2 flex-1 rounded-full bg-line">
              <div
                className="h-2 rounded-full"
                style={{
                  width: `${(amount / maxAmount) * 100}%`,
                  background: colorFor(cat),
                }}
              />
            </div>
            <span className="w-20 shrink-0 text-right text-sm tabular-nums text-muted">
              {fmt(amount)}
            </span>
          </div>
        ))}
      </div>

      <div className="mt-6 border-t border-line pt-4">
        <p className="mb-2 text-xs uppercase tracking-wide text-muted">Last {trend.length} months</p>
        <div className="flex items-end gap-2">
          {trend.map((m) => {
            const maxSpend = Math.max(...trend.map((x) => x.spending), 1);
            return (
              <Link
                key={m.month}
                href={`/?month=${m.month}`}
                className="flex flex-1 flex-col items-center gap-1"
              >
                <div className="flex h-24 w-full items-end">
                  <div
                    className={`w-full rounded-t ${m.month === selectedMonth.month ? "bg-ink" : "bg-accent"}`}
                    style={{ height: `${(m.spending / maxSpend) * 100}%` }}
                    title={fmt(m.spending)}
                  />
                </div>
                <span className="text-[10px] text-muted">{m.month.slice(5)}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </Card>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: "good" | "bad" }) {
  const color = tone === "good" ? "text-good" : tone === "bad" ? "text-bad" : "text-ink";
  return (
    <div>
      <p className="text-xs text-muted">{label}</p>
      <p className={`text-lg font-semibold tabular-nums ${color}`}>{value}</p>
    </div>
  );
}

export function Card({
  title,
  subtitle,
  nav,
  children,
}: {
  title: string;
  subtitle?: string;
  nav?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-lg border border-line bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-sm font-semibold text-ink">{title}</h2>
        {nav ?? (subtitle && <span className="text-xs text-muted">{subtitle}</span>)}
      </div>
      {children}
    </section>
  );
}

export function EmptyState({ text }: { text: string }) {
  return <p className="text-sm text-muted">{text}</p>;
}
