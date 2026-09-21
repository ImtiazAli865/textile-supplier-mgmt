# Contracts: Performa Invoicing Server Actions

**Feature**: `008-performa-invoicing` | **Date**: 2026-09-22

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001-007.

All actions:
- Require an authenticated session (valid Supabase Auth session, via `requireCurrentUser()`);
  throw `UnauthenticatedError` otherwise (FR-013).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.

## `createPerformaInvoice(input: PerformaInvoiceInput): Promise<{ id: string }>`

- **Input**: `customerId`, `tradeNameId`, `invoiceNumber?` (blank = auto-generate), `invoiceDate`,
  `taxRate` (defaults to `18` at the schema layer), `lines` (min 1, each `{ poLineId,
  invoicedQuantity (> 0) }`, `poLineId` unique within the array).
- **Behavior**: Calls `create_performa_invoice` (data-model.md) — validates eligibility, per-line
  customer/cancellation/remaining-quantity rules, increments each referenced PO line's
  `invoicedQuantity`, and posts the ledger credit, all atomically.
- **Output**: New row ID.
- **Errors**: `ValidationError`; `CustomerNotInvoiceEligibleError` ("This customer does not issue
  Performa Invoices." — FR-001, FR-008); `TradeNameNotFoundError`; `DuplicatePoLineError` (the same
  PO line was submitted more than once on this invoice); `PoLineWrongCustomerError` (a selected
  line belongs to a PO of a different customer — FR-002); `PoCancelledError` (a selected line's PO
  is cancelled — FR-002); `LineFullyInvoicedError` / `LineExceedsRemainingInvoiceableError` (FR-003,
  surfaced with the specific line and its remaining invoiceable quantity);
  `DuplicateInvoiceNumberError` (same trade name already has this number, from the `unique
  (trade_name_id, invoice_number)` violation — FR-004).

## `uploadPerformaInvoiceGstAttachment(invoiceId: string, formData: FormData): Promise<{ fileName: string }>`

- **Input**: Invoice `id`, a `FormData` carrying one `File`.
- **Behavior**: Uploads to the `performa-invoice-attachments` bucket
  (`lib/performa-invoices/storage.ts`, mirroring `lib/customer-pos/storage.ts`'s multi-attachment
  shape rather than `lib/challans/storage.ts`'s single-slot shape), then inserts a new
  `performa_invoice_attachments` row — an append, never a replace (FR-011).
- **Output**: The uploaded file's original name (for immediate UI feedback).
- **Errors**: `NotFoundError`; `InvalidAttachmentError` (no file present in the `FormData`).

## `listPerformaInvoices(filters: { customerId?: string; tradeNameId?: string }): Promise<PerformaInvoiceListItem[]>`

- **Behavior**: Fetches matching `performa_invoices` rows joined to `customers(display_name)` and
  `trade_names(printed_name)`, plus each invoice's lines (for the included-PO-numbers and net-total
  computation), ordered by `invoice_date desc` (FR-012).
- **Output**: `{ id, invoiceNumber, invoiceDate, customerId, customerDisplayName, tradeNamePrintedName,
  poNumbers: string[], netTotal: number }[]`. Not a Server Action (Server-Component read, same
  pattern as `listChallans`).

## `getPerformaInvoice(id: string): Promise<PerformaInvoiceDetail | null>`

- **Behavior**: Fetches the invoice row joined to its customer and trade name, its lines (each with
  its snapshot `product_id → products(name)`, plus a live join to `customer_po_lines
  (customer_item_code, po_id → customer_pos.po_number)` for the "Article" column and per-line PO
  attribution — FR-006), its attachments resolved to short-lived signed URLs, and the actual posted
  ledger credit amount (a display cross-check, mirroring `getChallan`'s own
  `getLedgerCreditAmount` helper).
- **Output**: Full invoice record with resolved `lines: PerformaInvoiceLineDetail[]` (each carrying
  its own `poNumber`), `grossTotal`/`taxAmount`/`netTotal: number` (computed in TypeScript over
  already-fetched lines and the invoice's own `taxRate` — data-model.md), `attachments:
  PerformaInvoiceAttachment[]`, `ledgerCreditAmount: number`, `createdAt`/`createdBy` (FR-014), or
  `null` if not found. Not a Server Action.

## `getPerformaInvoiceForPrint(id: string): Promise<PerformaInvoicePrintView | null>`

- **Behavior**: Same underlying fetch as `getPerformaInvoice`, additionally resolving the trade
  name's `signature_image_path`/`stamp_image_path` (004) to short-lived signed URLs and computing
  the net total's amount-in-words (`lib/performa-invoices/number-to-words.ts`, research.md). Used
  only by `app/performa-invoices/[invoiceId]/print/page.tsx` (ADR-0006 pattern).
- **Output**: `{ tradeNamePrintedName, tradeNamePrintedAddress, signatureImageUrl, stampImageUrl,
  invoiceNumber, invoiceDate, customerLegalName, poNumbers: string[], lines: { sNo, article,
  itemName, uom, quantityInvoiced, unitPrice, lineTotal, poNumber }[], grossTotal, taxRate,
  taxAmount, netTotal, netTotalInWords }`. Not a Server Action.

## `getInvoiceableLinesForPO(poId: string): Promise<{ id: string; poId: string; poNumber: string; customerItemCode: string | null; productName: string; uom: string; unitPrice: number; deliveredQuantity: number; invoicedQuantity: number; remaining: number }[]>`

- **Behavior**: Reuses `getCustomerPO` (006, already exported) and derives `remaining =
  deliveredQuantity - invoicedQuantity` per line in TypeScript, filtering out lines where `remaining
  <= 0` — the same shape as 007's own `getOpenPOLinesForChallan`, with the subtraction terms
  swapped (delivered-minus-invoiced instead of ordered-minus-delivered). Populates the "Create
  Performa Invoice" form's per-PO line picker once a PO is added to the invoice. Not a Server
  Action.

## `listPerformaInvoiceCustomersForSelect(): Promise<{ id: string; displayName: string }[]>`

- **New, small export added to `lib/customers/service.ts`** (005) — `listCustomers({status:
  'active'})` filtered additionally to `issues_performa_invoice = true`, shaped like that file's
  existing `listActiveCustomersForSelect()`. Populates the customer picker on the "Create Performa
  Invoice" form, restricting selection to eligible customers up front rather than only rejecting
  ineligible ones at submission time (FR-001).

## Reused, unchanged

- `listCustomerPOs({ customerId, status: 'open' })` (`lib/customer-pos/service.ts`, 006) — populates
  the PO picker on the "Create Performa Invoice" form once a customer is selected.
- `listActiveTradeNamesForSelect()` (`lib/trade-names/service.ts`, 004) — populates the trade name
  picker.
- `getTradeName(id)` (`lib/trade-names/service.ts`, 004) — resolves letterhead/signature/stamp for
  the print view, same as `getChallanForPrint` already does.
