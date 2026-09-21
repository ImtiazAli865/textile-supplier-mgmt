"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  challanInputSchema,
  challanUpdateInputSchema,
  type ChallanInput,
  type ChallanUpdateInput,
} from "@/lib/challans/schema";
import {
  createChallanRecord,
  updateChallanRecord,
  voidChallanRecord,
  acceptChallanRecord,
  recordChallanSignedCopy,
} from "@/lib/challans/service";

export type { ActionResult };

export async function createChallan(input: ChallanInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = challanInputSchema.parse(input);
    const { id } = await createChallanRecord(parsed, user.id);
    revalidatePath("/challans");
    revalidatePath(`/customer-pos/${parsed.poId}`);
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateChallan(id: string, input: ChallanUpdateInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = challanUpdateInputSchema.parse(input);
    await updateChallanRecord(id, parsed, user.id);
    revalidatePath("/challans");
    revalidatePath(`/challans/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function voidChallan(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await voidChallanRecord(id, user.id);
    revalidatePath("/challans");
    revalidatePath(`/challans/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function acceptChallan(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await acceptChallanRecord(id, user.id);
    revalidatePath("/challans");
    revalidatePath(`/challans/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadChallanSignedCopy(
  challanId: string,
  formData: FormData
): Promise<ActionResult<{ fileName: string }>> {
  try {
    const user = await requireCurrentUser();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }
    const { fileName } = await recordChallanSignedCopy(challanId, file, user.id);
    revalidatePath(`/challans/${challanId}`);
    return { success: true, data: { fileName } };
  } catch (error) {
    return fail(error);
  }
}
