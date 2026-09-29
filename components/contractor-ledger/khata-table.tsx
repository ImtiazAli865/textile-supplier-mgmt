import Link from "next/link";
import { describeBalance, formatRs, type KhataRow } from "@/lib/contractor-ledger/schema";

const SOURCE_LABELS: Record<KhataRow["sourceType"], string> = {
  production_batch: "Earning",
  payment: "Payment",
  payment_reversal: "Payment reversal",
  opening_balance: "Opening balance",
  adjustment: "Adjustment",
};

/**
 * The contractor khata (FR-004): date order, earned / owed up and paid / owed down columns, and a
 * running balance where a negative balance reads as an advance (FR-005). When a from date is
 * applied, the first row is the balance brought forward (FR-008).
 */
export function KhataTable({ rows, broughtForward }: { rows: KhataRow[]; broughtForward: number | null }) {
  if (rows.length === 0 && broughtForward === null) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No entries yet. Earnings appear here automatically when this contractor&apos;s batches are completed.
      </div>
    );
  }

  return (
    <table className="w-full rounded border border-zinc-200 bg-white text-sm text-zinc-900">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="px-4 py-2">Date</th>
          <th className="px-4 py-2">Description</th>
          <th className="px-4 py-2">Reference</th>
          <th className="px-4 py-2 text-right">Earned / owed up</th>
          <th className="px-4 py-2 text-right">Paid / owed down</th>
          <th className="px-4 py-2 text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {broughtForward !== null && (
          <tr className="border-b border-zinc-100 bg-zinc-50">
            <td className="px-4 py-2 text-zinc-500" colSpan={5}>
              Brought forward
            </td>
            <td className="px-4 py-2 text-right font-medium">{describeBalance(broughtForward)}</td>
          </tr>
        )}
        {rows.map((row) => (
          <tr key={row.id} className="border-b border-zinc-100">
            <td className="whitespace-nowrap px-4 py-2">{row.entryDate}</td>
            <td className="px-4 py-2">
              <span className="block">{row.description || SOURCE_LABELS[row.sourceType]}</span>
              <span className="text-xs text-zinc-500">{SOURCE_LABELS[row.sourceType]}</span>
            </td>
            <td className="px-4 py-2">
              {row.batch ? (
                <Link href={`/production-batches/${row.batch.id}`} className="underline">
                  {row.batch.batchNumber}
                </Link>
              ) : row.paymentId ? (
                <a href={`#payment-${row.paymentId}`} className="underline">
                  Payment
                </a>
              ) : (
                "—"
              )}
            </td>
            <td className="px-4 py-2 text-right">{row.credit !== null ? formatRs(row.credit) : ""}</td>
            <td className="px-4 py-2 text-right">{row.debit !== null ? formatRs(row.debit) : ""}</td>
            <td className="whitespace-nowrap px-4 py-2 text-right font-medium">{describeBalance(row.runningBalance)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
