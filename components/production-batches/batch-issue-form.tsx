"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {
  batchIssueInputSchema,
  todayInPakistan,
  type BatchIssueInput,
  type LotOption,
  type ManufacturedProductOption,
} from "@/lib/production-batches/schema";
import { issueProductionBatch, updateProductionBatch } from "@/app/actions/production-batches";

type BatchIssueFormProps = {
  lots: LotOption[];
  products: ManufacturedProductOption[];
  contractors: { id: string; name: string }[];
} & ({ mode: "create" } | { mode: "edit"; batchId: string; defaultValues: BatchIssueInput });

/** Issue (create) and edit form for an Issued batch — FR-003, FR-007, FR-008, FR-011. The
 * labour rate is pre-filled only when staff pick a product; on edit the stored rate is kept
 * until the product is actually changed. */
export function BatchIssueForm(props: BatchIssueFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    control,
    formState: { errors },
  } = useForm<BatchIssueInput>({
    resolver: zodResolver(batchIssueInputSchema),
    defaultValues:
      props.mode === "edit"
        ? props.defaultValues
        : {
            lotId: "",
            productId: "",
            contractorId: "",
            weightIssuedKg: undefined,
            labourRatePerPacket: undefined,
            issueDate: todayInPakistan(),
          },
  });

  const productId = useWatch({ control, name: "productId" });
  const lotId = useWatch({ control, name: "lotId" });
  const weight = Number(useWatch({ control, name: "weightIssuedKg" }));
  const product = props.products.find((p) => p.id === productId);
  const lot = props.lots.find((l) => l.id === lotId);
  const expectedPackets =
    product && Number.isFinite(weight) && weight > 0
      ? Math.floor(weight * product.expectedYieldPerKg)
      : null;

  const productField = register("productId");

  async function submit(data: BatchIssueInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (props.mode === "edit") {
        const result = await updateProductionBatch(props.batchId, data);
        if (result.success) {
          router.push(`/production-batches/${props.batchId}`);
          router.refresh();
          return;
        }
        setFormError(result.error);
        applyFieldErrors(result.fieldErrors);
      } else {
        const result = await issueProductionBatch(data);
        if (result.success) {
          router.push(`/production-batches/${result.data.id}`);
          router.refresh();
          return;
        }
        setFormError(result.error);
        applyFieldErrors(result.fieldErrors);
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  function applyFieldErrors(fieldErrors?: Record<string, string[]>) {
    if (!fieldErrors) return;
    for (const [field, messages] of Object.entries(fieldErrors)) {
      setError(field as keyof BatchIssueInput, { message: messages[0] });
    }
  }

  const inputClass = "w-full rounded border border-zinc-300 px-3 py-2 text-sm";

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="max-w-xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Fabric lot</label>
        <select {...register("lotId")} className={inputClass}>
          <option value="">Select a lot…</option>
          {props.lots.map((l) => (
            <option key={l.id} value={l.id}>
              {l.label}
            </option>
          ))}
        </select>
        {props.lots.length === 0 && (
          <p className="mt-1 text-xs text-zinc-500">No fabric lots have weight remaining.</p>
        )}
        {errors.lotId && <p className="mt-1 text-xs text-red-600">{errors.lotId.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Weight issued (kg)</label>
        <input
          type="number"
          step="0.01"
          min="0"
          {...register("weightIssuedKg")}
          className={inputClass}
        />
        {lot && (
          <p className="mt-1 text-xs text-zinc-500">
            Available on this lot: {lot.remainingWeightKg.toFixed(2)} kg
          </p>
        )}
        {errors.weightIssuedKg && (
          <p className="mt-1 text-xs text-red-600">{errors.weightIssuedKg.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Manufactured product</label>
        <select
          {...productField}
          onChange={(e) => {
            productField.onChange(e);
            const selected = props.products.find((p) => p.id === e.target.value);
            if (selected) {
              setValue("labourRatePerPacket", selected.defaultLabourRatePerPacket, {
                shouldValidate: true,
              });
            }
          }}
          className={inputClass}
        >
          <option value="">Select a product…</option>
          {props.products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {errors.productId && <p className="mt-1 text-xs text-red-600">{errors.productId.message}</p>}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Contractor</label>
        <select {...register("contractorId")} className={inputClass}>
          <option value="">Select a contractor…</option>
          {props.contractors.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        {errors.contractorId && (
          <p className="mt-1 text-xs text-red-600">{errors.contractorId.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Labour rate per packet (Rs)
        </label>
        <input
          type="number"
          step="0.01"
          min="0"
          {...register("labourRatePerPacket")}
          className={inputClass}
        />
        <p className="mt-1 text-xs text-zinc-500">
          Pre-filled from the product&apos;s default; the rate entered here is what this batch uses.
        </p>
        {errors.labourRatePerPacket && (
          <p className="mt-1 text-xs text-red-600">{errors.labourRatePerPacket.message}</p>
        )}
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Issue date</label>
        <input type="date" {...register("issueDate")} className={inputClass} />
        {errors.issueDate && <p className="mt-1 text-xs text-red-600">{errors.issueDate.message}</p>}
      </div>

      {expectedPackets !== null && (
        <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          Expected ≈ <strong>{expectedPackets.toLocaleString()}</strong> packets (suggestion only,
          from the product&apos;s expected yield of {product?.expectedYieldPerKg} packets/kg)
        </p>
      )}

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : props.mode === "create" ? "Issue batch" : "Save changes"}
      </button>
    </form>
  );
}
