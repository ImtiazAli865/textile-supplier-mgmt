"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { recordCustomerPayment } from "@/app/actions/customer-payments";
import {
  customerPaymentInputSchema,
  type CustomerPaymentInput,
} from "@/lib/customer-payments/schema";

interface CustomerPaymentFormProps {
  customerId: string;
  customerDisplayName: string;
  poOptions: { id: string; poNumber: string }[];
  invoiceOptions: { id: string; invoiceNumber: string }[];
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * Records a customer payment (cheque) — date, amount, cheque number, bank name, and an optional
 * invoice/PO reference (display-only, FR-005). No edit mode exists — a payment's fields have no
 * update path anywhere in this feature (FR-008); only its status may later change, via
 * components/customer-payments/payment-status-actions.tsx, not this form.
 */
export function CustomerPaymentForm({
  customerId,
  customerDisplayName,
  poOptions,
  invoiceOptions,
}: CustomerPaymentFormProps) {
  const router = useRouter();
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [referenceKind, setReferenceKind] = useState<"" | "customer_po" | "performa_invoice">("");

  const {
    register,
    handleSubmit,
    setError,
    setValue,
    watch,
    formState: { errors },
  } = useForm<CustomerPaymentInput>({
    resolver: zodResolver(customerPaymentInputSchema),
    defaultValues: {
      customerId,
      paymentDate: todayIso(),
      amount: 0,
      chequeNumber: "",
      bankName: "",
    },
  });

  const referenceId = watch("referenceId");

  function handleReferenceKindChange(kind: "" | "customer_po" | "performa_invoice") {
    setReferenceKind(kind);
    setValue("referenceId", undefined);
    setValue("referenceType", kind === "" ? undefined : kind);
  }

  async function submit(data: CustomerPaymentInput) {
    setFormError(null);
    setIsSubmitting(true);
    try {
      const result = await recordCustomerPayment(data);
      if (result.success) {
        router.push(`/customers/${customerId}/ledger`);
        router.refresh();
        return;
      }
      setFormError(result.error);
      if (result.fieldErrors) {
        for (const [field, messages] of Object.entries(result.fieldErrors)) {
          setError(field as keyof CustomerPaymentInput, { message: messages[0] });
        }
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit(submit)}
      className="max-w-xl space-y-4 rounded-lg border border-zinc-200 bg-white p-6"
    >
      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">Customer</label>
        <p className="rounded border border-zinc-200 bg-zinc-50 px-3 py-2 text-sm text-zinc-700">
          {customerDisplayName}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Payment date</label>
          <input
            type="date"
            {...register("paymentDate")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.paymentDate && <p className="mt-1 text-xs text-red-600">{errors.paymentDate.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Amount (Rs)</label>
          <input
            type="number"
            step="0.01"
            min={0.01}
            {...register("amount")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.amount && <p className="mt-1 text-xs text-red-600">{errors.amount.message}</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Cheque number</label>
          <input
            {...register("chequeNumber")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.chequeNumber && <p className="mt-1 text-xs text-red-600">{errors.chequeNumber.message}</p>}
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-zinc-700">Bank name</label>
          <input
            {...register("bankName")}
            className="w-full rounded border border-zinc-300 px-3 py-2 text-sm"
          />
          {errors.bankName && <p className="mt-1 text-xs text-red-600">{errors.bankName.message}</p>}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-sm font-medium text-zinc-700">
          Reference an invoice/PO (optional — leave blank for an untied lump-sum payment against
          the overall balance)
        </label>
        <div className="flex items-center gap-2">
          <select
            value={referenceKind}
            onChange={(e) => handleReferenceKindChange(e.target.value as typeof referenceKind)}
            className="rounded border border-zinc-300 px-3 py-2 text-sm"
          >
            <option value="">No reference</option>
            <option value="customer_po" disabled={poOptions.length === 0}>
              Purchase Order
            </option>
            <option value="performa_invoice" disabled={invoiceOptions.length === 0}>
              Performa Invoice
            </option>
          </select>
          {referenceKind === "customer_po" && (
            <select
              value={referenceId ?? ""}
              onChange={(e) => setValue("referenceId", e.target.value || undefined)}
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Select a PO…</option>
              {poOptions.map((po) => (
                <option key={po.id} value={po.id}>
                  {po.poNumber}
                </option>
              ))}
            </select>
          )}
          {referenceKind === "performa_invoice" && (
            <select
              value={referenceId ?? ""}
              onChange={(e) => setValue("referenceId", e.target.value || undefined)}
              className="flex-1 rounded border border-zinc-300 px-3 py-2 text-sm"
            >
              <option value="">Select an invoice…</option>
              {invoiceOptions.map((invoice) => (
                <option key={invoice.id} value={invoice.id}>
                  Invoice #{invoice.invoiceNumber}
                </option>
              ))}
            </select>
          )}
        </div>
        {errors.referenceId && <p className="mt-1 text-xs text-red-600">{errors.referenceId.message}</p>}
      </div>

      {formError && <p className="text-sm text-red-600">{formError}</p>}

      <button
        type="submit"
        disabled={isSubmitting}
        className="rounded bg-zinc-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
      >
        {isSubmitting ? "Saving…" : "Record Payment"}
      </button>
    </form>
  );
}
