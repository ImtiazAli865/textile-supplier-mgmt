"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidChallan, acceptChallan } from "@/app/actions/challans";
import type { ChallanDetail } from "@/lib/challans/schema";

/** Void (Issued only, FR-013/FR-014) and Accept (Issued only, FR-007–FR-012) actions. An
 * accepted or voided Challan renders neither control — both are terminal states. */
export function ChallanStatusControls({ challan }: { challan: ChallanDetail }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (challan.status !== "issued") {
    return null;
  }

  async function handleVoid() {
    const confirmed = window.confirm(
      "Void this Challan? It will be hidden from the default/active list but its record is kept. This cannot be done once accepted."
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await voidChallan(challan.id);
      if (result.success) {
        router.refresh();
      } else {
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleAccept() {
    const confirmed = window.confirm(
      "Accept this Challan? Its accepted quantities will roll up into the PO's Delivered figures, post the inventory effect, and (for eligible customers) post a ledger credit. This cannot be undone through this feature."
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await acceptChallan(challan.id);
      if (result.success) {
        router.refresh();
      } else {
        // Surfaces MissingShortfallDispositionError/NoAcceptedQuantityError/PoCancelledError
        // (FR-007/FR-008, Edge Cases) as a friendly message. The affected line ids (when
        // present) are already visible directly on each line's own shortfall-disposition
        // select above, so this message just points staff back to them.
        setError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={handleAccept}
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Working…" : "Accept Challan"}
      </button>
      <button
        type="button"
        onClick={handleVoid}
        disabled={isSubmitting}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50 disabled:opacity-50"
      >
        {isSubmitting ? "Working…" : "Void Challan"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
