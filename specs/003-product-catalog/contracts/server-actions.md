# Contracts: Product Catalog Server Actions

**Feature**: `003-product-catalog` | **Date**: 2026-09-20

Extends 001/002's pattern: no public REST/GraphQL API — Server Actions for mutations, Server
Components (via direct service calls) for reads.

All actions:
- Require an authenticated session (valid Supabase Auth session, verified via
  `supabase.auth.getUser()`); throw `UnauthenticatedError` otherwise (FR-014).
- Re-validate input server-side with the shared Zod schema regardless of client-side
  validation, including the type-conditional branching (manufactured requires yield ratio +
  labour rate; traded forbids both).
- Never accept `currentPurchaseCost` as writable input from any action — it has no write path
  in this feature at all (FR-003; see research.md).

## `createProduct(input: ProductInput): Promise<{ id: string }>`

- **Input**: `ProductInput` — `name`, `internalCode?`, `type` (`'traded' | 'manufactured'`),
  `stockUom`, `defaultSellingPrice` (> 0), and, only when `type === 'manufactured'`:
  `expectedYieldPerKg` (> 0) and `defaultLabourRatePerPacket` (> 0).
- **Behavior**: Validates input (FR-001, FR-002) — the Zod schema is a discriminated union on
  `type` so a `traded` submission that includes the manufactured-only fields, or a
  `manufactured` submission missing either of them, fails validation before reaching the
  database. Sets `status = 'active'`, `created_at`/`updated_at`/`created_by`/`updated_by`.
  Inserts a new row into `products`.
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field, including a type/field mismatch) →
  field-level form errors.

## `updateProduct(id: string, input: ProductUpdateInput): Promise<void>`

- **Input**: Existing product `id`, `ProductUpdateInput` — same shape as `ProductInput` **minus
  `type`** (FR-004: type is immutable and is not an accepted field on this action at all, not
  even as a no-op passthrough).
- **Behavior**: Loads the existing row's `type` server-side and validates the incoming
  manufactured-only fields against *that* type (a `traded` product's update can never smuggle in
  a yield ratio, and vice versa). Updates the row (FR-007), touches `updated_at`/`updated_by`.
- **Errors**: `ValidationError` (same shape as create); `NotFoundError` if `id` doesn't exist.

## `setProductStatus(id: string, status: 'active' | 'inactive'): Promise<void>`

- **Input**: Existing product `id`, target `status`.
- **Behavior**: Updates only the `status` column (FR-008). Setting a product to its current
  status is a no-op that still succeeds (spec Edge Cases — no error on redundant
  deactivate/reactivate).
- **Errors**: `NotFoundError` if `id` doesn't exist.

## `listProducts(filters: { search?: string; type?: 'traded' | 'manufactured'; status?: 'active' | 'inactive' }): Promise<{ products: ProductListItem[] }>`

- **Input**: Optional case-insensitive `search` (matched against `name` and `internal_code`),
  optional `type` filter, optional `status` filter (defaults to `'active'` when omitted, per
  FR-012).
- **Behavior**: Queries `products` with the combined filters (FR-010, FR-011), sorted by `name`
  ascending. Not a Server Action (called directly from the Server Component, same pattern as
  001's `listSuppliers`/002's `listPurchases`), but included here as the read contract this
  feature must satisfy.
- **Output**: List-view shape per product: `id`, `name`, `internalCode`, `type`, `stockUom`,
  `defaultSellingPrice`, `status`.

## `getProduct(id: string): Promise<ProductDetail | null>`

- **Input**: Product `id`.
- **Behavior**: Fetches the full row for the detail view (FR-006), including the type-specific
  fields relevant to that product's `type` only (the caller/UI omits manufactured-only fields
  entirely for a traded product and vice versa, rather than showing them as blank).
- **Output**: Full product record, or `null` if not found.
