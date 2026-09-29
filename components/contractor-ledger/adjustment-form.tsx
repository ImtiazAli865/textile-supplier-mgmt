"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordContractorAdjustment } from "@/app/actions/contractor-ledger";
import { adjustmentInputSchema, todayInPakistan, type AdjustmentInput } from "@/lib/contractor-ledger/schema";

/** A manual correction to what is owed, up or down, with a required reason (US4, FR-021).
 * It never changes any batch's figures or payment status (FR-022). */
export function AdjustmentForm({ contractorId, contractorName }: { contractorId: string; contractorName: string }) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<AdjustmentInput>({
    resolver: zodResolver(adjustmentInputSchema),
    defaultValues: { contractorId, type: "debit", amount: 0, entryDate: todayInPakistan(), reason: "" },
  });

  async function submit(data: AdjustmentInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await recordContractorAdjustment(data);
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
      className="max-w-xl space-y-5 rounded-lg border border-zinc-200 bg-white p-6 text-zinc-900"
    >
      <p className="text-sm text-zinc-600">
        Adjust what is owed to {contractorName}. Batch figures and payment status are not changed.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-zinc-700">Type</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="credit" {...register("type")} />
          Increase amount owed
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="debit" {...register("type")} />
          Decrease amount owed (deduction)
        </label>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Amount (Rs)</label>
          <input type="number" step="0.01" min="0.01" {...register("amount")} className={inputClass} />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Date</label>
          <input type="date" max={todayInPakistan()} {...register("entryDate")} className={inputClass} />
          {errors.entryDate && <p className="mt-1 text-xs text-red-600">{errors.entryDate.message}</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Reason</label>
        <input {...register("reason")} placeholder="e.g. damaged packets" className={inputClass} />
        {errors.reason && <p className="mt-1 text-xs text-red-600">{errors.reason.message}</p>}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Post adjustment"}
      </button>
    </form>
  );
}
