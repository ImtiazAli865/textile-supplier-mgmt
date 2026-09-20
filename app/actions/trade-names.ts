"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import { tradeNameInputSchema, type TradeNameInput, type TradeNameStatus } from "@/lib/trade-names/schema";
import {
  createTradeNameRecord,
  updateTradeNameRecord,
  setTradeNameStatusRecord,
  replaceTradeNameAssetRecord,
} from "@/lib/trade-names/service";

export type { ActionResult };

export async function createTradeName(
  input: TradeNameInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = tradeNameInputSchema.parse(input);
    const { id } = await createTradeNameRecord(parsed, user.id);
    revalidatePath("/trade-names");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateTradeName(
  id: string,
  input: TradeNameInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = tradeNameInputSchema.parse(input);
    await updateTradeNameRecord(id, parsed, user.id);
    revalidatePath("/trade-names");
    revalidatePath(`/trade-names/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setTradeNameStatus(
  id: string,
  status: TradeNameStatus
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setTradeNameStatusRecord(id, status, user.id);
    revalidatePath("/trade-names");
    revalidatePath(`/trade-names/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

async function uploadTradeNameAssetAction(
  id: string,
  formData: FormData,
  kind: "signature" | "stamp"
): Promise<ActionResult<{ path: string }>> {
  try {
    await requireCurrentUser();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return { success: false, error: "No file was provided." };
    }
    const { path } = await replaceTradeNameAssetRecord(id, kind, file);
    revalidatePath(`/trade-names/${id}`);
    return { success: true, data: { path } };
  } catch (error) {
    return fail(error);
  }
}

export async function uploadTradeNameSignature(
  id: string,
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  return uploadTradeNameAssetAction(id, formData, "signature");
}

export async function uploadTradeNameStamp(
  id: string,
  formData: FormData
): Promise<ActionResult<{ path: string }>> {
  return uploadTradeNameAssetAction(id, formData, "stamp");
}
