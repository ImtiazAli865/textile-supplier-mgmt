"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerPOUpdateInputSchema, type CustomerPOUpdateInput } from "@/lib/customer-pos/schema";
import {
  createCustomerPO,
  updateCustomerPO,
  uploadCustomerPOAttachment,
} from "@/app/actions/customer-pos";
import { CustomerPoLineRow } from "@/components/customer-pos/customer-po-line-row";

interface CustomerOption {
  id: string;
  displayName: string;
}

interface TradeNameOption {
  id: string;
  printedName: string;
}

interface ProductOption {
  id: string;
  name: string;
  stockUom: string;
}

const emptyLine = {
  customerItemCode: "",
  productId: "",
  description: "",
  quantityOrdered: 1,
  uom: "",
  unitPrice: 0,
};

const emptyDefaults: CustomerPOUpdateInput = {
  customerId: "",
  poNumber: "",
  orderDate: new Date().toISOString().slice(0, 10),
  purchaserName: "",
  requestedDeliveryDate: "",
  destinationText: "",
  tradeNameId: "",
  lines: [emptyLine],
};

type CustomerPoFormProps =
  | {
      mode: "create";
      defaultValues?: undefined;
      poId?: undefined;
      lockedLineIds?: undefined;
      customerOptions: CustomerOption[];
      tradeNameOptions: TradeNameOption[];
      productOptions: ProductOption[];
    }
  | {
      mode: "edit";
      defaultValues: CustomerPOUpdateInput;
      poId: string;
      lockedLineIds: Set<string>;
      customerOptions: CustomerOption[];
      tradeNameOptions: TradeNameOption[];
      productOptions: ProductOption[];
    };

export function CustomerPoForm({
  mode,
  defaultValues,
  poId,
  lockedLineIds,
  customerOptions,
  tradeNameOptions,
  productOptions,
}: CustomerPoFormProps) {
  const router = useRouter();
  const submitLabel = mode === "create" ? "Add Customer PO" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  // Only relevant in create mode: the PO doesn't exist yet, so the file is held locally
  // and uploaded as a follow-up step right after createCustomerPO returns a real id
  // (research.md's upload-after-create ordering) — never bundled into createCustomerPO.
  const [pendingFile, setPendingFile] = useState<File | null>(null);

  const form = useForm<CustomerPOUpdateInput>({
    resolver: zodResolver(customerPOUpdateInputSchema),
    defaultValues: defaultValues ?? emptyDefaults,
  });
  const {
    register,
    control,
    handleSubmit,
    setError,
    getValues,
    formState: { errors },
  } = form;
  const { fields, append, remove } = useFieldArray({ control, name: "lines" });

  const selectedCustomer = customerOptions.find((c) => c.id === defaultValues?.customerId);

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof CustomerPOUpdateInput, { message: messages[0] });
      }
    }
  }

  // Without this, a client-side validation failure react-hook-form doesn't have a rendered
  // {errors.x && ...} block for (e.g. the tradeNameId "" vs. uuid gap this bug report caught)
  // fails completely silently: handleSubmit's default behavior is to just refocus the first
  // invalid field with no visible feedback at all.
  function onInvalid() {
    setFormError("Please check the form for errors before submitting.");
  }

  async function submit(data: CustomerPOUpdateInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createCustomerPO(data);
        if (result.success) {
          if (pendingFile) {
            const formData = new FormData();
            formData.set("file", pendingFile);
            await uploadCustomerPOAttachment(result.data.id, formData);
          }
          router.push(`/customer-pos/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updateCustomerPO(poId, data);
        if (result.success) {
          router.push(`/customer-pos/${poId}`);
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
    <FormProvider {...form}>
      <form
        onSubmit={handleSubmit(submit, onInvalid)}
        className="max-w-3xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
      >
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Customer</label>
            {mode === "create" ? (
              <select
                {...register("customerId")}
                className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
              >
                <option value="">Select a customer…</option>
                {customerOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.displayName}
                  </option>
                ))}
              </select>
            ) : (
              <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
                {selectedCustomer?.displayName ?? "—"}
              </p>
            )}
            {errors.customerId && (
              <p className="mt-1 text-xs text-red-600">{errors.customerId.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">PO number</label>
            <input
              {...register("poNumber")}
              maxLength={30}
              placeholder='e.g. "P14337" or "111202110000440639"'
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.poNumber && (
              <p className="mt-1 text-xs text-red-600">{errors.poNumber.message}</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Order date</label>
            <input
              type="date"
              {...register("orderDate")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.orderDate && (
              <p className="mt-1 text-xs text-red-600">{errors.orderDate.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Requested delivery date (optional)
            </label>
            <input
              type="date"
              {...register("requestedDeliveryDate")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Purchaser name (optional)
            </label>
            <input
              {...register("purchaserName")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Trade name this PO bills under (optional)
            </label>
            <select
              {...register("tradeNameId")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">— none selected —</option>
              {tradeNameOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.printedName}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Destination / ship-to (optional — defaults to the customer&apos;s billing address when
            left blank)
          </label>
          <textarea
            {...register("destinationText")}
            rows={2}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="block text-sm font-medium text-zinc-700">Line items</span>
            <button
              type="button"
              onClick={() => append(emptyLine)}
              className="text-sm text-zinc-600 underline hover:text-zinc-900"
            >
              + Add line
            </button>
          </div>
          <div className="space-y-3">
            {fields.map((field, index) => {
              const lineId = getValues(`lines.${index}.id`);
              const locked =
                mode === "edit" && Boolean(lineId) && lockedLineIds?.has(lineId as string);
              return (
                <CustomerPoLineRow
                  key={field.id}
                  index={index}
                  productOptions={productOptions}
                  locked={locked}
                  onRemove={fields.length > 1 && !locked ? () => remove(index) : undefined}
                />
              );
            })}
          </div>
          {errors.lines?.message && (
            <p className="mt-1 text-xs text-red-600">{errors.lines.message}</p>
          )}
        </div>

        {mode === "create" && (
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Attach PO document (optional — e.g. Habbitt&apos;s PDF; never required for
              portal-based intake like Chaseup&apos;s)
            </label>
            <input
              type="file"
              onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              className="text-sm"
            />
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
    </FormProvider>
  );
}
