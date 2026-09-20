"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  customerPOInputSchema,
  customerPOUpdateInputSchema,
  type CustomerPOInput,
  type CustomerPOUpdateInput,
} from "@/lib/customer-pos/schema";
import {
  createCustomerPORecord,
  updateCustomerPORecord,
  setCustomerPOStatusRecord,
  addCustomerPOAttachmentRecord,
} from "@/lib/customer-pos/service";
import { resolveCustomerItemCode as resolveCustomerItemCodeLookup } from "@/lib/customer-pos/item-code-resolution";
import { uploadCustomerPOAttachment as uploadCustomerPOAttachmentFile } from "@/lib/customer-pos/storage";

export type { ActionResult };

export async function createCustomerPO(
  input: CustomerPOInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = customerPOInputSchema.parse(input);
    const { id } = await createCustomerPORecord(parsed, user.id);
    revalidatePath("/customer-pos");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCustomerPO(
  id: string,
  input: CustomerPOUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = customerPOUpdateInputSchema.parse(input);
    await updateCustomerPORecord(id, parsed, user.id);
    revalidatePath("/customer-pos");
    revalidatePath(`/customer-pos/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function cancelCustomerPO(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setCustomerPOStatusRecord(id, "cancelled", user.id);
    revalidatePath("/customer-pos");
    revalidatePath(`/customer-pos/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function reactivateCustomerPO(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setCustomerPOStatusRecord(id, "open", user.id);
    revalidatePath("/customer-pos");
    revalidatePath(`/customer-pos/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadCustomerPOAttachment(
  poId: string,
  formData: FormData
): Promise<ActionResult<{ id: string; fileName: string }>> {
  try {
    const user = await requireCurrentUser();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }
    const { path } = await uploadCustomerPOAttachmentFile(poId, file);
    const { id } = await addCustomerPOAttachmentRecord(
      poId,
      {
        storagePath: path,
        fileName: file.name,
        contentType: file.type || "application/octet-stream",
      },
      user.id
    );
    revalidatePath(`/customer-pos/${poId}`);
    return { success: true, data: { id, fileName: file.name } };
  } catch (error) {
    return fail(error);
  }
}

/**
 * Read exposed as a Server Action so a Client Component form can call it as staff type an
 * item code — still requires authentication (FR-018, contracts/server-actions.md's blanket
 * per-action auth rule).
 */
export async function resolveCustomerItemCode(customerId: string, itemCode: string) {
  try {
    await requireCurrentUser();
    const resolved = await resolveCustomerItemCodeLookup(customerId, itemCode);
    return { success: true, data: resolved } as const;
  } catch (error) {
    return fail(error);
  }
}
