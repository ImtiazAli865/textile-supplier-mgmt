"use server";

import { revalidatePath } from "next/cache";
import { requireCurrentUser } from "@/lib/auth/session";
import { fail, type ActionResult } from "@/lib/actions/result";
import {
  customerInputSchema,
  customerUpdateInputSchema,
  productMappingInputSchema,
  productMappingUpdateInputSchema,
  type CustomerInput,
  type CustomerStatus,
  type CustomerUpdateInput,
  type ProductMappingInput,
  type ProductMappingUpdateInput,
} from "@/lib/customers/schema";
import {
  createCustomerRecord,
  updateCustomerRecord,
  setCustomerStatusRecord,
} from "@/lib/customers/service";
import {
  addProductMapping as addProductMappingRecord,
  updateProductMapping as updateProductMappingRecord,
  removeProductMapping as removeProductMappingRecord,
} from "@/lib/customers/product-mappings";

export type { ActionResult };

export async function createCustomer(input: CustomerInput): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = customerInputSchema.parse(input);
    const { id } = await createCustomerRecord(parsed, user.id);
    revalidatePath("/customers");
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateCustomer(
  id: string,
  input: CustomerUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = customerUpdateInputSchema.parse(input);
    await updateCustomerRecord(id, parsed, user.id);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function setCustomerStatus(
  id: string,
  status: CustomerStatus
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    await setCustomerStatusRecord(id, status, user.id);
    revalidatePath("/customers");
    revalidatePath(`/customers/${id}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function addProductMapping(
  input: ProductMappingInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireCurrentUser();
    const parsed = productMappingInputSchema.parse(input);
    const { id } = await addProductMappingRecord(parsed, user.id);
    revalidatePath(`/customers/${parsed.customerId}`);
    revalidatePath(`/products/${parsed.productId}`);
    return { success: true, data: { id } };
  } catch (error) {
    return fail(error);
  }
}

export async function updateProductMapping(
  id: string,
  customerId: string,
  productId: string,
  input: ProductMappingUpdateInput
): Promise<ActionResult> {
  try {
    const user = await requireCurrentUser();
    const parsed = productMappingUpdateInputSchema.parse(input);
    await updateProductMappingRecord(id, parsed, user.id);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/products/${productId}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}

export async function removeProductMapping(
  id: string,
  customerId: string,
  productId: string
): Promise<ActionResult> {
  try {
    await requireCurrentUser();
    await removeProductMappingRecord(id);
    revalidatePath(`/customers/${customerId}`);
    revalidatePath(`/products/${productId}`);
    return { success: true };
  } catch (error) {
    return fail(error);
  }
}
