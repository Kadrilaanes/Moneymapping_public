import Link from "next/link";
import { getDashboardData } from "@/lib/queries";
import { SpendingByCategory } from "@/app/components/SpendingByCategory";
import { RecurringCharges } from "@/app/components/RecurringCharges";
import { GoalProgress } from "@/app/components/GoalProgress";
import { SavingsOverview } from "@/app/components/SavingsOverview";
import { ProjectedIncome } from "@/app/components/ProjectedIncome";

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;

  let data;
  try {
    data = await getDashboardData(params.month);
  } catch (e) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="mb-2 text-lg font-semibold text-ink">Database not reachable</h1>
        <p className="text-sm text-muted">
          Set <code className="rounded bg-line px-1 py-0.5">DATABASE_URL</code> and run{" "}
          <code className="rounded bg-line px-1 py-0.5">db/schema.sql</code> against it.
        </p>
        <p className="mt-3 text-xs text-muted">{(e as Error).message}</p>
      </main>
    );
  }

  const totalBalance = data.accounts.reduce((s, a) => s + a.balance, 0);
  const currency = data.accounts[0]?.currency ?? "EUR";

  const idx = data.cashflow.findIndex((c) => c.month === data.selectedMonth?.month);
  const prevMonth = idx > 0 ? data.cashflow[idx - 1].month : undefined;
  const nextMonth = idx >= 0 && idx < data.cashflow.length - 1 ? data.cashflow[idx + 1].month : undefined;

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <header className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-ink">MoneyMap</h1>
          <p className="text-sm text-muted">
            {data.accounts.length} account{data.accounts.length === 1 ? "" : "s"} ·{" "}
            {fmt(totalBalance, currency)} total
          </p>
        </div>
        <div className="flex gap-4">
          <Link href="/transactions" className="text-sm text-accent hover:underline">
            Transactions
          </Link>
          <Link href="/settings" className="text-sm text-accent hover:underline">
            Settings
          </Link>
        </div>
      </header>

      {!data.hasAnyData && (
        <p className="mb-6 rounded-md border border-line bg-white px-4 py-3 text-sm text-muted">
          No transactions yet. Link an account under Settings, then wait for the next{" "}
          <code className="rounded bg-line px-1 py-0.5">/api/sync</code> run.
        </p>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <div className="md:col-span-2">
          <SpendingByCategory
            cashflow={data.cashflow}
            selectedMonth={data.selectedMonth}
            categories={data.categories}
            prevMonth={prevMonth}
            nextMonth={nextMonth}
            expectedIncome={data.expectedIncome}
            isCurrentMonth={data.isCurrentMonth}
          />
        </div>
        <RecurringCharges recurring={data.recurring} />
        <GoalProgress goal={data.goal} accounts={data.accounts} />
        <div className="md:col-span-2">
          <ProjectedIncome projection={data.incomeProjection} />
        </div>
        <div className="md:col-span-2">
          <SavingsOverview accounts={data.accounts} />
        </div>
      </div>
    </main>
  );
}
