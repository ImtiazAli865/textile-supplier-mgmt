/**
 * 011 live QA: seeds QA-011 data and runs the quickstart §7 races and the §8 reconciliation
 * against the LIVE Supabase project through the real service layer (research.md, "race tests run
 * on live Supabase"). PGlite can't test these: it has one connection, so row locks never contend.
 *
 * Run from the repository root (Node 20.6+ for --env-file):
 *   npx tsx --env-file=.env.local --conditions=react-server --tsconfig tsconfig.json \
 *     specs/011-labour-commission-ledger/qa/seed-and-race-qa-011.mts
 *
 * Optional: QA_USER_ID=<auth user id> to record as a specific staff user (default: the first user).
 *
 * Every row it creates is tagged with the "QA-011 " prefix (a unique run suffix keeps names
 * unique), so specs/011-labour-commission-ledger/qa/cleanup-qa-011.sql removes it. The counts
 * printed at the end are informational; the cleanup counts for itself.
 */
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayInPakistan } from "@/lib/dates";
import { createContractorRecord } from "@/lib/contractors/service";
import {
  completeProductionBatchRecord,
  issueProductionBatchRecord,
} from "@/lib/production-batches/service";
import type { SettlementFigures } from "@/lib/contractor-ledger/schema";
import {
  getSettlementPreview,
  getSettlementStatement,
  listContractorBatchesWithPaymentStatus,
  recordContractorOpeningBalanceRecord,
  recordContractorPaymentRecord,
  reopenContractorSettlementRecord,
  settleContractorPeriodRecord,
} from "@/lib/contractor-ledger/service";

const admin = getSupabaseAdmin();
const today = todayInPakistan();
const run = Date.now().toString(36);
let pass = 0;
let fail = 0;

function check(name: string, condition: boolean, detail = "") {
  if (condition) pass++;
  else {
    fail++;
    console.log(`FAIL: ${name} ${detail}`);
  }
}

async function userId(): Promise<string> {
  if (process.env.QA_USER_ID) return process.env.QA_USER_ID;
  const { data, error } = await admin.auth.admin.listUsers({ page: 1, perPage: 1 });
  if (error || !data.users[0]) throw new Error("No auth user found; set QA_USER_ID.");
  return data.users[0].id;
}

function settled(result: PromiseSettledResult<unknown>): { ok: boolean; error: string } {
  return result.status === "fulfilled"
    ? { ok: true, error: "" }
    : { ok: false, error: result.reason instanceof Error ? result.reason.message : String(result.reason) };
}

const USER = await userId();
console.log(`QA-011 run ${run}, today ${today}, user ${USER}`);

// ----------------------------------------------------------------------------
// Seed: supplier + weight lot, manufactured product, contractors (all QA-011 prefixed)
// ----------------------------------------------------------------------------
const purchaseDate = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86_400_000).toISOString().slice(0, 10);

const { data: supplier, error: supplierError } = await admin
  .from("suppliers")
  .insert({
    company_name: `QA-011 Supplier ${run}`,
    address_line1: "QA",
    address_city: "QA",
    address_country: "Pakistan",
    payment_terms: "QA",
    created_by: USER,
    updated_by: USER,
  })
  .select("id")
  .single();
if (supplierError) throw supplierError;

const { data: lot, error: lotError } = await admin
  .from("raw_material_purchases")
  .insert({
    supplier_id: supplier.id,
    purchase_date: purchaseDate,
    purchase_mode: "weight",
    weight_kg: 1000,
    rate_per_kg: 100,
    remaining_weight_kg: 1000,
    created_by: USER,
    updated_by: USER,
  })
  .select("id")
  .single();
if (lotError) throw lotError;

const { data: product, error: productError } = await admin
  .from("products")
  .insert({
    name: `QA-011 Washcloth ${run}`,
    type: "manufactured",
    stock_uom: "packet",
    default_selling_price: 50,
    expected_yield_per_kg: 20,
    default_labour_rate_per_packet: 10,
    created_by: USER,
    updated_by: USER,
  })
  .select("id")
  .single();
if (productError) throw productError;
const LOT_ID = lot.id as string;
const PRODUCT_ID = product.id as string;

const contractor = async (label: string) =>
  (await createContractorRecord({ name: `QA-011 ${label} ${run}`, phone: "" }, USER)).id;

/** Issues 10 kg and completes it today with `packets` packets at Rs 10 (labour = packets × 10). */
async function completedBatch(contractorId: string, packets: number): Promise<string> {
  const { id } = await issueProductionBatchRecord(
    { lotId: LOT_ID, productId: PRODUCT_ID, contractorId, weightIssuedKg: 10, labourRatePerPacket: 10, issueDate: today },
    USER
  );
  await completeProductionBatchRecord(
    id,
    { packetsProduced: packets, returnedWeightKg: 9, completionDate: today, confirmReturnedWeightExceeded: false },
    USER
  );
  return id;
}

