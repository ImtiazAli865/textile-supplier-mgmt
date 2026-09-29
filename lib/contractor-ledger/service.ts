import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayInPakistan } from "@/lib/dates";
import { round2 } from "@/lib/production-batches/service";
import { getContractor } from "@/lib/contractors/service";
import {
  SETTLEMENT_BALANCE_NOT_ZERO_PREFIX,
  describeBalance,
  formatRs,
  paisa,
  type AdjustmentInput,
  type BatchPaymentState,
  type BatchPaymentStatus,
  type BatchPaymentStatusDetail,
  type ContractorKhata,
  type ContractorPaymentItem,
  type ContractorPaymentParsed,
  type KhataRow,
  type KhataSourceType,
  type OpeningBalanceInput,
  type OpeningBalanceState,
  type PayableBatch,
  type ReopenSettlementInput,
  type ReversePaymentInput,
  type SettleInput,
  type SettlementFigures,
  type SettlementItem,
  type SettlementPreview,
  type SettlementStatement,
} from "@/lib/contractor-ledger/schema";

// ============================================================================
// Helpers
// ============================================================================

const PAGE_SIZE = 1000;

/** PostgREST caps a response at 1,000 rows; a long khata must never be silently truncated. */
async function fetchAllRows<T>(
  page: (from: number, to: number) => PromiseLike<{ data: unknown[] | null; error: unknown }>
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function isIsoDate(value: string | undefined | null): value is string {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(value));
}

