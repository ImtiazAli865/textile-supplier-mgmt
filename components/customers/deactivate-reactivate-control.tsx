"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setCustomerStatus } from "@/app/actions/customers";
import type { CustomerStatus } from "@/lib/customers/schema";

export function DeactivateReactivateControl({
  customerId,
  status,
}: {
  customerId: string;
  status: CustomerStatus;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetStatus: CustomerStatus = status === "active" ? "inactive" : "active";
  const label = status === "active" ? "Deactivate" : "Reactivate";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label} this customer? ${
        targetStatus === "inactive"
          ? "It will be hidden from the active list but its record, ledger history, and product mappings are kept."
          : "It will reappear in the active list."
      }`
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await setCustomerStatus(customerId, targetStatus);
      router.refresh();
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isSubmitting}
      className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
    >
      {isSubmitting ? "Saving…" : label}
    </button>
  );
}
