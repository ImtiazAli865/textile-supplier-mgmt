"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  customerPaymentInputSchema,
  updateCustomerPaymentStatusInputSchema,
  type CustomerPaymentInput,
  type CustomerPaymentStatusUpdateInput,
} from "@/lib/customer-payments/schema";
import {
  recordCustomerPaymentRecord,
  updateCustomerPaymentStatusRecord,
} from "@/lib/customer-payments/service";

export type { ActionResult };

export async function recordCustomerPayment(
  input: CustomerPaymentInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = customerPaymentInputSchema.parse(input);
    const { id } = await recordCustomerPaymentRecord(parsed, user.id);
    revalidatePath(`/customers/${parsed.customerId}/ledger`);
    revalidatePath(`/customers/${parsed.customerId}`);
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCustomerPaymentStatus(
  input: CustomerPaymentStatusUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = updateCustomerPaymentStatusInputSchema.parse(input);
    await updateCustomerPaymentStatusRecord(parsed, user.id);
    // The affected customer isn't known here without an extra lookup; the calling page always
    // revalidates itself via router.refresh() (components/customer-payments/payment-status-actions.tsx),
    // matching components/customers/deactivate-reactivate-control.tsx's own precedent.
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
