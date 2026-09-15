# Contracts: Supplier Directory Server Actions

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06 | **Revised**: 2026-09-16 (Supabase Auth, see [ADR-0001](../../../history/adr/0001-firebase-to-supabase-backend.md))

This feature has no public REST/GraphQL API — it's a single internal app using Next.js Server Actions for mutations and Server Components for reads. These are the function-level contracts each Server Action must satisfy, standing in for an OpenAPI spec.

All actions:
- Require an authenticated session (valid Supabase Auth session, verified via `supabase.auth.getUser()`); throw `UnauthenticatedError` otherwise (FR-014).
- Re-validate input server-side with the shared Zod schema regardless of client-side validation.

## `createSupplier(input: SupplierInput): Promise<{ id: string }>`

- **Input**: `SupplierInput` — `companyName`, `address`, `materials` (≥1), `paymentTerms`, `contacts` (≥1, each with name + phone-or-email), optional `notes`, optional `rating` (1–5).
- **Behavior**: Validates input (FR-002). Inserts a `suppliers` row (`status: "active"`, `created_at`/`updated_at`/`created_by`/`updated_by`) plus its `supplier_contacts` and `supplier_materials` rows, in one transaction.
- **Output**: New supplier row ID.
- **Errors**: `ValidationError` (missing company name / no material / no valid contact) → surfaced as field-level form errors (FR-002, spec Edge Cases).

## `updateSupplier(id: string, input: SupplierInput): Promise<void>`

- **Input**: Existing supplier `id`, full `SupplierInput` (same shape as create).
- **Behavior**: Validates input, updates the `suppliers` row and replaces its `supplier_contacts`/`supplier_materials` rows, in one transaction, updates `updated_at`/`updated_by`. Does not change `status` (FR-005).
- **Errors**: `ValidationError` (same as create); `NotFoundError` if `id` doesn't exist.

## `setSupplierStatus(id: string, status: "active" | "inactive"): Promise<void>`

- **Input**: Supplier `id`, target status.
- **Behavior**: Sets `status`, updates `updatedAt`/`updatedBy`. No-op (still succeeds) if the supplier is already in the requested status (spec Edge Cases). Implements both deactivate (FR-006) and reactivate (FR-007) — direction is just the `status` argument.
- **Errors**: `NotFoundError` if `id` doesn't exist.

## `listSuppliers(filters: { status?: "active" | "inactive"; material?: string; search?: string }): Promise<Supplier[]>`

- **Input**: Optional status filter (defaults to `"active"` per FR-011), optional material filter, optional free-text search string.
- **Behavior**: Queries `suppliers` joined to `supplier_materials`, filtered by `status` (+ `material` exact match if given) and `company_name ILIKE '%search%'` if `search` given — all native SQL (FR-009, FR-010).
- **Output**: Array of Supplier records (list-view shape: id, companyName, materials, status — full detail not required for the list).
- **Errors**: None expected beyond generic infra failure.

## `getSupplier(id: string): Promise<Supplier | null>`

- **Input**: Supplier `id`.
- **Behavior**: Fetches the `suppliers` row joined to its `supplier_contacts`/`supplier_materials` rows for detail view (FR-004).
- **Output**: Full Supplier record or `null` if not found.

## `checkDuplicateSupplierName(companyName: string): Promise<{ id: string; companyName: string }[]>`

- **Input**: Company name as currently typed in the create/edit form.
- **Behavior**: Queries `suppliers` for rows where `lower(company_name)` exactly equals the lowercased input. Never blocks or throws on a match — purely informational.
- **Output**: Zero or more `{ id, companyName }` matches, for the form to render as a non-blocking warning (spec Edge Cases).
- **Errors**: None expected beyond generic infra failure.
