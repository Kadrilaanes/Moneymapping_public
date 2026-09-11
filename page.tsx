import Link from "next/link";
import {
  getAvailableMonths,
  getCategories,
  getTransactionsForMonth,
} from "@/lib/queries";
import { CategoryEditor } from "./CategoryEditor";
import { MonthNav } from "./MonthNav";
import { SwipeMonth } from "./SwipeMonth";

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
}

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ month?: string }>;
}) {
  const params = await searchParams;

  let months, categories;
  try {
    [months, categories] = await Promise.all([getAvailableMonths(), getCategories()]);
  } catch (e) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="mb-2 text-lg font-semibold text-ink">Database not reachable</h1>
        <p className="text-sm text-muted">{(e as Error).message}</p>
      </main>
    );
  }

  const month = params.month && months.includes(params.month) ? params.month : months[0];
  const txns = month ? await getTransactionsForMonth(month) : [];
  const idx = months.indexOf(month);
  const prevMonth = months[idx + 1]; // older
  const nextMonth = idx > 0 ? months[idx - 1] : undefined; // newer

  return (
    <main className="mx-auto max-w-3xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Transactions</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Dashboard
        </Link>
      </div>

      {!month ? (
        <p className="text-sm text-muted">No transactions synced yet.</p>
      ) : (
        <>
          <MonthNav months={months} current={month} />

          <SwipeMonth prevMonth={prevMonth} nextMonth={nextMonth}>
            <div className="overflow-hidden rounded-lg border border-line bg-white">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-line text-left text-xs text-muted">
                    <th className="px-3 py-2 font-medium">Date</th>
                    <th className="px-3 py-2 font-medium">Merchant</th>
                    <th className="px-3 py-2 text-right font-medium">Amount</th>
                    <th className="px-3 py-2 font-medium">Category</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {txns.map((t) => (
                    <tr key={t.id} className={t.isInternalTransfer ? "opacity-50" : ""}>
                      <td className="whitespace-nowrap px-3 py-2 text-muted">{t.date.slice(5)}</td>
                      <td className="max-w-[220px] truncate px-3 py-2 text-ink" title={t.description}>
                        {t.counterparty || t.description || "—"}
                        {t.isInternalTransfer && (
                          <span className="ml-1.5 text-xs text-muted">(internal transfer)</span>
                        )}
                      </td>
                      <td
                        className={`whitespace-nowrap px-3 py-2 text-right tabular-nums ${
                          t.isInternalTransfer
                            ? "text-muted"
                            : t.amount < 0
                              ? "text-ink"
                              : "text-good"
                        }`}
                      >
                        {fmt(t.amount, t.currency)}
                      </td>
                      <td className="px-3 py-2">
                        <CategoryEditor
                          key={`${t.id}-${t.category}`}
                          id={t.id}
                          category={t.category ?? null}
                          categories={categories}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SwipeMonth>
        </>
      )}
    </main>
  );
}
