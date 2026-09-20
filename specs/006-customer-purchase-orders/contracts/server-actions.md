# Contracts: Customer Purchase Orders Server Actions

**Feature**: `006-customer-purchase-orders` | **Date**: 2026-09-20

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001-005.

All actions:
- Require an authenticated session (valid Supabase Auth session, via `requireCurrentUser()`);
  throw `UnauthenticatedError` otherwise (FR-018).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.
- Reject any attempt to write `status`, `delivered_quantity`, or `invoiced_quantity` from
  `createCustomerPO`/`updateCustomerPO` — none of those fields exist on their input types
  (FR-014, FR-015, FR-017).

## `createCustomerPO(input: CustomerPOInput): Promise<{ id: string }>`

- **Input**: `customerId`, `poNumber` (1-30 chars, no format restriction), `orderDate`,
  `purchaserName?`, `requestedDeliveryDate?`, `destinationText?`, `tradeNameId?`, `lines` (min 1,
  each `{ customerItemCode?, productId, description?, quantityOrdered (> 0), uom, unitPrice (> 0)
  }`).
- **Behavior**: Validates required fields and that every line has a resolved `productId` (FR-002).
  When `destinationText` is blank, defaults it to the customer's current billing address before
  calling `create_customer_po` (research.md) — the RPC itself just stores whatever text it's
  given. Inserts the PO header and its lines in one transaction.
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field, e.g. a zero-quantity or zero-price line —
  FR-010); `DuplicatePONumberError` (same customer already has this PO number — FR-004, surfaced
  from the DB's `unique (customer_id, po_number)` violation as a friendly message, not a raw
  Postgres error).

## `updateCustomerPO(id: string, input: CustomerPOInput & { lines: (PoLineInput & { id?: string })[] }): Promise<void>`

- **Input**: Existing PO `id`, the same header shape as `CustomerPOInput`, plus each line
  optionally carrying its existing `id` (present = update that line; absent = new line; an
  existing line's `id` omitted from the array entirely = delete attempt).
- **Behavior**: Re-validates the same rules as create, applying the same blank-`destinationText`→
  billing-address default (research.md), then calls `update_customer_po` (data-model.md), which
  updates the header and per-line-upserts the lines, per its lock rule. Never touches `status`.
- **Errors**: `ValidationError`; `NotFoundError`; `LockedLineError` — surfaced from
  `update_customer_po`'s exception when the caller's `lines` array would either remove a line that
  already has nonzero delivered/invoiced quantity, or change that line's `productId`,
  `quantityOrdered`, `uom`, or `unitPrice` (FR-014 locks exactly these four fields — its
  `customerItemCode`/`description` remain editable regardless of lock status) ("This line has
  delivery or invoicing activity recorded against it — its quantity, unit of measure, price, and
  product cannot be changed here (its item code and description can still be edited)."). Inert
  today (no writer ever sets those quantities above zero until 007/008 ship), but the error path
  exists and is exercised by tests once those features add a way to trigger it.

## `cancelCustomerPO(id: string): Promise<void>`

- **Input**: PO `id`.
- **Behavior**: Calls `set_customer_po_status(id, 'cancelled', userId)`. Safe no-op if already
  cancelled (spec Edge Cases).
- **Errors**: `NotFoundError`; `LockedPOError` — surfaced when any line on the PO has nonzero
  delivered/invoiced quantity ("This PO has delivery or invoicing activity recorded against it and
  can no longer be cancelled here.") (FR-015). Inert today, same caveat as above.

## `reactivateCustomerPO(id: string): Promise<void>`

- **Input**: PO `id`.
- **Behavior**: Calls `set_customer_po_status(id, 'open', userId)`. Unconditional set, safe no-op
  if already open (spec Edge Cases).
- **Errors**: `NotFoundError`.

## `uploadCustomerPOAttachment(poId: string, formData: FormData): Promise<{ id: string; fileName: string }>`

- **Input**: PO `id`, a `FormData` carrying one `File`.
- **Behavior**: Uploads the file to the `customer-po-documents` bucket
  (`lib/customer-pos/storage.ts`, mirroring `lib/trade-names/storage.ts`), then inserts a
  `customer_po_attachments` row. Called only after the PO itself already exists (research.md) —
  never bundled into `createCustomerPO`/`updateCustomerPO`.
- **Output**: New attachment row ID and its original filename (for immediate UI feedback).
- **Errors**: `NotFoundError` (unknown `poId`); `InvalidAttachmentError` (no file present in the
  `FormData`).

## `resolveCustomerItemCode(customerId: string, itemCode: string): Promise<{ productId: string; productName: string; sellingUom: string | null; defaultPrice: number | null } | null>`

- **Input**: Customer `id`, the item code as typed so far.
- **Behavior**: Plain read against 005's `customer_product_mappings` (data-model.md). Returns
  `null` when no mapping matches — the caller (the line-item form) then falls back to a manual
  product picker (FR-007). Not a Server Action in the mutation sense, but exposed as one so it can
  be called from a Client Component form as the staff member types.
- **Output**: The resolved product plus pre-fill UOM/price, or `null`.

## `listCustomerPOs(filters: { status?: 'open' | 'cancelled'; customerId?: string }): Promise<CustomerPOListItem[]>`

- **Input**: Optional `status` filter, defaulting to `'open'` (FR-012); optional `customerId`
  filter.
- **Behavior**: Fetches matching `customer_pos` rows joined to `customers(display_name)`, plus
  each PO's lines (for the total-value sum — research.md), ordered by `order_date desc`.
- **Output**: `{ id, customerId, customerDisplayName, poNumber, orderDate, status, total: number
  }[]`. Not a Server Action (called directly from the Server Component, same pattern as
  `listCustomers`/`listSuppliers`).

## `getCustomerPO(id: string): Promise<CustomerPODetail | null>`

- **Input**: PO `id`.
- **Behavior**: Fetches the PO row joined to its customer, trade name (if set), lines (each joined
  to `products(name, stock_uom)`), and attachments; computes the total value as the sum of line
  totals (FR-011, data-model.md).
- **Output**: Full PO record with resolved `lines: PoLineDetail[]` (including
  `deliveredQuantity`/`invoicedQuantity`, always `0` today), `attachments: Attachment[]`,
  `createdAt`/`updatedAt` (FR-019), and `total: number`, or `null` if not found. Not a Server
  Action.

## `listActiveCustomersForSelect(): Promise<{ id: string; displayName: string }[]>` (extends `lib/customers/service.ts`)

- **Behavior**: Thin wrapper over the existing `listCustomers({ status: "active" })` — the
  addition 005's own [contracts/server-actions.md](../../005-customers/contracts/server-actions.md#listactivecustomersforselect-promise-id-string-displayname-string-)
  already deferred to this feature. Populates the customer picker on `customer-po-form.tsx`.

## Reused, unchanged

- `listActiveProductsForSelect()` (`lib/products/service.ts`, added by 005) — populates each
  line's manual-product-picker fallback.
- `listActiveTradeNamesForSelect()` (`lib/trade-names/service.ts`, added by 005) — populates the
  "trade name this PO bills under" picker.
