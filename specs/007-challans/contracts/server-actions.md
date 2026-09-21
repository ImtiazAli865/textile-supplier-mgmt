# Contracts: Challans Server Actions

**Feature**: `007-challans` | **Date**: 2026-09-21

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001-006.

All actions:
- Require an authenticated session (valid Supabase Auth session, via `requireCurrentUser()`);
  throw `UnauthenticatedError` otherwise (FR-017).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.

## `createChallan(input: ChallanInput): Promise<{ id: string }>`

- **Input**: `poId`, `tradeNameId`, `challanNumber?` (blank = auto-generate), `challanDate`, `lines`
  (min 1, each `{ poLineId, deliveredQuantity (> 0) }`).
- **Behavior**: Calls `create_challan` (data-model.md).
- **Output**: New row ID.
- **Errors**: `ValidationError`; `PoNotOpenError` (referenced PO is cancelled or doesn't exist,
  FR-001); `LineFullyDeliveredError` / `LineExceedsRemainingError` (FR-002, surfaced with the
  specific line and its remaining quantity); `DuplicateChallanNumberError` (same trade name already
  has this number, from the `unique (trade_name_id, challan_number)` violation — FR-004).

## `updateChallan(id: string, input: ChallanInput & { lines: ChallanLineUpdateInput[] }): Promise<void>`

- **Input**: Existing Challan `id`; same header shape as `ChallanInput`; each line as `{ poLineId,
  deliveredQuantity, acceptedQuantity, shortfallDisposition? }` (no per-line `id` needed — the
  whole set is replaced, research.md).
- **Behavior**: Calls `update_challan` (data-model.md). Used both for header/delivered-quantity
  corrections while nothing has come back yet, and later for recording the signed copy's actual
  accepted quantities and shortfall dispositions before finalizing acceptance (FR-003, FR-007).
- **Errors**: `ValidationError`; `NotFoundError`; `ChallanNotEditableError` (already accepted or
  voided — "This Challan has already been accepted and is read-only." / "This Challan has been
  voided." — FR-013); same line-validation errors as `createChallan`; `AcceptedExceedsDeliveredError`
  (a line's `acceptedQuantity` submitted above its `deliveredQuantity` — FR-003).

## `voidChallan(id: string): Promise<void>`

- **Input**: Challan `id`.
- **Behavior**: Calls `void_challan`.
- **Errors**: `NotFoundError`; `ChallanNotVoidableError` (already accepted — "An accepted Challan
  cannot be voided." — FR-013/FR-014).

## `acceptChallan(id: string): Promise<void>`

- **Input**: Challan `id`.
- **Behavior**: Calls `accept_challan` (data-model.md) — the single function posting every
  FR-009–FR-012 effect atomically.
- **Errors**: `NotFoundError`; `ChallanNotIssuedError` (already accepted or voided); `PoCancelledError`
  ("The referenced PO is cancelled — reactivate it before accepting this Challan." — Edge Cases);
  `NoAcceptedQuantityError` ("At least one line must have a positive accepted quantity." — FR-008);
  `MissingShortfallDispositionError` (naming the affected line(s) — "Line(s) with a short receipt
  need a disposition (return to inventory or write off) before this Challan can be accepted." —
  FR-007).

## `uploadChallanSignedCopy(challanId: string, formData: FormData): Promise<{ fileName: string }>`

- **Input**: Challan `id`, a `FormData` carrying one `File`.
- **Behavior**: Uploads to the `challan-attachments` bucket (`lib/challans/storage.ts`, mirroring
  `lib/trade-names/storage.ts`), then updates `challans`' `signed_copy_*` columns, best-effort
  deleting the previous object if one existed (004's three-step ordering). Allowed regardless of
  Challan status (FR-006) — the only action still permitted on an accepted Challan, since it
  changes no commercial data.
- **Output**: The uploaded file's original name (for immediate UI feedback).
- **Errors**: `NotFoundError`; `InvalidAttachmentError` (no file present in the `FormData`).

## `listChallans(filters: { poId?: string; customerId?: string; status?: 'issued' | 'accepted' | 'voided' }): Promise<ChallanListItem[]>`

- **Behavior**: Fetches matching `challans` rows joined to `customer_pos(po_number, customer_id,
  customers(display_name))` and `trade_names(printed_name)`, ordered by `challan_date desc`
  (FR-016).
- **Output**: `{ id, challanNumber, challanDate, status, poId, poNumber, customerDisplayName,
  tradeNamePrintedName }[]`. Not a Server Action (Server-Component read, same pattern as
  `listCustomerPOs`).

## `getChallan(id: string): Promise<ChallanDetail | null>`

- **Behavior**: Fetches the Challan row joined to its PO, customer, trade name, lines (each with
  its snapshot `product_id → products(name)`, plus a live join to `customer_po_lines
  (customer_item_code, quantity_ordered, delivered_quantity)` for the "Article" column and the
  remaining-quantity display), and the signed-copy columns resolved to a short-lived signed URL if
  present (FR-016).
- **Output**: Full Challan record with resolved `lines: ChallanLineDetail[]`, `total: number`
  (`sum(acceptedQuantity * unitPrice)`, computed in TypeScript over already-fetched lines — same
  pattern as 006's PO total), `signedCopyUrl: string | null`, `createdAt`/`updatedAt`/`acceptedAt`/
  `acceptedBy` (FR-018), or `null` if not found. Not a Server Action.

## `getChallanForPrint(id: string): Promise<ChallanPrintView | null>`

- **Behavior**: Same underlying fetch as `getChallan`, additionally resolving the trade name's
  `signature_image_path`/`stamp_image_path` (004) to short-lived signed URLs. Used only by
  `app/challans/[challanId]/print/page.tsx` (research.md).
- **Output**: `{ tradeNamePrintedName, tradeNamePrintedAddress, signatureImageUrl,
  stampImageUrl, challanNumber, challanDate, customerLegalName, poNumber, lines: {
  sNo, article, itemName, uom, quantity }[], total }`. Not a Server Action.

## `getOpenPOLinesForChallan(poId: string): Promise<{ id: string; customerItemCode: string | null; productName: string; uom: string; unitPrice: number; quantityOrdered: number; deliveredQuantity: number; remaining: number }[]>`

- **Behavior**: Reuses `getCustomerPO` (006, already exported) and derives `remaining =
  quantityOrdered - deliveredQuantity` per line in TypeScript, filtering out lines where `remaining
  <= 0` (FR-002). Populates the "Create Challan" form's line picker once a PO is selected. Not a
  Server Action.

## Reused, unchanged

- `listCustomerPOs({ status: 'open' })` (`lib/customer-pos/service.ts`, 006) — populates the PO
  picker on `challan-form.tsx`, or supplies the PO context when arriving via a "Create Challan"
  link from a PO's own detail page.
- `listActiveTradeNamesForSelect()` (`lib/trade-names/service.ts`, added by 005) — populates the
  trade name picker.
