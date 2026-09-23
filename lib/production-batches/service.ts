import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { todayInPakistan } from "@/lib/dates";
import type {
  BatchCompleteInput,
  BatchDetail,
  BatchIssueInput,
  BatchListItem,
  BatchListResult,
  BatchStatus,
  LotOption,
  OpeningStockCorrectionInput,
  OpeningStockInput,
  OpeningStockRow,
} from "@/lib/production-batches/schema";

/** Rounds to 2 decimal places — matches the numeric(…, 2) column precision (as in 002). */
export function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function daysBetween(fromDate: string, toDate: string): number {
  return Math.max(0, Math.round((Date.parse(toDate) - Date.parse(fromDate)) / 86_400_000));
}

function firstOf<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function escapeLike(value: string): string {
  return value.replace(/[%_\\]/g, (char) => `\\${char}`);
}

function formatKg(value: number): string {
  return value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ============================================================================
// Errors — surface the DB-level guarantees as friendly messages
// (contracts/server-actions.md), same approach as lib/challans/service.ts.
// ============================================================================

export class BatchNotFoundError extends Error {}
export class LotInsufficientWeightError extends Error {}
export class IssueBeforePurchaseError extends Error {}
export class ProductNotEligibleError extends Error {}
export class ContractorNotActiveError extends Error {}
export class BatchNotEditableError extends Error {}
export class BatchNotVoidableError extends Error {}
export class BatchNotIssuedError extends Error {}
export class CompletionBeforeIssueError extends Error {}
export class OpeningStockExistsError extends Error {}
export class OpeningStockNotFoundError extends Error {}
export class ProductNotManufacturedError extends Error {}
export class CorrectionExistsError extends Error {}
export class StockAlreadyShippedError extends Error {}
export class CorrectionBeforeEntryError extends Error {}
export class CorrectionBelowZeroError extends Error {}

/** Message is stable so the complete form can recognise it and re-ask for confirmation. */
export const RETURNED_WEIGHT_UNCONFIRMED_MESSAGE =
  "Returned weight exceeds the weight issued. Confirm to continue.";
export class ReturnedWeightUnconfirmedError extends Error {
  constructor() {
    super(RETURNED_WEIGHT_UNCONFIRMED_MESSAGE);
    this.name = "ReturnedWeightUnconfirmedError";
  }
}

function afterColon(msg: string, code: string): string {
  return msg.split(`${code}:`)[1]?.trim().split(/\s/)[0] ?? "";
}

function statusWord(msg: string, code: string): string {
  return afterColon(msg, code) || "completed or voided";
}

/** The functions' explicit input guards (0010) — the Zod schemas enforce the same rules first,
 * so these only surface for a caller that bypasses them. */
const INPUT_GUARD_MESSAGES: Record<string, string> = {
  INVALID_WEIGHT: "Weight issued must be greater than zero.",
  INVALID_LABOUR_RATE: "Labour rate must be greater than zero.",
  INVALID_PACKETS: "Packets produced must be a whole number of at least 1.",
  INVALID_RETURNED_WEIGHT: "Returned packet weight must be greater than zero.",
  INVALID_QUANTITY: "Opening quantity must be a whole number of at least 1.",
  INVALID_COST: "Cost per packet must be greater than zero when given.",
  INVALID_CORRECTION: "The correction must be a non-zero whole number.",
  REASON_REQUIRED: "A reason is required for the correction.",
  INVALID_DATE: "A valid date is required.",
};

function toFriendlyBatchError(error: { code?: string; message: string }): Error {
  const msg = error.message ?? "";

  for (const [code, friendly] of Object.entries(INPUT_GUARD_MESSAGES)) {
    if (msg.includes(code)) return new Error(friendly);
  }

  if (msg.includes("LOT_INSUFFICIENT_WEIGHT")) {
    const remaining = Number(afterColon(msg, "LOT_INSUFFICIENT_WEIGHT"));
    return new LotInsufficientWeightError(
      Number.isFinite(remaining)
        ? `Only ${formatKg(remaining)} kg remains on this lot.`
        : "Not enough weight remains on this lot."
    );
  }
  if (msg.includes("ISSUE_BEFORE_PURCHASE")) {
    const date = afterColon(msg, "ISSUE_BEFORE_PURCHASE");
    return new IssueBeforePurchaseError(
      `Issue date cannot be before the lot's purchase date${date ? ` (${date})` : ""}.`
    );
  }
  if (msg.includes("LOT_NOT_FOUND")) return new Error("Select a valid fabric lot.");
  if (msg.includes("LOT_NOT_WEIGHT_MODE")) {
    return new Error("Only weight-based fabric lots can be issued to a batch.");
  }
  if (msg.includes("PRODUCT_NOT_ELIGIBLE")) {
    return new ProductNotEligibleError("Select an active manufactured product.");
  }
  if (msg.includes("CONTRACTOR_NOT_ACTIVE")) {
    return new ContractorNotActiveError("Select an active contractor.");
  }
  if (msg.includes("BATCH_NOT_EDITABLE")) {
    return new BatchNotEditableError(
      `This batch has already been ${statusWord(msg, "BATCH_NOT_EDITABLE")} and is read-only.`
    );
  }
  if (msg.includes("BATCH_NOT_VOIDABLE")) {
    return new BatchNotVoidableError(
      `This batch has already been ${statusWord(msg, "BATCH_NOT_VOIDABLE")} and cannot be voided.`
    );
  }
  if (msg.includes("BATCH_NOT_ISSUED")) {
    return new BatchNotIssuedError(
      `This batch has already been ${statusWord(msg, "BATCH_NOT_ISSUED")}.`
    );
  }
  if (msg.includes("COMPLETION_BEFORE_ISSUE")) {
    return new CompletionBeforeIssueError("Completion date cannot be before the issue date.");
  }
  if (msg.includes("RETURNED_WEIGHT_UNCONFIRMED")) return new ReturnedWeightUnconfirmedError();
  if (msg.includes("OPENING_STOCK_EXISTS")) {
    return new OpeningStockExistsError("Opening stock has already been recorded for this product.");
  }
  if (msg.includes("OPENING_STOCK_NOT_FOUND")) {
    return new OpeningStockNotFoundError("No opening stock has been recorded for this product yet.");
  }
  if (msg.includes("PRODUCT_NOT_MANUFACTURED")) {
    return new ProductNotManufacturedError("Opening stock can only be recorded for manufactured products.");
  }
  if (msg.includes("CORRECTION_EXISTS")) {
    return new CorrectionExistsError("This product's opening stock has already been corrected once.");
  }
  if (msg.includes("STOCK_ALREADY_SHIPPED")) {
    return new StockAlreadyShippedError(
      "Stock of this product has already gone out on an accepted Challan, so the opening balance can no longer be corrected."
    );
  }
  if (msg.includes("CORRECTION_BEFORE_ENTRY")) {
    return new CorrectionBeforeEntryError(
      "Correction date cannot be before the opening stock entry date."
    );
  }
  if (msg.includes("CORRECTION_BELOW_ZERO")) {
    return new CorrectionBelowZeroError("This correction would take stock below zero.");
  }
  if (msg.includes("NOT_FOUND")) return new BatchNotFoundError("Not found.");
  return new Error(error.message);
}

// ============================================================================
// Mutations — every one is a single Postgres function (ADR-0002, FR-028)
// ============================================================================

export async function issueProductionBatchRecord(
  input: BatchIssueInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("issue_production_batch", {
    p_lot_id: input.lotId,
    p_product_id: input.productId,
    p_contractor_id: input.contractorId,
    p_weight_issued_kg: round2(input.weightIssuedKg),
    p_labour_rate_per_packet: round2(input.labourRatePerPacket),
    p_issue_date: input.issueDate.slice(0, 10),
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);
  return { id: data as string };
}

export async function updateProductionBatchRecord(
  id: string,
  input: BatchIssueInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("update_production_batch", {
    p_id: id,
    p_lot_id: input.lotId,
    p_product_id: input.productId,
    p_contractor_id: input.contractorId,
    p_weight_issued_kg: round2(input.weightIssuedKg),
    p_labour_rate_per_packet: round2(input.labourRatePerPacket),
    p_issue_date: input.issueDate.slice(0, 10),
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);
}

export async function voidProductionBatchRecord(id: string, userId: string): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("void_production_batch", {
    p_id: id,
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);
}

export async function completeProductionBatchRecord(
  id: string,
  input: BatchCompleteInput,
  userId: string
): Promise<{ productId: string }> {
  const { error } = await getSupabaseAdmin().rpc("complete_production_batch", {
    p_id: id,
    p_packets_produced: Number(input.packetsProduced),
    p_returned_weight_kg: round2(Number(input.returnedWeightKg)),
    p_completion_date: input.completionDate.slice(0, 10),
    p_confirm_returned_weight_exceeded: input.confirmReturnedWeightExceeded ?? false,
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);

  const { data, error: fetchError } = await getSupabaseAdmin()
    .from("production_batches")
    .select("product_id")
    .eq("id", id)
    .single();
  if (fetchError) throw fetchError;
  return { productId: data.product_id as string };
}

export async function recordOpeningStockRecord(
  input: OpeningStockInput,
  userId: string
): Promise<void> {
  const cost =
    input.costPerPacket === undefined || input.costPerPacket === ""
      ? null
      : round2(Number(input.costPerPacket));
  const { error } = await getSupabaseAdmin().rpc("record_manufactured_opening_stock", {
    p_product_id: input.productId,
    p_quantity: Number(input.quantity),
    p_entry_date: input.entryDate.slice(0, 10),
    p_cost_per_packet: cost,
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);
}

export async function recordOpeningStockCorrectionRecord(
  input: OpeningStockCorrectionInput,
  userId: string
): Promise<void> {
  const { error } = await getSupabaseAdmin().rpc("record_manufactured_opening_stock_correction", {
    p_product_id: input.productId,
    p_correction_qty: input.correctionQty,
    p_reason: input.reason,
    p_correction_date: input.correctionDate.slice(0, 10),
    p_user_id: userId,
  });
  if (error) throw toFriendlyBatchError(error);
}

// ============================================================================
// Reads
// ============================================================================

interface SupplierRef {
  company_name: string;
}

interface LotRow {
  id: string;
  purchase_date: string;
  weight_kg: number;
  rate_per_kg: number;
  remaining_weight_kg: number;
  suppliers: SupplierRef | SupplierRef[] | null;
}

function toLotOption(row: LotRow, extraKg = 0): LotOption {
  const supplierName = firstOf(row.suppliers)?.company_name ?? "";
  const weightKg = Number(row.weight_kg);
  const remainingWeightKg = round2(Number(row.remaining_weight_kg) + extraKg);
  const ratePerKg = Number(row.rate_per_kg);
  return {
    id: row.id,
    supplierName,
    purchaseDate: row.purchase_date,
    weightKg,
    remainingWeightKg,
    ratePerKg,
    label: `${supplierName} · ${row.purchase_date} · ${formatKg(remainingWeightKg)}/${formatKg(weightKg)} kg · Rs ${ratePerKg.toFixed(2)}/kg`,
  };
}

const LOT_SELECT = "id, purchase_date, weight_kg, rate_per_kg, remaining_weight_kg, suppliers(company_name)";

/** Weight-mode lots with weight left, oldest first (FR-004). With includeBatchId (edit form),
 * that batch's own lot is always included, with the batch's own weight added back so staff see
 * what is actually available to it. */
export async function listAvailableLotsForBatch(
  opts: { includeBatchId?: string } = {}
): Promise<LotOption[]> {
  const admin = getSupabaseAdmin();
  const { data, error } = await admin
    .from("raw_material_purchases")
    .select(LOT_SELECT)
    .eq("purchase_mode", "weight")
    .gt("remaining_weight_kg", 0)
    .order("purchase_date", { ascending: true });
  if (error) throw error;
  const rows = (data ?? []) as unknown as LotRow[];

  if (!opts.includeBatchId) return rows.map((row) => toLotOption(row));

  const { data: batch, error: batchError } = await admin
    .from("production_batches")
    .select("lot_id, weight_issued_kg, status")
    .eq("id", opts.includeBatchId)
    .maybeSingle();
  if (batchError) throw batchError;
  if (!batch || batch.status !== "issued") return rows.map((row) => toLotOption(row));

  const ownLotId = batch.lot_id as string;
  const ownKg = Number(batch.weight_issued_kg);
  const options = rows.map((row) => toLotOption(row, row.id === ownLotId ? ownKg : 0));

  if (!rows.some((row) => row.id === ownLotId)) {
    const { data: ownLot, error: ownLotError } = await admin
      .from("raw_material_purchases")
      .select(LOT_SELECT)
      .eq("id", ownLotId)
      .single();
    if (ownLotError) throw ownLotError;
    options.unshift(toLotOption(ownLot as unknown as LotRow, ownKg));
  }
  return options;
}

interface NameStatusRef {
  name: string;
  status: "active" | "inactive";
}

interface ProductRef extends NameStatusRef {
  stock_uom: string;
  expected_yield_per_kg: number | null;
}

interface DetailLotRef {
  purchase_date: string;
  weight_kg: number;
  rate_per_kg: number;
  suppliers: SupplierRef | SupplierRef[] | null;
}

interface BatchRow {
  id: string;
  batch_number: string;
  status: BatchStatus;
  lot_id: string;
  product_id: string;
  contractor_id: string;
  weight_issued_kg: number;
  labour_rate_per_packet: number;
  issue_date: string;
  completion_date: string | null;
  packets_produced: number | null;
  returned_weight_kg: number | null;
  lot_rate_per_kg: number | null;
  expected_packets: number | null;
  raw_material_cost: number | null;
  labour_cost: number | null;
  total_cost: number | null;
  avg_cost_per_packet: number | null;
  wastage_kg: number | null;
  wastage_value: number | null;
  wastage_pct: number | null;
  returned_weight_exceeded: boolean | null;
  completed_at: string | null;
  voided_at: string | null;
  created_at: string;
  updated_at: string;
  raw_material_purchases: DetailLotRef | DetailLotRef[] | null;
  products: ProductRef | ProductRef[] | null;
  contractors: NameStatusRef | NameStatusRef[] | null;
}

const BATCH_DETAIL_SELECT =
  "*, raw_material_purchases(purchase_date, weight_kg, rate_per_kg, suppliers(company_name)), " +
  "products(name, status, stock_uom, expected_yield_per_kg), contractors(name, status)";

export async function getProductionBatch(id: string): Promise<BatchDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("production_batches")
    .select(BATCH_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as BatchRow;
  const lot = firstOf(row.raw_material_purchases);
  const product = firstOf(row.products);
  const contractor = firstOf(row.contractors);
  const weightIssuedKg = Number(row.weight_issued_kg);
  const lotRatePerKg = Number(lot?.rate_per_kg ?? 0);

  let completion: BatchDetail["completion"] = null;
  if (row.status === "completed" && row.completion_date) {
    const expectedPackets = Number(row.expected_packets);
    const packetsProduced = Number(row.packets_produced);
    const yieldVariance = packetsProduced - expectedPackets;
    completion = {
      completionDate: row.completion_date,
      packetsProduced,
      returnedWeightKg: Number(row.returned_weight_kg),
      lotRatePerKg: Number(row.lot_rate_per_kg),
      expectedPackets,
      rawMaterialCost: Number(row.raw_material_cost),
      labourCost: Number(row.labour_cost),
      totalCost: Number(row.total_cost),
      avgCostPerPacket: Number(row.avg_cost_per_packet),
      wastageKg: Number(row.wastage_kg),
      wastageValue: Number(row.wastage_value),
      wastagePct: Number(row.wastage_pct),
      returnedWeightExceeded: Boolean(row.returned_weight_exceeded),
      yieldVariance,
      yieldVariancePct: expectedPackets > 0 ? round2((yieldVariance / expectedPackets) * 100) : null,
      completedAt: row.completed_at ?? "",
    };
  }

  const yieldPerKg = product?.expected_yield_per_kg;
  return {
    id: row.id,
    batchNumber: row.batch_number,
    status: row.status,
    lotId: row.lot_id,
    lotSupplierName: firstOf(lot?.suppliers ?? null)?.company_name ?? "",
    lotPurchaseDate: lot?.purchase_date ?? "",
    lotWeightKg: Number(lot?.weight_kg ?? 0),
    lotRatePerKg,
    productId: row.product_id,
    productName: product?.name ?? "",
    productStockUom: product?.stock_uom ?? "",
    productStatus: product?.status ?? "active",
    contractorId: row.contractor_id,
    contractorName: contractor?.name ?? "",
    contractorStatus: contractor?.status ?? "active",
    weightIssuedKg,
    labourRatePerPacket: Number(row.labour_rate_per_packet),
    issueDate: row.issue_date,
    fabricValue: round2(weightIssuedKg * lotRatePerKg),
    expectedPacketsSuggestion:
      row.status === "issued" && yieldPerKg != null
        ? Math.floor(weightIssuedKg * Number(yieldPerKg))
        : null,
    completion,
    voidedAt: row.voided_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export interface ListProductionBatchesFilters {
  status?: BatchStatus;
  contractorId?: string;
  productId?: string;
  issueDateFrom?: string;
  issueDateTo?: string;
  batchNumber?: string;
}

interface ListBatchRow {
  id: string;
  batch_number: string;
  status: BatchStatus;
  contractor_id: string;
  product_id: string;
  weight_issued_kg: number;
  issue_date: string;
  packets_produced: number | null;
  avg_cost_per_packet: number | null;
  contractors: { name: string } | { name: string }[] | null;
  products: { name: string } | { name: string }[] | null;
  raw_material_purchases: { rate_per_kg: number } | { rate_per_kg: number }[] | null;
}

/** Batch list (FR-021) plus the work-in-progress totals across the filtered Issued batches
 * (FR-022, SC-005), summed in TypeScript as in 006/007. */
export async function listProductionBatches(
  filters: ListProductionBatchesFilters = {}
): Promise<BatchListResult> {
  let query = getSupabaseAdmin()
    .from("production_batches")
    .select(
      "id, batch_number, status, contractor_id, product_id, weight_issued_kg, issue_date, packets_produced, avg_cost_per_packet, contractors(name), products(name), raw_material_purchases(rate_per_kg)"
    )
    .order("issue_date", { ascending: false })
    .order("batch_number", { ascending: false });

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.contractorId) query = query.eq("contractor_id", filters.contractorId);
  if (filters.productId) query = query.eq("product_id", filters.productId);
  if (filters.issueDateFrom) query = query.gte("issue_date", filters.issueDateFrom);
  if (filters.issueDateTo) query = query.lte("issue_date", filters.issueDateTo);
  const search = filters.batchNumber?.trim();
  if (search) query = query.ilike("batch_number", `%${escapeLike(search)}%`);

  const { data, error } = await query;
  if (error) throw error;

  const today = todayInPakistan();
  const items: BatchListItem[] = ((data ?? []) as unknown as ListBatchRow[]).map((row) => {
    const weightIssuedKg = Number(row.weight_issued_kg);
    const rate = Number(firstOf(row.raw_material_purchases)?.rate_per_kg ?? 0);
    return {
      id: row.id,
      batchNumber: row.batch_number,
      status: row.status,
      contractorId: row.contractor_id,
      contractorName: firstOf(row.contractors)?.name ?? "",
      productId: row.product_id,
      productName: firstOf(row.products)?.name ?? "",
      weightIssuedKg,
      fabricValue: round2(weightIssuedKg * rate),
      issueDate: row.issue_date,
      daysOutstanding: row.status === "issued" ? daysBetween(row.issue_date, today) : null,
      packetsProduced: row.packets_produced == null ? null : Number(row.packets_produced),
      avgCostPerPacket: row.avg_cost_per_packet == null ? null : Number(row.avg_cost_per_packet),
    };
  });

  const issued = items.filter((item) => item.status === "issued");
  return {
    items,
    issuedTotals: {
      weightKg: round2(issued.reduce((sum, item) => sum + item.weightIssuedKg, 0)),
      valueRs: round2(issued.reduce((sum, item) => sum + item.fabricValue, 0)),
    },
  };
}

interface OpeningRef {
  quantity: number;
  entry_date: string;
  cost_per_packet: number | null;
  correction_qty: number | null;
  correction_reason: string | null;
  correction_date: string | null;
}

interface OpeningProductRow {
  id: string;
  name: string;
  status: "active" | "inactive";
  stock_uom: string;
  quantity_on_hand: number;
  manufactured_opening_stock: OpeningRef | OpeningRef[] | null;
}

/** Every manufactured product (active and inactive — physical stock can exist either way) with
 * its opening stock status and whether the single correction is still allowed (FR-024/FR-025). */
export async function listManufacturedOpeningStockStatus(): Promise<OpeningStockRow[]> {
  const admin = getSupabaseAdmin();
  const [productsResult, outflowResult] = await Promise.all([
    admin
      .from("products")
      .select(
        "id, name, status, stock_uom, quantity_on_hand, manufactured_opening_stock(quantity, entry_date, cost_per_packet, correction_qty, correction_reason, correction_date)"
      )
      .eq("type", "manufactured")
      .order("name", { ascending: true }),
    // Exactly the rows accept_challan (0007) writes for accepted quantities.
    admin
      .from("inventory_movements")
      .select("product_id")
      .eq("source_type", "challan_line")
      .lt("qty_delta", 0),
  ]);
  if (productsResult.error) throw productsResult.error;
  if (outflowResult.error) throw outflowResult.error;

  const shipped = new Set((outflowResult.data ?? []).map((row) => row.product_id as string));

  return ((productsResult.data ?? []) as unknown as OpeningProductRow[]).map((row) => {
    const opening = firstOf(row.manufactured_opening_stock);
    const hasChallanOutflow = shipped.has(row.id);
    const correction =
      opening && opening.correction_qty != null
        ? {
            qty: Number(opening.correction_qty),
            reason: opening.correction_reason ?? "",
            date: opening.correction_date ?? "",
          }
        : null;
    return {
      productId: row.id,
      productName: row.name,
      productStatus: row.status,
      stockUom: row.stock_uom,
      quantityOnHand: Number(row.quantity_on_hand),
      opening: opening
        ? {
            quantity: Number(opening.quantity),
            entryDate: opening.entry_date,
            costPerPacket: opening.cost_per_packet == null ? null : Number(opening.cost_per_packet),
            correction,
          }
        : null,
      hasChallanOutflow,
      canCorrect: Boolean(opening) && correction === null && !hasChallanOutflow,
    };
  });
}
