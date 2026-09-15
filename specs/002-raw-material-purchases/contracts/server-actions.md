# Contracts: Raw Material Purchases Server Actions

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10 | **Revised**: 2026-09-16 (Supabase, see [ADR-0001](../../../history/adr/0001-firebase-to-supabase-backend.md))

This feature extends 001's pattern: no public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service calls) for reads.

All actions:
- Require an authenticated session (valid Supabase Auth session, verified via `supabase.auth.getUser()`); throw `UnauthenticatedError` otherwise (FR-014).
- Re-validate input server-side with the shared Zod schema regardless of client-side validation.
- Reject any attempt to write `totalCost` or `remainingWeightKg` directly from client input — `total_cost` is a Postgres generated column (cannot be written directly at all) and `remaining_weight_kg` is always server-set.

## `createPurchase(input: PurchaseInput): Promise<{ id: string }>`

- **Input**: `PurchaseInput` — `supplierId`, `purchaseDate` (≤ today), `weightKg` (> 0), `ratePerKg` (> 0).
- **Behavior**: Validates input (FR-003) and that `supplierId` references an existing **active** supplier (FR-001). Sets `remaining_weight_kg = weightKg`; `total_cost` is computed by Postgres itself (generated column). Sets `created_at`/`updated_at`/`created_by`/`updated_by`. Inserts a new row into `raw_material_purchases`.
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field) → field-level form errors; `SupplierNotActiveError` if `supplierId` resolves to an inactive or nonexistent supplier.

## `updatePurchase(id: string, input: PurchaseInput): Promise<void>`

- **Input**: Existing purchase `id`, full `PurchaseInput` (same shape as create).
- **Behavior**: First checks the existing record is unconsumed (`remaining_weight_kg = weight_kg`); if not, rejects with `PurchaseLockedError` (FR-010). Otherwise validates input, resets `remaining_weight_kg` to the new `weightKg` (`total_cost` recomputes automatically as a generated column), updates `updated_at`/`updated_by` (FR-008).
- **Errors**: `ValidationError` (same as create); `NotFoundError` if `id` doesn't exist; `PurchaseLockedError` if the purchase has already been partially/fully consumed.

## `deletePurchase(id: string): Promise<void>`

- **Input**: Existing purchase `id`.
- **Behavior**: First checks the existing record is unconsumed (`remaining_weight_kg = weight_kg`); if not, rejects with `PurchaseLockedError` (FR-010). Otherwise permanently `DELETE`s the row (FR-009) — hard delete, no soft-delete/status field on this entity.
- **Errors**: `NotFoundError` if `id` doesn't exist; `PurchaseLockedError` if the purchase has already been partially/fully consumed.

## `listPurchases(filters: { supplierId?: string; dateFrom?: string; dateTo?: string }): Promise<{ purchases: PurchaseListItem[]; totals: { totalKg: number; totalCost: number } }>`

- **Input**: Optional `supplierId` filter, optional `dateFrom`/`dateTo` (ISO date strings, inclusive) date-range filter.
- **Behavior**: Queries `raw_material_purchases` `JOIN suppliers` by `supplier_id` (if given) and `purchase_date` range (if given), sorted most-recent-first (FR-004, FR-005), with the supplier's current `company_name` selected directly from the join instead of a separate per-row fetch. Sums `weight_kg`/`total_cost` across the full filtered result set in application code (same "fetch-and-sum" approach as the Firestore era — trivial at this scale, and the set is already fetched for the list itself) for the running totals (FR-006).
- **Output**: List of purchase records (list-view shape: id, supplierId, supplierName, purchaseDate, weightKg, ratePerKg, totalCost) plus the computed totals for that filtered set.
- **Errors**: None expected beyond generic infra failure. Not a Server Action (called directly from the Server Component, same pattern as 001's `listSuppliers`), but included here as the read contract this feature must satisfy.

## `getPurchase(id: string): Promise<PurchaseDetail | null>`

- **Input**: Purchase `id`.
- **Behavior**: Fetches the purchase row `JOIN`ed to its supplier's current `company_name`/`status`, and the derived lock state (`remaining_weight_kg < weight_kg`) for the detail view (FR-007) and to drive whether edit/delete controls are shown.
- **Output**: Full purchase record with joined supplier info and derived `isLocked`, or `null` if not found.

## `listActiveSuppliersForSelect(): Promise<{ id: string; companyName: string }[]>`

- **Input**: None.
- **Behavior**: Thin wrapper over 001's existing `listSuppliers({ status: "active" })`, reused (not reimplemented) to populate the supplier dropdown on the create/edit form (FR-001).
- **Output**: Active suppliers' `id`/`companyName`, sorted by name (same ordering 001 already provides).
