import { z } from "zod";
import { isNotAfterTodayInPakistan } from "@/lib/dates";

export { todayInPakistan } from "@/lib/dates";

/** Integer paisa, so money comparisons never trip over floating point. */
export function paisa(value: number): number {
  return Math.round(value * 100);
}

export function formatRs(value: number): string {
  return `Rs ${value.toLocaleString("en-PK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** "Rs X owed" / "Rs X advance": a negative balance is shown as an advance (FR-005). */
export function describeBalance(value: number): string {
  if (paisa(value) === 0) return "Rs 0.00";
  return value > 0 ? `${formatRs(value)} owed` : `${formatRs(-value)} advance`;
}

/** Start of the settle action's non-zero-closing message; the settle form recognises it and
 * offers "Settle anyway" (FR-026), like 010's returned-weight confirmation. */
export const SETTLEMENT_BALANCE_NOT_ZERO_PREFIX = "The closing balance is not zero";

/** "Not in the future" uses the Pakistan calendar date (ADR-0009, FR-032). */
function pastOrTodayDate(label: string) {
  return z
    .string()
    .trim()
    .min(1, `${label} is required`)
    .refine((value) => /^\d{4}-\d{2}-\d{2}/.test(value) && !Number.isNaN(Date.parse(value)), `Invalid ${label.toLowerCase()}`)
    .refine(isNotAfterTodayInPakistan, { message: `${label} cannot be in the future` });
}

/** PKR above zero once rounded to 2 dp (FR-033); the service rounds before the RPC. */
function amount(label: string) {
  return z.coerce
    .number({ invalid_type_error: `${label} is required` })
    .refine((value) => paisa(value) > 0, `${label} must be greater than zero`);
}

function requiredReason(label: string) {
  return z.string().trim().min(1, `${label} is required`).max(500, `${label} is too long`);
}

// ============================================================================
// Inputs (contracts/server-actions.md)
// ============================================================================

export const paymentAllocationInputSchema = z.object({
  batchId: z.string().uuid("Select a batch"),
  amount: amount("Amount against the batch"),
});

/** A cash payment (FR-010 to FR-013). Allocations may be empty (fully unlinked). */
export const contractorPaymentInputSchema = z
  .object({
    contractorId: z.string().uuid("Select a contractor"),
    paymentDate: pastOrTodayDate("Payment date"),
    amount: amount("Payment amount"),
    note: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
    allocations: z.array(paymentAllocationInputSchema).default([]),
  })
  .superRefine((data, ctx) => {
    const seen = new Set<string>();
    data.allocations.forEach((allocation, index) => {
      if (seen.has(allocation.batchId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "A batch can appear only once on a payment.",
          path: ["allocations", index, "batchId"],
        });
      }
      seen.add(allocation.batchId);
    });
    const allocated = data.allocations.reduce((sum, allocation) => sum + paisa(allocation.amount), 0);
    if (allocated > paisa(data.amount)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "The amounts against batches are more than the payment.",
        path: ["amount"],
      });
    }
  });

export type ContractorPaymentInput = z.input<typeof contractorPaymentInputSchema>;
export type ContractorPaymentParsed = z.output<typeof contractorPaymentInputSchema>;

export const reversePaymentInputSchema = z.object({
  paymentId: z.string().uuid(),
  reason: requiredReason("Reason"),
});
export type ReversePaymentInput = z.input<typeof reversePaymentInputSchema>;

export const openingBalanceDirectionSchema = z.enum(["owed", "advance"]);
export type OpeningBalanceDirection = z.infer<typeof openingBalanceDirectionSchema>;

/** One opening balance per contractor, either direction (FR-020). */
export const openingBalanceInputSchema = z.object({
  contractorId: z.string().uuid("Select a contractor"),
  direction: openingBalanceDirectionSchema,
  amount: amount("Amount"),
  entryDate: pastOrTodayDate("Date"),
});
export type OpeningBalanceInput = z.input<typeof openingBalanceInputSchema>;

/** credit = "Increase amount owed", debit = "Decrease amount owed (deduction)" (FR-021). */
export const adjustmentTypeSchema = z.enum(["credit", "debit"]);
export type AdjustmentType = z.infer<typeof adjustmentTypeSchema>;

export const adjustmentInputSchema = z.object({
  contractorId: z.string().uuid("Select a contractor"),
  type: adjustmentTypeSchema,
  amount: amount("Amount"),
  entryDate: pastOrTodayDate("Date"),
  reason: requiredReason("Reason"),
});
export type AdjustmentInput = z.input<typeof adjustmentInputSchema>;

/** Settle up to periodEnd (FR-023). confirmNonZero is the second submit after the
 * non-zero-closing warning (FR-026). */
export const settleInputSchema = z.object({
  contractorId: z.string().uuid("Select a contractor"),
  periodEnd: pastOrTodayDate("Settle-up-to date"),
  note: z.string().trim().max(500, "Note is too long").optional().or(z.literal("")),
  confirmNonZero: z.boolean().default(false),
});
export type SettleInput = z.input<typeof settleInputSchema>;

export const reopenSettlementInputSchema = z.object({
  settlementId: z.string().uuid(),
  reason: requiredReason("Reason"),
});
export type ReopenSettlementInput = z.input<typeof reopenSettlementInputSchema>;

// ============================================================================
// Read types (contracts/server-actions.md, "Reads")
// ============================================================================

export type KhataSourceType =
  | "production_batch"
  | "payment"
  | "payment_reversal"
  | "opening_balance"
  | "adjustment";

export interface KhataRow {
  id: string;
  entryDate: string;
  sourceType: KhataSourceType;
  description: string;
  /** The linked batch (earnings) or payment (payments and reversals), when there is one. */
  batch: { id: string; batchNumber: string } | null;
  paymentId: string | null;
  /** For a payment row: the date its reversal was entered, if it has been reversed. The printed
   * statement flags a payment reversed after the period it sits in. */
  reversedOn: string | null;
  /** Earned / owed up. */
  credit: number | null;
  /** Paid / owed down. */
  debit: number | null;
  runningBalance: number;
}

export interface ContractorKhata {
  contractor: { id: string; name: string; phone: string | null; status: "active" | "inactive" };
  /** Positive = owed to the contractor; negative = advance (FR-005). */
  currentBalance: number;
  /** Balance before `from`, when a from date is applied (FR-008). */
  broughtForward: number | null;
  from: string | null;
  to: string | null;
  rows: KhataRow[];
}

export type BatchPaymentState = "unpaid" | "part_paid" | "paid";

export interface BatchPaymentStatus {
  batchId: string;
  batchNumber: string;
  completionDate: string;
  labourCost: number;
  paid: number;
  unpaid: number;
  status: BatchPaymentState;
}

export interface BatchLinkedPayment {
  paymentId: string;
  paymentDate: string;
  /** The amount of this payment put against the batch. */
  amount: number;
  status: "active" | "reversed";
}

export interface BatchPaymentStatusDetail extends BatchPaymentStatus {
  contractorId: string;
  payments: BatchLinkedPayment[];
}

export interface PayableBatch {
  batchId: string;
  batchNumber: string;
  completionDate: string;
  labourCost: number;
  unpaid: number;
}

export interface ContractorPaymentItem {
  id: string;
  paymentDate: string;
  amount: number;
  note: string | null;
  status: "active" | "reversed";
  allocations: { batchId: string; batchNumber: string; amount: number }[];
  unlinked: number;
  createdAt: string;
  createdBy: string;
  reversalReason: string | null;
  reversedAt: string | null;
  reversedBy: string | null;
}

export interface SettlementItem {
  id: string;
  contractorId: string;
  periodStart: string;
  periodEnd: string;
  openingBalance: number;
  earned: number;
  paid: number;
  adjustments: number;
  closingBalance: number;
  note: string | null;
  settledAt: string;
  settledBy: string;
  reopenedAt: string | null;
  reopenedBy: string | null;
  reopenReason: string | null;
  /** True only for the most recent current settlement, the one that may be reopened (FR-028). */
  isLatestCurrent: boolean;
}

export interface SettlementFigures {
  openingBalance: number;
  earned: number;
  paid: number;
  adjustments: number;
  closingBalance: number;
}

export type SettlementPreview =
  | { canSettle: false; reason: string; periodStart: string | null }
  | ({ canSettle: true; periodStart: string; periodEnd: string } & SettlementFigures);

export interface OpeningBalanceState {
  hasOpeningBalance: boolean;
  hasCurrentSettlement: boolean;
  earliestEntryDate: string | null;
}

export interface SettlementStatement {
  settlement: SettlementItem;
  contractor: { id: string; name: string; phone: string | null };
  rows: KhataRow[];
  /** The figures recomputed from the khata now; they should equal the frozen ones. */
  recomputed: SettlementFigures;
  matchesFrozen: boolean;
  generatedAt: string;
}
