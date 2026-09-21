import "server-only";
import { getSupabaseAdmin } from "@/lib/supabase/admin";
import { getCustomerPO } from "@/lib/customer-pos/service";
import { getTradeName } from "@/lib/trade-names/service";
import { getSignedPerformaInvoiceAttachmentUrl } from "@/lib/performa-invoices/storage";
import { amountInWords } from "@/lib/performa-invoices/number-to-words";
import type {
  InvoiceableLine,
  PerformaInvoiceAttachment,
  PerformaInvoiceDetail,
  PerformaInvoiceInput,
  PerformaInvoiceLineDetail,
  PerformaInvoiceListItem,
  PerformaInvoicePrintView,
} from "@/lib/performa-invoices/schema";

/** Surfaces the DB-level guarantees create_performa_invoice relies on as friendly messages
 * instead of a raw Postgres error, per contracts/server-actions.md (mirrors
 * lib/challans/service.ts's toFriendlyChallanError). */
export function toFriendlyPerformaInvoiceError(error: { code?: string; message: string }): Error {
  const msg = error.message ?? "";

  if (error.code === "23505") {
    return new Error("An invoice with this number already exists for this trade name.");
  }
  if (msg.includes("CUSTOMER_NOT_INVOICE_ELIGIBLE")) {
    return new Error("This customer does not issue Performa Invoices.");
  }
  if (msg.includes("TRADE_NAME_NOT_FOUND")) {
    return new Error("Select a valid trade name.");
  }
  if (msg.includes("DUPLICATE_PO_LINE")) {
    return new Error(
      "This invoice references the same PO line more than once — each PO line can appear at most once per invoice."
    );
  }
  if (msg.includes("PO_LINE_WRONG_CUSTOMER")) {
    return new Error("A selected line belongs to a different customer's PO.");
  }
  if (msg.includes("PO_CANCELLED")) {
    return new Error("A selected line's PO is cancelled.");
  }
  if (msg.includes("LINE_FULLY_INVOICED")) {
    return new Error("One of the selected lines has no remaining quantity to invoice.");
  }
  if (msg.includes("LINE_EXCEEDS_REMAINING_INVOICEABLE")) {
    return new Error("A line's invoiced quantity exceeds what remains to invoice.");
  }
  if (msg.includes("PO_LINE_NOT_FOUND")) {
    return new Error("A selected line does not exist.");
  }
  return new Error(error.message);
}

/** Delivered-but-not-yet-invoiced lines of an open PO, for the "Create Performa Invoice" form's
 * per-PO line checklist. Reuses 006's already-exported getCustomerPO and derives
 * `remaining = deliveredQuantity - invoicedQuantity` per line in TypeScript — mirrors 007's
 * getOpenPOLinesForChallan shape with the subtraction terms swapped (contracts/server-actions.md). */
export async function getInvoiceableLinesForPO(poId: string): Promise<InvoiceableLine[]> {
  const po = await getCustomerPO(poId);
  if (!po) return [];

  return po.lines
    .map((line) => ({
      id: line.id,
      poId: po.id,
      poNumber: po.poNumber,
      customerItemCode: line.customerItemCode,
      productName: line.productName,
      uom: line.uom,
      unitPrice: line.unitPrice,
      deliveredQuantity: line.deliveredQuantity,
      invoicedQuantity: line.invoicedQuantity,
      remaining: line.deliveredQuantity - line.invoicedQuantity,
    }))
    .filter((line) => line.remaining > 0);
}

/** Inserts a new performa_invoice_attachments row after the file itself has already been
 * uploaded via lib/performa-invoices/storage.ts's uploadPerformaInvoiceGstAttachment — mirrors
 * lib/customer-pos/service.ts's addCustomerPOAttachmentRecord (an append, never a replace,
 * since this is a zero-to-many relationship, FR-011). */
export async function addPerformaInvoiceAttachmentRecord(
  invoiceId: string,
  attachment: { storagePath: string; fileName: string; contentType: string },
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin()
    .from("performa_invoice_attachments")
    .insert({
      invoice_id: invoiceId,
      storage_path: attachment.storagePath,
      file_name: attachment.fileName,
      content_type: attachment.contentType,
      uploaded_by: userId,
    })
    .select("id")
    .single();
  if (error) throw error;
  return { id: data.id as string };
}

function linePayload(lines: PerformaInvoiceInput["lines"]) {
  return lines.map((line) => ({
    poLineId: line.poLineId,
    invoicedQuantity: line.invoicedQuantity,
  }));
}

