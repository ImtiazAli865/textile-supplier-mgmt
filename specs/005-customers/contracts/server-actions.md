# Contracts: Customers Server Actions

**Feature**: `005-customers` | **Date**: 2026-09-20

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001-004.

All actions:
- Require an authenticated session (valid Supabase Auth session, via `requireCurrentUser()`);
  throw `UnauthenticatedError` otherwise (FR-019).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.
- Reject any attempt to write `status` from `createCustomer`/`updateCustomer` (only
  `setCustomerStatus` may change it), and reject any attempt to write an opening balance from
  `updateCustomer` at all — that field doesn't exist on its input type (FR-005, FR-013).

## `createCustomer(input: CustomerInput): Promise<{ id: string }>`

- **Input**: `displayName`, `legalName`, `billingAddress` (line1/city/country required,
  line2/state/postalCode optional), `telephone?`, `ntnNumber?`, `salesTaxRegistrationNumber?`,
  `issuesPerformaInvoice` (boolean, default `false`), `paymentTermsMinDays` and
  `paymentTermsMaxDays` (non-negative integers, both default `0`, `max >= min` — FR-010),
  `contacts` (min 1, each name + phone-and/or-email), `shipToAddresses` (zero or more),
  `tradeNameHintIds` (zero or more, ordered), and `openingBalance?: { amount: number
  (> 0), type: 'debit' | 'credit', asOfDate: string }` — present only when there's a real
  balance to record (FR-011).
- **Behavior**: Validates required fields and the contacts-need-phone-or-email rule (FR-002),
  then calls `create_customer` (data-model.md), which inserts the customer plus its child rows
  and, only if `openingBalance` is present, the opening-balance `ledger_entries` row.
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field) → field-level form errors.

## `updateCustomer(id: string, input: CustomerUpdateInput): Promise<void>`

- **Input**: Existing customer `id`, the same shape as `CustomerInput` **minus**
  `openingBalance` — the type itself has no such field, so there is nothing to accidentally
  accept (FR-013).
- **Behavior**: Re-validates the same rules as create, then calls `update_customer`
  (data-model.md), which updates the customer row and replaces its contacts/ship-to
  addresses/trade-name hints. Never touches `status` or any `ledger_entries` row.
- **Errors**: `ValidationError`; `NotFoundError`.

## `setCustomerStatus(id: string, status: 'active' | 'inactive'): Promise<void>`

- **Input**: Customer `id`, target status.
- **Behavior**: Unconditional set — a safe no-op when already in the target status (spec Edge
  Cases), exactly mirroring `setSupplierStatusRecord`/`setTradeNameStatusRecord`. Never touches
  any other column (FR-006, FR-007).
- **Errors**: `NotFoundError`.

## `listCustomers(filters: { status?: 'active' | 'inactive' }): Promise<CustomerListItem[]>`

- **Input**: Optional `status` filter, defaulting to `'active'` (FR-003).
- **Behavior**: Plain `select` from `customers`, ordered by `display_name`.
- **Output**: `{ id, displayName, status }[]`. Not a Server Action (called directly from the
  Server Component, same pattern as `listSuppliers`/`listTradeNames`).

## `getCustomer(id: string): Promise<CustomerDetail | null>`

- **Input**: Customer `id`.
- **Behavior**: Fetches the customer row joined to its contacts, ship-to addresses, and
  trade-name hints (resolved to each hinted trade name's `printedName` for display), computes its
  live ledger balance (data-model.md's helper query), and fetches its product mappings
  (`listCustomerProductMappings`) (FR-004).
- **Output**: Full customer record plus `ledgerBalance: number` and `productMappings:
  CustomerProductMapping[]`, or `null` if not found. Not a Server Action (called directly from the
  Server Component).

## `addProductMapping(input: { customerId: string; productId: string; customerItemCode?: string; sellingUom?: string; defaultPrice?: number; conversionFactor?: number }): Promise<{ id: string }>`

- **Input**: As shown; at least one of `customerItemCode`/`sellingUom`/`defaultPrice` required
  (`customer_product_mappings_has_value_check`) — a mapping may exist with only a `defaultPrice`
  set and no code/UOM override. `defaultPrice` must be `> 0` when provided (FR-014, a pure
  pre-fill value, never validated against any PO's own price); `conversionFactor` defaults to `1`.
- **Behavior**: Plain `supabase-js` insert (no RPC — research.md). Surfaces the DB's partial
  unique constraint violation (FR-016) as a friendly `ValidationError` ("This item code is
  already used for a different product for this customer.") rather than a raw Postgres error.
- **Output**: New mapping row ID.
- **Errors**: `ValidationError` (missing both code/UOM, or a duplicate item code for this
  customer); `NotFoundError` (unknown customer or product id).

## `updateProductMapping(id: string, input: { customerItemCode?: string; sellingUom?: string; defaultPrice?: number; conversionFactor?: number }): Promise<void>`

- **Input**: Existing mapping `id`, updated fields (customer/product themselves are immutable
  once a mapping exists — remove and re-add instead of reassigning).
- **Behavior**: Plain `supabase-js` update. Same duplicate-item-code handling as `addProductMapping`.
- **Errors**: `ValidationError`; `NotFoundError`.

## `removeProductMapping(id: string): Promise<void>`

- **Input**: Mapping `id`.
- **Behavior**: Plain `supabase-js` delete.
- **Errors**: `NotFoundError`.

## `listCustomerProductMappings(customerId: string): Promise<CustomerProductMapping[]>`

Used by the customer detail page. Joins `products(name)` for display. Not a Server Action.

## `listProductCustomerMappings(productId: string): Promise<CustomerProductMapping[]>`

Used by the product detail page (per spec US2 Acceptance Scenario 1: a mapping is "shown when
viewing either the customer or the product"). Joins `customers(display_name)` for display. Not a
Server Action.

## `listActiveCustomersForSelect(): Promise<{ id: string; displayName: string }[]>`

Not built in this feature — no picker in 005 itself needs it (mapping management happens from an
already-open customer's own detail page, not from a customer-picker). Left for 006-customer
-purchase-orders to add when it needs one, per the same "add the wrapper when a real caller needs
it" discipline 003b applied to `listActiveTradedProductsForSelect`.

## `listActiveProductsForSelect(): Promise<{ id: string; name: string; stockUom: string }[]>` (extends `lib/products/service.ts`)

- **Behavior**: Thin wrapper over the existing `listProducts({ status: "active" })` — **no**
  `type` filter, unlike 003b's traded-only wrapper, since a customer may need a mapping to either
  a traded or a manufactured product. Reused (not reimplemented) to populate the product picker on
  `product-mapping-form.tsx`.

## `listActiveTradeNamesForSelect(): Promise<{ id: string; printedName: string }[]>` (extends `lib/trade-names/service.ts`)

- **Behavior**: Thin wrapper over the existing `listTradeNames({ status: "active" })`, reused to
  populate the trade-name-hint multi-select on `customer-form.tsx`.
