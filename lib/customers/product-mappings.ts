import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  CustomerProductMapping,
  ProductMappingInput,
  ProductMappingUpdateInput,
} from "@/lib/customers/schema";

const MAPPING_SELECT =
  "id, customer_id, product_id, customer_item_code, selling_uom, default_price, conversion_factor, products(name)";

interface MappingRow {
  id: string;
  customer_id: string;
  product_id: string;
  customer_item_code: string | null;
  selling_uom: string | null;
  default_price: number | null;
  conversion_factor: number;
  products: { name: string } | { name: string }[] | null;
}

function toMapping(row: MappingRow): CustomerProductMapping {
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    id: row.id,
    customerId: row.customer_id,
    productId: row.product_id,
    productName: product?.name ?? "",
    customerItemCode: row.customer_item_code,
    sellingUom: row.selling_uom,
    defaultPrice: row.default_price,
    conversionFactor: row.conversion_factor,
  };
}

/**
 * Turns the two DB-level guarantees this table relies on (research.md: the has-value
 * CHECK, and the partial unique index enforcing FR-016) into friendly messages instead
 * of a raw Postgres error, per contracts/server-actions.md.
 */
function toFriendlyMappingError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") {
    return new Error("This item code is already used for a different product for this customer.");
  }
  if (error.code === "23514") {
    return new Error("At least one of item code, selling unit, or default price is required.");
  }
  return new Error(error.message);
}

export class MappingNotFoundError extends Error {}

export async function addProductMapping(
  input: ProductMappingInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_product_mappings")
    .insert({
      customer_id: input.customerId,
      product_id: input.productId,
      customer_item_code: input.customerItemCode || null,
      selling_uom: input.sellingUom || null,
      default_price: input.defaultPrice ?? null,
      conversion_factor: input.conversionFactor,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw toFriendlyMappingError(error);
  return { id: data.id as string };
}

export async function updateProductMapping(
  id: string,
  input: ProductMappingUpdateInput,
  userId: string
): Promise<void> {
  const payload: Record<string, unknown> = { updated_by: userId };
  if (input.customerItemCode !== undefined) payload.customer_item_code = input.customerItemCode || null;
  if (input.sellingUom !== undefined) payload.selling_uom = input.sellingUom || null;
  if (input.defaultPrice !== undefined) payload.default_price = input.defaultPrice ?? null;
  if (input.conversionFactor !== undefined) payload.conversion_factor = input.conversionFactor;

  const { data, error } = await getSupabaseAdmin()
    .from("customer_product_mappings")
    .update(payload)
    .eq("id", id)
    .select("id")
    .maybeSingle();
  if (error) throw toFriendlyMappingError(error);
  if (!data) throw new MappingNotFoundError("Mapping not found");
}

export async function removeProductMapping(id: string): Promise<void> {
  const { error } = await getSupabaseAdmin().from("customer_product_mappings").delete().eq("id", id);
  if (error) throw error;
}

export async function listCustomerProductMappings(
  customerId: string
): Promise<CustomerProductMapping[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_product_mappings")
    .select(MAPPING_SELECT)
    .eq("customer_id", customerId)
    .order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []).map((row) => toMapping(row as unknown as MappingRow));
}

/** Used by the product detail page (spec US2 Acceptance Scenario 1: a mapping is "shown
 * when viewing either the customer or the product"). */
export interface ProductCustomerMapping {
  id: string;
  customerId: string;
  customerDisplayName: string;
  customerItemCode: string | null;
  sellingUom: string | null;
  defaultPrice: number | null;
  conversionFactor: number;
}

interface ProductMappingRow {
  id: string;
  customer_id: string;
  customer_item_code: string | null;
  selling_uom: string | null;
  default_price: number | null;
  conversion_factor: number;
  customers: { display_name: string } | { display_name: string }[] | null;
}

export async function listProductCustomerMappings(
  productId: string
): Promise<ProductCustomerMapping[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_product_mappings")
    .select(
      "id, customer_id, customer_item_code, selling_uom, default_price, conversion_factor, customers(display_name)"
    )
    .eq("product_id", productId)
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as ProductMappingRow[]).map((row) => {
    const customer = Array.isArray(row.customers) ? row.customers[0] : row.customers;
    return {
      id: row.id,
      customerId: row.customer_id,
      customerDisplayName: customer?.display_name ?? "",
      customerItemCode: row.customer_item_code,
      sellingUom: row.selling_uom,
      defaultPrice: row.default_price,
      conversionFactor: row.conversion_factor,
    };
  });
}
