# ADR-0003: Supabase Storage access via server-only client with signed URLs

> **Scope**: Documents how this project accesses Supabase Storage for any file it stores —
> not a decision specific to signature/stamp images alone.

- **Status:** Accepted
- **Date:** 2026-09-20
- **Feature:** 004-trade-names-and-document-settings (first user; establishes the pattern for
  006-customer-purchase-orders, 007-challans, 008-performa-invoicing, and any later feature
  that stores a file)
- **Context:** 004 introduces the project's first stored file: a signature image and a company
  stamp image per trade name, auto-inserted into every future generated Challan and Performa
  Invoice (`specs/PRODUCT-OVERVIEW.md` § "Trade Names & Document Settings"). The master spec's
  Cross-Cutting Technical Requirements section already flags that Supabase Storage, once set up
  here, will be reused by every later document-attachment need: PO PDFs (006), scanned signed
  Challans (007), and external GST invoice PDFs (008). How this first feature accesses Storage
  therefore sets the access pattern for all of them, the same way ADR-0001 set the access pattern
  for Postgres.

## Decision

Supabase Storage is accessed under the identical trust boundary ADR-0001 already established for
Postgres: **the browser never talks to Supabase directly**. Concretely:

- Every bucket is created **private** (`public = false`). No bucket in this project is ever made
  public.
- All uploads, replacements, and deletes go through the existing server-only Supabase admin client
  (`lib/supabase/admin.ts`, authenticated with the service-role key), called from a Server Action —
  never a client-side `supabase-js` call using the anon key.
- All reads exposed to the browser are **short-lived signed URLs**
  (`storage.from(bucket).createSignedUrl(path, expirySeconds)`), generated server-side at
  render/request time — never a stored public URL, and never the raw object path handed to the
  client.
- No Storage Row Level Security policies are written. The service-role key already bypasses
  Storage RLS exactly as it bypasses Postgres RLS, so — as with every Postgres table in this
  project — RLS stays enabled with no policies, and access control lives entirely in the Server
  Action layer that decides whether to call Storage at all.

004's specific application: one private bucket, `trade-name-assets`, holding per-trade-name
signature/stamp images at paths like `{trade_name_id}/signature-{timestamp}.{ext}`. See
[`specs/004-trade-names-and-document-settings/research.md`](../../specs/004-trade-names-and-document-settings/research.md)
for the upload/replace sequencing (upload new object, then update the DB pointer column, then
best-effort delete the old object).

## Consequences

### Positive

- Zero new trust model: a developer who already understands "the service-role key is the only
  thing that ever touches Supabase, and the browser only ever sees what a Server Action/Component
  chooses to hand it" for Postgres now applies the exact same mental model to files. No second
  credential class, no separate policy language to reason about.
- Signed URLs expire, so a copied/leaked link (from a browser history entry, a screenshot, a log
  line) stops working shortly afterward — directly satisfies 004's FR-010 (signature/stamp images
  must never be retrievable via a public or guessable URL) and will satisfy the equivalent
  requirement every later attachment feature is expected to have (a scanned signed Challan or a
  customer's GST invoice PDF is exactly as sensitive as a signature image, if not more).
- One established pattern now covers every future Storage consumer (006/007/008) — each of those
  features can reuse `lib/trade-names/storage.ts`'s shape (or a sibling module following the same
  three calls: upload, sign, delete) instead of re-deciding bucket visibility and access mode from
  scratch.

### Negative

- Every file read costs a server round-trip to mint a signed URL, rather than serving a static
  public asset URL directly from a CDN. At this project's scale (a single internal team, at most a
  few dozen trade names and a few hundred documents a year) this is not a measurable performance
  concern, but it is a real tradeoff that would need revisiting if this system ever served
  high-traffic public documents.
- Signed URLs must be regenerated on every render rather than cached long-term in the database or
  passed to a client component as a stable prop across navigations — the calling Server
  Component must always fetch a fresh one, a constraint every future feature's data-fetching code
  needs to remember.
- No Storage RLS policies means Storage access control is entirely the responsibility of
  application code (the same risk already accepted for Postgres under ADR-0001) — a bug in a
  Server Action's authorization check is now also a Storage exposure risk, not just a data
  exposure risk.

## Alternatives Considered

**A public bucket with plain public URLs** — Rejected outright. Directly violates 004's FR-010;
a signature or company stamp image is precisely the kind of asset whose public URL becoming
known would let someone forge a document, which is a materially worse failure mode than a leaked
read-only data row.

**Client-side direct-to-Storage upload using the Supabase anon key, gated by Storage RLS
policies** — Considered, since it's Supabase's documented pattern for browser uploads and would
save a server round-trip for the upload itself. Rejected: this project has deliberately kept
100% of Supabase access server-side since ADR-0001 specifically to keep one trust boundary instead
of two; introducing a second, client-facing credential and its own RLS policy surface for a
low-volume, staff-only upload (a handful of trade names, uploaded rarely; later, PO/Challan/GST
attachments at a few hundred documents a year) isn't justified by the round-trip it would save.

**Public bucket + obscure/unguessable path as the only protection ("security through
obscurity")** — Rejected. A path is not a secret once it appears in an HTML response, browser
history, or a server log; this doesn't meaningfully change the risk profile from a fully public
bucket and gives a false sense of protection.

## References

- Feature Spec: `specs/004-trade-names-and-document-settings/spec.md`
- Implementation Plan: `specs/004-trade-names-and-document-settings/plan.md`
- Research: `specs/004-trade-names-and-document-settings/research.md`
- Data Model: `specs/004-trade-names-and-document-settings/data-model.md`
- Related ADRs: [ADR-0001](0001-firebase-to-supabase-backend.md) (established the server-only
  trust boundary this ADR extends to Storage); [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md)
  (the sibling pattern for multi-table Postgres writes — this ADR is its Storage-side counterpart)
