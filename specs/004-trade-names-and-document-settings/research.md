# Research: Trade Names & Document Settings

**Feature**: `004-trade-names-and-document-settings` | **Date**: 2026-09-20

Resolves technical unknowns before design. Infrastructure decisions already made in 001-003b
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server) carry over unchanged and are not re-litigated here. Only
decisions specific to trade names and — new to this feature — file storage are recorded below.

## Decision: Supabase Storage is accessed exclusively server-side, through a private bucket, with signed URLs for reads

- **Decision**: A single private Storage bucket (`trade-name-assets`) holds signature/stamp
  images. All uploads and deletes go through the existing server-only Supabase admin client
  (`lib/supabase/admin.ts`, the service-role key, already bypassing RLS for Postgres). Reads are
  never a stored public URL — the server generates a short-lived signed URL
  (`storage.from(...).createSignedUrl(path, expirySeconds)`) at render time, each time a trade
  name's detail page is requested.
- **Rationale**: FR-010 requires that signature/stamp images never be retrievable via a publicly
  guessable or world-readable URL — these images exist specifically so they can be stamped onto
  official business documents, so a leaked or guessed URL is a forgery risk, not just a privacy
  nicety. Routing Storage through the same server-only trust boundary ADR-0001 already established
  for Postgres (the browser never talks to Supabase directly) means this feature introduces zero
  new trust model, just a second kind of object the existing boundary protects.
- **Alternatives considered**: A public bucket with plain public URLs — rejected outright, directly
  violates FR-010. Client-side direct-to-Storage upload from the browser (using the Supabase anon
  key, gated by Storage RLS policies) — rejected: this project has deliberately kept 100% of
  Supabase access server-side since ADR-0001, and introducing a second, client-facing credential
  plus its own RLS policy surface for a low-volume, staff-only upload (at most a handful of trade
  names, uploaded rarely) isn't justified when a normal `multipart/form-data` Server Action upload
  works fine at this scale.

## Decision: Signature/stamp uploads are "upload object, then update pointer column, then best-effort delete the old object" — not wrapped in ADR-0002's atomicity pattern

- **Decision**: Uploading or replacing a trade name's signature/stamp is three sequential steps:
  (1) upload the new file to the bucket at a fresh path (`{tradeNameId}/signature-{timestamp}.
  {ext}` or `.../stamp-{timestamp}.{ext}`); (2) update `trade_names.signature_image_path` (or
  `stamp_image_path`) to that new path; (3) if step 2 succeeds and a previous path existed, delete
  the old object from Storage (best-effort — a failure here is logged, not surfaced as an error).
- **Rationale**: Supabase Storage objects live outside Postgres' transaction boundary, so there is
  no way to make "write bytes to Storage" and "update a `trade_names` row" atomic the way
  ADR-0002's Postgres functions make two Postgres tables atomic. Ordering the steps this way means
  the only possible failure mode is a harmless orphaned object in Storage with nothing referencing
  it (step 1 succeeds, step 2 fails) — never a DB row pointing at a file that doesn't exist. That
  asymmetry is deliberate: an orphaned file costs nothing at this project's scale (a handful of
  trade names, replaced rarely); a dangling reference would break document generation later.
- **Alternatives considered**: Delete-old-then-upload-new — rejected, it produces the opposite (and
  worse) failure mode: a window where the row still points at a file that's already gone. A
  Postgres function that also manipulates Supabase's internal `storage.objects` table directly via
  SQL — rejected as needless complexity; Storage is designed to be driven through its client SDK
  (which also manages the underlying object bytes, not just the metadata row), not raw SQL against
  its internal schema.

## Decision: `trade_names` is a plain single table with ordinary `supabase-js` CRUD — no Postgres RPC function

- **Decision**: Unlike 001's `create_supplier`/`update_supplier` or 003b's
  `record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase`, trade name writes go
  directly through `supabase-js` `.insert()`/`.update()` calls from `lib/trade-names/service.ts` —
  the same pattern 002/003 already use for their own single-table writes.
- **Rationale**: ADR-0002's atomic-multi-table-write pattern exists specifically for one business
  action that must change rows in more than one table together (a parent + its child rows, or a
  row + another table's derived aggregate). A trade name has no child tables and no cross-table
  derived state to keep in sync — its signature/stamp path columns live on the same row being
  written, and its two document-number counters are plain columns on that same row too. Reaching
  for an RPC function here would be exactly the unjustified indirection ADR-0002 itself warns
  against for the single-table case.
- **Alternatives considered**: None seriously considered — this follows directly from ADR-0002's
  own stated boundary between single-table and multi-table writes.

## Decision: `next_challan_number` / `next_invoice_number` are plain integer columns, not a satellite sequences table

- **Decision**: Two `integer` columns on `trade_names` (`next_challan_number`,
  `next_invoice_number`), each defaulting to `1`, hold the next number a future feature will use
  when it issues a document under that trade name. This feature only lets staff view and manually
  override the value — it does not increment on issue, does not apply the `CH #001/Sep`
  month-suffix print format, and does not implement any reset behavior. That logic belongs to the
  Challans (007) and Performa Invoicing (008) features, which are the actual writers/consumers of
  these counters.
- **Rationale**: Exactly two counters exist per trade name today, both fixed for the life of this
  feature's scope (per spec Assumptions). A separate `document_number_sequences` table keyed by
  `(trade_name_id, document_type)` would only pay for itself if the set of countable document
  types were expected to grow or needed independent querying/auditing — neither applies here.
- **Alternatives considered**: A `document_number_sequences` child table — rejected as premature
  generalization for two known, fixed counters. Deferring the columns entirely to 007/008 (adding
  them only when a real writer exists, mirroring how `inventory_movements`/`ledger_entries` were
  deliberately introduced at their first-writer feature per `specs/PRODUCT-OVERVIEW.md` § "Module
  Roadmap") — rejected because the spec explicitly asks this feature to expose them as an
  overridable setting *now*, for migration-cutover purposes (spec User Story 3), independent of
  when a consuming feature is built.

## Decision: `printed_address` is one free-text field, not Suppliers' structured line1/city/state/postal/country shape

- **Decision**: `trade_names.printed_address` is a single `text` column, allowing embedded
  newlines, rather than the six-column structured address `suppliers` uses.
- **Rationale**: A trade name's address exists purely to be printed verbatim on a letterhead — no
  functional requirement in this feature filters, searches, or reports on it by city/state/country
  the way a structured shape would earn its keep. Suppliers' structured columns are justified by a
  fixed, non-repeating shape that's still just displayed as a whole in practice (per 001's own
  data-model.md), but introducing that same structure here would add six columns and a
  line1/line2/city/state/postal/country form to maintain for a field this feature never
  decomposes.
- **Alternatives considered**: Reusing Suppliers' structured `Address` shape — rejected: it lives
  in `lib/suppliers/schema.ts`, and importing a supplier-domain type into the trade-names module
  for an unrelated entity would be a cross-module coupling with no corresponding benefit, since
  nothing here needs the structure.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001/002/003/003b) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Supabase Postgres — new `trade_names` table; Supabase Storage — new private `trade-name-assets` bucket (first use of Storage in this project) |
| Testing | Vitest + Testing Library (same intended stack as 001/002/003/003b; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds one module, no new service) |
| Performance Goals | Trade name list renders instantly at the expected scale (a handful of records); no search/pagination budget needed |
| Constraints | No client-side Postgres or Storage access (service-role key only, server-side); uploaded images must never be publicly retrievable; only standard image types and a bounded file size accepted |
| Scale/Scope | Single internal business, a handful of trade names (five today, no hard cap), no multi-tenancy |
