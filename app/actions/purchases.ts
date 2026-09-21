"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import { purchaseInputSchema, type PurchaseInput } from "@/lib/purchases/schema";
import {
  createPurchaseRecord,
  updatePurchaseRecord,
  deletePurchaseRecord,
} from "@/lib/purchases/service";

export async function createPurchase(
  input: PurchaseInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = purchaseInputSchema.parse(input);
    const { id } = await createPurchaseRecord(parsed, user.id);
    revalidatePath("/purchases");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updatePurchase(id: string, input: PurchaseInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = purchaseInputSchema.parse(input);
    await updatePurchaseRecord(id, parsed, user.id);
    revalidatePath("/purchases");
    revalidatePath(`/purchases/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function deletePurchase(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await deletePurchaseRecord(id, user.id);
    revalidatePath("/purchases");
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
