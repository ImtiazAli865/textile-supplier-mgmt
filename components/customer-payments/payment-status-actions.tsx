"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { updateCustomerPaymentStatus } from "@/app/actions/customer-payments";

/**
 * "Mark Cleared"/"Mark Bounced" actions for a Received payment — rendered only when the row's
 * paymentStatus is 'received' (both other statuses are terminal, FR-007). Marking Bounced posts
 * a reversing ledger credit dated to today (data-model.md); router.refresh() picks up both the
 * new ledger row and the updated status, same pattern as
 * components/customers/deactivate-reactivate-control.tsx.
 */
export function PaymentStatusActions({ paymentId }: { paymentId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function changeStatus(newStatus: "cleared" | "bounced") {
    if (newStatus === "bounced") {
      const confirmed = window.confirm(
        "Mark this cheque as Bounced? A new reversing credit entry will be posted immediately, dated today."
      );
      if (!confirmed) return;
    }

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await updateCustomerPaymentStatus({ id: paymentId, newStatus });
      if (result.success) {
        router.refresh();
        return;
      }
      setError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <span className="inline-flex items-center gap-2">
      <button
        type="button"
        onClick={() => changeStatus("cleared")}
        disabled={isSubmitting}
        className="rounded border border-zinc-300 px-2 py-0.5 text-xs font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        Mark Cleared
      </button>
      <button
        type="button"
        onClick={() => changeStatus("bounced")}
        disabled={isSubmitting}
        className="rounded border border-red-300 px-2 py-0.5 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        Mark Bounced
      </button>
      {error && <span className="text-xs text-red-600">{error}</span>}
    </span>
  );
}
