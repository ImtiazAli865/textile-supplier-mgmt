"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  contractorInputSchema,
  contractorStatusSchema,
  type ContractorInput,
  type ContractorStatus,
} from "@/lib/contractors/schema";
import {
  createContractorRecord,
  updateContractorRecord,
  setContractorStatusRecord,
} from "@/lib/contractors/service";

export type { ActionResult };

export async function createContractor(
  input: ContractorInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = contractorInputSchema.parse(input);
    const { id } = await createContractorRecord(parsed, user.id);
    revalidatePath("/contractors");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateContractor(id: string, input: ContractorInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = contractorInputSchema.parse(input);
    await updateContractorRecord(id, parsed, user.id);
    revalidatePath("/contractors");
    revalidatePath("/production-batches");
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setContractorStatus(
  id: string,
  status: ContractorStatus
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = contractorStatusSchema.parse(status);
    await setContractorStatusRecord(id, parsed, user.id);
    revalidatePath("/contractors");
    revalidatePath("/production-batches");
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
