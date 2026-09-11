/**
 * Parser for ING NL's "alle_mutaties" CSV export:
 * Date;Name / Description;Account;Counterparty;Code;Debit/credit;
 * Amount (EUR);Transaction type;Notifications;Resulting balance;Tag
 *
 * Shared between scripts/analyze-fixture.ts (no DB, just testing rules) and
 * the real /api/transactions/import route.
 */
import { createHash } from "node:crypto";
import { normaliseMerchant, type Txn } from "../analysis";

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

function toTxn(row: Record<string, string>, accountId: string): Txn {
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

  return { id, accountId, date, amount, currency: "EUR", counterparty, description };
}

export function parseIngNlCsv(text: string, accountId: string): Txn[] {
  return parseCsv(text)
    .map((row) => toTxn(row, accountId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The IBAN in the CSV's own "Account" column, and the last row's running balance (rows are newest-first). */
export function csvAccountInfo(text: string): { iban: string; lastBalance: number } {
  const rows = parseCsv(text);
  return {
    iban: rows[0]?.Account ?? "",
    lastBalance: Number(rows[0]?.["Resulting balance"]?.replace(".", "").replace(",", ".") ?? "0"),
  };
}
