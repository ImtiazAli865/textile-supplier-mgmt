"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { createChallan, updateChallan } from "@/app/actions/challans";
import { ChallanLineRow, type ChallanLineCandidate } from "@/components/challans/challan-line-row";
import type { ChallanDetail, ChallanLineDetail, ShortfallDisposition } from "@/lib/challans/schema";

interface TradeNameOption {
  id: string;
  printedName: string;
}

interface LineState {
  poLineId: string;
  included: boolean;
  deliveredQuantity: number;
  acceptedQuantity: number;
  shortfallDisposition: "" | ShortfallDisposition;
}

type ChallanFormProps =
  | {
      mode: "create";
      poId: string;
      poNumber: string;
      candidateLines: ChallanLineCandidate[];
      tradeNameOptions: TradeNameOption[];
      challan?: undefined;
    }
  | {
      mode: "edit";
      poId?: undefined;
      poNumber?: undefined;
      candidateLines?: undefined;
      tradeNameOptions: TradeNameOption[];
      challan: ChallanDetail;
    };

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function candidateToLineState(candidate: ChallanLineCandidate): LineState {
  return {
    poLineId: candidate.id,
    included: false,
    deliveredQuantity: candidate.remaining,
    acceptedQuantity: candidate.remaining,
    shortfallDisposition: "",
  };
}

function existingLineToLineState(line: ChallanLineDetail): LineState {
  return {
    poLineId: line.poLineId,
    included: true,
    deliveredQuantity: line.deliveredQuantity,
    acceptedQuantity: line.acceptedQuantity,
    shortfallDisposition: line.shortfallDisposition ?? "",
  };
}

/** Unlike 006's customer-po-form.tsx, a Challan's lines are never freely added/removed —
 * they're always a subset of one PO's own (undelivered) lines (FR-001, FR-002), so this form
 * manages plain component state per candidate line (checkbox + quantities) rather than
 * react-hook-form's useFieldArray, which is built for arbitrary add/remove rows. Deeper
 * correctness (remaining-quantity limits, the shortfall-disposition requirement) is enforced
 * server-side by create_challan/update_challan and surfaced here via handleFailure. */
export function ChallanForm(props: ChallanFormProps) {
  const router = useRouter();
  const isCreate = props.mode === "create";

  const [tradeNameId, setTradeNameId] = useState(isCreate ? "" : props.challan.tradeNameId);
  const [challanNumber, setChallanNumber] = useState(
    isCreate ? "" : props.challan.challanNumber
  );
  const [challanDate, setChallanDate] = useState(
    isCreate ? todayIso() : props.challan.challanDate.slice(0, 10)
  );
  const [lines, setLines] = useState<LineState[]>(() =>
    isCreate ? props.candidateLines.map(candidateToLineState) : props.challan.lines.map(existingLineToLineState)
  );
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const candidateById = new Map(
    (isCreate ? props.candidateLines : []).map((c) => [c.id, c])
  );

  function updateLine(poLineId: string, patch: Partial<LineState>) {
    setLines((prev) => prev.map((line) => (line.poLineId === poLineId ? { ...line, ...patch } : line)));
  }

  async function submit() {
    setFormError(null);
    const included = lines.filter((l) => l.included);

    if (!tradeNameId) {
      setFormError("Select a trade name.");
      return;
    }
    if (!challanDate) {
      setFormError("Challan date is required.");
      return;
    }
    if (included.length === 0) {
      setFormError("Select at least one line item.");
      return;
    }
    if (included.some((l) => !l.deliveredQuantity || l.deliveredQuantity <= 0)) {
      setFormError("Every selected line needs a delivered quantity greater than zero.");
      return;
    }

    setIsSubmitting(true);
    try {
      if (isCreate) {
        const result = await createChallan({
          poId: props.poId,
          tradeNameId,
          challanNumber: challanNumber || undefined,
          challanDate,
          lines: included.map((l) => ({
            poLineId: l.poLineId,
            deliveredQuantity: l.deliveredQuantity,
          })),
        });
        if (result.success) {
          router.push(`/challans/${result.data.id}`);
          router.refresh();
          return;
        }
        setFormError(result.error);
      } else {
        const result = await updateChallan(props.challan.id, {
          tradeNameId,
          challanNumber,
          challanDate,
          lines: included.map((l) => ({
            poLineId: l.poLineId,
            deliveredQuantity: l.deliveredQuantity,
            acceptedQuantity: l.acceptedQuantity,
            shortfallDisposition: l.shortfallDisposition || undefined,
          })),
        });
        if (result.success) {
          router.push(`/challans/${props.challan.id}`);
          router.refresh();
          return;
        }
        setFormError(result.error);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-4xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6">
      <div className="grid grid-cols-3 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">PO</label>
          <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
            {isCreate ? props.poNumber : props.challan.poNumber}
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
            {props.tradeNameOptions.map((t) => (
              <option key={t.id} value={t.id}>
                {t.printedName}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Challan date</label>
          <input
            type="date"
            value={challanDate}
            onChange={(e) => setChallanDate(e.target.value)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Challan number {isCreate ? "(optional — auto-generated per trade name if left blank)" : ""}
        </label>
        <input
          value={challanNumber}
          onChange={(e) => setChallanNumber(e.target.value)}
          maxLength={30}
          placeholder={isCreate ? "e.g. CH #001/Sep" : undefined}
          className="w-full max-w-xs rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div>
        <span className="mb-2 block text-sm font-medium text-zinc-700">Line items</span>
        <div className="space-y-3">
          {lines.map((line) => {
            const candidate = isCreate
              ? candidateById.get(line.poLineId)
              : (() => {
                  const existing = props.challan.lines.find((l) => l.poLineId === line.poLineId);
                  return existing
                    ? {
                        id: existing.poLineId,
                        customerItemCode: existing.article,
                        productName: existing.productName,
                        uom: existing.uom,
                        unitPrice: existing.unitPrice,
                        remaining: existing.deliveredQuantity,
                      }
                    : undefined;
                })();
            if (!candidate) return null;
            return (
              <ChallanLineRow
                key={line.poLineId}
                candidate={candidate}
                mode={isCreate ? "create" : "edit"}
                included={line.included}
                onToggle={isCreate ? (included) => updateLine(line.poLineId, { included }) : undefined}
                deliveredQuantity={line.deliveredQuantity}
                onDeliveredQuantityChange={(value) =>
                  updateLine(line.poLineId, {
                    deliveredQuantity: value,
                    acceptedQuantity: isCreate ? value : line.acceptedQuantity,
                  })
                }
                acceptedQuantity={isCreate ? undefined : line.acceptedQuantity}
                onAcceptedQuantityChange={(value) =>
                  updateLine(line.poLineId, { acceptedQuantity: value })
                }
                shortfallDisposition={line.shortfallDisposition}
                onShortfallDispositionChange={(value) =>
                  updateLine(line.poLineId, { shortfallDisposition: value })
                }
                readOnly={!isCreate && props.challan.status !== "issued"}
              />
            );
          })}
          {isCreate && props.candidateLines.length === 0 && (
            <p className="text-sm text-zinc-500">This PO has no lines left to deliver.</p>
          )}
        </div>
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="button"
        onClick={submit}
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : isCreate ? "Create Challan" : "Save Changes"}
      </button>
    </div>
  );
}
