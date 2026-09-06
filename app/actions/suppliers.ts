"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import {
  supplierInputSchema,
  type SupplierInput,
  type SupplierStatus,
} from "@/lib/suppliers/schema";
import {
  createSupplierRecord,
  updateSupplierRecord,
  setSupplierStatusRecord,
  findSuppliersByName,
  type DuplicateMatch,
} from "@/lib/suppliers/service";

export type ActionResult<T = undefined> =
  | ({ success: true } & (T extends undefined ? object : { data: T }))
  | { success: false; error: string; fieldErrors?: Record<string, string[]> };

function fail(error: unknown): ActionResult<never> {
  if (error && typeof error === "object" && "issues" in error) {
    // ZodError
    const zodError = error as { issues: { path: (string | number)[]; message: string }[] };
    const fieldErrors: Record<string, string[]> = {};
    for (const issue of zodError.issues) {
      const key = issue.path.join(".");
      fieldErrors[key] = [...(fieldErrors[key] ?? []), issue.message];
    }
    return { success: false, error: "Please fix the highlighted fields.", fieldErrors };
  }
  const message = error instanceof Error ? error.message : "Something went wrong.";
  return { success: false, error: message };
}

export async function createSupplier(input: SupplierInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = supplierInputSchema.parse(input);
    const { id } = await createSupplierRecord(parsed, user.uid);
    revalidatePath("/suppliers");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateSupplier(id: string, input: SupplierInput): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = supplierInputSchema.parse(input);
    await updateSupplierRecord(id, parsed, user.uid);
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setSupplierStatus(id: string, status: SupplierStatus): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setSupplierStatusRecord(id, status, user.uid);
    revalidatePath("/suppliers");
    revalidatePath(`/suppliers/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function checkDuplicateSupplierName(
  companyName: string,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  await requireCurrentUser();
  if (!companyName.trim()) return [];
  return findSuppliersByName(companyName, excludeId);
}
