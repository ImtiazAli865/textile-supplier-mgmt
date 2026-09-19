# Research: Product Catalog

**Feature**: `003-product-catalog` | **Date**: 2026-09-20

Resolves technical unknowns before design. This feature extends the existing app from
001-supplier-directory and 002-raw-material-purchases, so all infrastructure decisions (Server
Components/Actions, Supabase-admin-only Postgres access, session-cookie auth via
`@supabase/ssr`, Zod validation shared client/server, `ILIKE` substring search) already carry
over unchanged — see [002's research.md](../002-raw-material-purchases/research.md). Only
decisions specific to the product catalog are recorded here.

## Decision: One `products` table with nullable type-conditional columns, not per-type tables

- **Decision**: A single `products` table holds both `traded` and `manufactured` products. The
  two manufactured-only columns (`expected_yield_per_kg`, `default_labour_rate_per_packet`) and
  the one traded-only column (`current_purchase_cost`) are nullable, with a `CHECK` constraint
  requiring the manufactured pair to be non-null exactly when `type = 'manufactured'` and
  forbidding it otherwise (FR-002, FR-003).
- **Rationale**: There are exactly two mutually exclusive types with a small, fixed set of
  type-specific columns, and every later feature (POs, challans, batches, inventory) needs to
  list/search/filter both types together in one view (FR-005, FR-010, FR-011). A single table
  avoids a join for what is conceptually one entity; the smallest viable diff.
- **Alternatives considered**: Separate `traded_products`/`manufactured_products` tables with a
  shared `products` parent — rejected, adds a join to every catalog list/search query for a
  distinction that's just three extra nullable columns. A single table with a JSONB
  "attributes" column for type-specific fields — rejected, loses column-level types and
  `CHECK`/numeric constraints for no benefit given the field set is small and fixed.

## Decision: Type immutability enforced in the service layer, not a database trigger

- **Decision**: `updateProductRecord` (the only code path that can modify an existing product)
  never accepts or writes a `type` value — the update `UPDATE` statement's column list simply
  excludes `type`. No `BEFORE UPDATE` trigger is added.
- **Rationale**: Matches 002's convention of enforcing time-/business-state-dependent rules
  (there, the consumption lock; here, type immutability) in the service layer rather than as a
  DB constraint, since the Supabase service-role key is the only writer to this table (no
  client-side Postgres access, per Constraints) — a trigger would be defense against a write
  path that doesn't exist.
- **Alternatives considered**: A `BEFORE UPDATE` trigger raising an exception if `NEW.type IS
  DISTINCT FROM OLD.type` — rejected as redundant belt-and-suspenders for a single-writer
  system; would be reconsidered if a second write path (e.g. a bulk-import script) is ever
  added outside the Server Actions.

## Decision: Weighted-average purchase cost is a nullable column with no write path in this feature

- **Decision**: `current_purchase_cost` is a nullable `numeric(10,2)` column on `products`,
  written by neither `createProductRecord` nor `updateProductRecord` in this feature. It starts
  and stays `NULL` for every product created here.
- **Rationale**: The traded-goods purchasing feature that will maintain this value (extending
  002, per `specs/PRODUCT-OVERVIEW.md`'s roadmap) doesn't exist yet — there is no data source to
  compute a weighted average from. Adding the column now (rather than in that later feature)
  means the later feature only needs an `UPDATE`, not a migration that also has to backfill
  every existing product row.
- **Alternatives considered**: Omitting the column entirely until the purchasing feature ships
  — rejected because FR-003 requires this feature to *display* the value (as "not yet
  established") on the traded-product detail view, which needs the column to exist and read as
  `NULL` now.

## Decision: Yield ratio stored as a single average figure, not a min–max range

- **Decision**: `expected_yield_per_kg` is a single `numeric(6,2)` (packets per kg), not two
  columns for a range.
- **Rationale**: Per spec Assumptions, this figure is planning/variance-only — it pre-fills a
  suggested packet count on a future production batch and is never authoritative over an actual
  entered figure. A single number is sufficient for a suggestion and simpler to validate
  (`> 0`) and display than a range.
- **Alternatives considered**: `yield_min`/`yield_max` columns — rejected as unneeded precision
  for a figure whose only consumer is a future "suggested quantity" pre-fill, not a stored
  calculation.

## Decision: Internal product code is a plain nullable text column, no uniqueness constraint

- **Decision**: `internal_code` is `text`, nullable, with no unique index.
- **Rationale**: Per spec Assumptions it's an informal, business-only reference field, not a
  system lookup key (unlike the deferred customer-specific item codes, which will need
  uniqueness *per customer* once that mapping exists in a later feature). Enforcing uniqueness
  now would impose a constraint the spec doesn't require and that a real-world business (branch
  variants, legacy codes) may not always satisfy.
- **Alternatives considered**: Unique index on `internal_code` — rejected, no requirement
  drives it, and 001's supplier `company_name` sets the precedent that duplicate informal names
  are allowed, not blocked.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001/002) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Supabase Postgres — new `products` table, no foreign keys in or out |
| Testing | Vitest + Testing Library (same intended stack as 001/002; not yet wired into `package.json` — no test tasks scaffolded here either) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (extends 001/002, no new service) |
| Performance Goals | Catalog search/filter renders in <2s at 500 products (SC-003) |
| Constraints | No client-side Postgres access (service-role key only, per 001/002); type immutable after creation, enforced server-side (FR-004); traded purchase cost has no write path in this feature |
| Scale/Scope | Single internal business, up to ~500 product records for now, no multi-tenancy |
