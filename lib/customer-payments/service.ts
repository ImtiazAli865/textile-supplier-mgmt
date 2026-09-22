import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type { CustomerPaymentInput, CustomerPaymentStatusUpdateInput } from "@/lib/customer-payments/schema";

/** Surfaces the DB-level guarantees record_customer_payment/update_customer_payment_status rely
 * on as friendly messages instead of a raw Postgres error, per contracts/server-actions.md
 * (mirrors lib/challans/service.ts's toFriendlyChallanError and
 * lib/performa-invoices/service.ts's toFriendlyPerformaInvoiceError). */
function toFriendlyCustomerPaymentError(error: { code?: string; message: string }): Error {
  const msg = error.message ?? "";

  if (msg.includes("CUSTOMER_NOT_FOUND")) {
    return new Error("Select a valid customer.");
  }
  if (msg.includes("REFERENCE_NOT_FOUND")) {
    return new Error("The selected invoice/PO does not exist.");
  }
  if (msg.includes("REFERENCE_WRONG_CUSTOMER")) {
    return new Error("That invoice/PO does not belong to this customer.");
  }
  if (msg.includes("PAYMENT_NOT_FOUND")) {
    return new Error("This payment does not exist.");
  }
  if (msg.includes("PAYMENT_STATUS_FINAL")) {
    return new Error("This payment's status is already final and cannot be changed again.");
  }
  if (msg.includes("INVALID_STATUS")) {
    return new Error("That is not a valid status to change a payment to.");
  }
  return new Error(error.message);
}

export async function recordCustomerPaymentRecord(
  input: CustomerPaymentInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("record_customer_payment", {
    p_customer_id: input.customerId,
    p_payment_date: input.paymentDate.slice(0, 10),
    p_amount: input.amount,
    p_cheque_number: input.chequeNumber,
    p_bank_name: input.bankName,
    p_reference_type: input.referenceType ?? null,
    p_reference_id: input.referenceId ?? null,
    p_user_id: userId,
  });
  if (error) throw toFriendlyCustomerPaymentError(error);
  return { id: data as string };
}

export async function updateCustomerPaymentStatusRecord(
  input: CustomerPaymentStatusUpdateInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_customer_payment_status", {
    p_id: input.id,
    p_new_status: input.newStatus,
    p_user_id: userId,
  });
  if (error) throw toFriendlyCustomerPaymentError(error);
}
