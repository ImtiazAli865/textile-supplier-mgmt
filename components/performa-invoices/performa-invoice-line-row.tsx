"use client";

export interface PerformaInvoiceLineCandidate {
  id: string;
  poId: string;
  poNumber: string;
  customerItemCode: string | null;
  productName: string;
  uom: string;
  unitPrice: number;
  remaining: number;
}

interface PerformaInvoiceLineRowProps {
  candidate: PerformaInvoiceLineCandidate;
  included: boolean;
  onToggle: (included: boolean) => void;
  invoicedQuantity: number;
  onInvoicedQuantityChange: (value: number) => void;
  showPoNumber: boolean;
}

/** One PO line candidate row — a checkbox + invoiced-quantity input over a fixed set of a PO's
 * delivered-but-uninvoiced lines (FR-002, FR-003), the same shape as
 * components/challans/challan-line-row.tsx's "create" mode. Always shows its source PO number
 * once the invoice spans more than one PO (User Story 2, Acceptance Scenario 2) — controlled by
 * `showPoNumber` so a single-PO invoice's rows stay uncluttered. */
export function PerformaInvoiceLineRow({
  candidate,
  included,
  onToggle,
  invoicedQuantity,
  onInvoicedQuantityChange,
  showPoNumber,
}: PerformaInvoiceLineRowProps) {
  return (
    <div
      className={`grid grid-cols-6 items-end gap-2 rounded border p-3 ${
        included ? "border-zinc-200" : "border-zinc-200 bg-zinc-50"
      }`}
    >
      <div className="col-span-1 flex items-center gap-2">
        <input type="checkbox" checked={included} onChange={(e) => onToggle(e.target.checked)} />
        <span className="text-xs text-zinc-500">Include</span>
      </div>
      <div className="col-span-3">
        <p className="text-sm font-medium text-zinc-900">
          {candidate.productName}
          {showPoNumber && <span className="ml-2 text-xs text-zinc-500">PO {candidate.poNumber}</span>}
        </p>
        <p className="text-xs text-zinc-500">
          {candidate.customerItemCode ?? "—"} · {candidate.uom} · Rs {candidate.unitPrice.toFixed(2)}{" "}
          · remaining {candidate.remaining}
        </p>
      </div>
      <div className="col-span-2">
        <label className="mb-1 block text-xs text-zinc-500">Invoiced qty</label>
        <input
          type="number"
          min={0}
          max={candidate.remaining}
          step="0.01"
          value={invoicedQuantity}
          onChange={(e) => onInvoicedQuantityChange(Number(e.target.value))}
          disabled={!included}
          className="w-full rounded border border-zinc-300 px-2 py-1 text-sm disabled:bg-zinc-100"
        />
      </div>
    </div>
  );
}
