# ADR-0001: Backend swap — Firebase (Firestore + Auth) to Supabase (Postgres + Auth)

- **Status:** Accepted
- **Date:** 2026-09-16
- **Feature:** 001-supplier-directory, 002-raw-material-purchases (and all future modules per `specs/PRODUCT-OVERVIEW.md`)
- **Context:** 001 and 002 were built on Next.js + Firestore + Firebase Auth. Before starting 003-production-batches, the business owner reviewed the full module roadmap — Suppliers ↔ Raw Material Purchases ↔ Production Batches ↔ Labour Ledger ↔ Finished Goods ↔ Sales/Invoicing ↔ Profit Reports — and identified that nearly every future module is a **join** across entities already in the system (a production batch consumes a purchase lot and produces inventory; labour entries reference batches; sales consume inventory and reference customers; profit reports aggregate across purchases, batches, labour, and sales). Firestore's document model has no native joins or cross-collection transactions/constraints, which would force denormalization or fan-out reads for nearly every future query. A relational database was judged the better fit for the remaining roadmap, and the switch was made now (after only 2 of 8 modules) specifically to avoid compounding the mismatch across 6 more modules.

## Decision

Replace Firestore + Firebase Auth with Supabase (managed Postgres) + Supabase Auth for all current and future modules of this project.

- **Database**: Supabase Postgres (project `zsvdrskitwcmqbnaltgx`). Schema defined as versioned SQL migrations under `supabase/migrations/`.
- **Data access**: Server Actions / Server Components use `@supabase/supabase-js` with the **secret (service role) key**, server-only, mirroring the previous Firebase Admin SDK pattern — the browser never talks to Postgres directly, and this one server-side client bypasses Row Level Security the same way Admin SDK bypassed Firestore security rules.
- **Auth**: Supabase Auth, email/password, for the single internal staff team (no role hierarchy — matches the existing "Single internal team" assumption from 001/002). Session handled via `@supabase/ssr` cookie-based helpers in a server client, refreshed in `middleware.ts`.
- **Framework**: Next.js (App Router) is unchanged. Only the persistence/auth layer changes.
- **Packages**: remove `firebase`, `firebase-admin`; add `@supabase/supabase-js`, `@supabase/ssr`.
- **Schema shape**: proper relational schema — `suppliers`, `supplier_contacts` (1:N), `supplier_materials` (1:N tags), `raw_material_purchases` (FK to `suppliers`) — replacing Firestore's single-document-with-embedded-arrays shape. See `specs/001-supplier-directory/data-model.md` and `specs/002-raw-material-purchases/data-model.md` for the full column-level design.
- Business rules and API-level TypeScript shapes (`Supplier`, `Address`, `Contact`, `Purchase`) are preserved as-is wherever possible; only the storage/query layer changes, to keep this a backend swap rather than a requirements change.

## Consequences

### Positive

- Foreign keys and `JOIN`s replace Firestore's live-join-in-application-code pattern (`getSupplier` called per purchase row) with a single SQL query — simpler and correct-by-construction as the roadmap adds more cross-references (batches → purchases, labour → batches, sales → inventory).
- Real transactions become available for future features that must update multiple rows atomically (e.g. a production batch decrementing `raw_material_purchases.remaining_weight_kg` while inserting a batch row — a correctness requirement flagged as a future ADR candidate in 002's plan.md).
- Case-insensitive/substring search (`ILIKE`), aggregate totals (`SUM`), and multi-column filters become native SQL instead of in-memory post-filtering — removes the "fetch active set, filter in-memory" pattern 001/002 needed to work around Firestore's query limits.
- One fewer bespoke composite-index file to maintain (`firestore.indexes.json` required manual correction once already, per 002's data-model.md); Postgres indexes are ordinary DDL reviewed like any other schema change.

### Negative

- Loses Firestore's schemaless flexibility — every new field is now a migration, not a bare write.
- Introduces SQL migration discipline (must run migrations against the live Supabase project before each deploy) where Firestore had none.
- Re-work cost: two already-implemented, already-tested features (001, 002) must be rebuilt on the new stack before any new module (003+) can start.
- Supabase service-role key is a single very-high-privilege credential (bypasses Row Level Security entirely) — must never reach the client bundle; same risk class as the Firebase Admin credentials it replaces, not a new one, but worth naming.

## Alternatives Considered

**Stay on Firestore, denormalize aggressively for future joins** — Rejected. Every future module (003–008) is inherently relational (batch→purchase, labour→batch, sale→inventory→batch, profit report joining all four); denormalizing across 6 more modules would mean maintaining consistency by hand (no FK constraints, no transactions across collections without the more limited Firestore transaction API) and duplicating join logic in every service file, as already started in 002's `getSupplier`-per-purchase-row pattern.

**Firebase + a separate relational DB for reporting only** — Rejected. Running two databases (Firestore for OLTP writes, Postgres for cross-entity reads/reports) doubles operational surface and requires a sync pipeline for an 8-module internal tool with a single small team; not justified at this scale.

**Supabase Postgres + Supabase Auth (chosen)** — One managed relational database, native to the Vercel/Next.js deployment target, with built-in email/password auth matching the existing single-team model. Chosen for fitting the remaining roadmap's relational shape without adding a second system.

## References

- Feature Spec: `specs/001-supplier-directory/spec.md`, `specs/002-raw-material-purchases/spec.md`
- Implementation Plan: `specs/001-supplier-directory/plan.md`, `specs/002-raw-material-purchases/plan.md`
- Related ADRs: none prior (first ADR in this project)
- Product roadmap: `specs/PRODUCT-OVERVIEW.md`
