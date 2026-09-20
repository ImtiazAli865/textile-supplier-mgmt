import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

export interface ResolvedItemCode {
  productId: string;
  productName: string;
  sellingUom: string | null;
  defaultPrice: number | null;
}

interface MappingRow {
  product_id: string;
  selling_uom: string | null;
  default_price: number | null;
  products: { name: string } | { name: string }[] | null;
}

/**
 * Read-only lookup against 005's customer_product_mappings — never re-run at save time
 * (research.md: FR-006 requires the entered price to remain authoritative regardless of
 * what a mapping says, so this is purely a form pre-fill convenience).
 */
export async function resolveCustomerItemCode(
  customerId: string,
  itemCode: string
): Promise<ResolvedItemCode | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("customer_product_mappings")
    .select("product_id, selling_uom, default_price, products(name)")
    .eq("customer_id", customerId)
    .eq("customer_item_code", itemCode)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as MappingRow;
  const product = Array.isArray(row.products) ? row.products[0] : row.products;
  return {
    productId: row.product_id,
    productName: product?.name ?? "",
    sellingUom: row.selling_uom,
    defaultPrice: row.default_price,
  };
}
