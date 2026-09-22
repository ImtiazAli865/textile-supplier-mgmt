import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCustomer, listCustomers } from "@/lib/customers/service";
import { getCustomerLedgerBalance } from "@/lib/customers/ledger";
import { getCustomerAgeing } from "@/lib/customer-ledger/ageing";
import { fetchLedgerEntries } from "@/lib/customer-ledger/entries";
import type {
  CustomerLedgerPrintView,
  CustomerLedgerRow,
  CustomerLedgerSummary,
  CustomerLedgerSummaryPrintView,
  CustomerLedgerView,
} from "@/lib/customer-ledger/types";
import type { CustomerPaymentStatus } from "@/lib/customer-payments/schema";

interface PoRef {
  po_number: string;
}

interface ChallanPoRow {
  id: string;
  customer_pos: PoRef | PoRef[] | null;
}

interface CustomerPoLineRef {
  customer_pos: PoRef | PoRef[] | null;
}

interface InvoiceLineRow {
  invoice_id: string;
  customer_po_lines: CustomerPoLineRef | CustomerPoLineRef[] | null;
}

interface PaymentRow {
  id: string;
  status: CustomerPaymentStatus;
  reference_type: "customer_po" | "performa_invoice" | null;
  reference_id: string | null;
  created_at: string;
  created_by: string;
  status_changed_at: string | null;
  status_changed_by: string | null;
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

/** Resolves a batch of Challan ids to their single PO number each (source_type = 'challan'). */
async function resolveChallanPoNumbers(challanIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (challanIds.length === 0) return map;

  const { data, error } = await getSupabaseAdmin()
    .from("challans")
    .select("id, customer_pos(po_number)")
    .in("id", challanIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as ChallanPoRow[]) {
    const po = firstOf(row.customer_pos);
    if (po?.po_number) map.set(row.id, po.po_number);
  }
  return map;
}

/** Resolves a batch of Performa Invoice ids to their de-duplicated PO number list each
 * (source_type = 'performa_invoice', and a payment's own reference_type = 'performa_invoice') —
 * an invoice can cover more than one PO (008's own multi-PO decision, FR-002). Returned as a
 * plain string[] per invoice, joined only at render time (matching
 * components/performa-invoices/performa-invoice-list.tsx's own `poNumbers.join(...)` pattern),
 * never pre-joined here. */
async function resolveInvoicePoNumbers(invoiceIds: string[]): Promise<Map<string, string[]>> {
  const map = new Map<string, string[]>();
  if (invoiceIds.length === 0) return map;

  const { data, error } = await getSupabaseAdmin()
    .from("performa_invoice_lines")
    .select("invoice_id, customer_po_lines(customer_pos(po_number))")
    .in("invoice_id", invoiceIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as InvoiceLineRow[]) {
    const poLine = firstOf(row.customer_po_lines);
    const po = poLine ? firstOf(poLine.customer_pos) : null;
    if (!po?.po_number) continue;
    const existing = map.get(row.invoice_id) ?? [];
    if (!existing.includes(po.po_number)) existing.push(po.po_number);
    map.set(row.invoice_id, existing);
  }
  return map;
}

/** Resolves a batch of customer_pos ids (a payment's own reference_type = 'customer_po') to
 * their single po_number each. */
async function resolvePoNumbersByPoId(poIds: string[]): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (poIds.length === 0) return map;

  const { data, error } = await getSupabaseAdmin().from("customer_pos").select("id, po_number").in("id", poIds);
  if (error) throw error;

  for (const row of data ?? []) {
    map.set(row.id as string, row.po_number as string);
  }
  return map;
}

async function fetchPayments(paymentIds: string[]): Promise<Map<string, PaymentRow>> {
  const map = new Map<string, PaymentRow>();
  if (paymentIds.length === 0) return map;

  const { data, error } = await getSupabaseAdmin()
    .from("customer_payments")
    .select("id, status, reference_type, reference_id, created_at, created_by, status_changed_at, status_changed_by")
    .in("id", paymentIds);
  if (error) throw error;

  for (const row of (data ?? []) as unknown as PaymentRow[]) {
    map.set(row.id, row);
  }
  return map;
}

/** Builds the full per-customer running-balance ledger (FR-001-003, FR-010): every entry, its
 * PO Number/description resolved at display time via one batched query per distinct source_type
 * present (never stored redundantly, FR-002), and a running balance computed over ALL entries
 * before any date-range filter narrows which rows are returned — so the balance shown for a
 * filtered view still reflects everything before the filter's start. */
