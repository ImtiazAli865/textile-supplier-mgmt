import Link from "next/link";
import { formatRs, type BatchPaymentState, type BatchPaymentStatus } from "@/lib/contractor-ledger/schema";

const STATUS: Record<BatchPaymentState, { label: string; className: string }> = {
  unpaid: { label: "Unpaid", className: "bg-red-100 text-red-800" },
  part_paid: { label: "Part-paid", className: "bg-amber-100 text-amber-800" },
  paid: { label: "Paid", className: "bg-green-100 text-green-800" },
};

export function BatchPaymentStatusBadge({ status }: { status: BatchPaymentState }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS[status].className}`}>
      {STATUS[status].label}
    </span>
  );
}

/** Completed batches with labour cost, paid, unpaid and status (FR-006). Used on the khata page
 * and, with a single row, on the batch detail page. */
export function BatchPaymentStatusTable({ batches }: { batches: BatchPaymentStatus[] }) {
  if (batches.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        No completed batches yet.
      </div>
    );
  }

  return (
    <table className="w-full rounded border border-zinc-200 bg-white text-sm text-zinc-900">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="px-4 py-2">Batch</th>
          <th className="px-4 py-2">Completed</th>
          <th className="px-4 py-2 text-right">Labour cost</th>
          <th className="px-4 py-2 text-right">Paid</th>
          <th className="px-4 py-2 text-right">Unpaid</th>
          <th className="px-4 py-2">Status</th>
        </tr>
      </thead>
      <tbody>
        {batches.map((batch) => (
          <tr key={batch.batchId} className="border-b border-zinc-100">
            <td className="px-4 py-2">
              <Link href={`/production-batches/${batch.batchId}`} className="underline">
                {batch.batchNumber}
              </Link>
            </td>
            <td className="px-4 py-2">{batch.completionDate}</td>
            <td className="px-4 py-2 text-right">{formatRs(batch.labourCost)}</td>
            <td className="px-4 py-2 text-right">{formatRs(batch.paid)}</td>
            <td className="px-4 py-2 text-right">{formatRs(batch.unpaid)}</td>
            <td className="px-4 py-2">
              <BatchPaymentStatusBadge status={batch.status} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