export async function createPerformaInvoiceRecord(
  input: PerformaInvoiceInput,
  userId: string
): Promise<{ id: string }> {
  const { data, error } = await getSupabaseAdmin().rpc("create_performa_invoice", {
    p_customer_id: input.customerId,
    p_trade_name_id: input.tradeNameId,
    p_invoice_number: input.invoiceNumber || null,
    p_invoice_date: input.invoiceDate.slice(0, 10),
    p_tax_rate: input.taxRate,
    p_lines: linePayload(input.lines),
    p_user_id: userId,
  });
  if (error) throw toFriendlyPerformaInvoiceError(error);
  return { id: data as string };
}

interface CustomerRef {
  display_name: string;
  legal_name: string;
}

interface TradeNameRef {
  printed_name: string;
}

interface PoRef {
  po_number: string;
}

interface CustomerPoLineRef {
  po_id: string;
  customer_pos: PoRef | PoRef[] | null;
}

interface ListInvoiceLineRow {
  invoiced_quantity: number;
  unit_price: number;
  po_line_id: string;
  customer_po_lines: CustomerPoLineRef | CustomerPoLineRef[] | null;
}

interface ListInvoiceRow {
  id: string;
  invoice_number: string;
  invoice_date: string;
  customer_id: string;
  tax_rate: number;
  customers: CustomerRef | CustomerRef[] | null;
  trade_names: TradeNameRef | TradeNameRef[] | null;
  performa_invoice_lines: ListInvoiceLineRow[];
}

function firstOf<T>(value: T | T[] | null): T | null {
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function computeTotals(lines: { invoicedQuantity: number; unitPrice: number }[], taxRate: number) {
  const grossTotal = lines.reduce((total, line) => total + line.invoicedQuantity * line.unitPrice, 0);
  const taxAmount = Math.round(grossTotal * (taxRate / 100) * 100) / 100;
  const netTotal = grossTotal + taxAmount;
  return { grossTotal, taxAmount, netTotal };
}

export interface ListPerformaInvoicesFilters {
  customerId?: string;
  tradeNameId?: string;
}

export async function listPerformaInvoices(
  filters: ListPerformaInvoicesFilters = {}
): Promise<PerformaInvoiceListItem[]> {
  let query = getSupabaseAdmin()
    .from("performa_invoices")
    .select(
      "id, invoice_number, invoice_date, customer_id, tax_rate, customers(display_name, legal_name), trade_names(printed_name), " +
        "performa_invoice_lines(invoiced_quantity, unit_price, po_line_id, customer_po_lines(customer_pos(po_number)))"
    )
    .order("invoice_date", { ascending: false });

  if (filters.customerId) query = query.eq("customer_id", filters.customerId);
  if (filters.tradeNameId) query = query.eq("trade_name_id", filters.tradeNameId);

  const { data, error } = await query;
  if (error) throw error;

  return ((data ?? []) as unknown as ListInvoiceRow[]).map((row) => {
    const customer = firstOf(row.customers);
    const tradeName = firstOf(row.trade_names);
    const lines = row.performa_invoice_lines ?? [];
    const { netTotal } = computeTotals(
      lines.map((l) => ({ invoicedQuantity: Number(l.invoiced_quantity), unitPrice: Number(l.unit_price) })),
      Number(row.tax_rate)
    );
    const poNumbers = Array.from(
      new Set(
        lines
          .map((l) => firstOf(l.customer_po_lines))
          .map((poLine) => firstOf(poLine?.customer_pos ?? null)?.po_number)
          .filter((n): n is string => Boolean(n))
      )
    );

    return {
      id: row.id,
      invoiceNumber: row.invoice_number,
      invoiceDate: row.invoice_date,
      customerId: row.customer_id,
      customerDisplayName: customer?.display_name ?? "",
      tradeNamePrintedName: tradeName?.printed_name ?? "",
      poNumbers,
      netTotal,
    };
  });
}

interface DetailLineRow {
  id: string;
  position: number;
  po_line_id: string;
  product_id: string;
  uom: string;
  unit_price: number;
  invoiced_quantity: number;
  products: { name: string } | { name: string }[] | null;
  customer_po_lines: CustomerPoLineRef | CustomerPoLineRef[] | null;
}

interface DetailAttachmentRow {
  id: string;
  file_name: string;
  content_type: string;
  uploaded_at: string;
  storage_path: string;
}

interface InvoiceRow {
  id: string;
  customer_id: string;
  trade_name_id: string;
  invoice_number: string;
  invoice_date: string;
  tax_rate: number;
  created_at: string;
  created_by: string;
  customers: CustomerRef | CustomerRef[] | null;
  trade_names: TradeNameRef | TradeNameRef[] | null;
  performa_invoice_lines: DetailLineRow[];
  performa_invoice_attachments: DetailAttachmentRow[];
}

const INVOICE_DETAIL_SELECT =
  "*, customers(display_name, legal_name), trade_names(printed_name), " +
  "performa_invoice_lines(id, position, po_line_id, product_id, uom, unit_price, invoiced_quantity, products(name), customer_po_lines(po_id, customer_pos(po_number))), " +
  "performa_invoice_attachments(id, file_name, content_type, uploaded_at, storage_path)";

async function mapLines(rows: DetailLineRow[]): Promise<PerformaInvoiceLineDetail[]> {
  return [...rows]
    .sort((a, b) => a.position - b.position)
    .map((line) => {
      const product = firstOf(line.products);
      const poLine = firstOf(line.customer_po_lines);
      const po = poLine ? firstOf(poLine.customer_pos) : null;
      const unitPrice = Number(line.unit_price);
      const invoicedQuantity = Number(line.invoiced_quantity);
      return {
        id: line.id,
        poLineId: line.po_line_id,
        poId: poLine?.po_id ?? "",
        poNumber: po?.po_number ?? "",
        productName: product?.name ?? "",
        uom: line.uom,
        unitPrice,
        invoicedQuantity,
        lineTotal: Math.round(invoicedQuantity * unitPrice * 100) / 100,
      };
    });
}

async function mapAttachments(rows: DetailAttachmentRow[]): Promise<PerformaInvoiceAttachment[]> {
  return Promise.all(
    rows.map(async (row) => ({
      id: row.id,
      fileName: row.file_name,
      contentType: row.content_type,
      uploadedAt: row.uploaded_at,
      url: await getSignedPerformaInvoiceAttachmentUrl(row.storage_path),
    }))
  );
}

async function getLedgerCreditAmount(invoiceId: string): Promise<number | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("ledger_entries")
    .select("amount")
    .eq("source_type", "performa_invoice")
    .eq("source_id", invoiceId)
    .maybeSingle();
  if (error) throw error;
  return data ? Number(data.amount) : null;
}

