"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  batchCompleteInputSchema,
  batchIssueInputSchema,
  openingStockCorrectionInputSchema,
  openingStockInputSchema,
  type BatchCompleteInput,
  type BatchIssueInput,
  type OpeningStockCorrectionInput,
  type OpeningStockInput,
} from "@/lib/production-batches/schema";
import {
  completeProductionBatchRecord,
  issueProductionBatchRecord,
  recordOpeningStockCorrectionRecord,
  recordOpeningStockRecord,
  updateProductionBatchRecord,
  voidProductionBatchRecord,
} from "@/lib/production-batches/service";

export type { ActionResult };

export async function issueProductionBatch(
  input: BatchIssueInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = batchIssueInputSchema.parse(input);
    const { id } = await issueProductionBatchRecord(parsed, user.id);
    revalidatePath("/production-batches");
    revalidatePath("/purchases");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateProductionBatch(
  id: string,
  input: BatchIssueInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = batchIssueInputSchema.parse(input);
    await updateProductionBatchRecord(id, parsed, user.id);
    revalidatePath("/production-batches");
    revalidatePath(`/production-batches/${id}`);
    revalidatePath("/purchases");
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function voidProductionBatch(id: string): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await voidProductionBatchRecord(id, user.id);
    revalidatePath("/production-batches");
    revalidatePath(`/production-batches/${id}`);
    revalidatePath("/purchases");
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function completeProductionBatch(
  id: string,
  input: BatchCompleteInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = batchCompleteInputSchema.parse(input);
    const { productId } = await completeProductionBatchRecord(id, parsed, user.id);
    revalidatePath("/production-batches");
    revalidatePath(`/production-batches/${id}`);
    revalidatePath(`/products/${productId}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function recordManufacturedOpeningStock(
  input: OpeningStockInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = openingStockInputSchema.parse(input);
    await recordOpeningStockRecord(parsed, user.id);
    revalidatePath("/production-batches/opening-stock");
    revalidatePath(`/products/${parsed.productId}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function recordManufacturedOpeningStockCorrection(
  input: OpeningStockCorrectionInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = openingStockCorrectionInputSchema.parse(input);
    await recordOpeningStockCorrectionRecord(parsed, user.id);
    revalidatePath("/production-batches/opening-stock");
    revalidatePath(`/products/${parsed.productId}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
