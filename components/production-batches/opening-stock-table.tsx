"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  recordManufacturedOpeningStock,
  recordManufacturedOpeningStockCorrection,
} from "@/app/actions/production-batches";
import { todayInPakistan, type OpeningStockRow } from "@/lib/production-batches/schema";

const inputClass = "rounded border border-zinc-300 px-2 py-1 text-sm";

function OpeningForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [quantity, setQuantity] = useState("");
  const [entryDate, setEntryDate] = useState(todayInPakistan());
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const confirmed = window.confirm(
      `Record an opening stock of ${quantity} for this product? This is a one-time entry and can be corrected at most once.`
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await recordManufacturedOpeningStock({
        productId,
        quantity: Number(quantity),
        entryDate,
        costPerPacket: cost.trim() === "" ? "" : Number(cost),
      });
      if (result.success) router.refresh();
      else setError(result.fieldErrors ? Object.values(result.fieldErrors)[0][0] : result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        step="1"
        min="1"
        required
        placeholder="Qty"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className={`${inputClass} w-24`}
      />
      <input
        type="date"
        required
        value={entryDate}
        onChange={(e) => setEntryDate(e.target.value)}
        className={inputClass}
      />
      <input
        type="number"
        step="0.01"
        min="0"
        placeholder="Cost/packet (optional)"
        value={cost}
        onChange={(e) => setCost(e.target.value)}
        className={`${inputClass} w-44`}
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Record opening stock"}
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </form>
  );
}

function CorrectionForm({ productId }: { productId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [qty, setQty] = useState("");
  const [reason, setReason] = useState("");
  const [correctionDate, setCorrectionDate] = useState(todayInPakistan());
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="text-xs text-zinc-600 underline hover:text-zinc-900"
      >
        Correct opening stock
      </button>
    );
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const confirmed = window.confirm(
      `Record a correction of ${qty} to the opening stock? Only one correction is ever allowed.`
    );
    if (!confirmed) return;

    setError(null);
    setIsSubmitting(true);
    try {
      const result = await recordManufacturedOpeningStockCorrection({
        productId,
        correctionQty: Number(qty),
        reason,
        correctionDate,
      });
      if (result.success) router.refresh();
      else setError(result.fieldErrors ? Object.values(result.fieldErrors)[0][0] : result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-center gap-2">
      <input
        type="number"
        step="1"
        required
        placeholder="± Qty"
        value={qty}
        onChange={(e) => setQty(e.target.value)}
        className={`${inputClass} w-24`}
      />
      <input
        type="text"
        required
        placeholder="Reason"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={`${inputClass} w-48`}
      />
      <input
        type="date"
        required
        value={correctionDate}
        onChange={(e) => setCorrectionDate(e.target.value)}
        className={inputClass}
      />
      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-3 py-1 text-xs font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Save correction"}
      </button>
      <button type="button" onClick={() => setOpen(false)} className="text-xs text-zinc-500">
        Cancel
      </button>
      {error && <span className="w-full text-xs text-red-600">{error}</span>}
    </form>
  );
}

/** One row per manufactured product: its opening stock status and the one allowed action
 * (US3, FR-024 to FR-026). */
export function OpeningStockTable({ rows }: { rows: OpeningStockRow[] }) {
  if (rows.length === 0) {
    return (
      <div className="rounded border border-dashed border-zinc-300 p-8 text-center text-sm text-zinc-500">
        No manufactured products exist yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded border border-zinc-200 bg-white">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
            <th className="px-3 py-2">Product</th>
            <th className="px-3 py-2 text-right">On hand</th>
            <th className="px-3 py-2">Opening entry</th>
            <th className="px-3 py-2">Correction</th>
            <th className="px-3 py-2">Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.productId} className="border-b border-zinc-100 align-top">
              <td className="px-3 py-2 font-medium">
                {row.productName}
                {row.productStatus === "inactive" && (
                  <span className="ml-2 text-xs font-normal text-zinc-400">(inactive)</span>
                )}
              </td>
              <td className="px-3 py-2 text-right">
                {row.quantityOnHand.toLocaleString()} {row.stockUom}
              </td>
              <td className="px-3 py-2 text-zinc-600">
                {row.opening
                  ? `${row.opening.quantity.toLocaleString()} on ${row.opening.entryDate} · ${
                      row.opening.costPerPacket !== null
                        ? `Rs ${row.opening.costPerPacket.toFixed(2)}/packet`
                        : "no cost"
                    }`
                  : "—"}
              </td>
              <td className="px-3 py-2 text-zinc-600">
                {row.opening?.correction
                  ? `${row.opening.correction.qty > 0 ? "+" : ""}${row.opening.correction.qty} on ${
                      row.opening.correction.date
                    } — ${row.opening.correction.reason}`
                  : "—"}
              </td>
              <td className="px-3 py-2">
                {!row.opening ? (
                  <OpeningForm productId={row.productId} />
                ) : row.canCorrect ? (
                  <CorrectionForm productId={row.productId} />
                ) : (
                  <span className="text-xs text-zinc-400">
                    {row.opening.correction ? "Corrected" : "Stock already shipped on a Challan"}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
