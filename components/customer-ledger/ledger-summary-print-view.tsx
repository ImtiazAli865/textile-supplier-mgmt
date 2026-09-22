import type { CustomerLedgerSummaryPrintView } from "@/lib/customer-ledger/types";

/** Printable all-customers summary layout (ADR-0006). */
export function LedgerSummaryPrintView({ view }: { view: CustomerLedgerSummaryPrintView }) {
  return (
    <div className="mx-auto max-w-2xl bg-white p-8 text-zinc-900 print:p-0">
      <style>{`
        @media print {
          @page { size: A4; margin: 16mm; }
          body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      <header className="mb-6 border-b border-zinc-300 pb-4">
        <h1 className="text-xl font-bold">Customer Ledger — Summary</h1>
        <p className="mt-1 text-xs text-zinc-500">Generated {new Date(view.generatedAt).toLocaleString()}</p>
      </header>

      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b-2 border-zinc-400 text-left">
            <th className="py-1 pr-2">Customer</th>
            <th className="py-1 pr-2 text-right">Current Balance</th>
            <th className="py-1 pr-2 text-right">Overdue Amount</th>
          </tr>
        </thead>
        <tbody>
          {view.rows.map((row) => (
            <tr key={row.id} className="border-b border-zinc-200">
              <td className="py-1 pr-2">{row.displayName}</td>
              <td className="py-1 pr-2 text-right">{row.balance.toFixed(2)}</td>
              <td className="py-1 pr-2 text-right">{row.overdueAmount > 0 ? row.overdueAmount.toFixed(2) : "—"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
