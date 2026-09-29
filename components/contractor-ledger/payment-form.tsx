"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordContractorPayment } from "@/app/actions/contractor-ledger";
import {
  contractorPaymentInputSchema,
  formatRs,
  paisa,
  todayInPakistan,
  type ContractorPaymentInput,
  type PayableBatch,
} from "@/lib/contractor-ledger/schema";

interface PaymentFormProps {
  contractorId: string;
  contractorName: string;
  contractorInactive: boolean;
  payableBatches: PayableBatch[];
}

/**
 * Records one cash payment (US2). Staff pick the date, tick the completed batches it covers (only
 * those completed on or before that date, FR-011); each ticked batch pre-fills with its unpaid
 * amount and can be lowered for a part-payment. The total follows the ticked amounts and can be
 * raised; the difference is unlinked (FR-013). The server re-checks every amount under lock.
 */
export function PaymentForm({ contractorId, contractorName, contractorInactive, payableBatches }: PaymentFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [ticked, setTicked] = useState<Record<string, string>>({});
  const [amountTouched, setAmountTouched] = useState(false);

  const {
    register,
    handleSubmit,
    setValue,
    control,
    formState: { errors },
  } = useForm<ContractorPaymentInput>({
    resolver: zodResolver(contractorPaymentInputSchema),
    defaultValues: {
      contractorId,
      paymentDate: todayInPakistan(),
      amount: 0,
      note: "",
      allocations: [],
    },
  });

  const paymentDate = useWatch({ control, name: "paymentDate" }) ?? "";
  const amountValue = Number(useWatch({ control, name: "amount" }));

  const eligible = useMemo(
    () => payableBatches.filter((batch) => paymentDate && batch.completionDate <= paymentDate),
    [payableBatches, paymentDate]
  );

  // A batch completed after the chosen date can't be linked: untick it when the date moves.
  useEffect(() => {
    const allowed = new Set(eligible.map((batch) => batch.batchId));
    setTicked((current) => {
      const next = Object.fromEntries(Object.entries(current).filter(([id]) => allowed.has(id)));
      return Object.keys(next).length === Object.keys(current).length ? current : next;
    });
  }, [eligible]);

  const allocations = Object.entries(ticked).map(([batchId, value]) => ({ batchId, amount: Number(value) }));
  const allocatedPaisa = allocations.reduce(
    (sum, allocation) => sum + (Number.isFinite(allocation.amount) ? paisa(allocation.amount) : 0),
    0
  );

  // The total follows the ticked amounts until staff raise it; it never sits below them.
  useEffect(() => {
    setValue("allocations", allocations, { shouldValidate: false });
    const currentPaisa = Number.isFinite(amountValue) ? paisa(amountValue) : 0;
    if (!amountTouched || currentPaisa < allocatedPaisa) {
      setValue("amount", allocatedPaisa / 100, { shouldValidate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticked]);

  const unlinkedPaisa = (Number.isFinite(amountValue) ? paisa(amountValue) : 0) - allocatedPaisa;

  function toggle(batch: PayableBatch) {
    setTicked((current) => {
      if (batch.batchId in current) {
        const { [batch.batchId]: _removed, ...rest } = current;
        void _removed;
        return rest;
      }
      return { ...current, [batch.batchId]: batch.unpaid.toFixed(2) };
    });
  }

  function batchError(batch: PayableBatch): string | null {
    const value = ticked[batch.batchId];
    if (value === undefined) return null;
    const amount = Number(value);
    if (!Number.isFinite(amount) || paisa(amount) <= 0) return "Enter an amount above zero.";
    if (paisa(amount) > paisa(batch.unpaid)) return `Only ${formatRs(batch.unpaid)} is unpaid on this batch.`;
    return null;
  }

  async function submit(data: ContractorPaymentInput) {
    if (eligible.some((batch) => batchError(batch))) {
      setFormError("Fix the batch amounts first.");
      return;
    }
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await recordContractorPayment({ ...data, allocations });
      if (result.success) {
        router.push(`/contractors/${contractorId}`);
        router.refresh();
        return;
      }
      setFormError(result.error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputClass = "w-full rounded border border-zinc-300 px-3 py-2 text-sm";

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="max-w-2xl space-y-5 rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900"
    >
      <div>
        <p className="text-sm font-medium text-zinc-700">Contractor</p>
        <p className="text-sm">
          {contractorName}
          {contractorInactive && <span className="text-zinc-500"> (inactive: can still be paid)</span>}
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Payment date</label>
          <input type="date" max={todayInPakistan()} {...register("paymentDate")} className={inputClass} />
          {errors.paymentDate && <p className="mt-1 text-xs text-red-600">{errors.paymentDate.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Cash paid (Rs)</label>
          <input
            type="number"
            step="0.01"
            min="0.01"
            {...register("amount", { onChange: () => setAmountTouched(true) })}
            className={inputClass}
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
        </div>
      </div>

      <fieldset>
        <legend className="mb-2 text-sm font-medium text-zinc-700">Batches this cash covers (optional)</legend>
        {eligible.length === 0 ? (
          <p className="rounded border border-dashed border-zinc-300 p-4 text-sm text-zinc-500">
            No unpaid batches completed on or before this date. The whole payment will be unlinked.
          </p>
        ) : (
          <table className="w-full rounded border border-zinc-200 text-sm text-zinc-900">
            <thead>
              <tr className="border-b border-zinc-200 text-left text-xs text-zinc-500">
                <th className="px-3 py-2" />
                <th className="px-3 py-2">Batch</th>
                <th className="px-3 py-2">Completed</th>
                <th className="px-3 py-2 text-right">Unpaid</th>
                <th className="px-3 py-2 text-right">Pay against it</th>
              </tr>
            </thead>
            <tbody>
              {eligible.map((batch) => {
                const isTicked = batch.batchId in ticked;
                const error = batchError(batch);
                return (
                  <tr key={batch.batchId} className="border-b border-zinc-100 align-top">
                    <td className="px-3 py-2">
                      <input
                        type="checkbox"
                        checked={isTicked}
                        onChange={() => toggle(batch)}
                        aria-label={`Pay batch ${batch.batchNumber}`}
                      />
                    </td>
                    <td className="px-3 py-2">{batch.batchNumber}</td>
                    <td className="px-3 py-2">{batch.completionDate}</td>
                    <td className="px-3 py-2 text-right">{formatRs(batch.unpaid)}</td>
                    <td className="px-3 py-2 text-right">
                      {isTicked && (
                        <>
                          <input
                            type="number"
                            step="0.01"
                            min="0.01"
                            max={batch.unpaid}
                            value={ticked[batch.batchId]}
                            onChange={(e) => setTicked((current) => ({ ...current, [batch.batchId]: e.target.value }))}
                            className="w-32 rounded border border-zinc-300 px-2 py-1 text-right text-sm"
                          />
                          {error && <p className="mt-1 text-xs text-red-600">{error}</p>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </fieldset>

      <dl className="grid grid-cols-2 gap-x-6 gap-y-1 rounded border border-zinc-100 bg-zinc-50 p-3 text-xs text-zinc-600">
        <div>
          <dt>Against batches</dt>
          <dd className="font-medium text-zinc-900">{formatRs(allocatedPaisa / 100)}</dd>
        </div>
        <div>
          <dt>Unlinked (advance / opening balance)</dt>
          <dd className={`font-medium ${unlinkedPaisa < 0 ? "text-red-600" : "text-zinc-900"}`}>
            {unlinkedPaisa < 0
              ? "The payment is less than the batch amounts"
              : formatRs(unlinkedPaisa / 100)}
          </dd>
        </div>
      </dl>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Note (optional)</label>
        <input {...register("note")} className={inputClass} />
        {errors.note && <p className="mt-1 text-xs text-red-600">{errors.note.message}</p>}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Record payment"}
      </button>
    </form>
  );
}