function addDays(isoDate: string, days: number): string {
  const date = new Date(`${isoDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function batchPaymentState(labourCost: number, paid: number): BatchPaymentState {
  if (paisa(paid) <= 0) return "unpaid";
  return paisa(paid) >= paisa(labourCost) ? "paid" : "part_paid";
}

/** Staff email per auth user id (FR-034 "who"), falling back to the id. */
async function resolveUserLabels(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = Array.from(new Set(ids.filter((id): id is string => Boolean(id))));
  const labels = new Map<string, string>();
  await Promise.all(
    unique.map(async (id) => {
      const { data } = await getSupabaseAdmin().auth.admin.getUserById(id);
      labels.set(id, data?.user?.email ?? id);
    })
  );
  return labels;
}

// ============================================================================
// Errors — the functions' codes (contracts/server-actions.md) as friendly messages
// ============================================================================

export class ContractorLedgerError extends Error {}
export class ContractorPeriodSettledError extends ContractorLedgerError {}
export class SettlementBalanceNotZeroError extends ContractorLedgerError {
  constructor(public readonly closingBalance: number) {
    super(
      `${SETTLEMENT_BALANCE_NOT_ZERO_PREFIX} (${describeBalance(closingBalance)}). It will carry into the next period.`
    );
    this.name = "SettlementBalanceNotZeroError";
  }
}

/** Code and the value after "CODE:", e.g. "PERIOD_SETTLED:2026-10-13". */
function parseCode(message: string): { code: string; value: string } {
  const match = message.match(/([A-Z][A-Z_]{2,})(?::(\S*))?/);
  return { code: match?.[1] ?? "", value: match?.[2] ?? "" };
}

const PLAIN_MESSAGES: Record<string, string> = {
  INVALID_AMOUNT: "The amount must be greater than zero.",
  INVALID_DATE: "A valid date that is not in the future is required.",
  INVALID_ALLOCATION: "Every ticked batch needs an amount above zero.",
  INVALID_DIRECTION: "Choose owed to the contractor or advance already given.",
  INVALID_TYPE: "Choose increase or decrease.",
  DUPLICATE_BATCH: "A batch can appear only once on a payment.",
  REASON_REQUIRED: "A reason is required.",
  CONTRACTOR_NOT_FOUND: "Contractor not found.",
  BATCH_NOT_FOUND: "One of the batches no longer exists. Reload and try again.",
  ALLOCATIONS_EXCEED_PAYMENT: "The amounts against batches are more than the payment.",
  PAYMENT_ALREADY_REVERSED: "This payment has already been reversed.",
  OPENING_BALANCE_EXISTS: "An opening balance is already recorded. Use an adjustment to correct it.",
  NOTHING_TO_SETTLE: "There is nothing to settle for this contractor.",
  SETTLE_DATE_FUTURE: "The settlement date cannot be after today.",
  SETTLEMENT_ALREADY_REOPENED: "This settlement has already been reopened.",
  NOT_LATEST_SETTLEMENT: "Only the most recent settlement can be reopened.",
  IMMUTABLE_RECORD: "Khata records cannot be changed or deleted.",
  NOT_FOUND: "Not found.",
};

async function toFriendlyContractorLedgerError(
  error: { message: string },
  contractorName: () => Promise<string>
): Promise<Error> {
  const { code, value } = parseCode(error.message ?? "");
  switch (code) {
    case "PERIOD_SETTLED":
      return new ContractorPeriodSettledError(
        `${await contractorName()} is settled up to ${value}. Use a later date.`
      );
    case "PAYMENT_IN_SETTLED_PERIOD":
      return new ContractorPeriodSettledError(
        `This payment is inside a period settled up to ${value}. Reopen that settlement first.`
      );
    case "BATCH_NOT_COMPLETED":
    case "BATCH_OTHER_CONTRACTOR":
      return new ContractorLedgerError(`Batch ${value} can't be paid on this payment.`);
    case "BATCH_COMPLETED_AFTER_PAYMENT":
      return new ContractorLedgerError(`Batch ${value} was completed after the payment date.`);
    case "ALLOCATION_EXCEEDS_UNPAID": {
      const [batchNumber, unpaid] = value.split(":");
      return new ContractorLedgerError(
        `Only ${formatRs(Number(unpaid ?? 0))} is unpaid on batch ${batchNumber}.`
      );
    }
    case "OVER_ALLOCATED":
      return new ContractorLedgerError(`Batch ${value} would be paid more than its labour cost.`);
    case "OPENING_BALANCE_AFTER_SETTLEMENT":
      return new ContractorLedgerError(
        `${await contractorName()} already has a settlement. Post an adjustment instead (e.g. reason 'Opening balance missed at go-live').`
      );
    case "OPENING_BALANCE_AFTER_FIRST_ENTRY":
      return new ContractorLedgerError(
        `The opening balance must be dated on or before ${value}, the first entry in this khata.`
      );
    case "SETTLE_BEFORE_PERIOD_START":
      return new ContractorLedgerError(`The period starts on ${value}; choose that date or later.`);
    case "SETTLEMENT_BALANCE_NOT_ZERO":
      return new SettlementBalanceNotZeroError(Number(value));
  }
  if (PLAIN_MESSAGES[code]) return new ContractorLedgerError(PLAIN_MESSAGES[code]);
  return new Error(error.message);
}

function nameOfContractor(contractorId: string): () => Promise<string> {
  return async () => (await getContractor(contractorId))?.name ?? "This contractor";
}

async function nameOfPaymentContractor(paymentId: string): Promise<string> {
  const { data } = await getSupabaseAdmin()
    .from("contractor_payments")
    .select("contractors(name)")
    .eq("id", paymentId)
    .maybeSingle();
  return firstOf((data as { contractors?: { name: string } | { name: string }[] } | null)?.contractors)?.name ?? "This contractor";
}

// ============================================================================
// Mutations — each is one Postgres function (ADR-0002); "today" comes from lib/dates.ts
// ============================================================================

export async function recordContractorPaymentRecord(
  input: ContractorPaymentParsed,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("record_contractor_payment", {
    p_contractor_id: input.contractorId,
    p_payment_date: input.paymentDate.slice(0, 10),
    p_amount: round2(input.amount),
    p_note: input.note?.trim() || null,
    p_allocations: input.allocations.map((allocation) => ({
      batch_id: allocation.batchId,
      amount: round2(allocation.amount),
    })),
    p_today: todayInPakistan(),
    p_user_id: userId,
  });
  if (error) throw await toFriendlyContractorLedgerError(error, nameOfContractor(input.contractorId));
  return { id: data as string };
}