// ----------------------------------------------------------------------------
// Race 1: two payments against one batch (FR-015, US2-6, SC-004), 10 runs
// ----------------------------------------------------------------------------
const payRacer = await contractor("Race Pay");
for (let i = 1; i <= 10; i++) {
  const batchId = await completedBatch(payRacer, 900); // labour Rs 9,000
  const pay = () =>
    recordContractorPaymentRecord(
      { contractorId: payRacer, paymentDate: today, amount: 9000, note: `race ${i}`, allocations: [{ batchId, amount: 9000 }] },
      USER
    );
  const results = (await Promise.allSettled([pay(), pay()])).map(settled);
  const wins = results.filter((r) => r.ok).length;
  const loser = results.find((r) => !r.ok);
  check(`race1 run ${i}: exactly one payment wins`, wins === 1, JSON.stringify(results));
  check(`race1 run ${i}: loser sees Rs 0 unpaid`, Boolean(loser?.error.includes("Only Rs 0.00 is unpaid")), loser?.error ?? "");
  const status = (await listContractorBatchesWithPaymentStatus(payRacer)).find((b) => b.batchId === batchId);
  check(`race1 run ${i}: batch paid never above labour cost`, status?.paid === 9000 && status.status === "paid", JSON.stringify(status));
}

// ----------------------------------------------------------------------------
// Race 2: payment vs settlement (FR-015, US5-10), 10 runs, reopening between runs
// ----------------------------------------------------------------------------
const settleRacer = await contractor("Race Settle");
await completedBatch(settleRacer, 100); // something to settle
for (let i = 1; i <= 10; i++) {
  const [payment, settlement] = (
    await Promise.allSettled([
      recordContractorPaymentRecord(
        { contractorId: settleRacer, paymentDate: today, amount: 100, note: `race ${i}`, allocations: [] },
        USER
      ),
      settleContractorPeriodRecord({ contractorId: settleRacer, periodEnd: today, note: `race ${i}`, confirmNonZero: true }, USER),
    ])
  ).map((r, index) => ({ ...settled(r), value: r.status === "fulfilled" ? (r.value as { id: string }).id : null, index }));

  check(`race2 run ${i}: settlement saved`, settlement.ok, settlement.error);
  check(
    `race2 run ${i}: payment saved or refused as settled`,
    payment.ok || payment.error.includes("is settled up to"),
    payment.error
  );
  if (settlement.ok && settlement.value) {
    const statement = await getSettlementStatement(settleRacer, settlement.value);
    check(`race2 run ${i}: frozen figures match the khata`, Boolean(statement?.matchesFrozen), JSON.stringify(statement?.recomputed));
    await reopenContractorSettlementRecord({ settlementId: settlement.value, reason: `QA-011 race ${i}` }, USER);
  }
}

// ----------------------------------------------------------------------------
// Race 3: batch completion vs settlement (FR-003, research.md lock order), 5 runs
// ----------------------------------------------------------------------------
const completeRacer = await contractor("Race Complete");
await completedBatch(completeRacer, 100);
for (let i = 1; i <= 5; i++) {
  const { id: batchId } = await issueProductionBatchRecord(
    { lotId: LOT_ID, productId: PRODUCT_ID, contractorId: completeRacer, weightIssuedKg: 10, labourRatePerPacket: 10, issueDate: today },
    USER
  );
  const [completion, settlement] = (
    await Promise.allSettled([
      completeProductionBatchRecord(
        batchId,
        { packetsProduced: 50, returnedWeightKg: 9, completionDate: today, confirmReturnedWeightExceeded: false },
        USER
      ),
      settleContractorPeriodRecord({ contractorId: completeRacer, periodEnd: today, note: `race ${i}`, confirmNonZero: true }, USER),
    ])
  ).map((r) => ({ ...settled(r), value: r.status === "fulfilled" ? r.value : null }));

  check(`race3 run ${i}: settlement saved`, settlement.ok, settlement.error);
  check(
    `race3 run ${i}: completion saved or refused as settled`,
    completion.ok || completion.error.includes("is settled up to"),
    completion.error
  );
  const settlementId = (settlement.value as { id: string } | null)?.id;
  if (settlementId) {
    const statement = await getSettlementStatement(completeRacer, settlementId);
    check(`race3 run ${i}: frozen figures match the khata`, Boolean(statement?.matchesFrozen), JSON.stringify(statement?.recomputed));
    await reopenContractorSettlementRecord({ settlementId, reason: `QA-011 race ${i}` }, USER);
  }
  if (!completion.ok) {
    // Leave no batch half-done: complete it now that the settlement is reopened.
    await completeProductionBatchRecord(
      batchId,
      { packetsProduced: 50, returnedWeightKg: 9, completionDate: today, confirmReturnedWeightExceeded: false },
      USER
    );
  }
}

