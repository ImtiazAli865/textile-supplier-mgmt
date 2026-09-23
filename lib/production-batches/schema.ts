import { z } from "zod";
import { isNotAfterTodayInPakistan } from "@/lib/dates";

export { todayInPakistan } from "@/lib/dates";

export const batchStatusSchema = z.enum(["issued", "completed", "voided"]);
export type BatchStatus = z.infer<typeof batchStatusSchema>;

/** "Not in the future" is checked here against the Pakistan calendar date (ADR-0009), not in
 * SQL (Postgres current_date is UTC). */
function pastOrTodayDate(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), `Invalid ${label.toLowerCase()}`)
    .refine(isNotAfterTodayInPakistan, {
      message: `${label} cannot be in the future`,
    });
}

/** Shape submitted by the issue form (create and edit) — FR-003. Money/weight are rounded to
 * 2 dp by the service, matching 002. */
export const batchIssueInputSchema = z.object({
  lotId: z.string().uuid("Select a fabric lot"),
  productId: z.string().uuid("Select a manufactured product"),
  contractorId: z.string().uuid("Select a contractor"),
  weightIssuedKg: z.coerce.number().positive("Weight issued must be greater than zero"),
  labourRatePerPacket: z.coerce.number().positive("Labour rate must be greater than zero"),
  issueDate: pastOrTodayDate("Issue date"),
});

export type BatchIssueInput = z.infer<typeof batchIssueInputSchema>;

/** Shape submitted by the complete form — FR-014, FR-019. The packet count is authoritative;
 * the returned weight is a cross-check that never validates it. */
export const batchCompleteInputSchema = z.object({
  packetsProduced: z.coerce
    .number()
    .int("Packets produced must be a whole number")
    .min(1, "Packets produced must be at least 1"),
  returnedWeightKg: z.coerce.number().positive("Returned packet weight must be greater than zero"),
  completionDate: pastOrTodayDate("Completion date"),
  confirmReturnedWeightExceeded: z.boolean().default(false),
});

export type BatchCompleteInput = z.input<typeof batchCompleteInputSchema>;

/** One-time opening stock for a manufactured product — FR-024. */
export const openingStockInputSchema = z.object({
  productId: z.string().uuid("Select a product"),
  quantity: z.coerce.number().int("Quantity must be a whole number").min(1, "Quantity must be at least 1"),
  entryDate: pastOrTodayDate("Entry date"),
  costPerPacket: z
    .union([z.literal(""), z.coerce.number().positive("Cost per packet must be greater than zero")])
    .optional(),
});

export type OpeningStockInput = z.input<typeof openingStockInputSchema>;

/** The single allowed correction to an opening stock entry — FR-025. */
export const openingStockCorrectionInputSchema = z.object({
  productId: z.string().uuid("Select a product"),
  correctionQty: z.coerce
    .number()
    .int("Correction must be a whole number")
    .refine((value) => value !== 0, "Correction cannot be zero"),
  reason: z.string().trim().min(1, "A reason is required").max(500, "Reason is too long"),
  correctionDate: pastOrTodayDate("Correction date"),
});

export type OpeningStockCorrectionInput = z.infer<typeof openingStockCorrectionInputSchema>;

/** A lot offered in the issue form's picker (FR-004, US1-6). */
export interface LotOption {
  id: string;
  supplierName: string;
  purchaseDate: string;
  weightKg: number;
  remainingWeightKg: number;
  ratePerKg: number;
  label: string;
}

/** A manufactured product offered in the issue form, carrying the pre-fill (FR-007) and the
 * yield for the expected-packets suggestion (FR-008). */
export interface ManufacturedProductOption {
  id: string;
  name: string;
  stockUom: string;
  defaultLabourRatePerPacket: number;
  expectedYieldPerKg: number;
}

export interface BatchListItem {
  id: string;
  batchNumber: string;
  status: BatchStatus;
  contractorId: string;
  contractorName: string;
  productId: string;
  productName: string;
  weightIssuedKg: number;
  fabricValue: number;
  issueDate: string;
  daysOutstanding: number | null;
  packetsProduced: number | null;
  avgCostPerPacket: number | null;
}

export interface BatchListResult {
  items: BatchListItem[];
  issuedTotals: { weightKg: number; valueRs: number };
}

export interface BatchDetail {
  id: string;
  batchNumber: string;
  status: BatchStatus;
  lotId: string;
  lotSupplierName: string;
  lotPurchaseDate: string;
  lotWeightKg: number;
  lotRatePerKg: number;
  productId: string;
  productName: string;
  productStockUom: string;
  productStatus: "active" | "inactive";
  contractorId: string;
  contractorName: string;
  contractorStatus: "active" | "inactive";
  weightIssuedKg: number;
  labourRatePerPacket: number;
  issueDate: string;
  fabricValue: number;
  /** Live suggestion while Issued: floor(weight × current expected yield). Null otherwise. */
  expectedPacketsSuggestion: number | null;
  completion: {
    completionDate: string;
    packetsProduced: number;
    returnedWeightKg: number;
    lotRatePerKg: number;
    expectedPackets: number;
    rawMaterialCost: number;
    labourCost: number;
    totalCost: number;
    avgCostPerPacket: number;
    wastageKg: number;
    wastageValue: number;
    wastagePct: number;
    returnedWeightExceeded: boolean;
    yieldVariance: number;
    yieldVariancePct: number | null;
    completedAt: string;
  } | null;
  voidedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface OpeningStockRow {
  productId: string;
  productName: string;
  productStatus: "active" | "inactive";
  stockUom: string;
  quantityOnHand: number;
  opening: {
    quantity: number;
    entryDate: string;
    costPerPacket: number | null;
    correction: { qty: number; reason: string; date: string } | null;
  } | null;
  hasChallanOutflow: boolean;
  canCorrect: boolean;
}

export interface StockMovementRow {
  id: string;
  movementDate: string;
  reason: string;
  qtyDelta: number;
  sourceType: string;
  sourceId: string | null;
}
