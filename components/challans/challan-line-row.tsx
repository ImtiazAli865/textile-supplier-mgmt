"use client";

import type { ShortfallDisposition } from "@/lib/challans/schema";

export interface ChallanLineCandidate {
  id: string;
  customerItemCode: string | null;
  productName: string;
  uom: string;
  unitPrice: number;
  remaining: number;
}

interface ChallanLineRowProps {
  candidate: ChallanLineCandidate;
  mode: "create" | "edit";
  included?: boolean;
  onToggle?: (included: boolean) => void;
  deliveredQuantity: number;
  onDeliveredQuantityChange: (value: number) => void;
  acceptedQuantity?: number;
  onAcceptedQuantityChange?: (value: number) => void;
  shortfallDisposition?: "" | ShortfallDisposition;
  onShortfallDispositionChange?: (value: "" | ShortfallDisposition) => void;
  readOnly?: boolean;
}

/** One PO line candidate row. In "create" mode it's a checkbox + delivered-quantity input over
 * a fixed set of a PO's undelivered lines (FR-001, FR-002) — not a freely add/remove row list
 * like 006's PO lines, since a Challan can only ever reference lines the PO already has. In
 * "edit" mode (only reachable while the Challan is Issued, FR-003) it additionally shows the
 * accepted-quantity input and, once accepted < delivered, the mandatory shortfall disposition
 * (FR-007). */
export function ChallanLineRow({
  candidate,
  mode,
  included = true,
  onToggle,
  deliveredQuantity,
  onDeliveredQuantityChange,
  acceptedQuantity,
  onAcceptedQuantityChange,
  shortfallDisposition,
  onShortfallDispositionChange,
  readOnly,
}: ChallanLineRowProps) {
  const disabled = readOnly || (mode === "create" && !included);
  const showDisposition =
    mode === "edit" &&
    acceptedQuantity !== undefined &&
    deliveredQuantity > 0 &&
    acceptedQuantity < deliveredQuantity;

  return (
    <div
      className={`grid grid-cols-6 items-end gap-2 rounded border p-3 ${
        disabled && mode === "create" ? "border-zinc-200 bg-zinc-50" : "border-zinc-200"
      }`}
    >
      {mode === "create" && onToggle && (
        <div className="col-span-1 flex items-center gap-2">
          <input
            type="checkbox"
            checked={included}
            onChange={(e) => onToggle(e.target.checked)}
          />
          <span className="text-xs text-zinc-500">Include</span>
        </div>
      )}
      <div className={mode === "create" ? "col-span-2" : "col-span-3"}>
        <p className="text-sm font-medium text-zinc-900">{candidate.productName}</p>
        <p className="text-xs text-zinc-500">
          {candidate.customerItemCode ?? "—"} · {candidate.uom} · Rs {candidate.unitPrice.toFixed(2)}{" "}
          · remaining {candidate.remaining}
        </p>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Delivered qty</label>
        <input
          type="number"
          min={0}
          step="0.01"
          value={deliveredQuantity}
          onChange={(e) => onDeliveredQuantityChange(Number(e.target.value))}
          disabled={disabled}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        />
      </div>
      {mode === "edit" && (
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Accepted qty</label>
          <input
            type="number"
            min={0}
            step="0.01"
            value={acceptedQuantity ?? 0}
            onChange={(e) => onAcceptedQuantityChange?.(Number(e.target.value))}
            disabled={readOnly}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
          />
        </div>
      )}
      {showDisposition && (
        <div className="col-span-2">
          <label className="mb-1 block text-xs text-zinc-500">Shortfall disposition</label>
          <select
            value={shortfallDisposition ?? ""}
            onChange={(e) =>
              onShortfallDispositionChange?.(e.target.value as "" | ShortfallDisposition)
            }
            disabled={readOnly}
            className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
          >
            <option value="">— choose —</option>
            <option value="return_to_inventory">Return to inventory</option>
            <option value="write_off">Write off</option>
          </select>
        </div>
      )}
    </div>
  );
}
