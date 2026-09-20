"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setTradeNameStatus } from "@/app/actions/trade-names";
import type { TradeNameStatus } from "@/lib/trade-names/schema";

export function DeactivateReactivateControl({
  tradeNameId,
  status,
}: {
  tradeNameId: string;
  status: TradeNameStatus;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetStatus: TradeNameStatus = status === "active" ? "inactive" : "active";
  const label = status === "active" ? "Deactivate" : "Reactivate";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label} this trade name? ${
        targetStatus === "inactive"
          ? "It will be hidden from the active list but its record, images, and sequence settings are kept."
          : "It will reappear in the active list."
      }`
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await setTradeNameStatus(tradeNameId, targetStatus);
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
