"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { tradeNameInputSchema, type TradeNameInput } from "@/lib/trade-names/schema";
import { createTradeName, updateTradeName } from "@/app/actions/trade-names";

const emptyDefaults: TradeNameInput = {
  printedName: "",
  printedAddress: "",
  ntnNumber: "",
  salesTaxRegistrationNumber: "",
  nextChallanNumber: 1,
  nextInvoiceNumber: 1,
};

type TradeNameFormProps =
  | { mode: "create"; defaultValues?: undefined; tradeNameId?: undefined }
  | { mode: "edit"; defaultValues: TradeNameInput; tradeNameId: string };

export function TradeNameForm({ mode, defaultValues, tradeNameId }: TradeNameFormProps) {
  const router = useRouter();
  const submitLabel = mode === "create" ? "Add Trade Name" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<TradeNameInput>({
    resolver: zodResolver(tradeNameInputSchema),
    defaultValues: defaultValues ?? emptyDefaults,
  });

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof TradeNameInput, { message: messages[0] });
      }
    }
  }

  async function submit(data: TradeNameInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createTradeName(data);
        if (result.success) {
          router.push(`/trade-names/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updateTradeName(tradeNameId, data);
        if (result.success) {
          router.push(`/trade-names/${tradeNameId}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="max-w-2xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Printed name</label>
        <input
          {...register("printedName")}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        {errors.printedName && (
          <p className="mt-1 text-xs text-red-600">{errors.printedName.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Printed address</label>
        <textarea
          {...register("printedAddress")}
          rows={3}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        {errors.printedAddress && (
          <p className="mt-1 text-xs text-red-600">{errors.printedAddress.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            NTN number (optional)
          </label>
          <input
            {...register("ntnNumber")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Sales Tax Registration number (optional)
          </label>
          <input
            {...register("salesTaxRegistrationNumber")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>
      </div>

      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-1 text-sm font-medium text-zinc-700">Document number sequences</legend>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Next Challan number</label>
          <input
            type="number"
            min={1}
            step={1}
            {...register("nextChallanNumber", { valueAsNumber: true })}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.nextChallanNumber && (
            <p className="mt-1 text-xs text-red-600">{errors.nextChallanNumber.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Next Invoice number</label>
          <input
            type="number"
            min={1}
            step={1}
            {...register("nextInvoiceNumber", { valueAsNumber: true })}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.nextInvoiceNumber && (
            <p className="mt-1 text-xs text-red-600">{errors.nextInvoiceNumber.message}</p>
          )}
        </div>
      </fieldset>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : submitLabel}
      </button>
    </form>
  );
}
