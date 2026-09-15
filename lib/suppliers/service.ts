import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Supplier,
  SupplierInput,
  SupplierListItem,
  SupplierStatus,
} from "@/lib/suppliers/schema";

interface SupplierContactRow {
  name: string;
  phone: string | null;
  email: string | null;
  role: string | null;
}

interface SupplierMaterialRow {
  material: string;
}

interface SupplierRow {
  id: string;
  company_name: string;
  address_line1: string;
  address_line2: string | null;
  address_city: string;
  address_state: string | null;
  address_postal_code: string | null;
  address_country: string;
  payment_terms: string;
  status: SupplierStatus;
  notes: string | null;
  rating: number | null;
  created_at: string;
  updated_at: string;
  created_by: string;
  updated_by: string;
  supplier_contacts: SupplierContactRow[];
  supplier_materials: SupplierMaterialRow[];
}

const SUPPLIER_DETAIL_SELECT =
  "*, supplier_contacts(name, phone, email, role), supplier_materials(material)";

/** Escapes ILIKE wildcard characters so a plain string always matches literally. */
function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function toSupplier(row: SupplierRow): Supplier {
  return {
    id: row.id,
    companyName: row.company_name,
    address: {
      line1: row.address_line1,
      line2: row.address_line2 ?? undefined,
      city: row.address_city,
      state: row.address_state ?? undefined,
      postalCode: row.address_postal_code ?? undefined,
      country: row.address_country,
    },
    materials: (row.supplier_materials ?? []).map((m) => m.material),
    paymentTerms: row.payment_terms,
    status: row.status,
    notes: row.notes ?? "",
    rating: row.rating ?? undefined,
    contacts: (row.supplier_contacts ?? []).map((c) => ({
      name: c.name,
      phone: c.phone ?? undefined,
      email: c.email ?? undefined,
      role: c.role ?? undefined,
    })),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    createdBy: row.created_by,
    updatedBy: row.updated_by,
  };
}

export async function getSupplier(id: string): Promise<Supplier | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("suppliers")
    .select(SUPPLIER_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return toSupplier(data as unknown as SupplierRow);
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
  const admin = getSupabaseAdmin();

  // Resolve the material filter to a set of supplier IDs first, then fetch
  // those suppliers with their FULL material list intact (an inner-joined
  // embed would truncate `materials` down to just the matching tag).
  let matchingSupplierIds: string[] | null = null;
  const material = filters.material?.trim().toLowerCase();
  if (material) {
    const { data, error } = await admin
      .from("supplier_materials")
      .select("supplier_id")
      .eq("material", material);
    if (error) throw error;
    matchingSupplierIds = (data ?? []).map((r) => r.supplier_id as string);
    if (matchingSupplierIds.length === 0) return [];
  }

  let query = admin
    .from("suppliers")
    .select("id, company_name, status, supplier_materials(material)")
    .eq("status", status)
    .order("company_name", { ascending: true });

  if (matchingSupplierIds) {
    query = query.in("id", matchingSupplierIds);
  }

  // Case-insensitive substring match, done as a native SQL ILIKE instead of
  // Firestore's fetch-then-filter-in-memory workaround (FR-009).
  const search = filters.search?.trim();
  if (search) {
    query = query.ilike("company_name", `%${escapeLike(search)}%`);
  }

  const { data, error } = await query;
  if (error) throw error;

  return (data ?? []).map((row) => ({
    id: row.id as string,
    companyName: row.company_name as string,
    materials: ((row.supplier_materials ?? []) as SupplierMaterialRow[]).map((m) => m.material),
    status: row.status as SupplierStatus,
  }));
}

export async function createSupplierRecord(
  input: SupplierInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("create_supplier", {
    p_company_name: input.companyName,
    p_address_line1: input.address.line1,
    p_address_line2: input.address.line2 || null,
    p_address_city: input.address.city,
    p_address_state: input.address.state || null,
    p_address_postal_code: input.address.postalCode || null,
    p_address_country: input.address.country,
    p_payment_terms: input.paymentTerms,
    p_notes: input.notes ?? "",
    p_rating: input.rating ?? null,
    p_contacts: input.contacts.map((c) => ({
      name: c.name,
      phone: c.phone || null,
      email: c.email || null,
      role: c.role || null,
    })),
    p_materials: input.materials,
    p_user_id: userId,
  });
  if (error) throw error;
  return { id: data as string };
}

export async function updateSupplierRecord(
  id: string,
  input: SupplierInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_supplier", {
    p_id: id,
    p_company_name: input.companyName,
    p_address_line1: input.address.line1,
    p_address_line2: input.address.line2 || null,
    p_address_city: input.address.city,
    p_address_state: input.address.state || null,
    p_address_postal_code: input.address.postalCode || null,
    p_address_country: input.address.country,
    p_payment_terms: input.paymentTerms,
    p_notes: input.notes ?? "",
    p_rating: input.rating ?? null,
    p_contacts: input.contacts.map((c) => ({
      name: c.name,
      phone: c.phone || null,
      email: c.email || null,
      role: c.role || null,
    })),
    p_materials: input.materials,
    p_user_id: userId,
    // status is intentionally omitted — only setSupplierStatusRecord may change it (FR-005 vs FR-006/FR-007).
  });
  if (error) throw error;
}

export async function setSupplierStatusRecord(
  id: string,
  status: SupplierStatus,
  userId: string
): Promise<void> {
  // Unconditional set is a safe no-op when the supplier is already in the
  // target status (spec Edge Cases): it succeeds without error either way.
  const { error } = await getSupabaseAdmin()
    .from("suppliers")
    .update({ status, updated_by: userId })
    .eq("id", id);
  if (error) throw error;
}

export interface DuplicateMatch {
  id: string;
  companyName: string;
}

export async function findSuppliersByName(
  companyName: string,
  excludeId?: string
): Promise<DuplicateMatch[]> {
  const trimmed = companyName.trim();
  if (!trimmed) return [];

  let query = getSupabaseAdmin()
    .from("suppliers")
    .select("id, company_name")
    // No wildcards after escaping, so ILIKE behaves as a case-insensitive exact match.
    .ilike("company_name", escapeLike(trimmed))
    .limit(5);
  if (excludeId) {
    query = query.neq("id", excludeId);
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({ id: row.id as string, companyName: row.company_name as string }));
}
