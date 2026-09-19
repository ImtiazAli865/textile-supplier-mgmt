"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setProductStatus } from "@/app/actions/products";
import type { ProductStatus } from "@/lib/products/schema";

export function ProductStatusControl({
  productId,
  status,
}: {
  productId: string;
  status: ProductStatus;
}) {
  const router = useRouter();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const targetStatus: ProductStatus = status === "active" ? "inactive" : "active";
  const label = status === "active" ? "Deactivate" : "Reactivate";

  async function handleClick() {
    const confirmed = window.confirm(
      `${label} this product? ${
        targetStatus === "inactive"
          ? "It will be hidden from the active catalog but its record is kept."
          : "It will reappear in the active catalog."
      }`
    );
    if (!confirmed) return;

    setIsSubmitting(true);
    try {
      await setProductStatus(productId, targetStatus);
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
