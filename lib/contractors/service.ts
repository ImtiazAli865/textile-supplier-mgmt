import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import type {
  Contractor,
  ContractorInput,
  ContractorListItem,
  ContractorStatus,
} from "@/lib/contractors/schema";

const CONTRACTORS_TABLE = "contractors";

export class ContractorNotFoundError extends Error {}

/** Raised from the idx_contractors_name_unique violation (FR-001). */
export class DuplicateContractorNameError extends Error {
  constructor() {
    super("A contractor with this name already exists.");
    this.name = "DuplicateContractorNameError";
  }
}

interface ContractorRow {
  id: string;
  name: string;
  phone: string | null;
  status: ContractorStatus;
  created_at: string;
  updated_at: string;
}

function toContractor(row: ContractorRow): Contractor {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toFriendlyContractorError(error: { code?: string; message: string }): Error {
  if (error.code === "23505") return new DuplicateContractorNameError();
  return new Error(error.message);
}

export async function createContractorRecord(
  input: ContractorInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONTRACTORS_TABLE)
    .insert({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      created_by: userId,
      updated_by: userId,
    })
    .select("id")
    .single();
  if (error) throw toFriendlyContractorError(error);
  return { id: data.id as string };
}

export async function updateContractorRecord(
  id: string,
  input: ContractorInput,
  userId: string
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONTRACTORS_TABLE)
    .update({
      name: input.name.trim(),
      phone: input.phone?.trim() || null,
      updated_by: userId,
    })
    .eq("id", id)
    .select("id");
  if (error) throw toFriendlyContractorError(error);
  if (!data || data.length === 0) throw new ContractorNotFoundError("Contractor not found");
}

/** Deactivating never affects batches already recorded against the contractor (FR-002). */
export async function setContractorStatusRecord(
  id: string,
  status: ContractorStatus,
  userId: string
): Promise<void> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONTRACTORS_TABLE)
    .update({ status, updated_by: userId })
    .eq("id", id)
    .select("id");
  if (error) throw error;
  if (!data || data.length === 0) throw new ContractorNotFoundError("Contractor not found");
}

export async function getContractor(id: string): Promise<Contractor | null> {
  const { data, error } = await getSupabaseAdmin()
    .from(CONTRACTORS_TABLE)
    .select("id, name, phone, status, created_at, updated_at")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  return data ? toContractor(data as ContractorRow) : null;
}

export async function listContractors(
  filters: { status?: ContractorStatus } = {}
): Promise<ContractorListItem[]> {
  let query = getSupabaseAdmin()
    .from(CONTRACTORS_TABLE)
    .select("id, name, phone, status")
    .order("name", { ascending: true });
  if (filters.status) query = query.eq("status", filters.status);

  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []).map((row) => ({
    id: row.id as string,
    name: row.name as string,
    phone: row.phone as string | null,
    status: row.status as ContractorStatus,
  }));
}

/** Thin wrapper over listContractors — populates the batch issue form's contractor picker. */
export async function listActiveContractorsForSelect(): Promise<{ id: string; name: string }[]> {
  const contractors = await listContractors({ status: "active" });
  return contractors.map(({ id, name }) => ({ id, name }));
}
