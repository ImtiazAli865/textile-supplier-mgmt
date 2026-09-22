import "server-only";
import type { CustomerLedgerRow, CustomerLedgerSummary } from "@/lib/customer-ledger/types";

/** Standard CSV field escaping: wraps in double quotes and doubles any embedded quote whenever
 * the value contains a comma, quote, or newline. */
function csvField(value: string | number): string {
  const s = String(value);
  if (/[",\n]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function toCsv(header: string[], rows: (string | number)[][]): string {
  const lines = [header, ...rows].map((row) => row.map(csvField).join(","));
  return lines.join("\r\n") + "\r\n";
}

/** Renders the exact same rows the ledger view (getCustomerLedger) already produces as
 * text/csv — no separate data path, so an export can never diverge from what's on screen
 * (FR-012, SC-007, ADR-0007). */
export function renderLedgerCsv(rows: CustomerLedgerRow[]): string {
  return toCsv(
    ["Date", "Description", "PO Number", "Debit", "Credit", "Balance"],
    rows.map((row) => [
      row.entryDate,
      row.description ?? "",
      row.poNumbers.join(" / "),
      row.type === "debit" ? row.amount.toFixed(2) : "",
      row.type === "credit" ? row.amount.toFixed(2) : "",
      row.runningBalance.toFixed(2),
    ])
  );
}

/** Renders the exact same rows the all-customers summary (listCustomerLedgerSummaries) already
 * produces as text/csv (ADR-0007). */
export function renderSummaryCsv(rows: CustomerLedgerSummary[]): string {
  return toCsv(
    ["Customer", "Current Balance", "Overdue Amount"],
    rows.map((row) => [row.displayName, row.balance.toFixed(2), row.overdueAmount.toFixed(2)])
  );
}

/** Sanitizes a customer's display_name (005 — no format restriction) for safe use inside a
 * Content-Disposition filename: strips/replaces any character outside [A-Za-z0-9-_ ], since the
 * raw value could otherwise contain quotes, slashes, or newlines (/sp.analyze finding U2). */
export function sanitizeFilenamePart(value: string): string {
  return value.replace(/[^A-Za-z0-9-_ ]/g, "").trim() || "customer";
}
