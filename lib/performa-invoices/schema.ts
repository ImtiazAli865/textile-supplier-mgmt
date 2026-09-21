import { z } from "zod";

/** One invoice line as submitted by the create form — references a customer_po_lines row
 * directly, never a challan_lines row (spec.md's resolved data-model decision). */
export const performaInvoiceLineInputSchema = z.object({
  poLineId: z.string().uuid("Select a PO line"),
  invoicedQuantity: z.coerce.number().positive("Invoiced quantity must be greater than zero"),
});

export type PerformaInvoiceLineInput = z.infer<typeof performaInvoiceLineInputSchema>;

/** Rejects a lines array referencing the same PO line more than once — a friendlier, earlier
 * echo of create_performa_invoice's own authoritative DUPLICATE_PO_LINE guard (mirrors
 * lib/challans/schema.ts's noDuplicatePoLines). */
function noDuplicatePoLines<L extends { poLineId: string }>(schema: z.ZodType<L[]>) {
  return schema.superRefine((lines, ctx) => {
    const seen = new Set<string>();
    for (const line of lines) {
      if (seen.has(line.poLineId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Each PO line can appear at most once per invoice.",
        });
        return;
      }
      seen.add(line.poLineId);
    }
  });
}

/** Shape submitted by the create form and accepted by createPerformaInvoice. invoiceNumber
 * left blank auto-generates from the trade name's counter (FR-004); taxRate defaults to 18
 * (FR-005) but is always explicitly submitted. There is no update-input counterpart — a
 * Performa Invoice has no edit path at all (FR-009, research.md). */
export const performaInvoiceInputSchema = z.object({
  customerId: z.string().uuid("Select a customer"),
  tradeNameId: z.string().uuid("Select a trade name"),
  invoiceDate: z.string().trim().min(1, "Invoice date is required"),
  invoiceNumber: z.string().trim().max(30, "Invoice number is too long").optional(),
  taxRate: z.coerce
    .number()
    .min(0, "Tax rate cannot be negative")
    .max(100, "Tax rate cannot exceed 100%")
    .default(18),
  lines: noDuplicatePoLines(
    z.array(performaInvoiceLineInputSchema).min(1, "At least one line item is required")
  ),
});

export type PerformaInvoiceInput = z.infer<typeof performaInvoiceInputSchema>;

/** Fields shown in the Performa Invoice list view (FR-012). poNumbers is always an array — one
 * element for a single-PO invoice, more for a combined one (spec.md's resolved multi-PO
 * decision) — never a single poNumber field. */
export interface PerformaInvoiceListItem {
  id: string;
  invoiceNumber: string;
  invoiceDate: string;
  customerId: string;
  customerDisplayName: string;
  tradeNamePrintedName: string;
  poNumbers: string[];
  netTotal: number;
}

/** A resolved invoice line, as returned to Server/Client Components — always carries its own
 * source PO number, whether the invoice includes one PO or several (User Story 2). */
export interface PerformaInvoiceLineDetail {
  id: string;
  poLineId: string;
  poId: string;
  poNumber: string;
  productName: string;
  uom: string;
  unitPrice: number;
  invoicedQuantity: number;
  lineTotal: number;
}

export interface PerformaInvoiceAttachment {
  id: string;
  fileName: string;
  contentType: string;
  uploadedAt: string;
  url: string | null;
}

/** Full invoice record with resolved lines/attachments and totals computed in TypeScript from
 * the already-fetched lines and the invoice's own taxRate (data-model.md's "computed, not
 * stored" decision) — never stale, since a created invoice's lines/taxRate never change. */
export interface PerformaInvoiceDetail {
  id: string;
  customerId: string;
  customerDisplayName: string;
  customerLegalName: string;
  tradeNameId: string;
  tradeNamePrintedName: string;
  invoiceNumber: string;
  invoiceDate: string;
  taxRate: number;
  lines: PerformaInvoiceLineDetail[];
  grossTotal: number;
  taxAmount: number;
  netTotal: number;
  ledgerCreditAmount: number | null;
  attachments: PerformaInvoiceAttachment[];
  createdAt: string;
  createdBy: string;
}

/** Shape rendered by the standalone print route — the real printed document's contents,
 * including amount in words (FR-006). */
export interface PerformaInvoicePrintView {
  tradeNamePrintedName: string;
  tradeNamePrintedAddress: string;
  signatureImageUrl: string | null;
  stampImageUrl: string | null;
  invoiceNumber: string;
  invoiceDate: string;
  customerLegalName: string;
  poNumbers: string[];
  lines: {
    sNo: number;
    itemName: string;
    uom: string;
    quantityInvoiced: number;
    unitPrice: number;
    lineTotal: number;
    poNumber: string;
  }[];
  grossTotal: number;
  taxRate: number;
  taxAmount: number;
  netTotal: number;
  netTotalInWords: string;
}

/** One invoiceable PO line — a PO line with delivered quantity not yet invoiced (`remaining =
 * deliveredQuantity - invoicedQuantity > 0`), used to populate the create form's per-PO line
 * checklist (mirrors lib/challans/schema.ts's ChallanLineCandidate shape). */
export interface InvoiceableLine {
  id: string;
  poId: string;
  poNumber: string;
  customerItemCode: string | null;
  productName: string;
  uom: string;
  unitPrice: number;
  deliveredQuantity: number;
  invoicedQuantity: number;
  remaining: number;
}