/** Returns the contractor and the batches the payment was linked to, for revalidation. */
export async function reverseContractorPaymentRecord(
  input: ReversePaymentInput,
  userId: string
): Promise<{ contractorId: string; batchIds: string[] }> {
  const { error } = await getSupabaseAdmin().rpc("reverse_contractor_payment", {
    p_payment_id: input.paymentId,
    p_reason: input.reason,
    p_today: todayInPakistan(),
    p_user_id: userId,
  });
  if (error) {
    throw await toFriendlyContractorLedgerError(error, () => nameOfPaymentContractor(input.paymentId));
  }

  const { data, error: fetchError } = await getSupabaseAdmin()
    .from("contractor_payments")
    .select("contractor_id, contractor_payment_allocations(batch_id)")
    .eq("id", input.paymentId)
    .single();
  if (fetchError) throw fetchError;
  const allocations = (data.contractor_payment_allocations ?? []) as { batch_id: string }[];
  return {
    contractorId: data.contractor_id as string,
    batchIds: allocations.map((allocation) => allocation.batch_id),
  };
}

export async function recordContractorOpeningBalanceRecord(
  input: OpeningBalanceInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("record_contractor_opening_balance", {
    p_contractor_id: input.contractorId,
    p_direction: input.direction,
    p_amount: round2(Number(input.amount)),
    p_entry_date: input.entryDate.slice(0, 10),
    p_today: todayInPakistan(),
    p_user_id: userId,
  });
  if (error) throw await toFriendlyContractorLedgerError(error, nameOfContractor(input.contractorId));
}

export async function recordContractorAdjustmentRecord(
  input: AdjustmentInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("record_contractor_adjustment", {
    p_contractor_id: input.contractorId,
    p_type: input.type,
    p_amount: round2(Number(input.amount)),
    p_entry_date: input.entryDate.slice(0, 10),
    p_reason: input.reason.trim(),
    p_today: todayInPakistan(),
    p_user_id: userId,
  });
  if (error) throw await toFriendlyContractorLedgerError(error, nameOfContractor(input.contractorId));
}

export async function settleContractorPeriodRecord(
  input: SettleInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("settle_contractor_period", {
    p_contractor_id: input.contractorId,
    p_period_end: input.periodEnd.slice(0, 10),
    p_note: input.note?.trim() || null,
    p_confirm_nonzero: input.confirmNonZero ?? false,
    p_today: todayInPakistan(),
    p_user_id: userId,
  });
  if (error) throw await toFriendlyContractorLedgerError(error, nameOfContractor(input.contractorId));
  return { id: data as string };
}

/** Returns the settlement's contractor, for revalidation. */
export async function reopenContractorSettlementRecord(
  input: ReopenSettlementInput,
  userId: string
): Promise<{ contractorId: string }> {
  const { error } = await getSupabaseAdmin().rpc("reopen_contractor_settlement", {
    p_settlement_id: input.settlementId,
    p_reason: input.reason,
    p_user_id: userId,
  });
  if (error) throw await toFriendlyContractorLedgerError(error, async () => "This contractor");

  const { data, error: fetchError } = await getSupabaseAdmin()
    .from("contractor_settlements")
    .select("contractor_id")
    .eq("id", input.settlementId)
    .single();
  if (fetchError) throw fetchError;
  return { contractorId: data.contractor_id as string };
}

// ============================================================================
// Reads — balances and running totals computed in TypeScript over fetched rows (as 009)
// ============================================================================

interface EntryRow {
  id: string;
  contractor_id: string;
  entry_date: string;
  type: "credit" | "debit";
  amount: number;
  source_type: KhataSourceType;
  source_id: string | null;
  description: string | null;
  created_at: string;
}

export interface ContractorEntry {
  id: string;
  entryDate: string;
  type: "credit" | "debit";
  amount: number;
  sourceType: KhataSourceType;
  sourceId: string | null;
  description: string | null;
}

