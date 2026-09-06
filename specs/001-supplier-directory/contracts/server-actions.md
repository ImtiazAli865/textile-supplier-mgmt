# Contracts: Supplier Directory Server Actions

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06

Per [research.md](../research.md), this feature has no public REST/GraphQL API — it's a single internal app using Next.js Server Actions for mutations and Server Components for reads. These are the function-level contracts each Server Action must satisfy, standing in for an OpenAPI spec.

All actions:
- Require an authenticated session (valid Firebase session cookie); throw `UnauthenticatedError` otherwise (FR-014).
- Re-validate input server-side with the shared Zod schema regardless of client-side validation (see research.md).

## `createSupplier(input: SupplierInput): Promise<{ id: string }>`

- **Input**: `SupplierInput` — `companyName`, `address`, `materials` (≥1), `paymentTerms`, `contacts` (≥1, each with name + phone-or-email), optional `notes`, optional `rating` (1–5).
- **Behavior**: Validates input (FR-002). Sets `status: "active"`, `companyNameLower`, `createdAt`/`updatedAt`/`createdBy`/`updatedBy`. Writes new document to `suppliers`.
- **Output**: New document ID.
- **Errors**: `ValidationError` (missing company name / no material / no valid contact) → surfaced as field-level form errors (FR-002, spec Edge Cases).

## `updateSupplier(id: string, input: SupplierInput): Promise<void>`

- **Input**: Existing supplier `id`, full `SupplierInput` (same shape as create).
- **Behavior**: Validates input, re-derives `companyNameLower`, updates `updatedAt`/`updatedBy`. Does not change `status` (FR-005).
- **Errors**: `ValidationError` (same as create); `NotFoundError` if `id` doesn't exist.

## `setSupplierStatus(id: string, status: "active" | "inactive"): Promise<void>`

- **Input**: Supplier `id`, target status.
- **Behavior**: Sets `status`, updates `updatedAt`/`updatedBy`. No-op (still succeeds) if the supplier is already in the requested status (spec Edge Cases). Implements both deactivate (FR-006) and reactivate (FR-007) — direction is just the `status` argument.
- **Errors**: `NotFoundError` if `id` doesn't exist.

## `listSuppliers(filters: { status?: "active" | "inactive"; material?: string; search?: string }): Promise<Supplier[]>`

- **Input**: Optional status filter (defaults to `"active"` per FR-011), optional material filter, optional free-text search string.
- **Behavior**: Queries Firestore by `status` (+ `materials array-contains` if `material` given), then applies case-insensitive substring match on `companyName` in-memory if `search` given (FR-009, FR-010; see research.md for why search is in-memory).
- **Output**: Array of Supplier records (list-view shape: id, companyName, materials, status — full detail not required for the list).
- **Errors**: None expected beyond generic infra failure.

## `getSupplier(id: string): Promise<Supplier | null>`

- **Input**: Supplier `id`.
- **Behavior**: Fetches full document for detail view (FR-004).
- **Output**: Full Supplier record or `null` if not found.
