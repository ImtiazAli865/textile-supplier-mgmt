import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Product,
  ProductInput,
  ProductUpdateInput,
  ProductListItem,
  ProductDetail,
  ProductType,
  ProductStatus,
} from "@/lib/products/schema";

const PRODUCTS_TABLE = "products";

/** Rounds to 2 decimal places — matches the numeric column precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

/**
 * Wraps a value for use inside a PostgREST `.or()` filter string, which
 * otherwise treats commas/parentheses as its own grouping syntax — real
 * product names contain both (e.g. "Bonded Polyester Fibre (Falta)").
 */
function quoteOrFilterValue(value: string): string {
  return `"${value.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
}

interface ProductRow {
  id: string;
  name: string;
  internal_code: string | null;
  type: ProductType;
  stock_uom: string;
  default_selling_price: number;
  expected_yield_per_kg: number | null;
  default_labour_rate_per_packet: number | null;
  current_purchase_cost: number | null;
  quantity_on_hand: number;
  status: ProductStatus;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

function toProduct(row: ProductRow): Product {
  return {
    id: row.id,
    name: row.name,
    internalCode: row.internal_code,
    type: row.type,
    stockUom: row.stock_uom,
    defaultSellingPrice: row.default_selling_price,
    expectedYieldPerKg: row.expected_yield_per_kg,
    defaultLabourRatePerPacket: row.default_labour_rate_per_packet,
    currentPurchaseCost: row.current_purchase_cost,
    quantityOnHand: row.quantity_on_hand,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export class ProductNotFoundError extends Error {}
export class ProductTypeMismatchError extends Error {}

export async function createProductRecord(
  input: ProductInput,
  userId: string
): Promise<{ id: string }> {
  const payload: Record<string, unknown> = {
    name: input.name,
    internal_code: input.internalCode || null,
    type: input.type,
    stock_uom: input.stockUom,
    default_selling_price: round2(input.defaultSellingPrice),
    created_by: userId,
    updated_by: userId,
  };

  // current_purchase_cost is deliberately never set here — it has no write
  // path in this feature at all (FR-003; see research.md).
  if (input.type === "manufactured") {
    payload.expected_yield_per_kg = round2(input.expectedYieldPerKg);
    payload.default_labour_rate_per_packet = round2(input.defaultLabourRatePerPacket);
  }

  const { data, error } = await getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .insert(payload)
    .select("id")
    .single();

  if (error) throw error;
  return { id: data.id as string };
}

export async function getProduct(id: string): Promise<ProductDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  return toProduct(data as ProductRow);
}

export interface ListProductsFilters {
  search?: string;
  type?: ProductType;
  status?: ProductStatus;
}

export async function listProducts(
  filters: ListProductsFilters = {}
): Promise<ProductListItem[]> {
  let query = getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .select("id, name, internal_code, type, stock_uom, default_selling_price, status")
    .eq("status", filters.status ?? "active")
    .order("name", { ascending: true });

  if (filters.type) {
    query = query.eq("type", filters.type);
  }

  const search = filters.search?.trim();
  if (search) {
    // Case-insensitive substring match on name OR internal code (FR-010),
    // backed by the trigram indexes in data-model.md. The pattern is quoted
    // (quoteOrFilterValue) so a search term containing a comma or parenthesis
    // isn't misparsed as part of the `.or()` filter syntax itself.
    const pattern = `%${escapeLike(search)}%`;
    const quoted = quoteOrFilterValue(pattern);
    query = query.or(`name.ilike.${quoted},internal_code.ilike.${quoted}`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    internalCode: row.internal_code as string | null,
    type: row.type as ProductType,
    stockUom: row.stock_uom as string,
    defaultSellingPrice: row.default_selling_price as number,
    status: row.status as ProductStatus,
  }));
}

/** Thin wrapper over listProducts — reused, not reimplemented, per research.md (003b). */
export async function listActiveTradedProductsForSelect(): Promise<
  { id: string; name: string; stockUom: string }[]
> {
  const products = await listProducts({ type: "traded", status: "active" });
  return products.map(({ id, name, stockUom }) => ({ id, name, stockUom }));
}

export async function updateProductRecord(
  id: string,
  input: ProductUpdateInput,
  userId: string
): Promise<void> {
  const { data, error: fetchError } = await getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!data) throw new ProductNotFoundError("Product not found");

  const existing = toProduct(data as ProductRow);

  const payload: Record<string, unknown> = {
    name: input.name,
    internal_code: input.internalCode || null,
    stock_uom: input.stockUom,
    default_selling_price: round2(input.defaultSellingPrice),
    updated_by: userId,
  };

  // Type itself is never part of the update payload (FR-004) — this
  // validates the incoming manufactured-only fields against the *existing*
  // record's type, since ProductUpdateInput alone can't carry that.
  if (existing.type === "manufactured") {
    if (input.expectedYieldPerKg === undefined || input.defaultLabourRatePerPacket === undefined) {
      throw new ProductTypeMismatchError(
        "Manufactured products require an expected yield ratio and a default labour rate per packet"
      );
    }
    payload.expected_yield_per_kg = round2(input.expectedYieldPerKg);
    payload.default_labour_rate_per_packet = round2(input.defaultLabourRatePerPacket);
  } else if (
    input.expectedYieldPerKg !== undefined ||
    input.defaultLabourRatePerPacket !== undefined
  ) {
    throw new ProductTypeMismatchError("Traded products cannot have a yield ratio or a labour rate");
  }

  const { error } = await getSupabaseAdmin().from(PRODUCTS_TABLE).update(payload).eq("id", id);
  if (error) throw error;
}

export async function setProductStatusRecord(
  id: string,
  status: ProductStatus,
  userId: string
): Promise<void> {
  const { data, error: fetchError } = await getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .select("id")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!data) throw new ProductNotFoundError("Product not found");

  const { error } = await getSupabaseAdmin()
    .from(PRODUCTS_TABLE)
    .update({ status, updated_by: userId })
    .eq("id", id);
  if (error) throw error;
}
