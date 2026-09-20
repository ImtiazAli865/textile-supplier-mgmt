"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { cancelCustomerPO, reactivateCustomerPO } from "@/app/actions/customer-pos";
import type { CustomerPOStatus } from "@/lib/customer-pos/schema";

export function CustomerPoStatusControl({
  poId,
  status,
}: {
  poId: string;
  status: CustomerPOStatus;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const targetStatus: CustomerPOStatus = status === "open" ? "cancelled" : "open";
  const label = status === "open" ? "Cancel PO" : "Reactivate PO";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label}? ${
        targetStatus === "cancelled"
          ? "It will be hidden from the default (open) list but its record, lines, and attachments are kept."
          : "It will reappear in the default (open) list."
      }`
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result =
        status === "open" ? await cancelCustomerPO(poId) : await reactivateCustomerPO(poId);
      if (result.success) {
        router.refresh();
      } else {
        // Surfaces LockedPOError's friendly message (FR-015) — inert today since no
        // writer sets delivered/invoiced above zero until 007/008 ship.
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div>
      <button
        type="button"
        onClick={handleClick}
        disabled={isSubmitting}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : label}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
