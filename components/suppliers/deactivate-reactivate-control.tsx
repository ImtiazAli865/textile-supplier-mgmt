"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setSupplierStatus } from "@/app/actions/suppliers";
import type { SupplierStatus } from "@/lib/suppliers/schema";

export function DeactivateReactivateControl({
  supplierId,
  status,
}: {
  supplierId: string;
  status: SupplierStatus;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetStatus: SupplierStatus = status === "active" ? "inactive" : "active";
  const label = status === "active" ? "Deactivate" : "Reactivate";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label} this supplier? ${
        targetStatus === "inactive"
          ? "It will be hidden from the active list but its record is kept."
          : "It will reappear in the active list."
      }`
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await setSupplierStatus(supplierId, targetStatus);
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
