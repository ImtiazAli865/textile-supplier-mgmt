# Contracts: Traded-Goods Purchasing Server Actions

**Feature**: `003b-traded-goods-purchasing` | **Date**: 2026-09-20

Extends 002's contract (same file conceptually — `app/actions/purchases.ts` is not a new file).
No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads.

All actions:
- Require an authenticated session (valid Supabase Auth session, verified via
  `supabase.auth.getUser()`); throw `UnauthenticatedError` otherwise (FR-017).
- Re-validate input server-side with the shared Zod discriminated-union schema regardless of
  client-side validation.
- Reject any attempt to write `totalCost`, `remainingWeightKg`/`remainingUnits`, or a product's
  `currentPurchaseCost`/`quantityOnHand` directly from client input — all four are always
  server-computed (the first three exactly as in 002; the product fields are new in this
  feature, computed by the Postgres functions in data-model.md, never accepted as input at all).

## `createPurchase(input: PurchaseInput): Promise<{ id: string }>`

- **Input**: `PurchaseInput` — a discriminated union on `mode`:
  - `mode: 'weight'` — unchanged from 002: `supplierId`, `purchaseDate` (≤ today), `weightKg`
    (> 0), `ratePerKg` (> 0).
  - `mode: 'unit'` — new: `supplierId`, `productId`, `purchaseDate` (≤ today), `quantityUnits`
    (> 0), `ratePerUnit` (> 0).
- **Behavior**:
  - `weight` mode: unchanged from 002 — validates the active-supplier rule, inserts directly
    into `raw_material_purchases`.
  - `unit` mode: validates `supplierId` resolves to an active supplier and `productId` resolves
    to an active, **traded-type** product (FR-002, FR-014), then calls the
    `record_unit_purchase` Postgres function (data-model.md), which inserts the row and
    recomputes the product's `current_purchase_cost`/`quantity_on_hand` in the same transaction.
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field, or a field/mode mismatch) → field-level
  form errors; `SupplierNotActiveError`; `ProductNotPurchasableError` if `productId` resolves to
  an inactive or manufactured-type product, or doesn't exist.

## `updatePurchase(id: string, input: PurchaseInput): Promise<void>`

- **Input**: Existing purchase `id`, full `PurchaseInput` (same discriminated shape as create).
  The mode of an existing purchase cannot change (not exposed as an editable field in either
  the UI or this action's accepted shape) — mirrors 003's product-type immutability rule.
- **Behavior**:
  - `weight` mode: unchanged from 002.
  - `unit` mode: first checks the existing row is unconsumed (`remaining_units =
    quantity_units`); if not, rejects with `PurchaseLockedError` (FR-013). Otherwise validates
    input (re-checking the active-supplier/active-traded-product rules only when those
    references actually change, same "don't re-block on an untouched reference" logic 002
    already applies to suppliers), then calls `update_unit_purchase`.
- **Errors**: `ValidationError`; `NotFoundError`; `PurchaseLockedError`; `SupplierNotActiveError`;
  `ProductNotPurchasableError`.

## `deletePurchase(id: string): Promise<void>`

- **Input**: Existing purchase `id`.
- **Behavior**:
  - `weight` mode: unchanged from 002.
  - `unit` mode: first checks the existing row is unconsumed (`remaining_units =
    quantity_units`); if not, rejects with `PurchaseLockedError` (FR-013). Otherwise calls
    `delete_unit_purchase`, which removes the row and recomputes the affected product's
    `current_purchase_cost`/`quantity_on_hand`.
- **Errors**: `NotFoundError`; `PurchaseLockedError`.

## `listPurchases(filters: { supplierId?: string; dateFrom?: string; dateTo?: string; productId?: string }): Promise<{ purchases: PurchaseListItem[]; totals: PurchaseTotals }>`

- **Input**: Existing `supplierId`/`dateFrom`/`dateTo` filters (unchanged), plus new optional
  `productId` (matches unit-mode rows only — a weight-mode row never has a `productId` to match,
  so this filter implicitly excludes all weight-mode rows when set, per spec Acceptance
  Scenario US2.3).
- **Behavior**: Queries `raw_material_purchases` `JOIN suppliers` (unchanged) and, for rows with
  a `product_id`, `JOIN products` for the product's current name — sorted most-recent-first
  across both modes together (FR-007). Applies all filters as a combined `WHERE` (FR-008).
- **Output**:
  - `purchases`: list-view shape per row — common fields (`id`, `supplierId`, `supplierName`,
    `purchaseDate`, `totalCost`, `mode`) plus, for weight-mode rows, `weightKg`/`ratePerKg`, or
    for unit-mode rows, `productId`/`productName`/`quantityUnits`/`ratePerUnit`.
  - `totals` (`PurchaseTotals`): `{ weight: { totalKg: number; totalCost: number } | null;
    unit: { totalUnits: number; totalCost: number } | null; grandTotalCost: number }` — `weight`/
    `unit` are `null` (not zero) when the filtered set has no rows of that mode, so the UI can
    omit that line entirely rather than show a misleading zero (FR-009, spec Edge Cases).
- **Errors**: None expected beyond generic infra failure. Not a Server Action (called directly
  from the Server Component, same pattern as 002's `listPurchases`).

## `getPurchase(id: string): Promise<PurchaseDetail | null>`

- **Input**: Purchase `id`.
- **Behavior**: Fetches the purchase row joined to its supplier's current name/status
  (unchanged) and, for a unit-mode row, its product's current name/type/status too, plus the
  derived lock state for whichever mode applies (FR-010).
- **Output**: Full purchase record with joined supplier (and, for unit-mode, product) info and
  derived `isLocked`, or `null` if not found.

## `listActiveSuppliersForSelect(): Promise<{ id: string; companyName: string }[]>`

Unchanged from 002.

## `listActiveTradedProductsForSelect(): Promise<{ id: string; name: string; stockUom: string }[]>`

- **Input**: None.
- **Behavior**: Thin wrapper over 003's existing `listProducts({ type: "traded", status:
  "active" })`, reused (not reimplemented) to populate the product dropdown on the per-unit
  purchase form (FR-002, FR-014), per research.md.
- **Output**: Active traded products' `id`/`name`/`stockUom`, sorted by name (same ordering 003
  already provides).
