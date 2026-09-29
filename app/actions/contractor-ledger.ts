"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  adjustmentInputSchema,
  contractorPaymentInputSchema,
  openingBalanceInputSchema,
  reopenSettlementInputSchema,
  reversePaymentInputSchema,
  settleInputSchema,
  type AdjustmentInput,
  type ContractorPaymentInput,
  type OpeningBalanceInput,
  type ReopenSettlementInput,
  type ReversePaymentInput,
  type SettleInput,
} from "@/lib/contractor-ledger/schema";
import {
  recordContractorAdjustmentRecord,
  recordContractorOpeningBalanceRecord,
  recordContractorPaymentRecord,
  reopenContractorSettlementRecord,
  reverseContractorPaymentRecord,
  settleContractorPeriodRecord,
} from "@/lib/contractor-ledger/service";

export type { ActionResult };

/** The contractors list (balances) and the contractor's khata page. */
function revalidateContractor(contractorId: string) {
  revalidatePath("/contractors");
  revalidatePath(`/contractors/${contractorId}`);
}

/** Batch detail pages show the batch's labour payment status (FR-006). */
function revalidateBatches(batchIds: string[]) {
  for (const batchId of new Set(batchIds)) revalidatePath(`/production-batches/${batchId}`);
}

export async function recordContractorPayment(
  input: ContractorPaymentInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = contractorPaymentInputSchema.parse(input);
    const { id } = await recordContractorPaymentRecord(parsed, user.id);
    revalidateContractor(parsed.contractorId);
    revalidateBatches(parsed.allocations.map((allocation) => allocation.batchId));
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function reverseContractorPayment(input: ReversePaymentInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = reversePaymentInputSchema.parse(input);
    const { contractorId, batchIds } = await reverseContractorPaymentRecord(parsed, user.id);
    revalidateContractor(contractorId);
    revalidateBatches(batchIds);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function recordContractorOpeningBalance(input: OpeningBalanceInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = openingBalanceInputSchema.parse(input);
    await recordContractorOpeningBalanceRecord(parsed, user.id);
    revalidateContractor(parsed.contractorId);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function recordContractorAdjustment(input: AdjustmentInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = adjustmentInputSchema.parse(input);
    await recordContractorAdjustmentRecord(parsed, user.id);
    revalidateContractor(parsed.contractorId);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

/** First submitted with confirmNonZero false; a non-zero closing comes back as an error starting
 * with SETTLEMENT_BALANCE_NOT_ZERO_PREFIX, and the form resubmits with true (FR-026). */
export async function settleContractorPeriod(input: SettleInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = settleInputSchema.parse(input);
    const { id } = await settleContractorPeriodRecord(parsed, user.id);
    revalidateContractor(parsed.contractorId);
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function reopenContractorSettlement(input: ReopenSettlementInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = reopenSettlementInputSchema.parse(input);
    const { contractorId } = await reopenContractorSettlementRecord(parsed, user.id);
    revalidateContractor(contractorId);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
