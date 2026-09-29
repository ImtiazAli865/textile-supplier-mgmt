"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { reverseContractorPayment } from "@/app/actions/contractor-ledger";
import { formatRs, type ContractorPaymentItem } from "@/lib/contractor-ledger/schema";

/** Inline reason + confirm (not window.confirm): the reason is required (FR-018). */
function ReverseControl({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit() {
    if (!reason.trim()) {
      setError("A reason is required.");
      return;
    }
    setError(null);
    setIsSubmitting(true);
    try {
      const result = await reverseContractorPayment({ paymentId, reason });
      if (result.success) {
        setOpen(false);
        setReason("");
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-600 underline hover:text-zinc-900"
      >
        Reverse
      </button>
    );
  }

  return (
    <div className="mt-2 space-y-2 rounded border border-amber-200 bg-amber-50 p-3">
      <p className="text-xs text-amber-900">
        Reversing keeps this payment on record, adds an offsetting entry dated today, and frees any
        batches it paid.
      </p>
      <input
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        placeholder="Reason (required)"
        className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
      />
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={submit}
          disabled={isSubmitting}
          className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
        >
          {isSubmitting ? "Reversing…" : "Confirm reversal"}
        </button>
        <button
          type="button"
          onClick={() => {
            setOpen(false);
            setError(null);
          }}
          className="text-xs text-zinc-600 underline"
        >
          Cancel
        </button>
      </div>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}

/** A contractor's payments (FR-013, US4): batches and amounts, the unlinked remainder, and
 * reversal details. Reversed payments stay listed, greyed. */
export function PaymentList({ payments }: { payments: ContractorPaymentItem[] }) {
  if (payments.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-6 text-center text-sm text-zinc-500">
        No payments recorded yet.
      </div>
    );
  }

  return (
    <ul className="divide-y divide-zinc-100 rounded border border-zinc-200 bg-white text-sm text-zinc-900">
      {payments.map((payment) => {
        const reversed = payment.status === "reversed";
        return (
          <li key={payment.id} id={`payment-${payment.id}`} className={`px-4 py-3 ${reversed ? "bg-zinc-50 text-zinc-500" : ""}`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <div>
                <span className={`font-medium ${reversed ? "line-through" : ""}`}>{formatRs(payment.amount)}</span>{" "}
                <span className="text-zinc-500">cash · {payment.paymentDate}</span>
                {reversed && (
                  <span className="ml-2 rounded-full bg-zinc-200 px-2 py-0.5 text-xs font-medium text-zinc-700">
                    reversed
                  </span>
                )}
              </div>
              {!reversed && <ReverseControl paymentId={payment.id} />}
            </div>
            <div className="mt-1 text-xs">
              {payment.allocations.length > 0 ? (
                <span>
                  {payment.allocations.map((allocation, index) => (
                    <span key={allocation.batchId}>
                      {index > 0 && ", "}
                      <Link href={`/production-batches/${allocation.batchId}`} className="underline">
                        {allocation.batchNumber}
                      </Link>{" "}
                      {formatRs(allocation.amount)}
                    </span>
                  ))}
                </span>
              ) : (
                <span>No batches linked</span>
              )}
              {payment.unlinked > 0 && <span> · Unlinked (advance) {formatRs(payment.unlinked)}</span>}
            </div>
            {payment.note && <p className="mt-1 text-xs">Note: {payment.note}</p>}
            <p className="mt-1 text-xs text-zinc-400">
              Recorded {new Date(payment.createdAt).toLocaleString()} by {payment.createdBy}
            </p>
            {reversed && (
              <p className="mt-1 text-xs">
                Reversed {payment.reversedAt ? new Date(payment.reversedAt).toLocaleString() : ""} by{" "}
                {payment.reversedBy ?? "—"}: {payment.reversalReason}
              </p>
            )}
          </li>
        );
      })}
    </ul>
  );
}
