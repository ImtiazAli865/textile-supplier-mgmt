import "server-only";
import { Timestamp, type DocumentData, type QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminDb } from "@/lib/firebase/admin";
import type {
  Supplier,
  SupplierInput,
  SupplierListItem,
  SupplierStatus,
} from "@/lib/suppliers/schema";

const SUPPLIERS_COLLECTION = "suppliers";

function suppliersRef() {
  return getAdminDb().collection(SUPPLIERS_COLLECTION);
}

function toIsoString(value: Timestamp | undefined): string {
  return value ? value.toDate().toISOString() : new Date(0).toISOString();
}

function toSupplier(doc: QueryDocumentSnapshot<DocumentData>): Supplier {
  const data = doc.data();
  return {
    id: doc.id,
    companyName: data.companyName,
    companyNameLower: data.companyNameLower,
    address: data.address,
    materials: data.materials ?? [],
    paymentTerms: data.paymentTerms,
    status: data.status,
    notes: data.notes ?? "",
    rating: data.rating ?? undefined,
    contacts: data.contacts ?? [],
    createdAt: toIsoString(data.createdAt),
    updatedAt: toIsoString(data.updatedAt),
    createdBy: data.createdBy,
    updatedBy: data.updatedBy,
  };
}

function normalizeMaterials(materials: string[]): string[] {
  return materials.map((m) => m.trim().toLowerCase()).filter(Boolean);
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const doc = await suppliersRef().doc(id).get();
  if (!doc.exists) return null;
  return toSupplier(doc as QueryDocumentSnapshot<DocumentData>);
}

export interface ListSuppliersFilters {
  status?: SupplierStatus;
  material?: string;
  search?: string;
}

export async function listSuppliers(
  filters: ListSuppliersFilters = {}
): Promise<SupplierListItem[]> {
  const status = filters.status ?? "active";

  let query: FirebaseFirestore.Query = suppliersRef().where("status", "==", status);
  if (filters.material) {
    query = query.where("materials", "array-contains", filters.material.trim().toLowerCase());
  }

  const snapshot = await query.orderBy("companyNameLower", "asc").get();
  let suppliers = snapshot.docs.map((doc) =>
    toSupplier(doc as QueryDocumentSnapshot<DocumentData>)
  );

  // Case-insensitive partial name match — done in-memory rather than via a
  // Firestore query, since Firestore has no substring operator (see research.md).
  const search = filters.search?.trim().toLowerCase();
  if (search) {
    suppliers = suppliers.filter((s) => s.companyNameLower.includes(search));
  }

  return suppliers.map(({ id, companyName, materials, status }) => ({
    id,
    companyName,
    materials,
    status,
  }));
}

export async function createSupplierRecord(
  input: SupplierInput,
  uid: string
): Promise<{ id: string }> {
  const now = Timestamp.now();
  const docRef = await suppliersRef().add({
    companyName: input.companyName,
    companyNameLower: input.companyName.trim().toLowerCase(),
    address: input.address,
    materials: normalizeMaterials(input.materials),
    paymentTerms: input.paymentTerms,
    status: "active" satisfies SupplierStatus,
    notes: input.notes ?? "",
    rating: input.rating ?? null,
    contacts: input.contacts,
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
    updatedBy: uid,
  });
  return { id: docRef.id };
}

export async function updateSupplierRecord(
  id: string,
  input: SupplierInput,
  uid: string
): Promise<void> {
  await suppliersRef()
    .doc(id)
    .update({
      companyName: input.companyName,
      companyNameLower: input.companyName.trim().toLowerCase(),
      address: input.address,
      materials: normalizeMaterials(input.materials),
      paymentTerms: input.paymentTerms,
      notes: input.notes ?? "",
      rating: input.rating ?? null,
      contacts: input.contacts,
      updatedAt: Timestamp.now(),
      updatedBy: uid,
      // status is intentionally omitted — only setSupplierStatusRecord may change it (FR-005 vs FR-006/FR-007).
    });
}

export async function setSupplierStatusRecord(
  id: string,
  status: SupplierStatus,
  uid: string
): Promise<void> {
  // Unconditional set is a safe no-op when the supplier is already in the
  // target status (spec Edge Cases): it succeeds without error either way.
  await suppliersRef().doc(id).update({
    status,
    updatedAt: Timestamp.now(),
    updatedBy: uid,
  });
}

export interface DuplicateMatch {
  id: string;
  companyName: string;
}

export async function findSuppliersByName(
  companyName: string,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  const lower = companyName.trim().toLowerCase();
  if (!lower) return [];

  const snapshot = await suppliersRef().where("companyNameLower", "==", lower).limit(5).get();
  return snapshot.docs
    .filter((doc) => doc.id !== excludeId)
    .map((doc) => ({ id: doc.id, companyName: doc.data().companyName as string }));
}
