# Research: Traded-Goods Purchasing

**Feature**: `003b-traded-goods-purchasing` | **Date**: 2026-09-20

Resolves technical unknowns before design. This feature extends 002-raw-material-purchases and
003-product-catalog, so all infrastructure decisions (Server Components/Actions,
Supabase-admin-only Postgres access, session-cookie auth, Zod validation shared client/server,
`ILIKE` substring search) already carry over unchanged — see
[002's research.md](../002-raw-material-purchases/research.md) and
[003's research.md](../003-product-catalog/research.md). Only decisions specific to unit-mode
purchases are recorded here.

## Decision: Unit-mode purchase writes go through Postgres functions, not sequential client calls

- **Decision**: Creating, editing, or deleting a unit-mode purchase calls a single Postgres
  function (`record_unit_purchase`, `update_unit_purchase`, `delete_unit_purchase`) that writes
  the purchase row and recalculates the referenced product's `current_purchase_cost` and
  `quantity_on_hand` in one transaction. The Server Action/service layer never does "write the
  purchase, then separately update the product" as two `supabase-js` calls.
- **Rationale**: FR-004/FR-005 require the product's cost and quantity to always reflect exactly
  the purchases that exist — if the second of two sequential calls failed (network blip, a
  constraint violation, the process being killed), the purchase and the product would go out of
  sync with no way to detect it short of a manual reconciliation. A single Postgres function
  makes that inconsistency structurally impossible. This is also literally the pattern 001
  already uses for its own multi-table writes (`create_supplier`/`update_supplier` writing
  `suppliers` + `supplier_contacts` + `supplier_materials` together) — not a new convention,
  just the first time 002/003's code needs it.
- **Alternatives considered**: Two sequential `supabase-js` calls with manual rollback logic on
  failure — rejected, reinventing transaction semantics in application code that Postgres
  already provides for free. A Supabase Edge Function — rejected, unnecessary indirection for
  logic that's naturally expressed as SQL operating on two tables already in the same database.

## Decision: Weighted-average cost and quantity-on-hand are recomputed from scratch, not incrementally patched

- **Decision**: Every unit-mode write (create/edit/delete) recomputes the product's
  `current_purchase_cost` and `quantity_on_hand` by re-aggregating **all** of that product's
  current unit-mode purchase rows (`SUM(quantity_units * rate_per_unit) / SUM(quantity_units)`
  for cost, `SUM(quantity_units)` for quantity), rather than adding/subtracting a delta from the
  product's existing stored values.
- **Rationale**: A full recompute can never drift from the true state no matter how many edits
  or deletes happen, and at this business's scale (a handful of purchases per product) the
  re-aggregation is trivial. An incremental patch (`current_purchase_cost = (old_cost *
  old_qty + new_amount) / new_total_qty`, then reverse it on delete/edit) is exactly the kind of
  stateful arithmetic that silently drifts after a few edits — a bug class this project has
  deliberately avoided everywhere else (e.g. 002's `remaining_weight_kg` reset, not
  incrementally adjusted, on every edit).
- **Alternatives considered**: Incremental delta updates — rejected for the drift risk above.
  A database trigger that recomputes on every `INSERT`/`UPDATE`/`DELETE` to
  `raw_material_purchases` — considered and functionally equivalent, but rejected in favor of
  doing the recompute explicitly inside the same three Postgres functions above, so the whole
  write is visible in one place rather than split between an RPC call and a trigger a future
  reader has to know to look for.

## Decision: `raw_material_purchases` is extended in place, not replaced or split

- **Decision**: `weight_kg`, `rate_per_kg`, and `remaining_weight_kg` become nullable. A new
  `purchase_mode` column (`'weight' | 'unit'`) plus `product_id`, `quantity_units`,
  `rate_per_unit`, and `remaining_units` are added. A table-level `CHECK` constraint enforces
  that exactly the right set of columns is non-null for each mode (mirroring 003's
  `products_type_fields_check` pattern). The existing generated `total_cost` column must be
  dropped and re-added with a mode-conditional expression, since Postgres does not support
  altering a generated column's expression in place.
- **Rationale**: This is the schema-level execution of the decision already recorded in
  `specs/PRODUCT-OVERVIEW.md` §14.1 — one purchase log, not two. Reusing the same table (rather
  than a `traded_purchases` sibling table) means the unified list (FR-007) is a single query
  with an `ORDER BY purchase_date`, not a `UNION` of two tables that would need to be kept in
  sync for every future filter/sort feature.
- **Alternatives considered**: A separate `traded_purchases` table — rejected, it would force
  every "show me all purchases" query (the list, totals, future reports) to `UNION` two tables
  forever. A single table with a JSONB "details" column for mode-specific fields — rejected,
  same reasoning 003 used for products: loses column-level types and `CHECK` constraints for a
  small, fixed field set that doesn't need that flexibility.

## Decision: The traded-product picker reuses 003's existing `listProducts` filter, not a new query

- **Decision**: `listActiveTradedProductsForSelect()` in `lib/products/service.ts` is a thin
  wrapper over the existing `listProducts({ type: "traded", status: "active" })`, exactly the
  way 002's `listActiveSuppliersForSelect()` already wraps `listSuppliers({ status: "active" })`.
- **Rationale**: No new query logic needed — 003 already built exactly this filter combination
  for the catalog's own type/status dropdowns; reusing it keeps "which products count as
  purchasable" defined in exactly one place.
- **Alternatives considered**: A dedicated query in `lib/purchases/service.ts` duplicating the
  type/status filter — rejected as unnecessary duplication of logic 003 already owns.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001/002/003) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Supabase Postgres — extends `raw_material_purchases` and `products`, plus three new Postgres functions |
| Testing | Vitest + Testing Library (same intended stack as 001/002/003; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (extends 002/003, no new service) |
| Performance Goals | Unified purchase list search/filter + totals render in <2s at 1,000 records (SC-004) |
| Constraints | No client-side Postgres access (service-role key only); unit-mode purchase writes and their product-side effects are atomic via Postgres functions; only active traded products selectable for new unit-mode purchases |
| Scale/Scope | Single internal business, up to ~1,000 combined purchase records for now, no multi-tenancy |
