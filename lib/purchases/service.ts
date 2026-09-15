import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getSupplier, listSuppliers } from "@/lib/suppliers/service";
import type {
  Purchase,
  PurchaseInput,
  PurchaseListItem,
  PurchaseDetail,
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
  weight_kg: number;
  rate_per_kg: number;
  total_cost: number;
  remaining_weight_kg: number;
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
    weightKg: row.weight_kg,
    ratePerKg: row.rate_per_kg,
    totalCost: row.total_cost,
    remainingWeightKg: row.remaining_weight_kg,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export class SupplierNotActiveError extends Error {}
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

  const weightKg = round2(input.weightKg);
  const ratePerKg = round2(input.ratePerKg);

  const { data, error } = await getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .insert({
      supplier_id: input.supplierId,
      purchase_date: input.purchaseDate.slice(0, 10),
      weight_kg: weightKg,
      rate_per_kg: ratePerKg,
      // Never decremented by this feature — reserved for the future Production
      // Batches feature (003) to consume. See data-model.md. total_cost is a
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

export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const purchase = toPurchase(data as PurchaseRow);
  const supplier = await getSupplier(purchase.supplierId);
  return {
    ...purchase,
    supplierName: supplier?.companyName ?? "(unknown supplier)",
    supplierStatus: supplier?.status ?? "inactive",
    isLocked: purchase.remainingWeightKg < purchase.weightKg,
  };
}

export interface ListPurchasesFilters {
  supplierId?: string;
  dateFrom?: string;
  dateTo?: string;
}

export interface ListPurchasesResult {
  purchases: PurchaseListItem[];
  totals: { totalKg: number; totalCost: number };
}

export async function listPurchases(
  filters: ListPurchasesFilters = {}
): Promise<ListPurchasesResult> {
  let query = getSupabaseAdmin()
    .from(PURCHASES_TABLE)
    .select("*, suppliers(company_name)")
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

  const { data, error } = await query;
  if (error) throw error;

  type Row = PurchaseRow & { suppliers: { company_name: string } | null };
  const rows = (data ?? []) as unknown as Row[];

  const listItems: PurchaseListItem[] = rows.map((row) => {
    const purchase = toPurchase(row);
    return {
      id: purchase.id,
      supplierId: purchase.supplierId,
      supplierName: row.suppliers?.company_name ?? "(unknown supplier)",
      purchaseDate: purchase.purchaseDate,
      weightKg: purchase.weightKg,
      ratePerKg: purchase.ratePerKg,
      totalCost: purchase.totalCost,
    };
  });

  // Totals computed over the full filtered result set in application code —
  // the set is already fetched for the list itself, and this stays well
  // within budget at the ~1,000-record scale in SC-004.
  const totals = listItems.reduce(
    (acc, item) => ({
      totalKg: round2(acc.totalKg + item.weightKg),
      totalCost: round2(acc.totalCost + item.totalCost),
    }),
    { totalKg: 0, totalCost: 0 }
  );

  return { purchases: listItems, totals };
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
  if (existing.remainingWeightKg !== existing.weightKg) {
    throw new PurchaseLockedError(
      "This lot has already been used in production and cannot be deleted"
    );
  }

  const { error } = await getSupabaseAdmin().from(PURCHASES_TABLE).delete().eq("id", id);
  if (error) throw error;
}
