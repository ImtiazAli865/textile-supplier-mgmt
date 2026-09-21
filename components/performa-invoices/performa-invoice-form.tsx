"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createPerformaInvoice } from "@/app/actions/performa-invoices";
import {
  PerformaInvoiceLineRow,
  type PerformaInvoiceLineCandidate,
} from "@/components/performa-invoices/performa-invoice-line-row";

interface TradeNameOption {
  id: string;
  printedName: string;
}

export interface PoGroup {
  poId: string;
  poNumber: string;
  lines: PerformaInvoiceLineCandidate[];
}

interface LineState extends PerformaInvoiceLineCandidate {
  included: boolean;
  invoicedQuantity: number;
}

interface PerformaInvoiceFormProps {
  customerId: string;
  customerDisplayName: string;
  poGroups: PoGroup[];
  tradeNameOptions: TradeNameOption[];
  /** The customer's remaining open POs not yet added to this draft — rendered as a plain GET
   * form appending another `poId` to the URL (a full Server Component reload), matching this
   * project's established preference for server-rendered data over client-side fetching
   * (research.md — the same reasoning 007's own getOpenPOLinesForChallan documents). */
  availablePOs: { id: string; poNumber: string }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Create-only — a Performa Invoice has no edit path at all (FR-009). Supports one or more POs
 * from the start: each PO's invoiceable lines render as their own labeled group, with the PO
 * number shown per line once more than one PO is included (User Story 2, Acceptance Scenario
 * 2). Plain component state per candidate line (checkbox + invoiced quantity), the same shape
 * as components/challans/challan-form.tsx, since lines are always a checkbox-selected subset of
 * already-fetched candidates, never freely added/removed text rows.
 */
export function PerformaInvoiceForm({
  customerId,
  customerDisplayName,
  poGroups,
  tradeNameOptions,
  availablePOs,
}: PerformaInvoiceFormProps) {
  const router = useRouter();

  const [tradeNameId, setTradeNameId] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState(todayIso());
  const [taxRate, setTaxRate] = useState(18);
  const [lines, setLines] = useState<LineState[]>(() =>
    poGroups.flatMap((group) =>
      group.lines.map((candidate) => ({
        ...candidate,
        included: false,
        invoicedQuantity: candidate.remaining,
      }))
    )
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showPoNumber = poGroups.length > 1;

  function updateLine(poLineId: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line) => (line.id === poLineId ? { ...line, ...patch } : line)));
  }

  async function submit() {
    setFormError(null);
    const included = lines.filter((l) => l.included);

    if (!tradeNameId) {
      setFormError("Select a trade name.");
      return;
    }
    if (!invoiceDate) {
      setFormError("Invoice date is required.");
      return;
    }
    if (included.length === 0) {
      setFormError("Select at least one line item.");
      return;
    }
    if (included.some((l) => !l.invoicedQuantity || l.invoicedQuantity <= 0)) {
      setFormError("Every selected line needs an invoiced quantity greater than zero.");
      return;
    }
    if (included.some((l) => l.invoicedQuantity > l.remaining)) {
      setFormError("A selected line's invoiced quantity exceeds what remains to invoice.");
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await createPerformaInvoice({
        customerId,
        tradeNameId,
        invoiceNumber: invoiceNumber || undefined,
        invoiceDate,
        taxRate,
        lines: included.map((l) => ({ poLineId: l.id, invoicedQuantity: l.invoicedQuantity })),
      });
      if (result.success) {
        router.push(`/performa-invoices/${result.data.id}`);
        router.refresh();
        return;
      }
      setFormError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Customer</label>
          <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {customerDisplayName}
          </p>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Trade name</label>
          <select
            value={tradeNameId}
            onChange={(e) => setTradeNameId(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">Select a trade name…</option>
            {tradeNameOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.printedName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Invoice date</label>
          <input
            type="date"
            value={invoiceDate}
            onChange={(e) => setInvoiceDate(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Invoice number (optional — auto-generated per trade name if left blank)
          </label>
          <input
            value={invoiceNumber}
            onChange={(e) => setInvoiceNumber(e.target.value)}
            maxLength={30}
            placeholder="e.g. 18"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Tax rate (%)</label>
          <input
            type="number"
            min={0}
            max={100}
            step="0.01"
            value={taxRate}
            onChange={(e) => setTaxRate(Number(e.target.value))}
            className="w-full max-w-[8rem] rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      {poGroups.map((group) => (
        <div key={group.poId}>
          <span className="mb-2 block text-sm font-medium text-zinc-700">
            PO {group.poNumber} — line items
          </span>
          <div className="space-y-3">
            {lines
              .filter((line) => line.poId === group.poId)
              .map((line) => (
                <PerformaInvoiceLineRow
                  key={line.id}
                  candidate={line}
                  included={line.included}
                  onToggle={(included) => updateLine(line.id, { included })}
                  invoicedQuantity={line.invoicedQuantity}
                  onInvoicedQuantityChange={(value) => updateLine(line.id, { invoicedQuantity: value })}
                  showPoNumber={showPoNumber}
                />
              ))}
            {group.lines.length === 0 && (
              <p className="text-sm text-zinc-500">This PO has no delivered-but-uninvoiced quantity.</p>
            )}
          </div>
        </div>
      ))}

      {availablePOs.length > 0 && (
        <form method="GET" className="rounded border border-dashed border-zinc-300 p-3">
          <input type="hidden" name="customerId" value={customerId} />
          {poGroups.map((group) => (
            <input key={group.poId} type="hidden" name="poId" value={group.poId} />
          ))}
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Add another PO to this invoice (optional)
          </label>
          <div className="flex items-center gap-2">
            <select name="poId" className="rounded border border-zinc-300 px-3 py-1.5 text-sm">
              {availablePOs.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber}
                </option>
              ))}
            </select>
            <button
              type="submit"
              className="rounded border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Add PO
            </button>
          </div>
        </form>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Create Performa Invoice"}
      </button>
    </div>
  );
}
