# Contracts: Trade Names & Document Settings Server Actions

**Feature**: `004-trade-names-and-document-settings` | **Date**: 2026-09-20

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001/002/003/003b.

All actions:
- Require an authenticated session (valid Supabase Auth session, verified via
  `requireCurrentUser()`, the same helper 001/002/003/003b use); throw `UnauthenticatedError`
  otherwise (FR-014).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.
- Reject any attempt to write `signatureImagePath`/`stampImagePath` directly from client input —
  those are only ever set by the dedicated upload actions below, never accepted as plain form
  fields on create/update.

## `createTradeName(input: TradeNameInput): Promise<{ id: string }>`

- **Input**: `printedName`, `printedAddress`, `ntnNumber?`, `salesTaxRegistrationNumber?`,
  `nextChallanNumber` (positive integer, defaults to `1`), `nextInvoiceNumber` (positive integer,
  defaults to `1`).
- **Behavior**: Validates `printedName`/`printedAddress` are non-empty (FR-002) and both number
  fields are positive integers, then inserts directly into `trade_names` with `status: 'active'`
  (plain `supabase-js` `.insert()` — no RPC, see data-model.md/research.md).
- **Output**: New row ID.
- **Errors**: `ValidationError` (missing/invalid field) → field-level form errors.

## `updateTradeName(id: string, input: TradeNameInput): Promise<void>`

- **Input**: Existing trade name `id`, full `TradeNameInput` (same shape as create, including the
  two number fields — this is how a staff member overrides them per User Story 3).
- **Behavior**: Re-validates the same rules as create, then `.update()`s the row.
  `signatureImagePath`/`stampImagePath` and `status` are never touched by this action (status is
  changed only by `setTradeNameStatus`; images only by the upload actions below) (FR-005, FR-011,
  FR-012).
- **Errors**: `ValidationError`; `NotFoundError`.

## `setTradeNameStatus(id: string, status: 'active' | 'inactive'): Promise<void>`

- **Input**: Trade name `id`, target status.
- **Behavior**: Unconditional set — a safe no-op when the trade name is already in the target
  status (spec Edge Cases), exactly mirroring `setSupplierStatusRecord`. Never touches any other
  column (FR-006, FR-007).
- **Errors**: `NotFoundError`.

## `uploadTradeNameSignature(id: string, file: File): Promise<{ path: string }>`

## `uploadTradeNameStamp(id: string, file: File): Promise<{ path: string }>`

- **Input**: Trade name `id`, an image `File` (sent as `multipart/form-data` from the client
  component, per Next.js Server Action file-upload convention — the browser never talks to
  Supabase Storage directly, per research.md).
- **Behavior**: Validates content type (`image/png` or `image/jpeg`) and size (≤ 5 MB) server-side
  before anything is uploaded (FR-009); rejects with `ValidationError` and leaves the trade name's
  existing image (if any) completely unchanged on failure (spec Edge Cases). On success: uploads
  to `trade-name-assets/{id}/signature-{timestamp}.{ext}` (or `stamp-{timestamp}.{ext}`), updates
  `trade_names.signature_image_path` (or `stamp_image_path`) to the new path, then best-effort
  deletes the previous object at the old path if one existed (see research.md's three-step
  ordering and its rationale).
- **Output**: The new object's Storage path (used by the calling Server Component to build a
  fresh signed URL on next render — the action itself does not return a signed URL, since those
  are short-lived and meant to be generated at render/read time, not cached from a write).
- **Errors**: `ValidationError` (wrong file type or too large); `NotFoundError` (unknown trade name
  id).

## `listTradeNames(filters: { status?: 'active' | 'inactive' }): Promise<TradeNameListItem[]>`

- **Input**: Optional `status` filter, defaulting to `'active'` (FR-003), matching
  `listSuppliers`'s default-to-active convention.
- **Behavior**: Plain `select` from `trade_names`, ordered by `printed_name`.
- **Output**: `{ id, printedName, status }[]` — the minimum needed for a list view (FR-003). Not a
  Server Action (called directly from the Server Component, same pattern as `listSuppliers`).
- **Errors**: None expected beyond generic infra failure.

## `getTradeName(id: string): Promise<TradeNameDetail | null>`

- **Input**: Trade name `id`.
- **Behavior**: Fetches the full row (FR-004). If `signature_image_path`/`stamp_image_path` are
  set, also generates a signed URL for each (short expiry, e.g. 5 minutes — long enough to render
  one detail-page view, short enough that a copied link stops working shortly after) via
  `lib/trade-names/storage.ts`'s `getSignedAssetUrl`.
- **Output**: Full trade name record plus `signatureImageUrl`/`stampImageUrl` (signed, nullable)
  ready for direct use in an `<img>` tag, or `null` if not found.
- **Errors**: None expected beyond generic infra failure. Not a Server Action (called directly
  from the Server Component).
