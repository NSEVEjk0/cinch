/**
 * Accounting export (#10).
 *
 * Turns a circle's whole settlement history into a flat, accountant-friendly
 * ledger — one row per settled transfer across every clearing — and serialises
 * it as CSV or JSON. This is the record a treasury or bookkeeper actually
 * imports, beyond the per-settlement PDF certificate.
 */

import type { Circle } from "./circle";
import { partyName } from "./circle";
import { formatAmount } from "./money";

export interface LedgerRow {
  settlementId: string;
  date: string;
  from: string;
  fromAddress: string;
  to: string;
  toAddress: string;
  amount: string;
  token: string;
  references: string;
  mode: string;
  txRef: string;
}

function label(circle: Circle, address: string): string {
  const n = partyName(circle, address);
  return n.startsWith("0x") ? n : n;
}

/** Flatten every settled transfer in a circle's history into ledger rows. */
export function circleLedgerRows(circle: Circle): LedgerRow[] {
  const rows: LedgerRow[] = [];
  for (const s of circle.settlements ?? []) {
    const tx = s.txRefs.find(Boolean) ?? "";
    for (const t of s.transfers) {
      rows.push({
        settlementId: s.id,
        date: s.at,
        from: label(circle, t.from),
        fromAddress: t.from,
        to: label(circle, t.to),
        toAddress: t.to,
        amount: formatAmount(BigInt(t.amount), t.tokenDecimals),
        token: t.tokenSymbol,
        references: t.references.join("; "),
        mode: s.atomic ? "atomic" : "leg-by-leg",
        txRef: tx,
      });
    }
  }
  return rows;
}

const COLUMNS: { key: keyof LedgerRow; header: string }[] = [
  { key: "date", header: "Date" },
  { key: "from", header: "From" },
  { key: "fromAddress", header: "From address" },
  { key: "to", header: "To" },
  { key: "toAddress", header: "To address" },
  { key: "amount", header: "Amount" },
  { key: "token", header: "Token" },
  { key: "references", header: "References" },
  { key: "mode", header: "Settlement" },
  { key: "txRef", header: "Transaction" },
  { key: "settlementId", header: "Settlement ID" },
];

function csvCell(v: string): string {
  // Quote if the value contains a comma, quote, or newline.
  if (/[",\n]/.test(v)) return `"${v.replace(/"/g, '""')}"`;
  return v;
}

export function toCsv(circle: Circle): string {
  const rows = circleLedgerRows(circle);
  const head = COLUMNS.map((c) => c.header).join(",");
  const body = rows.map((r) => COLUMNS.map((c) => csvCell(r[c.key])).join(",")).join("\n");
  return `${head}\n${body}`;
}

export function toJson(circle: Circle): string {
  return JSON.stringify(
    {
      circle: circle.name,
      exportedAt: new Date().toISOString(),
      settlements: circle.settlements?.length ?? 0,
      rows: circleLedgerRows(circle),
    },
    null,
    2
  );
}

/** Trigger a browser download of the export. */
export function downloadExport(circle: Circle, format: "csv" | "json"): void {
  if (typeof window === "undefined") return;
  const content = format === "csv" ? toCsv(circle) : toJson(circle);
  const mime = format === "csv" ? "text/csv" : "application/json";
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safe = circle.name.replace(/[^a-z0-9]+/gi, "-").toLowerCase();
  a.href = url;
  a.download = `cinch-${safe}-ledger.${format}`;
  a.click();
  URL.revokeObjectURL(url);
}
