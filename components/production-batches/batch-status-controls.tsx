"use client";

import Link from "next/link";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { voidProductionBatch } from "@/app/actions/production-batches";

/** Edit and Void, Issued batches only (FR-011 to FR-013). Completed and Voided batches render
 * nothing — both are terminal. */
export function BatchStatusControls({
  batchId,
  status,
}: {
  batchId: string;
  status: "issued" | "completed" | "voided";
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (status !== "issued") return null;

  async function handleVoid() {
    const confirmed = window.confirm(
      "Void this batch? Its full issued weight goes back to the fabric lot and no stock or cost is recorded. This cannot be undone."
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await voidProductionBatch(batchId);
      if (result.success) router.refresh();
      else setError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <Link
        href={`/production-batches/${batchId}/edit`}
        className="rounded border border-zinc-300 px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
      >
        Edit
      </Link>
      <button
        type="button"
        onClick={handleVoid}
        disabled={isSubmitting}
        className="rounded border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-50"
      >
        {isSubmitting ? "Voiding…" : "Void batch"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
