"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  productInputSchema,
  productUpdateInputSchema,
  type ProductInput,
  type ProductUpdateInput,
  type ProductStatus,
} from "@/lib/products/schema";
import {
  createProductRecord,
  updateProductRecord,
  setProductStatusRecord,
} from "@/lib/products/service";

export async function createProduct(input: ProductInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = productInputSchema.parse(input);
    const { id } = await createProductRecord(parsed, user.id);
    revalidatePath("/products");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateProduct(
  id: string,
  input: ProductUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = productUpdateInputSchema.parse(input);
    await updateProductRecord(id, parsed, user.id);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setProductStatus(id: string, status: ProductStatus): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setProductStatusRecord(id, status, user.id);
    revalidatePath("/products");
    revalidatePath(`/products/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