export async function getCustomerLedger(
  customerId: string,
  filters: { from?: string; to?: string } = {}
): Promise<CustomerLedgerView | null> {
  const customer = await getCustomer(customerId);
  if (!customer) return null;

  const entries = await fetchLedgerEntries(customerId);

  const challanIds = entries
    .filter((e) => e.sourceType === "challan" && e.sourceId)
    .map((e) => e.sourceId as string);
  const invoiceIdsFromEntries = entries
    .filter((e) => e.sourceType === "performa_invoice" && e.sourceId)
    .map((e) => e.sourceId as string);
  const paymentIds = entries
    .filter((e) => (e.sourceType === "payment" || e.sourceType === "payment_reversal") && e.sourceId)
    .map((e) => e.sourceId as string);

  const [challanPoNumbers, invoicePoNumbersFromEntries, payments] = await Promise.all([
    resolveChallanPoNumbers(challanIds),
    resolveInvoicePoNumbers(invoiceIdsFromEntries),
    fetchPayments(paymentIds),
  ]);

  const poReferenceIds = Array.from(
    new Set(
      Array.from(payments.values())
        .filter((p) => p.reference_type === "customer_po" && p.reference_id)
        .map((p) => p.reference_id as string)
    )
  );
  const invoiceReferenceIds = Array.from(
    new Set(
      Array.from(payments.values())
        .filter((p) => p.reference_type === "performa_invoice" && p.reference_id)
        .map((p) => p.reference_id as string)
    )
  );

  const [poRefNumbers, invoiceRefNumbers] = await Promise.all([
    resolvePoNumbersByPoId(poReferenceIds),
    resolveInvoicePoNumbers(invoiceReferenceIds),
  ]);

  function paymentPoNumbers(payment: PaymentRow): string[] {
    if (payment.reference_type === "customer_po" && payment.reference_id) {
      const n = poRefNumbers.get(payment.reference_id);
      return n ? [n] : [];
    }
    if (payment.reference_type === "performa_invoice" && payment.reference_id) {
      return invoiceRefNumbers.get(payment.reference_id) ?? [];
    }
    return [];
  }

  let balance = 0;
  const rows: CustomerLedgerRow[] = entries.map((entry) => {
    balance += entry.type === "credit" ? entry.amount : -entry.amount;

    let poNumbers: string[] = [];
    let extra: Partial<CustomerLedgerRow> = {};

    if (entry.sourceType === "challan" && entry.sourceId) {
      const n = challanPoNumbers.get(entry.sourceId);
      poNumbers = n ? [n] : [];
    } else if (entry.sourceType === "performa_invoice" && entry.sourceId) {
      poNumbers = invoicePoNumbersFromEntries.get(entry.sourceId) ?? [];
    } else if ((entry.sourceType === "payment" || entry.sourceType === "payment_reversal") && entry.sourceId) {
      const payment = payments.get(entry.sourceId);
      if (payment) {
        poNumbers = paymentPoNumbers(payment);
        // paymentStatus/createdAt/createdBy/statusChangedAt/statusChangedBy are carried only on
        // the original 'payment' debit row, never duplicated onto its 'payment_reversal' credit
        // row — FR-014's "record and display" is about the payment itself, resolved once here
        // (contracts/server-actions.md; /sp.analyze finding G1).
        if (entry.sourceType === "payment") {
          extra = {
            paymentStatus: payment.status,
            createdAt: payment.created_at,
            createdBy: payment.created_by,
            ...(payment.status_changed_at ? { statusChangedAt: payment.status_changed_at } : {}),
            ...(payment.status_changed_by ? { statusChangedBy: payment.status_changed_by } : {}),
          };
        }
      }
    }

    return {
      id: entry.id,
      entryDate: entry.entryDate,
      type: entry.type,
      amount: entry.amount,
      runningBalance: balance,
      description: entry.description,
      poNumbers,
      sourceType: entry.sourceType,
      sourceId: entry.sourceId,
      ...extra,
    };
  });

  const filteredRows = rows.filter((row) => {
    if (filters.from && row.entryDate < filters.from) return false;
    if (filters.to && row.entryDate > filters.to) return false;
    return true;
  });

  return {
    customer: {
      id: customer.id,
      displayName: customer.displayName,
      legalName: customer.legalName,
      paymentTermsMinDays: customer.paymentTermsMinDays,
      paymentTermsMaxDays: customer.paymentTermsMaxDays,
    },
    currentBalance: balance,
    rows: filteredRows,
  };
}

/** Every customer (both active and inactive — deactivation never hides historical ledger data,
 * 005 spec Edge Cases), with current balance and overdue amount (FR-011). lib/customers/service.ts
 * is left unchanged (plan.md's Project Structure) — listCustomers() only ever filters to one
 * status at a time, so both are fetched and merged here rather than adding a new "all statuses"
 * export there. */
export async function listCustomerLedgerSummaries(): Promise<CustomerLedgerSummary[]> {
  const [active, inactive] = await Promise.all([
    listCustomers({ status: "active" }),
    listCustomers({ status: "inactive" }),
  ]);
  const customers = [...active, ...inactive].sort((a, b) => a.displayName.localeCompare(b.displayName));

  return Promise.all(
    customers.map(async (customer) => {
      const [balance, ageing] = await Promise.all([
        getCustomerLedgerBalance(customer.id),
        getCustomerAgeing(customer.id),
      ]);
      return {
        id: customer.id,
        displayName: customer.displayName,
        balance,
        overdueAmount: ageing.overdueAmount,
      };
    })
  );
}

/** Same underlying fetch as getCustomerLedger, shaped for the standalone print route (ADR-0006)
 * — a report, not a business document issued to the customer, so no signature/stamp images
 * (research.md). */
export async function getCustomerLedgerForPrint(
  customerId: string,
  filters: { from?: string; to?: string } = {}
): Promise<CustomerLedgerPrintView | null> {
  const ledger = await getCustomerLedger(customerId, filters);
  if (!ledger) return null;

  return {
    customerDisplayName: ledger.customer.displayName,
    customerLegalName: ledger.customer.legalName,
    generatedAt: new Date().toISOString(),
    fromDate: filters.from,
    toDate: filters.to,
    rows: ledger.rows,
    currentBalance: ledger.currentBalance,
  };
}

/** Same underlying data as listCustomerLedgerSummaries, shaped for its standalone print route
 * (ADR-0006). */
export async function getCustomerLedgerSummaryForPrint(): Promise<CustomerLedgerSummaryPrintView> {
  const rows = await listCustomerLedgerSummaries();
  return { generatedAt: new Date().toISOString(), rows };
}
