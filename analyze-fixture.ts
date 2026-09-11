/**
 * Run categorisation/recurring-detection against a real bank CSV export
 * without touching a database or the bank API. Per CLAUDE.md: rules should
 * be tuned against real statements before trusting any report.
 *
 * Usage: npm run fixture -- fixtures/ing-nl.csv
 *
 * Only ING NL's "alle_mutaties" export format is supported for now
 * (Date;Name / Description;Account;Counterparty;Code;Debit/credit;
 * Amount (EUR);Transaction type;Notifications;Resulting balance;Tag).
 */
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { categorise, findRecurring, monthlyCashflow, normaliseMerchant, type Txn } from "../lib/analysis.ts";

// Node's plain ESM loader (used to run this script directly) requires
// explicit extensions on every relative import, transitively — which
// conflicts with lib/importers/ing-nl.ts being written for Next's bundler
// (no extensions). Small, deliberate duplication rather than fighting that.
const path = process.argv[2];
if (!path) {
  console.error("usage: npm run fixture -- <path-to-csv>");
  process.exit(1);
}

function splitLine(line: string): string[] {
  return line.split(";").map((c) => c.replace(/^"|"$/g, ""));
}
function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(Boolean);
  const header = splitLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i]]));
  });
}
function toTxn(row: Record<string, string>): Txn {
  const date = `${row.Date.slice(0, 4)}-${row.Date.slice(4, 6)}-${row.Date.slice(6, 8)}`;
  const amount =
    Number(row["Amount (EUR)"].replace(".", "").replace(",", ".")) *
    (row["Debit/credit"] === "Debit" ? -1 : 1);
  const counterparty = row["Name / Description"];
  const description = row["Notifications"] ?? "";
  const id = createHash("sha256")
    .update(["ing-nl", date, amount, normaliseMerchant(counterparty + description)].join("|"))
    .digest("hex")
    .slice(0, 32);
  return { id, accountId: row["Account"], date, amount, currency: "EUR", counterparty, description };
}

const txns = parseCsv(readFileSync(path, "utf8"))
  .map(toTxn)
  .sort((a, b) => a.date.localeCompare(b.date));

const categorised = txns.map((t) => ({ ...t, category: categorise(t) }));
const uncategorised = categorised.filter((t) => t.category === "Uncategorised");

console.log(`${txns.length} transactions, ${txns[0]?.date} to ${txns.at(-1)?.date}`);
console.log(
  `categorised: ${txns.length - uncategorised.length}/${txns.length} ` +
    `(${(((txns.length - uncategorised.length) / txns.length) * 100).toFixed(0)}%)`,
);

const byMerchant = new Map<string, { count: number; total: number }>();
for (const t of uncategorised) {
  const key = normaliseMerchant(t.counterparty);
  const entry = byMerchant.get(key) ?? { count: 0, total: 0 };
  entry.count++;
  entry.total += Math.abs(t.amount);
  byMerchant.set(key, entry);
}
const topUncategorised = [...byMerchant.entries()].sort((a, b) => b[1].total - a[1].total);

console.log(`\nuncategorised merchants, by total €:`);
for (const [merchant, { count, total }] of topUncategorised.slice(0, 25)) {
  console.log(`  €${total.toFixed(0).padStart(6)}  (${count}x)  ${merchant}`);
}

console.log(`\nrecurring charges detected: ${findRecurring(categorised).length}`);
for (const r of findRecurring(categorised)) {
  console.log(
    `  ${r.merchant.padEnd(30)} ${r.cadence.padEnd(9)} €${r.typicalAmount.toFixed(2)} -> €${r.annualCost.toFixed(0)}/yr${r.dormant ? "  [dormant]" : ""}`,
  );
}

console.log(`\nmonthly cashflow:`);
for (const m of monthlyCashflow(categorised)) {
  console.log(`  ${m.month}  income €${m.income.toFixed(0).padStart(6)}  spend €${m.spending.toFixed(0).padStart(6)}  net €${m.net.toFixed(0)}`);
}
