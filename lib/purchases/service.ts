import "server-only";
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import { getSupplier, listSuppliers } from "@/lib/suppliers/service";
import type {
  Purchase,
  PurchaseInput,
  PurchaseListItem,
  PurchaseDetail,
} from "@/lib/purchases/schema";

const PURCHASES_COLLECTION = "rawMaterialPurchases";

function purchasesRef() {
  return getAdminDb().collection(PURCHASES_COLLECTION);
}

/** Rounds to 2 decimal places — see research.md's "plain rounded numbers" decision. */
function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function toIsoDateString(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString().slice(0, 10) : "";
}

function toIsoString(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

function toPurchase(doc: QueryDocumentSnapshot<DocumentData>): Purchase {
  const data = doc.data();
  return {
    id: doc.id,
    supplierId: data.supplierId,
    purchaseDate: toIsoDateString(data.purchaseDate),
    weightKg: data.weightKg,
    ratePerKg: data.ratePerKg,
    totalCost: data.totalCost,
    remainingWeightKg: data.remainingWeightKg,
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
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
  uid: string
): Promise<{ id: string }> {
  const supplier = await getSupplier(input.supplierId);
  if (!supplier || supplier.status !== "active") {
    throw new SupplierNotActiveError("Selected supplier is not active");
  }

  const weightKg = round2(input.weightKg);
  const ratePerKg = round2(input.ratePerKg);
  const totalCost = round2(weightKg * ratePerKg);
  const now = Timestamp.now();

  const docRef = await purchasesRef().add({
    supplierId: input.supplierId,
    purchaseDate: Timestamp.fromDate(new Date(input.purchaseDate)),
    weightKg,
    ratePerKg,
    totalCost,
    // Never decremented by this feature — reserved for the future Production
    // Batches feature (003) to consume. See data-model.md.
    remainingWeightKg: weightKg,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
  });
  return { id: docRef.id };
}

export async function getPurchase(id: string): Promise<PurchaseDetail | null> {
  const doc = await purchasesRef().doc(id).get();
  if (!doc.exists) return null;
  const purchase = toPurchase(doc as QueryDocumentSnapshot<DocumentData>);
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
  let query: FirebaseFirestore.Query = purchasesRef();

  if (filters.supplierId) {
    query = query.where("supplierId", "==", filters.supplierId);
  }
  if (filters.dateFrom) {
    query = query.where("purchaseDate", ">=", Timestamp.fromDate(new Date(filters.dateFrom)));
  }
  if (filters.dateTo) {
    const end = new Date(filters.dateTo);
    end.setUTCHours(23, 59, 59, 999);
    query = query.where("purchaseDate", "<=", Timestamp.fromDate(end));
  }

  const snapshot = await query.orderBy("purchaseDate", "desc").get();
  const purchases = snapshot.docs.map((doc) =>
    toPurchase(doc as QueryDocumentSnapshot<DocumentData>)
  );

  // Join supplier names — small result sets at this scale (SC-004), so fetching
  // each referenced (deduped) supplier individually stays well within budget.
  // See research.md's live-join decision (no denormalized supplierName field).
  const supplierIds = Array.from(new Set(purchases.map((p) => p.supplierId)));
  const supplierEntries = await Promise.all(
    supplierIds.map(async (id) => [id, await getSupplier(id)] as const)
  );
  const supplierNames = new Map(
    supplierEntries.map(([id, supplier]) => [id, supplier?.companyName ?? "(unknown supplier)"])
  );

  const listItems: PurchaseListItem[] = purchases.map((p) => ({
    id: p.id,
    supplierId: p.supplierId,
    supplierName: supplierNames.get(p.supplierId) ?? "(unknown supplier)",
    purchaseDate: p.purchaseDate,
    weightKg: p.weightKg,
    ratePerKg: p.ratePerKg,
    totalCost: p.totalCost,
  }));

  // Totals computed over the full filtered result set in application code —
  // see research.md's fetch-and-sum decision.
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
  uid: string
): Promise<void> {
  const doc = await purchasesRef().doc(id).get();
  if (!doc.exists) throw new PurchaseNotFoundError("Purchase not found");
  const existing = toPurchase(doc as QueryDocumentSnapshot<DocumentData>);
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
  const totalCost = round2(weightKg * ratePerKg);

  await purchasesRef()
    .doc(id)
    .update({
      supplierId: input.supplierId,
      purchaseDate: Timestamp.fromDate(new Date(input.purchaseDate)),
      weightKg,
      ratePerKg,
      totalCost,
      // Reset to the new weight — edit is only reachable while unconsumed, so
      // remaining always equals the (possibly updated) full weight again.
      remainingWeightKg: weightKg,
      updatedAt: Timestamp.now(),
      updatedBy: uid,
    });
}

export async function deletePurchaseRecord(id: string): Promise<void> {
  const doc = await purchasesRef().doc(id).get();
  if (!doc.exists) throw new PurchaseNotFoundError("Purchase not found");
  const existing = toPurchase(doc as QueryDocumentSnapshot<DocumentData>);
  if (existing.remainingWeightKg !== existing.weightKg) {
    throw new PurchaseLockedError(
      "This lot has already been used in production and cannot be deleted"
    );
  }
  await purchasesRef().doc(id).delete();
}
