import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";

/**
 * A customer's running ledger balance, computed live from its ledger_entries rows —
 * never cached on the customer row (research.md: "a customer's ledger balance is
 * computed live via SUM, never cached"). Credit increases the balance, debit decreases it,
 * matching specs/PRODUCT-OVERVIEW.md's literal "billing events post as Credit; payments
 * received post as Debit" framing.
 */
export async function getCustomerLedgerBalance(customerId: string): Promise<number> {
  const { data, error } = await getSupabaseAdmin()
    .from("ledger_entries")
    .select("type, amount")
    .eq("customer_id", customerId);
  if (error) throw error;

  return (data ?? []).reduce((balance, row) => {
    const amount = row.amount as number;
    return row.type === "credit" ? balance + amount : balance - amount;
  }, 0);
}
