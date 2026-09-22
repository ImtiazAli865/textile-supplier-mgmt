import type { CustomerLedgerPrintView } from "@/lib/customer-ledger/types";

/**
 * Printable per-customer ledger layout (ADR-0006, third application) — a report, not a business
 * document issued to the customer, so no letterhead/signature/stamp images (research.md). Staff
 * use the browser's native Print → Save as PDF. Rendered only by
 * app/customers/[customerId]/ledger/print/page.tsx.
 */
export function LedgerPrintView({ view }: { view: CustomerLedgerPrintView }) {
  return (
    <div className="mx-auto max-w-3xl bg-white p-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <header className="mb-6 border-b border-zinc-300 pb-4">
        <h1 className="text-xl font-bold">{view.customerDisplayName} — Customer Ledger</h1>
        <p className="text-sm text-zinc-600">{view.customerLegalName}</p>
        <p className="mt-1 text-xs text-zinc-500">
          Generated {new Date(view.generatedAt).toLocaleString()}
          {view.fromDate ? ` · From ${view.fromDate}` : ""}
          {view.toDate ? ` · To ${view.toDate}` : ""}
        </p>
      </header>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-400 text-left">
            <th className="py-1 pr-2">Date</th>
            <th className="py-1 pr-2">Description</th>
            <th className="py-1 pr-2">PO Number</th>
            <th className="py-1 pr-2 text-right">Debit</th>
            <th className="py-1 pr-2 text-right">Credit</th>
            <th className="py-1 pr-2 text-right">Balance</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-200">
              <td className="py-1 pr-2">{new Date(row.entryDate).toLocaleDateString()}</td>
              <td className="py-1 pr-2">{row.description ?? "—"}</td>
              <td className="py-1 pr-2">{row.poNumbers.join(" / ") || "—"}</td>
              <td className="py-1 pr-2 text-right">{row.type === "debit" ? row.amount.toFixed(2) : ""}</td>
              <td className="py-1 pr-2 text-right">{row.type === "credit" ? row.amount.toFixed(2) : ""}</td>
              <td className="py-1 pr-2 text-right">{row.runningBalance.toFixed(2)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="flex justify-end">
        <p className="text-sm font-semibold">Current balance: Rs {view.currentBalance.toFixed(2)}</p>
      </div>
    </div>
  );
}
