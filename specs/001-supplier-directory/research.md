# Research: Supplier Directory

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06

Resolves all technical unknowns before design. Each decision follows the project's default stack (Next.js + Firestore + Firebase Auth on Vercel, per user direction), scoped to what FR-001–FR-015 and SC-001–SC-005 in [spec.md](./spec.md) actually require.

## Decision: Rendering & mutation pattern — Server Components + Server Actions (no separate REST API)

- **Decision**: Use Next.js Server Components for reads (supplier list/detail) and Server Actions for all writes (create, update, deactivate, reactivate). No public REST/GraphQL API is exposed.
- **Rationale**: This is a single internal app with one client (its own UI) — there's no second consumer that needs a stable wire contract. Server Actions colocate mutation logic with validation, keep the Firebase Admin SDK server-only (never shipped to the browser), and remove an entire layer of hand-written fetch/response plumbing.
- **Alternatives considered**: Next.js Route Handlers as a REST API consumed by client components — rejected as unnecessary indirection for a single-consumer internal tool; would only be justified if a mobile app or third party needed the same endpoints later.

## Decision: Firestore access via Admin SDK only (no client-side Firestore SDK)

- **Decision**: All Firestore reads/writes happen server-side (Server Components, Server Actions) using `firebase-admin`. The browser never talks to Firestore directly.
- **Rationale**: Centralizes authorization in one place (server-side session check) instead of duplicating it in Firestore Security Rules and app code. Simpler mental model for a small internal tool with one permission level (any authenticated staff member can do anything, per spec Assumptions).
- **Alternatives considered**: Client Firestore SDK with Security Rules enforcing auth — rejected for now since it doubles the places authorization logic lives; revisit if a future feature needs realtime listeners (e.g., live-updating PO status) that Server Actions can't provide.

## Decision: Authentication — Firebase Auth email/password with server-side session cookie

- **Decision**: Firebase Auth (email/password sign-in) issues an ID token on login; the app exchanges it for a Firebase session cookie (via Admin SDK `createSessionCookie`), set as an httpOnly cookie. Next.js middleware checks that cookie on every request to protected routes.
- **Rationale**: Session cookies work naturally with Server Components/Actions (readable server-side without extra client round-trips), unlike raw ID tokens which expire hourly and are awkward to attach to Server Component reads.
- **Alternatives considered**: Client-side-only Firebase Auth with ID token passed per-request — rejected because Server Components have no request object to attach a bearer token to; would force everything into Route Handlers instead.

## Decision: Name search — fetch-and-filter in the Server Component (no search index)

- **Decision**: FR-009 requires partial, case-insensitive company-name search. Firestore has no native substring search. At the scale committed to in SC-004 (500 suppliers, <2s), the list Server Component fetches all suppliers matching the status filter, then applies name/material filtering in-memory before rendering.
- **Rationale**: 500 small documents is trivial to fetch and filter server-side in well under the 2-second budget — no need for Algolia/Typesense/Elasticsearch, which would add a second system to keep in sync for a directory this size.
- **Alternatives considered**: Maintain a `companyNameLower` prefix field and use Firestore range queries (`>=`/`<`) — only supports prefix match, not arbitrary substring, so it wouldn't fully satisfy FR-009; rejected as solving a problem the scale doesn't have. Third-party search service — rejected as over-engineering for 500 records; revisit if Scale/Scope grows by an order of magnitude.

## Decision: Contacts stored as an embedded array on the Supplier document (not a subcollection)

- **Decision**: Each Supplier document embeds its `contacts` as an array of objects, not a separate Firestore subcollection.
- **Rationale**: Contacts are always read/written together with their supplier (per FR-004, FR-013), are few per supplier, and never queried independently across suppliers. Embedding avoids extra reads and keeps create/edit a single atomic document write.
- **Alternatives considered**: `suppliers/{id}/contacts/{contactId}` subcollection — rejected as unnecessary complexity (extra reads for every list/detail view, no independent query need).

## Decision: Soft delete via `status` field only

- **Decision**: Deactivation (FR-006, FR-008) sets `status: "inactive"` on the existing document. No documents are ever deleted by the app.
- **Rationale**: Directly matches spec Assumption ("deactivate is a soft status change, not deletion") and FR-008.
- **Alternatives considered**: Separate `archived` flag distinct from `status` — rejected as redundant; the spec only defines two states (active/inactive).

## Decision: Validation — Zod schemas shared between form and Server Action

- **Decision**: Define one Zod schema per entity (Supplier, Contact) in `lib/suppliers/schema.ts`, used both for client-side form validation (via `react-hook-form` resolver) and re-validated server-side inside each Server Action before writing to Firestore.
- **Rationale**: Firestore is schemaless, so FR-002/FR-013's required-field rules (company name, ≥1 material, ≥1 contact with phone or email) must be enforced in application code. Re-validating server-side closes the gap where a Server Action could theoretically be invoked without going through the form.
- **Alternatives considered**: Client-only validation — rejected as insufficient given Server Actions are directly callable.

## Decision: Testing stack — Vitest + Testing Library (unit/integration), no e2e for this feature

- **Decision**: Unit-test Zod schemas and Firestore service functions (with the Firebase Admin SDK mocked/emulated via the Firestore Emulator) using Vitest; integration-test Server Actions against the Firestore Emulator.
- **Rationale**: Matches the Next.js/TypeScript ecosystem default, runs fast without hitting real Firestore, and the Firestore Emulator gives realistic integration coverage without cloud costs during development.
- **Alternatives considered**: Playwright e2e for this feature — deferred; worth adding once there are enough features for a meaningful end-to-end flow (e.g., after Purchase Orders references Supplier).

## Decision: Duplicate-name detection — exact match on `companyNameLower`, non-blocking warning

- **Decision**: When a staff member enters/edits a company name, a Server Action queries `suppliers` for an exact `companyNameLower` match and returns any hits; the form shows a non-blocking warning ("A supplier named X already exists") without preventing submission.
- **Rationale**: Spec Edge Cases requires flagging potential duplicates on entry, and spec Assumptions explicitly says duplicates are "permitted (flagged, not blocked)". An exact-match query on the existing `companyNameLower` field (already indexed for the default list sort) needs no new index or fuzzy-matching infrastructure.
- **Alternatives considered**: Fuzzy/similarity matching (e.g., Levenshtein distance) — rejected as over-engineering; spec only asks for a flag, not deduplication, and exact-match on the normalized name catches the common case (re-entering the same supplier) with zero added infrastructure.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ |
| Primary Dependencies | Next.js 14+ (App Router), React 18+, `firebase-admin`, `firebase` (Auth client only), `zod`, `react-hook-form`, Tailwind CSS |
| Storage | Firestore (single `suppliers` collection) |
| Testing | Vitest, Testing Library, Firestore Emulator |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (web) |
| Performance Goals | Supplier list search/filter renders in <2s at 500 records (SC-004) |
| Constraints | No client-side Firestore access; server-only Admin SDK credentials |
| Scale/Scope | Single internal business, up to ~500 supplier records, no multi-tenancy |
