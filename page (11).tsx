import Link from "next/link";
import { getAccounts, getConsentStatus, getHoldings } from "@/lib/queries";
import { LinkBankForm } from "./LinkBankForm";
import { ManualAccountForm } from "./ManualAccountForm";
import { HoldingsForm } from "./HoldingsForm";
import { ImportForm } from "./ImportForm";

function fmt(n: number, currency = "EUR") {
  return new Intl.NumberFormat("en-IE", { style: "currency", currency }).format(n);
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ linked?: string; error?: string }>;
}) {
  const params = await searchParams;

  let accounts, consents, holdings;
  try {
    [accounts, consents, holdings] = await Promise.all([
      getAccounts(),
      getConsentStatus(),
      getHoldings(),
    ]);
  } catch (e) {
    return (
      <main className="mx-auto max-w-lg px-4 py-16">
        <h1 className="mb-2 text-lg font-semibold text-ink">Database not reachable</h1>
        <p className="text-sm text-muted">{(e as Error).message}</p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-lg font-semibold text-ink">Settings</h1>
        <Link href="/" className="text-sm text-accent hover:underline">
          ← Dashboard
        </Link>
      </div>

      {params.linked && (
        <p className="mb-4 rounded-md bg-good/10 px-3 py-2 text-sm text-good">
          Account linked. It'll appear here once the next sync runs.
        </p>
      )}
      {params.error && (
        <p className="mb-4 rounded-md bg-bad/10 px-3 py-2 text-sm text-bad">{params.error}</p>
      )}

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Linked accounts</h2>
        {accounts.length === 0 ? (
          <p className="text-sm text-muted">None yet — link one below.</p>
        ) : (
          <ul className="divide-y divide-line rounded-lg border border-line bg-white">
            {accounts.map((a) => {
              const consent = consents.find((c) => c.account === a.name);
              const expiringSoon = consent && consent.daysLeft <= 7;
              return (
                <li key={a.id} className="flex items-center justify-between px-4 py-3">
                  <div>
                    <p className="text-sm text-ink">
                      {a.name} <span className="text-muted">· {a.type}</span>
                      {!a.liquid && <span className="text-muted"> · locked</span>}
                      {!consent && a.id.startsWith("manual-") && (
                        <span className="text-muted"> · manual</span>
                      )}
                    </p>
                    {a.interestRate != null && (
                      <p className="text-xs text-muted">
                        {a.interestRate}%/yr
                        {a.accruedInterest != null && ` · ${fmt(a.accruedInterest, a.currency)} earned so far`}
                      </p>
                    )}
                    {consent && (
                      <p className={`text-xs ${expiringSoon ? "text-bad" : "text-muted"}`}>
                        {consent.bank} · consent {expiringSoon ? "expires" : "valid"} in{" "}
                        {consent.daysLeft}d
                        {expiringSoon && (
                          <a
                            href={`/api/auth/start?bank=${encodeURIComponent(consent.bank)}&country=PT`}
                            className="ml-2 text-accent hover:underline"
                          >
                            Re-authorise
                          </a>
                        )}
                      </p>
                    )}
                  </div>
                  <span className="text-sm tabular-nums text-ink">{fmt(a.balance, a.currency)}</span>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Import transactions from CSV</h2>
        <p className="mb-3 text-xs text-muted">
          No live bank sync set up? Export a statement from your bank and upload it here.
          Supports ING NL and Rabobank NL export formats. Re-uploading the same file is safe —
          transactions already in the database are skipped, not duplicated.
        </p>
        <ImportForm accounts={accounts} />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Link a new account</h2>
        <LinkBankForm />
      </section>

      <section className="mb-8">
        <h2 className="mb-3 text-sm font-semibold text-ink">Register a manual account</h2>
        <p className="mb-3 text-xs text-muted">
          For holdings Enable Banking can't sync — e.g. a Revolut investment, or a savings
          account you haven't linked. Balances here don't update automatically.
        </p>
        <ManualAccountForm />
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-ink">Stock holdings</h2>
        <p className="mb-3 text-xs text-muted">
          Add positions to an investment account and the dashboard shows shares × live price
          instead of a manually-updated balance. Needs <code className="rounded bg-line px-1 py-0.5">FINNHUB_API_KEY</code> set.
        </p>
        <HoldingsForm
          investmentAccounts={accounts.filter((a) => a.type === "investment")}
          holdings={holdings}
        />
      </section>
    </main>
  );
}
