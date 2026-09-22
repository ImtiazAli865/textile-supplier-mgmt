import type { CustomerPaymentStatus } from "@/lib/customer-payments/schema";

/** One row of a customer's running-balance ledger (FR-001). poNumbers is always an array (never
 * a single poNumber field), matching lib/performa-invoices/schema.ts's own multi-PO shape —
 * empty for an opening-balance row, one element for a Challan-sourced row, one or more for a
 * Performa-Invoice-sourced row. paymentStatus/createdAt/createdBy/statusChangedAt/
 * statusChangedBy are present only on rows whose sourceType is 'payment' (contracts/
 * server-actions.md) — resolved from data-model.md finding G1. */
export interface CustomerLedgerRow {
  id: string;
  entryDate: string;
  type: "debit" | "credit";
  amount: number;
  runningBalance: number;
  description: string | null;
  poNumbers: string[];
  sourceType: string;
  sourceId: string | null;
  paymentStatus?: CustomerPaymentStatus;
  createdAt?: string;
  createdBy?: string;
  statusChangedAt?: string;
  statusChangedBy?: string;
}

/** Full per-customer ledger view (contracts/server-actions.md's getCustomerLedger output). */
export interface CustomerLedgerView {
  customer: {
    id: string;
    displayName: string;
    legalName: string;
    paymentTermsMinDays: number;
    paymentTermsMaxDays: number;
  };
  currentBalance: number;
  rows: CustomerLedgerRow[];
}

/** One still-open (or partially-open) credit entry from the FIFO ageing allocation
 * (research.md's computeAgeing), classified against the customer's payment-terms maximum only —
 * paymentTermsMinDays plays no role here (FR-009, as reworded; resolved from finding A1). */
export interface CustomerAgeingEntry {
  entryDate: string;
  remainingAmount: number;
  withinRange: boolean;
}

export interface CustomerAgeingView {
  openEntries: CustomerAgeingEntry[];
  overdueAmount: number;
}

/** One row of the all-customers summary list (FR-011). */
export interface CustomerLedgerSummary {
  id: string;
  displayName: string;
  balance: number;
  overdueAmount: number;
}

/** Shape rendered by the standalone per-customer print route (ADR-0006) — a report, not a
 * business document, so no signature/stamp images (research.md). */
export interface CustomerLedgerPrintView {
  customerDisplayName: string;
  customerLegalName: string;
  generatedAt: string;
  fromDate?: string;
  toDate?: string;
  rows: CustomerLedgerRow[];
  currentBalance: number;
}

/** Shape rendered by the standalone all-customers summary print route (ADR-0006). */
export interface CustomerLedgerSummaryPrintView {
  generatedAt: string;
  rows: CustomerLedgerSummary[];
}
