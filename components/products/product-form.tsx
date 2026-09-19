"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  productUpdateInputSchema,
  type ProductType,
  type ProductUpdateInput,
} from "@/lib/products/schema";
import { createProduct, updateProduct } from "@/app/actions/products";

type FormFields = ProductUpdateInput;

const emptyDefaults: FormFields = {
  name: "",
  internalCode: "",
  stockUom: "",
  defaultSellingPrice: 0,
  expectedYieldPerKg: undefined,
  defaultLabourRatePerPacket: undefined,
};

type ProductFormProps =
  | { mode: "create" }
  | {
      mode: "edit";
      productId: string;
      existingType: ProductType;
      currentPurchaseCost: number | null;
      defaultValues: FormFields;
    };

export function ProductForm(props: ProductFormProps) {
  const router = useRouter();
  const submitLabel = props.mode === "create" ? "Add Product" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  let initialType: ProductType = "traded";
  let initialValues: FormFields = emptyDefaults;
  if (props.mode === "edit") {
    initialType = props.existingType;
    initialValues = props.defaultValues;
  }
  const [type, setType] = useState<ProductType>(initialType);

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<FormFields>({
    resolver: zodResolver(productUpdateInputSchema),
    defaultValues: initialValues,
  });

  const isManufactured = type === "manufactured";

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof FormFields, { message: messages[0] });
      }
    }
  }

  async function submit(data: FormFields) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (props.mode === "edit") {
        const result = await updateProduct(props.productId, data);
        if (result.success) {
          router.push(`/products/${props.productId}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const payload =
          type === "manufactured"
            ? {
                type: "manufactured" as const,
                name: data.name,
                internalCode: data.internalCode,
                stockUom: data.stockUom,
                defaultSellingPrice: data.defaultSellingPrice,
                expectedYieldPerKg: data.expectedYieldPerKg ?? 0,
                defaultLabourRatePerPacket: data.defaultLabourRatePerPacket ?? 0,
              }
            : {
                type: "traded" as const,
                name: data.name,
                internalCode: data.internalCode,
                stockUom: data.stockUom,
                defaultSellingPrice: data.defaultSellingPrice,
              };
        const result = await createProduct(payload);
        if (result.success) {
          router.push(`/products/${result.data.id}`);
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
        <label className="mb-1 block text-sm font-medium text-zinc-700">Type</label>
        {props.mode === "create" ? (
          <select
            value={type}
            onChange={(e) => setType(e.target.value as ProductType)}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="traded">Traded</option>
            <option value="manufactured">Manufactured</option>
          </select>
        ) : (
          <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
            {type === "traded" ? "Traded" : "Manufactured"} — fixed at creation; create a new
            product to change type
          </p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Name</label>
        <input
          {...register("name")}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
        {errors.name && <p className="mt-1 text-xs text-red-600">{errors.name.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Internal code (optional)
        </label>
        <input
          {...register("internalCode")}
          className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Stock unit of measure
          </label>
          <input
            {...register("stockUom")}
            placeholder="e.g. packet, yd, PAC"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.stockUom && (
            <p className="mt-1 text-xs text-red-600">{errors.stockUom.message}</p>
          )}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Default selling price
          </label>
          <input
            type="number"
            step="0.01"
            min="0"
            {...register("defaultSellingPrice")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.defaultSellingPrice && (
            <p className="mt-1 text-xs text-red-600">{errors.defaultSellingPrice.message}</p>
          )}
        </div>
      </div>

      {isManufactured && (
        <div className="grid grid-cols-2 gap-3 rounded border border-zinc-200 bg-zinc-50 p-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Expected yield (packets/kg)
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register("expectedYieldPerKg")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.expectedYieldPerKg && (
              <p className="mt-1 text-xs text-red-600">{errors.expectedYieldPerKg.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Default labour rate / packet
            </label>
            <input
              type="number"
              step="0.01"
              min="0"
              {...register("defaultLabourRatePerPacket")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.defaultLabourRatePerPacket && (
              <p className="mt-1 text-xs text-red-600">
                {errors.defaultLabourRatePerPacket.message}
              </p>
            )}
          </div>
        </div>
      )}

      {type === "traded" && (
        <div className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
          Current purchase cost:{" "}
          {props.mode === "edit" && props.currentPurchaseCost !== null
            ? `Rs ${props.currentPurchaseCost.toFixed(2)}`
            : "not yet established"}{" "}
          — set automatically once purchases are recorded
        </div>
      )}

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
