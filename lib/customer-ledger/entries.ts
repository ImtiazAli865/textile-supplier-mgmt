import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

interface LedgerEntryRow {
  id: string;
  entry_date: string;
  type: "debit" | "credit";
  amount: number;
  source_type: string;
  source_id: string | null;
  description: string | null;
  created_at: string;
}

/** Raw entry shape shared by getCustomerLedger (service.ts) and getCustomerAgeing (ageing.ts) —
 * both call this same function/query rather than each defining their own (research.md, "reusing
 * getCustomerLedger's underlying fetch rather than a duplicate query where practical"). Lives in
 * its own module, not service.ts, so service.ts and ageing.ts can each import it without a
 * circular dependency between the two. */
export interface RawLedgerEntry {
  id: string;
  entryDate: string;
  type: "debit" | "credit";
  amount: number;
  sourceType: string;
  sourceId: string | null;
  description: string | null;
}

export async function fetchLedgerEntries(customerId: string): Promise<RawLedgerEntry[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("ledger_entries")
    .select("id, entry_date, type, amount, source_type, source_id, description, created_at")
    .eq("customer_id", customerId)
    .order("entry_date", { ascending: true })
    .order("created_at", { ascending: true });
  if (error) throw error;

  return ((data ?? []) as unknown as LedgerEntryRow[]).map((row) => ({
    id: row.id,
    entryDate: row.entry_date,
    type: row.type,
    amount: Number(row.amount),
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
  }));
}
