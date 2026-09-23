"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  batchCompleteInputSchema,
  todayInPakistan,
  type BatchCompleteInput,
} from "@/lib/production-batches/schema";
import { completeProductionBatch } from "@/app/actions/production-batches";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function rs(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

interface BatchCompleteFormProps {
  batchId: string;
  weightIssuedKg: number;
  lotRatePerKg: number;
  labourRatePerPacket: number;
  expectedPackets: number | null;
}

/** Complete step — FR-014 to FR-019. The packet count is authoritative; the returned weight is a
 * cross-check only. The preview mirrors complete_production_batch's formulas, but the figures
 * the server stores are the authoritative ones. */
export function BatchCompleteForm(props: BatchCompleteFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<BatchCompleteInput>({
    resolver: zodResolver(batchCompleteInputSchema),
    defaultValues: {
      packetsProduced: undefined,
      returnedWeightKg: undefined,
      completionDate: todayInPakistan(),
      confirmReturnedWeightExceeded: false,
    },
  });

  const packets = Number(useWatch({ control, name: "packetsProduced" }));
  const returned = Number(useWatch({ control, name: "returnedWeightKg" }));
  const hasPackets = Number.isInteger(packets) && packets >= 1;
  const hasReturned = Number.isFinite(returned) && returned > 0;
  const exceeded = hasReturned && returned > props.weightIssuedKg;

  const raw = round2(props.weightIssuedKg * props.lotRatePerKg);
  const labour = hasPackets ? round2(packets * props.labourRatePerPacket) : null;
  const total = labour !== null ? round2(raw + labour) : null;
  const avg = total !== null ? round2(total / packets) : null;
  const wastageKg = hasReturned ? (exceeded ? 0 : round2(props.weightIssuedKg - returned)) : null;

  async function submit(data: BatchCompleteInput) {
    let confirmExceeded = false;
    if (Number(data.returnedWeightKg) > props.weightIssuedKg) {
      confirmExceeded = window.confirm(
        "Returned weight exceeds the weight issued (packaging weight?). Wastage will be recorded as 0. Continue?"
      );
      if (!confirmExceeded) return;
    }

    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await completeProductionBatch(props.batchId, {
        ...data,
        confirmReturnedWeightExceeded: confirmExceeded,
      });
      if (result.success) {
        router.refresh();
        return;
      }
      setFormError(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof BatchCompleteInput, { message: messages[0] });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "w-full rounded border border-zinc-300 px-3 py-2 text-sm";

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="space-y-5 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <h2 className="text-sm font-semibold text-zinc-900">Complete batch — packets received</h2>

      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Packets produced</label>
          <input type="number" step="1" min="1" {...register("packetsProduced")} className={inputClass} />
          {errors.packetsProduced && (
            <p className="mt-1 text-xs text-red-600">{errors.packetsProduced.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Returned packet weight (kg)
          </label>
          <input type="number" step="0.01" min="0" {...register("returnedWeightKg")} className={inputClass} />
          {errors.returnedWeightKg && (
            <p className="mt-1 text-xs text-red-600">{errors.returnedWeightKg.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Completion date</label>
          <input type="date" {...register("completionDate")} className={inputClass} />
          {errors.completionDate && (
            <p className="mt-1 text-xs text-red-600">{errors.completionDate.message}</p>
          )}
        </div>
      </div>

      <p className="text-xs text-zinc-500">
        The packet count drives stock and cost. The returned weight is a cross-check only and never
        changes or blocks the packet count.
      </p>

      {exceeded && (
        <p className="rounded border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Returned weight is more than the {props.weightIssuedKg.toFixed(2)} kg issued (packaging
          weight?). You&apos;ll be asked to confirm; wastage will be recorded as 0.
        </p>
      )}

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600 sm:grid-cols-3">
        <div>
          <dt>Raw material cost</dt>
          <dd className="font-medium text-zinc-900">{rs(raw)}</dd>
        </div>
        <div>
          <dt>Labour cost</dt>
          <dd className="font-medium text-zinc-900">{labour !== null ? rs(labour) : "—"}</dd>
        </div>
        <div>
          <dt>Total / avg per packet</dt>
          <dd className="font-medium text-zinc-900">
            {total !== null && avg !== null ? `${rs(total)} / ${rs(avg)}` : "—"}
          </dd>
        </div>
        <div>
          <dt>Wastage</dt>
          <dd className="font-medium text-zinc-900">
            {wastageKg !== null
              ? `${wastageKg.toFixed(2)} kg · ${rs(round2(wastageKg * props.lotRatePerKg))} · ${round2(
                  (wastageKg / props.weightIssuedKg) * 100
                ).toFixed(2)}%`
              : "—"}
          </dd>
        </div>
        <div>
          <dt>Yield variance (info only)</dt>
          <dd className="font-medium text-zinc-900">
            {hasPackets && props.expectedPackets
              ? `${packets - props.expectedPackets >= 0 ? "+" : ""}${(
                  packets - props.expectedPackets
                ).toLocaleString()} vs ${props.expectedPackets.toLocaleString()} expected`
              : "—"}
          </dd>
        </div>
      </dl>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Completing…" : "Complete batch"}
      </button>
    </form>
  );
}
