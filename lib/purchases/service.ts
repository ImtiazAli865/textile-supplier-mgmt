import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupplier, listSuppliers } from "@/lib/suppliers/service";
import { getProduct } from "@/lib/products/service";
import type {
  Purchase,
  PurchaseInput,
  PurchaseListItem,
  PurchaseDetail,
  PurchaseMode,
  PurchaseTotals,
} from "@/lib/purchases/schema";

const PURCHASES_TABLE = "raw_material_purchases";

/** Rounds to 2 decimal places — matches the numeric(10,2) column precision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

interface PurchaseRow {
  id: string;
  supplier_id: string;
  purchase_date: string;
  purchase_mode: PurchaseMode;
  weight_kg: number | null;
  rate_per_kg: number | null;
  remaining_weight_kg: number | null;
  product_id: string | null;
  quantity_units: number | null;
  rate_per_unit: number | null;
  remaining_units: number | null;
  total_cost: number;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
}

function toPurchase(row: PurchaseRow): Purchase {
  return {
    id: row.id,
    supplierId: row.supplier_id,
    purchaseDate: row.purchase_date,
    mode: row.purchase_mode,
    weightKg: row.weight_kg,
    ratePerKg: row.rate_per_kg,
    remainingWeightKg: row.remaining_weight_kg,
    productId: row.product_id,
    quantityUnits: row.quantity_units,
    ratePerUnit: row.rate_per_unit,
    remainingUnits: row.remaining_units,
    totalCost: row.total_cost,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

function isLockedPurchase(purchase: Purchase): boolean {
  return purchase.mode === "weight"
    ? purchase.remainingWeightKg! < purchase.weightKg!
    : purchase.remainingUnits! < purchase.quantityUnits!;
}

export class SupplierNotActiveError extends Error {}
export class ProductNotPurchasableError extends Error {}
export class PurchaseNotFoundError extends Error {}
export class PurchaseLockedError extends Error {}

/** Thin wrapper over 001's listSuppliers — reused, not reimplemented, per contracts/server-actions.md. */
export async function listActiveSuppliersForSelect(): Promise<
  { id: string; companyName: string }[]
> {
  const suppliers = await listSuppliers({ status: "active" });
  return suppliers.map(({ id, companyName }) => ({ id, companyName }));
}

export async function createPurchaseRecord(
  input: PurchaseInput,
  userId: string
): Promise<{ id: string }> {
  const supplier = await getSupplier(input.supplierId);
  if (!supplier || supplier.status !== "active") {
    throw new SupplierNotActiveError("Selected supplier is not active");
  }

  if (input.mode === "weight") {
    const weightKg = round2(input.weightKg);
    const ratePerKg = round2(input.ratePerKg);

    const { data, error } = await getSupabaseAdmin()
      .from(PURCHASES_TABLE)
      .insert({
        supplier_id: input.supplierId,
        purchase_date: input.purchaseDate.slice(0, 10),
        purchase_mode: "weight",
        weight_kg: weightKg,
        rate_per_kg: ratePerKg,
        // Never decremented by this feature — reserved for the future Production
        // Batches feature to consume. See data-model.md. total_cost is a
        // generated column and is never written directly.
        remaining_weight_kg: weightKg,
        created_by: userId,
        updated_by: userId,
      })
      .select("id")
      .single();

    if (error) throw error;
    return { id: data.id as string };
  }

  const product = await getProduct(input.productId);
  if (!product || product.status !== "active" || product.type !== "traded") {
    throw new ProductNotPurchasableError("Selected product is not an active traded product");
  }

  // Atomic multi-table write: inserts the purchase row and recomputes the
  // product's current_purchase_cost/quantity_on_hand in one transaction.
  // See specs/003b-traded-goods-purchasing/research.md.
  const { data, error } = await getSupabaseAdmin().rpc("record_unit_purchase", {
    p_supplier_id: input.supplierId,
    p_product_id: input.productId,
    p_purchase_date: input.purchaseDate.slice(0, 10),
    p_quantity_units: round2(input.quantityUnits),
    p_rate_per_unit: round2(input.ratePerUnit),
    p_user_id: userId,
  });

  if (error) throw error;
  return { id: data as string };
}

export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const purchase = toPurchase(data as PurchaseRow);
  const [supplier, product] = await Promise.all([
    getSupplier(purchase.supplierId),
    purchase.productId ? getProduct(purchase.productId) : Promise.resolve(null),
  ]);

  return {
    ...purchase,
    supplierName: supplier?.companyName ?? "(unknown supplier)",
    supplierStatus: supplier?.status ?? "inactive",
    productName: purchase.productId ? (product?.name ?? "(unknown product)") : null,
    isLocked: isLockedPurchase(purchase),
  };
}

export interface ListPurchasesFilters {
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
  productId?: string;
}

export interface ListPurchasesResult {
  purchases: PurchaseListItem[];
  totals: PurchaseTotals;
}