/** Credit +, debit − (data-model.md sign convention). */
export function signed(entry: Pick<ContractorEntry, "type" | "amount">): number {
  return entry.type === "credit" ? entry.amount : -entry.amount;
}

const ENTRY_SELECT = "id, contractor_id, entry_date, type, amount, source_type, source_id, description, created_at";

function toEntry(row: EntryRow): ContractorEntry {
  return {
    id: row.id,
    entryDate: row.entry_date,
    type: row.type,
    amount: Number(row.amount),
    sourceType: row.source_type,
    sourceId: row.source_id,
    description: row.description,
  };
}

/** Every entry of one contractor in khata order: entry_date, then the order recorded (009). */
export async function fetchContractorEntries(contractorId: string): Promise<ContractorEntry[]> {
  const rows = await fetchAllRows<EntryRow>((from, to) =>
    getSupabaseAdmin()
      .from("contractor_ledger_entries")
      .select(ENTRY_SELECT)
      .eq("contractor_id", contractorId)
      .order("entry_date", { ascending: true })
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map(toEntry);
}

/** Current balance per contractor (FR-007), from one scan over all entries. */
export async function listContractorBalances(): Promise<Map<string, number>> {
  const rows = await fetchAllRows<Pick<EntryRow, "contractor_id" | "type" | "amount">>((from, to) =>
    getSupabaseAdmin()
      .from("contractor_ledger_entries")
      .select("contractor_id, type, amount")
      .order("id", { ascending: true })
      .range(from, to)
  );
  const balances = new Map<string, number>();
  for (const row of rows) {
    const value = row.type === "credit" ? Number(row.amount) : -Number(row.amount);
    balances.set(row.contractor_id, round2((balances.get(row.contractor_id) ?? 0) + value));
  }
  return balances;
}

async function resolveBatchNumbers(batchIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const unique = Array.from(new Set(batchIds));
  for (let i = 0; i < unique.length; i += 200) {
    const { data, error } = await getSupabaseAdmin()
      .from("production_batches")
      .select("id, batch_number")
      .in("id", unique.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) map.set(row.id as string, row.batch_number as string);
  }
  return map;
}

/** Khata rows with a running balance over ALL entries, so any later filter keeps true balances. */
async function buildKhataRows(entries: ContractorEntry[]): Promise<KhataRow[]> {
  const batchNumbers = await resolveBatchNumbers(
    entries.filter((e) => e.sourceType === "production_batch" && e.sourceId).map((e) => e.sourceId as string)
  );
  const reversalDates = new Map(
    entries
      .filter((e) => e.sourceType === "payment_reversal" && e.sourceId)
      .map((e) => [e.sourceId as string, e.entryDate])
  );
  let balance = 0;
  return entries.map((entry) => {
    balance = round2(balance + signed(entry));
    const isBatch = entry.sourceType === "production_batch" && entry.sourceId;
    const isPayment = (entry.sourceType === "payment" || entry.sourceType === "payment_reversal") && entry.sourceId;
    return {
      id: entry.id,
      entryDate: entry.entryDate,
      sourceType: entry.sourceType,
      description: entry.description ?? "",
      batch: isBatch
        ? { id: entry.sourceId as string, batchNumber: batchNumbers.get(entry.sourceId as string) ?? "" }
        : null,
      paymentId: isPayment ? (entry.sourceId as string) : null,
      reversedOn:
        entry.sourceType === "payment" && entry.sourceId ? (reversalDates.get(entry.sourceId) ?? null) : null,
      credit: entry.type === "credit" ? entry.amount : null,
      debit: entry.type === "debit" ? entry.amount : null,
      runningBalance: balance,
    };
  });
}

/** The contractor's khata (FR-004, FR-005, FR-008), optionally narrowed to a date range. */
export async function getContractorKhata(
  contractorId: string,
  filters: { from?: string; to?: string } = {}
): Promise<ContractorKhata | null> {
  const contractor = await getContractor(contractorId);
  if (!contractor) return null;

  const from = isIsoDate(filters.from) ? filters.from : null;
  const to = isIsoDate(filters.to) ? filters.to : null;

  const rows = await buildKhataRows(await fetchContractorEntries(contractorId));
  const currentBalance = rows.length > 0 ? rows[rows.length - 1].runningBalance : 0;

  let broughtForward: number | null = null;
  if (from) {
    const before = rows.filter((row) => row.entryDate < from);
    broughtForward = before.length > 0 ? before[before.length - 1].runningBalance : 0;
  }

  return {
    contractor: { id: contractor.id, name: contractor.name, phone: contractor.phone, status: contractor.status },
    currentBalance,
    broughtForward,
    from,
    to,
    rows: rows.filter((row) => (!from || row.entryDate >= from) && (!to || row.entryDate <= to)),
  };
}

interface AllocationWithPaymentRow {
  batch_id: string;
  payment_id: string;
  amount: number;
  contractor_payments:
    | { contractor_id: string; status: "active" | "reversed"; payment_date: string }
    | { contractor_id: string; status: "active" | "reversed"; payment_date: string }[]
    | null;
}

/** All allocations of one contractor's payments, with each payment's status. Goes through the
 * payments (same contractor as the batch, enforced by the guard trigger) so no id list is sent. */
async function fetchContractorAllocations(contractorId: string) {
  const rows = await fetchAllRows<AllocationWithPaymentRow>((from, to) =>
    getSupabaseAdmin()
      .from("contractor_payment_allocations")
      .select("batch_id, payment_id, amount, contractor_payments!inner(contractor_id, status, payment_date)")
      .eq("contractor_payments.contractor_id", contractorId)
      .order("id", { ascending: true })
      .range(from, to)
  );
  return rows.map((row) => {
    const payment = firstOf(row.contractor_payments);
    return {
      batchId: row.batch_id,
      paymentId: row.payment_id,
      amount: Number(row.amount),
      status: payment?.status ?? "active",
    };
  });
}

/** Completed batches of a contractor with paid / unpaid / status, newest completion first
 * (FR-006). Paid counts only ACTIVE payments' allocations. */
export async function listContractorBatchesWithPaymentStatus(
  contractorId: string
): Promise<BatchPaymentStatus[]> {
  const [batches, allocations] = await Promise.all([
    fetchAllRows<{ id: string; batch_number: string; completion_date: string; labour_cost: number }>((from, to) =>
      getSupabaseAdmin()
        .from("production_batches")
        .select("id, batch_number, completion_date, labour_cost")
        .eq("contractor_id", contractorId)
        .eq("status", "completed")
        .order("completion_date", { ascending: false })
        .order("batch_number", { ascending: false })
        .range(from, to)
    ),
    fetchContractorAllocations(contractorId),
  ]);

  const paidByBatch = new Map<string, number>();
  for (const allocation of allocations) {
    if (allocation.status !== "active") continue;
    paidByBatch.set(allocation.batchId, round2((paidByBatch.get(allocation.batchId) ?? 0) + allocation.amount));
  }

  return batches.map((batch) => {
    const labourCost = Number(batch.labour_cost);
    const paid = paidByBatch.get(batch.id) ?? 0;
    return {
      batchId: batch.id,
      batchNumber: batch.batch_number,
      completionDate: batch.completion_date,
      labourCost,
      paid,
      unpaid: round2(labourCost - paid),
      status: batchPaymentState(labourCost, paid),
    };
  });
}

/** Batches the payment form may offer: completed, still unpaid, oldest first (FR-011). The form
 * hides those completed after the chosen payment date. */
export async function listPayableBatches(contractorId: string): Promise<PayableBatch[]> {
  const batches = await listContractorBatchesWithPaymentStatus(contractorId);
  return batches
    .filter((batch) => paisa(batch.unpaid) > 0)
    .sort((a, b) => a.completionDate.localeCompare(b.completionDate) || a.batchNumber.localeCompare(b.batchNumber))
    .map(({ batchId, batchNumber, completionDate, labourCost, unpaid }) => ({
      batchId,
      batchNumber,
      completionDate,
      labourCost,
      unpaid,
    }));
}

/** One batch's payment status and the payments linked to it (FR-006, batch detail page). Null
 * for a batch that isn't completed. */
export async function getBatchPaymentStatus(batchId: string): Promise<BatchPaymentStatusDetail | null> {
  const { data: batch, error } = await getSupabaseAdmin()
    .from("production_batches")
    .select("id, batch_number, status, contractor_id, completion_date, labour_cost")
    .eq("id", batchId)
    .maybeSingle();
  if (error) throw error;
  if (!batch || batch.status !== "completed") return null;

  const { data: allocations, error: allocationError } = await getSupabaseAdmin()
    .from("contractor_payment_allocations")
    .select("payment_id, amount, contractor_payments(payment_date, status)")
    .eq("batch_id", batchId);
  if (allocationError) throw allocationError;

  const payments = ((allocations ?? []) as unknown as {
    payment_id: string;
    amount: number;
    contractor_payments: { payment_date: string; status: "active" | "reversed" } | { payment_date: string; status: "active" | "reversed" }[] | null;
  }[])
    .map((row) => {
      const payment = firstOf(row.contractor_payments);
      return {
        paymentId: row.payment_id,
        paymentDate: payment?.payment_date ?? "",
        amount: Number(row.amount),
        status: payment?.status ?? "active",
      } as const;
    })
    .sort((a, b) => a.paymentDate.localeCompare(b.paymentDate));

  const labourCost = Number(batch.labour_cost);
  const paid = round2(payments.filter((p) => p.status === "active").reduce((sum, p) => sum + p.amount, 0));
  return {
    batchId: batch.id as string,
    batchNumber: batch.batch_number as string,
    completionDate: batch.completion_date as string,
    labourCost,
    paid,
    unpaid: round2(labourCost - paid),
    status: batchPaymentState(labourCost, paid),
    contractorId: batch.contractor_id as string,
    payments: payments.map((p) => ({ ...p })),
  };
}

interface PaymentRow {
  id: string;
  payment_date: string;
  amount: number;
  note: string | null;
  status: "active" | "reversed";
  reversal_reason: string | null;
  reversed_at: string | null;
  reversed_by: string | null;
  created_at: string;
  created_by: string;
  contractor_payment_allocations:
    | { batch_id: string; amount: number; production_batches: { batch_number: string } | { batch_number: string }[] | null }[]
    | null;
}

/** A contractor's payments, newest first, with their batch amounts and unlinked remainder
 * (FR-013) and reversal details (US4). */
export async function listContractorPayments(contractorId: string): Promise<ContractorPaymentItem[]> {
  const rows = await fetchAllRows<PaymentRow>((from, to) =>
    getSupabaseAdmin()
      .from("contractor_payments")
      .select(
        "id, payment_date, amount, note, status, reversal_reason, reversed_at, reversed_by, created_at, created_by, contractor_payment_allocations(batch_id, amount, production_batches(batch_number))"
      )
      .eq("contractor_id", contractorId)
      .order("payment_date", { ascending: false })
      .order("created_at", { ascending: false })
      .range(from, to)
  );
  const users = await resolveUserLabels(rows.flatMap((row) => [row.created_by, row.reversed_by]));

  return rows.map((row) => {
    const allocations = (row.contractor_payment_allocations ?? [])
      .map((allocation) => ({
        batchId: allocation.batch_id,
        batchNumber: firstOf(allocation.production_batches)?.batch_number ?? "",
        amount: Number(allocation.amount),
      }))
      .sort((a, b) => a.batchNumber.localeCompare(b.batchNumber));
    const amount = Number(row.amount);
    return {
      id: row.id,
      paymentDate: row.payment_date,
      amount,
      note: row.note,
      status: row.status,
      allocations,
      unlinked: round2(amount - allocations.reduce((sum, a) => sum + a.amount, 0)),
      createdAt: row.created_at,
      createdBy: users.get(row.created_by) ?? row.created_by,
      reversalReason: row.reversal_reason,
      reversedAt: row.reversed_at,
      reversedBy: row.reversed_by ? (users.get(row.reversed_by) ?? row.reversed_by) : null,
    };
  });
}

/** What the opening-balance action may do (FR-020). */
export async function getOpeningBalanceState(contractorId: string): Promise<OpeningBalanceState> {
  const admin = getSupabaseAdmin();
  const [opening, settlement, earliest] = await Promise.all([
    admin
      .from("contractor_ledger_entries")
      .select("id")
      .eq("contractor_id", contractorId)
      .eq("source_type", "opening_balance")
      .limit(1),
    admin
      .from("contractor_settlements")
      .select("id")
      .eq("contractor_id", contractorId)
      .is("reopened_at", null)
      .limit(1),
    admin
      .from("contractor_ledger_entries")
      .select("entry_date")
      .eq("contractor_id", contractorId)
      .order("entry_date", { ascending: true })
      .limit(1),
  ]);
  if (opening.error) throw opening.error;
  if (settlement.error) throw settlement.error;
  if (earliest.error) throw earliest.error;
  return {
    hasOpeningBalance: (opening.data ?? []).length > 0,
    hasCurrentSettlement: (settlement.data ?? []).length > 0,
    earliestEntryDate: (earliest.data?.[0]?.entry_date as string | undefined) ?? null,
  };
}

// ============================================================================
// Settlements
// ============================================================================

interface SettlementRow {
  id: string;
  contractor_id: string;
  period_start: string;
  period_end: string;
  opening_balance: number;
  earned: number;
  paid: number;
  adjustments: number;
  closing_balance: number;
  note: string | null;
  settled_at: string;
  settled_by: string;
  reopened_at: string | null;
  reopened_by: string | null;
  reopen_reason: string | null;
}

const SETTLEMENT_SELECT =
  "id, contractor_id, period_start, period_end, opening_balance, earned, paid, adjustments, closing_balance, note, settled_at, settled_by, reopened_at, reopened_by, reopen_reason";

function toSettlementItem(row: SettlementRow, users: Map<string, string>, latestCurrentId: string | null): SettlementItem {
  return {
    id: row.id,
    contractorId: row.contractor_id,
    periodStart: row.period_start,
    periodEnd: row.period_end,
    openingBalance: Number(row.opening_balance),
    earned: Number(row.earned),
    paid: Number(row.paid),
    adjustments: Number(row.adjustments),
    closingBalance: Number(row.closing_balance),
    note: row.note,
    settledAt: row.settled_at,
    settledBy: users.get(row.settled_by) ?? row.settled_by,
    reopenedAt: row.reopened_at,
    reopenedBy: row.reopened_by ? (users.get(row.reopened_by) ?? row.reopened_by) : null,
    reopenReason: row.reopen_reason,
    isLatestCurrent: row.id === latestCurrentId,
  };
}

async function fetchSettlementRows(contractorId: string): Promise<SettlementRow[]> {
  const { data, error } = await getSupabaseAdmin()
    .from("contractor_settlements")
    .select(SETTLEMENT_SELECT)
    .eq("contractor_id", contractorId)
    .order("period_end", { ascending: false })
    .order("settled_at", { ascending: false });
  if (error) throw error;
  return (data ?? []) as SettlementRow[];
}

function latestCurrent(rows: SettlementRow[]): SettlementRow | null {
  return (
    rows
      .filter((row) => row.reopened_at === null)
      .sort((a, b) => b.period_end.localeCompare(a.period_end))[0] ?? null
  );
}

/** Every settlement of a contractor, current and reopened, newest first (FR-029). */
export async function listContractorSettlements(contractorId: string): Promise<SettlementItem[]> {
  const rows = await fetchSettlementRows(contractorId);
  const users = await resolveUserLabels(rows.flatMap((row) => [row.settled_by, row.reopened_by]));
  const latestId = latestCurrent(rows)?.id ?? null;
  return rows.map((row) => toSettlementItem(row, users, latestId));
}

/** The settlement figures for [start, end], exactly as settle_contractor_period computes them
 * (data-model.md step 4): the go-live opening entry counts in opening; paid is net of reversals. */
function computeFigures(entries: ContractorEntry[], start: string, end: string): SettlementFigures {
  let opening = 0;
  let earned = 0;
  let paid = 0;
  let adjustments = 0;
  for (const entry of entries) {
    if (entry.entryDate > end) continue;
    if (entry.entryDate < start || entry.sourceType === "opening_balance") {
      opening += signed(entry);
    } else if (entry.sourceType === "production_batch") {
      earned += entry.amount;
    } else if (entry.sourceType === "payment") {
      paid += entry.amount;
    } else if (entry.sourceType === "payment_reversal") {
      paid -= entry.amount;
    } else if (entry.sourceType === "adjustment") {
      adjustments += signed(entry);
    }
  }
  const figures = {
    openingBalance: round2(opening),
    earned: round2(earned),
    paid: round2(paid),
    adjustments: round2(adjustments),
  };
  return {
    ...figures,
    closingBalance: round2(figures.openingBalance + figures.earned - figures.paid + figures.adjustments),
  };
}

/** Period start and figures for the settle form. The stored figures always come from SQL. */
export async function getSettlementPreview(contractorId: string, periodEnd: string): Promise<SettlementPreview> {
  const [entries, settlements] = await Promise.all([
    fetchContractorEntries(contractorId),
    fetchSettlementRows(contractorId),
  ]);
  const latest = latestCurrent(settlements);
  const periodStart = latest ? addDays(latest.period_end, 1) : (entries[0]?.entryDate ?? null);
  if (!periodStart) {
    return { canSettle: false, reason: "There is nothing to settle for this contractor.", periodStart: null };
  }
  const today = todayInPakistan();
  if (periodStart > today) {
    return {
      canSettle: false,
      reason: `This contractor is already settled up to ${latest?.period_end}. The next period starts on ${periodStart}.`,
      periodStart,
    };
  }
  if (!isIsoDate(periodEnd) || periodEnd > today) {
    return { canSettle: false, reason: "The settlement date cannot be after today.", periodStart };
  }
  if (periodEnd < periodStart) {
    return { canSettle: false, reason: `The period starts on ${periodStart}; choose that date or later.`, periodStart };
  }
  return { canSettle: true, periodStart, periodEnd, ...computeFigures(entries, periodStart, periodEnd) };
}

/** A settlement statement for printing (FR-030): the period's rows with running balance, the
 * frozen figures, and a check that they still match the khata. */
export async function getSettlementStatement(
  contractorId: string,
  settlementId: string
): Promise<SettlementStatement | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("contractor_settlements")
    .select(SETTLEMENT_SELECT)
    .eq("id", settlementId)
    .eq("contractor_id", contractorId)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const row = data as SettlementRow;

  const [contractor, entries, allSettlements] = await Promise.all([
    getContractor(contractorId),
    fetchContractorEntries(contractorId),
    fetchSettlementRows(contractorId),
  ]);
  if (!contractor) return null;

  const users = await resolveUserLabels([row.settled_by, row.reopened_by]);
  const settlement = toSettlementItem(row, users, latestCurrent(allSettlements)?.id ?? null);
  const recomputed = computeFigures(entries, settlement.periodStart, settlement.periodEnd);
  const rows = (await buildKhataRows(entries)).filter(
    (r) => r.entryDate >= settlement.periodStart && r.entryDate <= settlement.periodEnd
  );
  const matchesFrozen =
    paisa(recomputed.openingBalance) === paisa(settlement.openingBalance) &&
    paisa(recomputed.earned) === paisa(settlement.earned) &&
    paisa(recomputed.paid) === paisa(settlement.paid) &&
    paisa(recomputed.adjustments) === paisa(settlement.adjustments) &&
    paisa(recomputed.closingBalance) === paisa(settlement.closingBalance);

  return {
    settlement,
    contractor: { id: contractor.id, name: contractor.name, phone: contractor.phone },
    rows,
    recomputed,
    matchesFrozen,
    generatedAt: new Date().toISOString(),
  };
}
