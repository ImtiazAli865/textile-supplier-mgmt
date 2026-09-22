import type { CustomerLedgerRow } from "@/lib/customer-ledger/types";
import { PaymentStatusActions } from "@/components/customer-payments/payment-status-actions";

const STATUS_LABEL: Record<string, string> = {
  received: "Received",
  cleared: "Cleared",
  bounced: "Bounced",
};

const STATUS_CLASS: Record<string, string> = {
  received: "bg-amber-100 text-amber-800",
  cleared: "bg-green-100 text-green-800",
  bounced: "bg-red-100 text-red-800",
};

/**
 * The Date / Description / PO Number / Debit / Credit / Balance table (FR-001), matching the
 * manual Excel ledger's own layout. Each source_type = 'payment' row additionally shows its
 * status badge, an attribution tooltip (createdAt/createdBy/statusChangedAt/statusChangedBy —
 * FR-014's "display" half, /sp.analyze finding G1), and Mark Cleared/Bounced actions when still
 * Received (User Story 3).
 */
export function LedgerTable({ rows }: { rows: CustomerLedgerRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No ledger entries in this range.
      </div>
    );
  }

  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
          <th className="py-2 pr-2">Date</th>
          <th className="py-2 pr-2">Description</th>
          <th className="py-2 pr-2">PO Number</th>
          <th className="py-2 pr-2 text-right">Debit</th>
          <th className="py-2 pr-2 text-right">Credit</th>
          <th className="py-2 pr-2 text-right">Balance</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => {
          const isPayment = row.sourceType === "payment";
          const attribution = isPayment
            ? `Recorded ${new Date(row.createdAt ?? row.entryDate).toLocaleDateString()} by ${row.createdBy ?? "—"}` +
              (row.statusChangedAt
                ? ` · Status changed ${new Date(row.statusChangedAt).toLocaleDateString()} by ${row.statusChangedBy ?? "—"}`
                : "")
            : undefined;

          return (
            <tr key={row.id} className="border-b border-zinc-100 align-top">
              <td className="py-2 pr-2 whitespace-nowrap">{new Date(row.entryDate).toLocaleDateString()}</td>
              <td className="py-2 pr-2">
                <span title={attribution}>{row.description ?? "—"}</span>
                {isPayment && row.paymentStatus && (
                  <span
                    className={`ml-2 rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CLASS[row.paymentStatus]}`}
                  >
                    {STATUS_LABEL[row.paymentStatus]}
                  </span>
                )}
                {isPayment && row.paymentStatus === "received" && row.sourceId && (
                  <div className="mt-1">
                    <PaymentStatusActions paymentId={row.sourceId} />
                  </div>
                )}
              </td>
              <td className="py-2 pr-2">{row.poNumbers.join(" / ") || "—"}</td>
              <td className="py-2 pr-2 text-right">{row.type === "debit" ? row.amount.toFixed(2) : ""}</td>
              <td className="py-2 pr-2 text-right">{row.type === "credit" ? row.amount.toFixed(2) : ""}</td>
              <td className="py-2 pr-2 text-right font-medium">{row.runningBalance.toFixed(2)}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