export async function listPurchases(
  filters: ListPurchasesFilters = {}
): Promise<ListPurchasesResult> {
  let query = getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*, suppliers(company_name), products(name)")
    .order("purchase_date", { ascending: false });

  if (filters.supplierId) {
    query = query.eq("supplier_id", filters.supplierId);
  }
  if (filters.dateFrom) {
    query = query.gte("purchase_date", filters.dateFrom.slice(0, 10));
  }
  if (filters.dateTo) {
    query = query.lte("purchase_date", filters.dateTo.slice(0, 10));
  }
  if (filters.productId) {
    query = query.eq("product_id", filters.productId);
  }

  const { data, error } = await query;
  if (error) throw error;

  type Row = PurchaseRow & {
    suppliers: { company_name: string } | null;
    products: { name: string } | null;
  };
  const rows = (data ?? []) as unknown as Row[];

  const listItems: PurchaseListItem[] = rows.map((row) => {
    const purchase = toPurchase(row);
    return {
      id: purchase.id,
      supplierId: purchase.supplierId,
      supplierName: row.suppliers?.company_name ?? "(unknown supplier)",
      purchaseDate: purchase.purchaseDate,
      mode: purchase.mode,
      totalCost: purchase.totalCost,
      weightKg: purchase.weightKg,
      ratePerKg: purchase.ratePerKg,
      productId: purchase.productId,
      productName: purchase.productId ? (row.products?.name ?? "(unknown product)") : null,
      quantityUnits: purchase.quantityUnits,
      ratePerUnit: purchase.ratePerUnit,
    };
  });

  // Totals computed over the full filtered result set in application code —
  // the set is already fetched for the list itself, and this stays well
  // within budget at the ~1,000-record scale in SC-004.
  const weightItems = listItems.filter((item) => item.mode === "weight");
  const unitItems = listItems.filter((item) => item.mode === "unit");

  const weightTotals = weightItems.length
    ? weightItems.reduce(
        (acc, item) => ({
          totalKg: round2(acc.totalKg + (item.weightKg ?? 0)),
          totalCost: round2(acc.totalCost + item.totalCost),
        }),
        { totalKg: 0, totalCost: 0 }
      )
    : null;

  const unitTotals = unitItems.length
    ? unitItems.reduce(
        (acc, item) => ({
          totalUnits: round2(acc.totalUnits + (item.quantityUnits ?? 0)),
          totalCost: round2(acc.totalCost + item.totalCost),
        }),
        { totalUnits: 0, totalCost: 0 }
      )
    : null;

  const grandTotalCost = round2(listItems.reduce((sum, item) => sum + item.totalCost, 0));

  return {
    purchases: listItems,
    totals: { weight: weightTotals, unit: unitTotals, grandTotalCost },
  };
}

export async function updatePurchaseRecord(
  id: string,
  input: PurchaseInput,
  userId: string
): Promise<void> {
  const { data, error: fetchError } = await getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!data) throw new PurchaseNotFoundError("Purchase not found");

  const existing = toPurchase(data as PurchaseRow);
  if (input.mode !== existing.mode) {
    throw new Error("A purchase's mode cannot be changed");
  }

  if (existing.mode === "weight" && input.mode === "weight") {
    if (existing.remainingWeightKg !== existing.weightKg) {
      throw new PurchaseLockedError(
        "This lot has already been used in production and can no longer be edited"
      );
    }

    // Only re-enforce the active-supplier rule when the supplier is actually
    // being changed — an unchanged supplier may have since been deactivated,
    // and the purchase must remain fully editable in that case (spec Edge Cases).
    if (input.supplierId !== existing.supplierId) {
      const supplier = await getSupplier(input.supplierId);
      if (!supplier || supplier.status !== "active") {
        throw new SupplierNotActiveError("Selected supplier is not active");
      }
    }

    const weightKg = round2(input.weightKg);
    const ratePerKg = round2(input.ratePerKg);

    const { error } = await getSupabaseAdmin()
      .from(PURCHASES_TABLE)
      .update({
        supplier_id: input.supplierId,
        purchase_date: input.purchaseDate.slice(0, 10),
        weight_kg: weightKg,
        rate_per_kg: ratePerKg,
        // Reset to the new weight — edit is only reachable while unconsumed, so
        // remaining always equals the (possibly updated) full weight again.
        remaining_weight_kg: weightKg,
        updated_by: userId,
      })
      .eq("id", id);
    if (error) throw error;
    return;
  }

  if (existing.mode === "unit" && input.mode === "unit") {
    if (existing.remainingUnits !== existing.quantityUnits) {
      throw new PurchaseLockedError(
        "This purchase has already been used and can no longer be edited"
      );
    }

    if (input.supplierId !== existing.supplierId) {
      const supplier = await getSupplier(input.supplierId);
      if (!supplier || supplier.status !== "active") {
        throw new SupplierNotActiveError("Selected supplier is not active");
      }
    }
    if (input.productId !== existing.productId) {
      const product = await getProduct(input.productId);
      if (!product || product.status !== "active" || product.type !== "traded") {
        throw new ProductNotPurchasableError("Selected product is not an active traded product");
      }
    }

    const { error } = await getSupabaseAdmin().rpc("update_unit_purchase", {
      p_id: id,
      p_supplier_id: input.supplierId,
      p_product_id: input.productId,
      p_purchase_date: input.purchaseDate.slice(0, 10),
      p_quantity_units: round2(input.quantityUnits),
      p_rate_per_unit: round2(input.ratePerUnit),
      p_user_id: userId,
    });
    if (error) throw error;
  }
}

export async function deletePurchaseRecord(id: string): Promise<void> {
  const { data, error: fetchError } = await getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (fetchError) throw fetchError;
  if (!data) throw new PurchaseNotFoundError("Purchase not found");

  const existing = toPurchase(data as PurchaseRow);

  if (existing.mode === "weight") {
    if (existing.remainingWeightKg !== existing.weightKg) {
      throw new PurchaseLockedError(
        "This lot has already been used in production and cannot be deleted"
      );
    }
    const { error } = await getSupabaseAdmin().from(PURCHASES_TABLE).delete().eq("id", id);
    if (error) throw error;
    return;
  }

  if (existing.remainingUnits !== existing.quantityUnits) {
    throw new PurchaseLockedError("This purchase has already been used and cannot be deleted");
  }

  const { error } = await getSupabaseAdmin().rpc("delete_unit_purchase", { p_id: id });
  if (error) throw error;
}
