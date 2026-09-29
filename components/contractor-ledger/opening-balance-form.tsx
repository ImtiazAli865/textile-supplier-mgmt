"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordContractorOpeningBalance } from "@/app/actions/contractor-ledger";
import {
  openingBalanceInputSchema,
  todayInPakistan,
  type OpeningBalanceInput,
} from "@/lib/contractor-ledger/schema";

interface OpeningBalanceFormProps {
  contractorId: string;
  contractorName: string;
  /** The khata's earliest entry: the opening balance must be dated on or before it (FR-020). */
  earliestEntryDate: string | null;
}

/** The one-time go-live balance from the old Excel khata (US3), in either direction. */
export function OpeningBalanceForm({ contractorId, contractorName, earliestEntryDate }: OpeningBalanceFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const today = todayInPakistan();
  const maxDate = earliestEntryDate && earliestEntryDate < today ? earliestEntryDate : today;

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<OpeningBalanceInput>({
    resolver: zodResolver(openingBalanceInputSchema),
    defaultValues: { contractorId, direction: "owed", amount: 0, entryDate: maxDate },
  });

  async function submit(data: OpeningBalanceInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await recordContractorOpeningBalance(data);
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
        The balance carried over from {contractorName}&apos;s old khata. It can be recorded once;
        later corrections are made with an adjustment.
      </p>

      <fieldset className="space-y-2">
        <legend className="mb-1 text-sm font-medium text-zinc-700">Direction</legend>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="owed" {...register("direction")} />
          Owed to contractor (we still have to pay them)
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="radio" value="advance" {...register("direction")} />
          Advance already given (they owe us work)
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
          <input type="date" max={maxDate} {...register("entryDate")} className={inputClass} />
          {errors.entryDate && <p className="mt-1 text-xs text-red-600">{errors.entryDate.message}</p>}
          {earliestEntryDate && (
            <p className="mt-1 text-xs text-zinc-500">On or before {earliestEntryDate}, the first entry in this khata.</p>
          )}
        </div>
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Record opening balance"}
      </button>
    </form>
  );
}
