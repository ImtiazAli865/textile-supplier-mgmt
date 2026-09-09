"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { deletePurchase } from "@/app/actions/purchases";

export function DeletePurchaseControl({ purchaseId }: { purchaseId: string }) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    const confirmed = window.confirm(
      "Delete this purchase? This cannot be undone."
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    setError(null);
    try {
      const result = await deletePurchase(purchaseId);
      if (result.success) {
        router.push("/purchases");
        router.refresh();
        return;
      }
      setError(result.error);
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
        className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {isSubmitting ? "Deleting…" : "Delete"}
      </button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </div>
  );
}
