/**
 * Parser for Rabobank NL's CSV account export (download from "Mijn
 * bankzaken" as a date-range CSV). Comma-delimited, quoted fields, columns:
 *
 * IBAN/BBAN,Munt,BIC,Volgnr,Datum,Rentedatum,Bedrag,Saldo na trn,
 * Tegenrekening IBAN/BBAN,Naam tegenpartij,Naam uiteindelijke partij,
 * Naam initiërende partij,BIC tegenpartij,Code,Batch ID,Transactiereferentie,
 * Machtigingskenmerk,Incassant ID,Betalingskenmerk,Omschrijving-1,
 * Omschrijving-2,Omschrijving-3,Reden retour,Oorspr bedrag,Oorspr munt,Koers
 *
 * Unlike ING's export, amount is a single signed column (no separate
 * debit/credit flag) and there's an explicit counterparty IBAN, which
 * markInternalTransfers can use directly instead of falling back to
 * amount/date pairing.
 *
 * Shared between scripts/analyze-fixture.ts (no DB) and the real
 * /api/transactions/import route.
 */
import { createHash } from "node:crypto";
import { normaliseMerchant, type Txn } from "../analysis";

/** RFC4180-ish: Rabobank quotes every field and free-text columns
 *  (Naam tegenpartij, Omschrijving-*) can legitimately contain commas, so a
 *  plain split(",") would misalign the row. Handles "" as an escaped quote. */
function splitCsvLine(line: string): string[] {
  const cells: string[] = [];
  let cell = "";
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQuotes) {
      if (c === '"' && line[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        cell += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      cells.push(cell);
      cell = "";
    } else {
      cell += c;
    }
  }
  cells.push(cell);
  return cells;
}

function parseCsv(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const header = splitCsvLine(lines[0]);
  return lines.slice(1).map((line) => {
    const cells = splitCsvLine(line);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] ?? ""]));
  });
}

/** "1.234,56" or "-45,30" -> 1234.56 / -45.3. Dot is a thousands separator
 *  here, never a decimal point — same convention ING's export uses. */
function parseAmount(raw: string): number {
  return Number(raw.replace(/\./g, "").replace(",", "."));
}

function toTxn(row: Record<string, string>, accountId: string): Txn {
  const d = row.Datum ?? "";
  const date = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  const amount = parseAmount(row.Bedrag ?? "0");
  const counterparty = row["Naam tegenpartij"] || row["Naam uiteindelijke partij"] || "";
  const description = [row["Omschrijving-1"], row["Omschrijving-2"], row["Omschrijving-3"]]
    .filter(Boolean)
    .join(" ")
    .trim();
  const counterpartyIban = row["Tegenrekening IBAN/BBAN"] || undefined;

  const id = createHash("sha256")
    .update(["rabo-nl", date, amount, normaliseMerchant(counterparty + " " + description)].join("|"))
    .digest("hex")
    .slice(0, 32);

  return {
    id,
    accountId,
    date,
    amount,
    currency: row.Munt || "EUR",
    counterparty,
    counterpartyIban,
    description,
  };
}

export function parseRaboNlCsv(text: string, accountId: string): Txn[] {
  return parseCsv(text)
    .map((row) => toTxn(row, accountId))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/** The IBAN in the CSV's own column, and the balance after the
 *  latest-dated row. Unlike ING's export, row order isn't guaranteed
 *  newest-first, so this picks the max date (ties broken by Volgnr) rather
 *  than assuming a position. */
export function csvAccountInfo(text: string): { iban: string; lastBalance: number } {
  const rows = parseCsv(text);
  if (rows.length === 0) return { iban: "", lastBalance: 0 };

  const latest = rows.reduce((best, r) => {
    if (r.Datum > best.Datum) return r;
    if (r.Datum === best.Datum && Number(r.Volgnr || 0) > Number(best.Volgnr || 0)) return r;
    return best;
  });

  return {
    iban: rows[0]["IBAN/BBAN"] ?? "",
    lastBalance: parseAmount(latest["Saldo na trn"] ?? "0"),
  };
}