// ----------------------------------------------------------------------------
// Opening balance x settlement boundary: the TypeScript preview and statement figures must equal
// the SQL-frozen ones for a first settlement starting on the opening-balance date, and for the
// second settlement, where the opening entry is before the period start (counted once).
// ----------------------------------------------------------------------------
const obContractor = await contractor("OB Boundary");
const dayBefore = new Date(Date.parse(`${today}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
await recordContractorOpeningBalanceRecord(
  { contractorId: obContractor, direction: "owed", amount: 5000, entryDate: dayBefore },
  USER
);
await recordContractorPaymentRecord(
  { contractorId: obContractor, paymentDate: dayBefore, amount: 1000, note: "", allocations: [] },
  USER
);
const sameFigures = (a: SettlementFigures, b: SettlementFigures) =>
  JSON.stringify([a.openingBalance, a.earned, a.paid, a.adjustments, a.closingBalance]) ===
  JSON.stringify([b.openingBalance, b.earned, b.paid, b.adjustments, b.closingBalance]);
for (const [label, end] of [["first", dayBefore], ["second", today]] as const) {
  if (label === "second") await completedBatch(obContractor, 300); // earned 3,000 today
  const preview = await getSettlementPreview(obContractor, end);
  const { id } = await settleContractorPeriodRecord(
    { contractorId: obContractor, periodEnd: end, note: `OB ${label}`, confirmNonZero: true },
    USER
  );
  const statement = await getSettlementStatement(obContractor, id);
  check(`OB ${label}: statement matches frozen`, Boolean(statement?.matchesFrozen), JSON.stringify(statement?.recomputed));
  check(
    `OB ${label}: preview equals frozen`,
    preview.canSettle && Boolean(statement) && sameFigures(preview, statement!.settlement),
    JSON.stringify({ preview, frozen: statement?.settlement })
  );
  const expected = label === "first" ? [5000, 0, 1000, 0, 4000] : [4000, 3000, 0, 0, 7000];
  const s = statement!.settlement;
  check(
    `OB ${label}: figures ${expected.join("/")}`,
    JSON.stringify([s.openingBalance, s.earned, s.paid, s.adjustments, s.closingBalance]) === JSON.stringify(expected),
    JSON.stringify(s)
  );
}

// ----------------------------------------------------------------------------
// §8 reconciliation over the QA contractors: every completed batch has exactly one earning equal
// to its labour cost, and nothing else does (SC-001)
// ----------------------------------------------------------------------------
const qaContractorIds = [payRacer, settleRacer, completeRacer, obContractor];
const { data: batches, error: batchesError } = await admin
  .from("production_batches")
  .select("id, status, labour_cost")
  .in("contractor_id", qaContractorIds);
if (batchesError) throw batchesError;
const { data: earnings, error: earningsError } = await admin
  .from("contractor_ledger_entries")
  .select("source_id, amount")
  .eq("source_type", "production_batch")
  .in("contractor_id", qaContractorIds);
if (earningsError) throw earningsError;
const earningsByBatch = new Map<string, number[]>();
for (const e of earnings ?? []) {
  earningsByBatch.set(e.source_id as string, [...(earningsByBatch.get(e.source_id as string) ?? []), Number(e.amount)]);
}
const mismatches = (batches ?? []).filter((b) => {
  const found = earningsByBatch.get(b.id as string) ?? [];
  return b.status === "completed" ? found.length !== 1 || found[0] !== Number(b.labour_cost) : found.length !== 0;
});
check("§8 reconciliation: 0 mismatches", mismatches.length === 0, JSON.stringify(mismatches));

// ----------------------------------------------------------------------------
// Rows created (informational; cleanup-qa-011.sql counts for itself)
// ----------------------------------------------------------------------------
async function countWhere(table: string, column: string, values: string[]): Promise<number> {
  const { count, error } = await admin.from(table).select("id", { count: "exact" }).in(column, values).limit(1);
  if (error) throw error;
  return count ?? 0;
}
const batchIds = (batches ?? []).map((b) => b.id as string);
console.log("Rows created this run:", {
  contractors: qaContractorIds.length,
  suppliers: 1,
  raw_material_purchases: 1,
  products: 1,
  production_batches: batchIds.length,
  contractor_ledger_entries: await countWhere("contractor_ledger_entries", "contractor_id", qaContractorIds),
  contractor_payments: await countWhere("contractor_payments", "contractor_id", qaContractorIds),
  contractor_settlements: await countWhere("contractor_settlements", "contractor_id", qaContractorIds),
});

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
