import Link from "next/link";
import type { CustomerLedgerSummary } from "@/lib/customer-ledger/types";

/** All-customers summary table (FR-011) — current balance and overdue amount side by side,
 * without opening any individual customer's ledger. */
export function LedgerSummaryList({ summaries }: { summaries: CustomerLedgerSummary[] }) {
  if (summaries.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No customers yet.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="py-2 pr-2">Customer</th>
          <th className="py-2 pr-2 text-right">Current Balance</th>
          <th className="py-2 pr-2 text-right">Overdue Amount</th>
        </tr>
      </thead>
      <tbody>
        {summaries.map((summary) => (
          <tr key={summary.id} className="border-b border-zinc-100">
            <td className="py-2 pr-2">
              <Link href={`/customers/${summary.id}/ledger`} className="underline hover:text-zinc-900">
                {summary.displayName}
              </Link>
            </td>
            <td className="py-2 pr-2 text-right font-medium">Rs {summary.balance.toFixed(2)}</td>
            <td className="py-2 pr-2 text-right">
              {summary.overdueAmount > 0 ? (
                <span className="text-amber-800">Rs {summary.overdueAmount.toFixed(2)}</span>
              ) : (
                <span className="text-zinc-400">—</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