export async function getPerformaInvoice(id: string): Promise<PerformaInvoiceDetail | null> {
  const { data, error } = await getSupabaseAdmin()
    .from("performa_invoices")
    .select(INVOICE_DETAIL_SELECT)
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;

  const row = data as unknown as InvoiceRow;
  const customer = firstOf(row.customers);
  const tradeName = firstOf(row.trade_names);
  const [lines, attachments, ledgerCreditAmount] = await Promise.all([
    mapLines(row.performa_invoice_lines ?? []),
    mapAttachments(row.performa_invoice_attachments ?? []),
    getLedgerCreditAmount(id),
  ]);
  const { grossTotal, taxAmount, netTotal } = computeTotals(lines, Number(row.tax_rate));

  return {
    id: row.id,
    customerId: row.customer_id,
    customerDisplayName: customer?.display_name ?? "",
    customerLegalName: customer?.legal_name ?? "",
    tradeNameId: row.trade_name_id,
    tradeNamePrintedName: tradeName?.printed_name ?? "",
    invoiceNumber: row.invoice_number,
    invoiceDate: row.invoice_date,
    taxRate: Number(row.tax_rate),
    lines,
    grossTotal,
    taxAmount,
    netTotal,
    ledgerCreditAmount,
    attachments,
    createdAt: row.created_at,
    createdBy: row.created_by,
  };
}

/** Same underlying data as getPerformaInvoice, reshaped for the standalone print route: adds
 * the trade name's signature/stamp images (already resolved by 004's getTradeName) and the net
 * total's amount-in-words (FR-006). */
export async function getPerformaInvoiceForPrint(id: string): Promise<PerformaInvoicePrintView | null> {
  const invoice = await getPerformaInvoice(id);
  if (!invoice) return null;

  const tradeName = await getTradeName(invoice.tradeNameId);
  const poNumbers = Array.from(new Set(invoice.lines.map((l) => l.poNumber).filter(Boolean)));

  const lines = invoice.lines.map((line, index) => ({
    sNo: index + 1,
    itemName: line.productName,
    uom: line.uom,
    quantityInvoiced: line.invoicedQuantity,
    unitPrice: line.unitPrice,
    lineTotal: line.lineTotal,
    poNumber: line.poNumber,
  }));

  return {
    tradeNamePrintedName: tradeName?.printedName ?? "",
    tradeNamePrintedAddress: tradeName?.printedAddress ?? "",
    signatureImageUrl: tradeName?.signatureImageUrl ?? null,
    stampImageUrl: tradeName?.stampImageUrl ?? null,
    invoiceNumber: invoice.invoiceNumber,
    invoiceDate: invoice.invoiceDate,
    customerLegalName: invoice.customerLegalName,
    poNumbers,
    lines,
    grossTotal: invoice.grossTotal,
    taxRate: invoice.taxRate,
    taxAmount: invoice.taxAmount,
    netTotal: invoice.netTotal,
    netTotalInWords: amountInWords(invoice.netTotal),
  };
}
