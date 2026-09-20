"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { FormProvider, useFieldArray, useForm, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { customerUpdateInputSchema, type CustomerUpdateInput } from "@/lib/customers/schema";
import { createCustomer, updateCustomer } from "@/app/actions/customers";

interface TradeNameOption {
  id: string;
  printedName: string;
}

const emptyDefaults: CustomerUpdateInput = {
  displayName: "",
  legalName: "",
  billingAddress: { line1: "", line2: "", city: "", state: "", postalCode: "", country: "" },
  telephone: "",
  ntnNumber: "",
  salesTaxRegistrationNumber: "",
  issuesPerformaInvoice: false,
  paymentTermsMinDays: 0,
  paymentTermsMaxDays: 0,
  contacts: [{ name: "", phone: "", email: "", role: "" }],
  shipToAddresses: [],
  tradeNameHintIds: [],
};

function CustomerContactFields() {
  const {
    register,
    control,
    formState: { errors },
  } = useFormContext<CustomerUpdateInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "contacts" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="block text-sm font-medium text-zinc-700">Contacts</span>
        <button
          type="button"
          onClick={() => append({ name: "", phone: "", email: "", role: "" })}
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          + Add contact
        </button>
      </div>
      <div className="space-y-3">
        {fields.map((field, index) => {
          const contactErrors = errors.contacts?.[index];
          return (
            <div key={field.id} className="grid grid-cols-2 gap-2 rounded border border-zinc-200 p-3">
              <input
                placeholder="Name"
                {...register(`contacts.${index}.name` as const)}
                className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Phone"
                {...register(`contacts.${index}.phone` as const)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Email"
                {...register(`contacts.${index}.email` as const)}
                className="rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              <input
                placeholder="Role (optional)"
                {...register(`contacts.${index}.role` as const)}
                className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
              />
              {contactErrors?.phone && (
                <p className="col-span-2 text-xs text-red-600">{contactErrors.phone.message}</p>
              )}
              {fields.length > 1 && (
                <button
                  type="button"
                  onClick={() => remove(index)}
                  className="col-span-2 justify-self-end text-xs text-red-600 hover:underline"
                >
                  Remove contact
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShipToAddressFields() {
  const { register, control } = useFormContext<CustomerUpdateInput>();
  const { fields, append, remove } = useFieldArray({ control, name: "shipToAddresses" });

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="block text-sm font-medium text-zinc-700">
          Ship-to / warehouse addresses (optional)
        </span>
        <button
          type="button"
          onClick={() =>
            append({ label: "", line1: "", line2: "", city: "", state: "", postalCode: "", country: "" })
          }
          className="text-sm text-zinc-600 underline hover:text-zinc-900"
        >
          + Add address
        </button>
      </div>
      <div className="space-y-3">
        {fields.map((field, index) => (
          <div key={field.id} className="grid grid-cols-2 gap-2 rounded border border-zinc-200 p-3">
            <input
              placeholder="Label (optional)"
              {...register(`shipToAddresses.${index}.label` as const)}
              className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Line 1"
              {...register(`shipToAddresses.${index}.line1` as const)}
              className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Line 2 (optional)"
              {...register(`shipToAddresses.${index}.line2` as const)}
              className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="City"
              {...register(`shipToAddresses.${index}.city` as const)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="State (optional)"
              {...register(`shipToAddresses.${index}.state` as const)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Postal code (optional)"
              {...register(`shipToAddresses.${index}.postalCode` as const)}
              className="rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <input
              placeholder="Country"
              {...register(`shipToAddresses.${index}.country` as const)}
              className="col-span-2 rounded border border-zinc-300 px-2 py-1 text-sm"
            />
            <button
              type="button"
              onClick={() => remove(index)}
              className="col-span-2 justify-self-end text-xs text-red-600 hover:underline"
            >
              Remove address
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function TradeNameHintFields({ options }: { options: TradeNameOption[] }) {
  const { watch, setValue } = useFormContext<CustomerUpdateInput>();
  const selected = watch("tradeNameHintIds") ?? [];
  const available = options.filter((o) => !selected.includes(o.id));

  function addHint(id: string) {
    if (!id) return;
    setValue("tradeNameHintIds", [...selected, id], { shouldValidate: true });
  }
  function removeHint(id: string) {
    setValue(
      "tradeNameHintIds",
      selected.filter((s) => s !== id),
      { shouldValidate: true }
    );
  }

  return (
    <div>
      <label className="mb-1 block text-sm font-medium text-zinc-700">
        Usable trade names (hint only — never restricts which trade name a later document uses)
      </label>
      {selected.length > 0 && (
        <div className="mb-2 flex flex-wrap gap-2">
          {selected.map((id, index) => {
            const option = options.find((o) => o.id === id);
            return (
              <span
                key={id}
                className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2 py-1 text-xs text-zinc-700"
              >
                {index === 0 && <span title="Primary/default hint">★</span>}
                {option?.printedName ?? id}
                <button
                  type="button"
                  onClick={() => removeHint(id)}
                  className="text-zinc-400 hover:text-red-600"
                >
                  ×
                </button>
              </span>
            );
          })}
        </div>
      )}
      {available.length > 0 && (
        <select
          value=""
          onChange={(e) => addHint(e.target.value)}
          className="rounded border border-zinc-300 px-3 py-2 text-sm"
        >
          <option value="">+ Add trade name hint</option>
          {available.map((o) => (
            <option key={o.id} value={o.id}>
              {o.printedName}
            </option>
          ))}
        </select>
      )}
    </div>
  );
}

type CustomerFormProps =
  | {
      mode: "create";
      defaultValues?: undefined;
      customerId?: undefined;
      tradeNameOptions: TradeNameOption[];
    }
  | {
      mode: "edit";
      defaultValues: CustomerUpdateInput;
      customerId: string;
      tradeNameOptions: TradeNameOption[];
    };

export function CustomerForm({ mode, defaultValues, customerId, tradeNameOptions }: CustomerFormProps) {
  const router = useRouter();
  const submitLabel = mode === "create" ? "Add Customer" : "Save Changes";
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Opening balance is deliberately NOT part of the react-hook-form/zod-managed fields —
  // it only ever exists in create mode (FR-013) and is folded into the payload manually
  // at submit time, so a blank amount never trips validation for a customer with no
  // real opening balance to record.
  const [openingAmount, setOpeningAmount] = useState("");
  const [openingType, setOpeningType] = useState<"debit" | "credit">("credit");
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().slice(0, 10));

  const form = useForm<CustomerUpdateInput>({
    resolver: zodResolver(customerUpdateInputSchema),
    defaultValues: defaultValues ?? emptyDefaults,
  });
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = form;

  function handleFailure(result: { error: string; fieldErrors?: Record<string, string[]> }) {
    setFormError(result.error);
    if (result.fieldErrors) {
      for (const [field, messages] of Object.entries(result.fieldErrors)) {
        setError(field as keyof CustomerUpdateInput, { message: messages[0] });
      }
    }
  }

  async function submit(data: CustomerUpdateInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      if (mode === "create") {
        const amount = Number(openingAmount);
        const openingBalance =
          openingAmount.trim() !== "" && amount > 0
            ? { amount, type: openingType, asOfDate: openingDate }
            : undefined;
        const result = await createCustomer({ ...data, openingBalance });
        if (result.success) {
          router.push(`/customers/${result.data.id}`);
          router.refresh();
          return;
        }
        handleFailure(result);
      } else {
        const result = await updateCustomer(customerId, data);
        if (result.success) {
          router.push(`/customers/${customerId}`);
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
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Display name</label>
            <input
              {...register("displayName")}
              placeholder="e.g. Habbitt"
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.displayName && (
              <p className="mt-1 text-xs text-red-600">{errors.displayName.message}</p>
            )}
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">
              Legal name (for tax documents)
            </label>
            <input
              {...register("legalName")}
              placeholder="e.g. Universal Retail (Pvt) Ltd"
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.legalName && (
              <p className="mt-1 text-xs text-red-600">{errors.legalName.message}</p>
            )}
          </div>
        </div>

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-medium text-zinc-700">Billing address</legend>
          <input
            placeholder="Line 1"
            {...register("billingAddress.line1")}
            className="col-span-2 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Line 2 (optional)"
            {...register("billingAddress.line2")}
            className="col-span-2 rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="City"
            {...register("billingAddress.city")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="State (optional)"
            {...register("billingAddress.state")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Postal code (optional)"
            {...register("billingAddress.postalCode")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          <input
            placeholder="Country"
            {...register("billingAddress.country")}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.billingAddress?.line1 && (
            <p className="col-span-2 text-xs text-red-600">{errors.billingAddress.line1.message}</p>
          )}
          {errors.billingAddress?.city && (
            <p className="col-span-2 text-xs text-red-600">{errors.billingAddress.city.message}</p>
          )}
          {errors.billingAddress?.country && (
            <p className="col-span-2 text-xs text-red-600">{errors.billingAddress.country.message}</p>
          )}
        </fieldset>

        <ShipToAddressFields />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">Telephone (optional)</label>
            <input
              {...register("telephone")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-sm font-medium text-zinc-700">NTN number (optional)</label>
            <input
              {...register("ntnNumber")}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
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

        <fieldset className="grid grid-cols-2 gap-3">
          <legend className="mb-1 text-sm font-medium text-zinc-700">
            Payment terms (expected range — actual payments are always recorded as they really
            happen, independent of this range)
          </legend>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Minimum days</label>
            <input
              type="number"
              min={0}
              step={1}
              {...register("paymentTermsMinDays", { valueAsNumber: true })}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label className="mb-1 block text-xs text-zinc-500">Maximum days</label>
            <input
              type="number"
              min={0}
              step={1}
              {...register("paymentTermsMaxDays", { valueAsNumber: true })}
              className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
            />
            {errors.paymentTermsMaxDays && (
              <p className="mt-1 text-xs text-red-600">{errors.paymentTermsMaxDays.message}</p>
            )}
          </div>
        </fieldset>

        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input type="checkbox" {...register("issuesPerformaInvoice")} />
          Issues Performa Invoice
        </label>

        <CustomerContactFields />

        <TradeNameHintFields options={tradeNameOptions} />

        {mode === "create" && (
          <fieldset className="grid grid-cols-3 gap-3 rounded border border-zinc-200 p-3">
            <legend className="mb-1 text-sm font-medium text-zinc-700">
              Opening balance (optional — only relevant at go-live)
            </legend>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Amount</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={openingAmount}
                onChange={(e) => setOpeningAmount(e.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">Type</label>
              <select
                value={openingType}
                onChange={(e) => setOpeningType(e.target.value as "debit" | "credit")}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              >
                <option value="credit">Credit (customer owes)</option>
                <option value="debit">Debit</option>
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs text-zinc-500">As-of date</label>
              <input
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="w-full rounded border border-zinc-300 px-2 py-1 text-sm"
              />
            </div>
          </fieldset>
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
