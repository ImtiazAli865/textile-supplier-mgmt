"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { supplierInputSchema, type SupplierInput } from "@/lib/suppliers/schema";
import {
  checkDuplicateSupplierName,
  createSupplier,
  updateSupplier,
} from "@/app/actions/suppliers";
import { ContactFields } from "@/components/suppliers/contact-fields";

const emptyDefaults: SupplierInput = {
  companyName: "",
  address: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "" },
  materials: [],
  paymentTerms: "",
  notes: "",
  rating: undefined,
  contacts: [{ name: "", phone: "", email: "", role: "" }],
};

type SupplierFormProps =
  | { mode: "create"; defaultValues?: undefined; supplierId?: undefined }
  | { mode: "edit"; defaultValues: SupplierInput; supplierId: string };

export function SupplierForm({ mode, defaultValues, supplierId }: SupplierFormProps) {
  const router = useRouter();
  const submitLabel = mode === "create" ? "Add Supplier" : "Save Changes";
  const [materialsText, setMaterialsText] = useState((defaultValues?.materials ?? []).join(", "));
  const [duplicateWarning, setDuplicateWarning] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<SupplierInput>({
    resolver: zodResolver(supplierInputSchema),
    defaultValues: defaultValues ?? emptyDefaults,
  });
  const {
    register,
    handleSubmit,
    setValue,
    setError,
    formState: { errors },
  } = form;

  async function handleCompanyNameBlur(event: React.FocusEvent<HTMLInputElement>) {
    const name = event.target.value;
    if (!name.trim()) {
      setDuplicateWarning(null);
      return;
    }
    const matches = await checkDuplicateSupplierName(name, supplierId);
    setDuplicateWarning(
      matches.length > 0
        ? `A supplier named "${matches[0].companyName}" already exists. You can still save this record.`
        : null
    );
  }

  function handleMaterialsBlur() {
    const materials = materialsText
      .split(",")
      .map((m) => m.trim())
      .filter(Boolean);
    setValue("materials", materials, { shouldValidate: true });
  }

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof SupplierInput, { message: messages[0] });
      }
    }
  }

  async function submit(data: SupplierInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const result = await createSupplier(data);
        if (result.success) {
          router.push(`/suppliers/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updateSupplier(supplierId, data);
        if (result.success) {
          router.push(`/suppliers/${supplierId}`);
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
        onSubmit={handleSubmit(submit)}
        className="max-w-2xl space-y-6 rounded-lg border border-zinc-200 bg-white p-6"
      >
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Company name</label>
          <input
            {...register("companyName")}
            onBlur={handleCompanyNameBlur}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.companyName && (
            <p className="mt-1 text-xs text-red-600">{errors.companyName.message}</p>
          )}
          {duplicateWarning && <p className="mt-1 text-xs text-amber-600">{duplicateWarning}</p>}
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-medium text-zinc-700">Address</legend>
          <input
            placeholder="Line 1"
            {...register("address.line1")}
            className="col-span-2 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Line 2 (optional)"
            {...register("address.line2")}
            className="col-span-2 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="City"
            {...register("address.city")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="State (optional)"
            {...register("address.state")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Postal code (optional)"
            {...register("address.postalCode")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Country"
            {...register("address.country")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.address?.line1 && (
            <p className="col-span-2 text-xs text-red-600">{errors.address.line1.message}</p>
          )}
          {errors.address?.city && (
            <p className="col-span-2 text-xs text-red-600">{errors.address.city.message}</p>
          )}
          {errors.address?.country && (
            <p className="col-span-2 text-xs text-red-600">{errors.address.country.message}</p>
          )}
        </fieldset>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Materials / fabric types (comma-separated)
          </label>
          <input
            value={materialsText}
            onChange={(e) => setMaterialsText(e.target.value)}
            onBlur={handleMaterialsBlur}
            placeholder="e.g. cotton, denim, silk"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.materials && (
            <p className="mt-1 text-xs text-red-600">{errors.materials.message}</p>
          )}
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Payment terms</label>
          <input
            {...register("paymentTerms")}
            placeholder="e.g. Net 30"
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.paymentTerms && (
            <p className="mt-1 text-xs text-red-600">{errors.paymentTerms.message}</p>
          )}
        </div>

        <ContactFields />

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Rating (1-5, optional)
          </label>
          <select
            {...register("rating", { setValueAs: (v) => (v === "" ? undefined : Number(v)) })}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
            defaultValue=""
          >
            <option value="">No rating</option>
            {[1, 2, 3, 4, 5].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">
            Internal notes (optional)
          </label>
          <textarea
            {...register("notes")}
            rows={3}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
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
    </FormProvider>
  );
}
