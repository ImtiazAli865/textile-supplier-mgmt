"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { purchaseInputSchema, type PurchaseInput } from "@/lib/purchases/schema";
import { createPurchase, updatePurchase } from "@/app/actions/purchases";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

const emptyDefaults: PurchaseInput = {
  supplierId: "",
  purchaseDate: todayIsoDate(),
  weightKg: 0,
  ratePerKg: 0,
};

type PurchaseFormProps = {
  activeSuppliers: { id: string; companyName: string }[];
} & (
  | { mode: "create"; defaultValues?: undefined; purchaseId?: undefined }
  | { mode: "edit"; defaultValues: PurchaseInput; purchaseId: string }
);

export function PurchaseForm({
  mode,
  defaultValues,
  purchaseId,
  activeSuppliers,
}: PurchaseFormProps) {
  const router = useRouter();
  const submitLabel = mode === "create" ? "Add Purchase" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<PurchaseInput>({
    resolver: zodResolver(purchaseInputSchema),
    defaultValues: defaultValues ?? emptyDefaults,
  });

  const [watchedWeightKg, watchedRatePerKg] = useWatch({
    control,
    name: ["weightKg", "ratePerKg"],
  });
  const weightKg = Number(watchedWeightKg) || 0;
  const ratePerKg = Number(watchedRatePerKg) || 0;
  const totalCostPreview = Math.round(weightKg * ratePerKg * 100) / 100;

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof PurchaseInput, { message: messages[0] });
      }
    }
  }

  async function submit(data: PurchaseInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createPurchase(data);
        if (result.success) {
          router.push(`/purchases/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updatePurchase(purchaseId, data);
        if (result.success) {
          router.push(`/purchases/${purchaseId}`);
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
      className="max-w-lg space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Supplier</label>
        <select
          {...register("supplierId")}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          defaultValue={defaultValues?.supplierId ?? ""}
        >
          <option value="" disabled>
            Select a supplier
          </option>
          {activeSuppliers.map((s) => (
            <option key={s.id} value={s.id}>
              {s.companyName}
            </option>
          ))}
        </select>
        {errors.supplierId && (
          <p className="mt-1 text-xs text-red-600">{errors.supplierId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Purchase date</label>
        <input
          type="date"
          max={todayIsoDate()}
          {...register("purchaseDate")}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        {errors.purchaseDate && (
          <p className="mt-1 text-xs text-red-600">{errors.purchaseDate.message}</p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Weight (kg)</label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register("weightKg")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.weightKg && (
            <p className="mt-1 text-xs text-red-600">{errors.weightKg.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Rate per kg</label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register("ratePerKg")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.ratePerKg && (
            <p className="mt-1 text-xs text-red-600">{errors.ratePerKg.message}</p>
          )}
        </div>
      </div>

      <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
        Total cost: <span className="font-semibold">Rs {totalCostPreview.toFixed(2)}</span>
      </div>

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
