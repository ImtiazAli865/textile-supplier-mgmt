# Contracts: Raw Material Purchases Server Actions

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10

Per [research.md](../research.md), this feature extends 001's pattern: no public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service calls) for reads.

All actions:
- Require an authenticated session (valid Firebase session cookie); throw `UnauthenticatedError` otherwise (FR-014).
- Re-validate input server-side with the shared Zod schema regardless of client-side validation.
- Reject any attempt to write `totalCost` or `remainingWeightKg` directly from client input — both are always server-computed.

## `createPurchase(input: PurchaseInput): Promise<{ id: string }>`

- **Input**: `PurchaseInput` — `supplierId`, `purchaseDate` (≤ today), `weightKg` (> 0), `ratePerKg` (> 0).
- **Behavior**: Validates input (FR-003) and that `supplierId` references an existing **active** supplier (FR-001). Computes `totalCost = weightKg * ratePerKg` and sets `remainingWeightKg = weightKg`. Sets `createdAt`/`updatedAt`/`createdBy`/`updatedBy`. Writes new document to `rawMaterialPurchases`.
- **Output**: New document ID.
- **Errors**: `ValidationError` (missing/invalid field) → field-level form errors; `SupplierNotActiveError` if `supplierId` resolves to an inactive or nonexistent supplier.

## `updatePurchase(id: string, input: PurchaseInput): Promise<void>`

- **Input**: Existing purchase `id`, full `PurchaseInput` (same shape as create).
- **Behavior**: First checks the existing record is unconsumed (`remainingWeightKg === weightKg`); if not, rejects with `PurchaseLockedError` (FR-010). Otherwise validates input, recomputes `totalCost`, resets `remainingWeightKg` to the new `weightKg`, updates `updatedAt`/`updatedBy` (FR-008).
- **Errors**: `ValidationError` (same as create); `NotFoundError` if `id` doesn't exist; `PurchaseLockedError` if the purchase has already been partially/fully consumed.

## `deletePurchase(id: string): Promise<void>`

- **Input**: Existing purchase `id`.
- **Behavior**: First checks the existing record is unconsumed (`remainingWeightKg === weightKg`); if not, rejects with `PurchaseLockedError` (FR-010). Otherwise permanently deletes the document (FR-009) — hard delete, no soft-delete/status field on this entity.
- **Errors**: `NotFoundError` if `id` doesn't exist; `PurchaseLockedError` if the purchase has already been partially/fully consumed.

## `listPurchases(filters: { supplierId?: string; dateFrom?: string; dateTo?: string }): Promise<{ purchases: PurchaseListItem[]; totals: { totalKg: number; totalCost: number } }>`

- **Input**: Optional `supplierId` filter, optional `dateFrom`/`dateTo` (ISO date strings, inclusive) date-range filter.
- **Behavior**: Queries `rawMaterialPurchases` by `supplierId` (if given) and `purchaseDate` range (if given), sorted most-recent-first (FR-004, FR-005). Joins each result to its supplier's current `companyName` for display (research.md's live-join decision). Sums `weightKg`/`totalCost` across the full filtered result set for the running totals (FR-006).
- **Output**: List of purchase records (list-view shape: id, supplierId, supplierName, purchaseDate, weightKg, ratePerKg, totalCost) plus the computed totals for that filtered set.
- **Errors**: None expected beyond generic infra failure. Not a Server Action (called directly from the Server Component, same pattern as 001's `listSuppliers`), but included here as the read contract this feature must satisfy.

## `getPurchase(id: string): Promise<PurchaseDetail | null>`

- **Input**: Purchase `id`.
- **Behavior**: Fetches the full document plus its joined supplier's current `companyName`/`status`, and the derived lock state (`remainingWeightKg < weightKg`) for the detail view (FR-007) and to drive whether edit/delete controls are shown.
- **Output**: Full purchase record with joined supplier info and derived `isLocked`, or `null` if not found.

## `listActiveSuppliersForSelect(): Promise<{ id: string; companyName: string }[]>`

- **Input**: None.
- **Behavior**: Thin wrapper over 001's existing `listSuppliers({ status: "active" })`, reused (not reimplemented) to populate the supplier dropdown on the create/edit form (FR-001).
- **Output**: Active suppliers' `id`/`companyName`, sorted by name (same ordering 001 already provides).
