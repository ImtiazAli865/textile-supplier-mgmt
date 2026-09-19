"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { purchaseInputSchema, type PurchaseInput, type PurchaseMode } from "@/lib/purchases/schema";
import { createPurchase, updatePurchase } from "@/app/actions/purchases";

const todayIsoDate = () => new Date().toISOString().slice(0, 10);

/** Flat superset of both PurchaseInput branches — the form always holds every field,
 * and `mode` decides which subset is actually sent (and validated) on submit. */
type PurchaseFormValues = {
  mode: PurchaseMode;
  supplierId: string;
  purchaseDate: string;
  weightKg: number;
  ratePerKg: number;
  productId: string;
  quantityUnits: number;
  ratePerUnit: number;
};

const emptyDefaults: PurchaseFormValues = {
  mode: "weight",
  supplierId: "",
  purchaseDate: todayIsoDate(),
  weightKg: 0,
  ratePerKg: 0,
  productId: "",
  quantityUnits: 0,
  ratePerUnit: 0,
};

type PurchaseFormProps = {
  activeSuppliers: { id: string; companyName: string }[];
  activeTradedProducts: { id: string; name: string; stockUom: string }[];
} & (
  | { mode: "create"; defaultValues?: undefined; purchaseId?: undefined }
  | { mode: "edit"; defaultValues: PurchaseFormValues; purchaseId: string }
);

export function PurchaseForm({
  mode: formMode,
  defaultValues,
  purchaseId,
  activeSuppliers,
  activeTradedProducts,
}: PurchaseFormProps) {
  const router = useRouter();
  const submitLabel = formMode === "create" ? "Add Purchase" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    control,
    formState: { errors },
  } = useForm<PurchaseFormValues>({
    defaultValues: defaultValues ?? emptyDefaults,
  });

  const [
    purchaseMode,
    watchedWeightKg,
    watchedRatePerKg,
    watchedQuantityUnits,
    watchedRatePerUnit,
  ] = useWatch({
    control,
    name: ["mode", "weightKg", "ratePerKg", "quantityUnits", "ratePerUnit"],
  });

  const totalCostPreview =
    purchaseMode === "weight"
      ? Math.round((Number(watchedWeightKg) || 0) * (Number(watchedRatePerKg) || 0) * 100) / 100
      : Math.round((Number(watchedQuantityUnits) || 0) * (Number(watchedRatePerUnit) || 0) * 100) /
        100;

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof PurchaseFormValues, { message: messages[0] });
      }
    }
  }

  async function submit(data: PurchaseFormValues) {
    setFormError(null);

    const candidate: PurchaseInput =
      data.mode === "weight"
        ? {
            mode: "weight",
            supplierId: data.supplierId,
            purchaseDate: data.purchaseDate,
            weightKg: data.weightKg,
            ratePerKg: data.ratePerKg,
          }
        : {
            mode: "unit",
            supplierId: data.supplierId,
            purchaseDate: data.purchaseDate,
            productId: data.productId,
            quantityUnits: data.quantityUnits,
            ratePerUnit: data.ratePerUnit,
          };

    const parsed = purchaseInputSchema.safeParse(candidate);
    if (!parsed.success) {
      for (const issue of parsed.error.issues) {
        setError(issue.path.join(".") as keyof PurchaseFormValues, { message: issue.message });
      }
      return;
    }

    setIsSubmitting(true);
    try {
      if (formMode === "create") {
        const result = await createPurchase(parsed.data);
        if (result.success) {
          router.push(`/purchases/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updatePurchase(purchaseId, parsed.data);
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
        <label className="mb-1 block text-sm font-medium text-zinc-700">Purchase mode</label>
        <select
          {...register("mode")}
          disabled={formMode === "edit"}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm disabled:bg-zinc-100"
        >
          <option value="weight">Per-kg (raw material)</option>
          <option value="unit">Per-unit (traded item)</option>
        </select>
      </div>

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

      {purchaseMode === "weight" ? (
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
      ) : (
        <>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Product</label>
            <select
              {...register("productId")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              defaultValue={defaultValues?.productId ?? ""}
            >
              <option value="" disabled>
                Select a traded product
              </option>
              {activeTradedProducts.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} ({p.stockUom})
                </option>
              ))}
            </select>
            {errors.productId && (
              <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Quantity</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("quantityUnits")}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errors.quantityUnits && (
                <p className="mt-1 text-xs text-red-600">{errors.quantityUnits.message}</p>
              )}
            </div>
            <div>
              <label className="mb-1 block text-sm font-medium text-zinc-700">Rate per unit</label>
              <input
                type="number"
                step="0.01"
                min="0"
                {...register("ratePerUnit")}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              />
              {errors.ratePerUnit && (
                <p className="mt-1 text-xs text-red-600">{errors.ratePerUnit.message}</p>
              )}
            </div>
          </div>
        </>
      )}

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
