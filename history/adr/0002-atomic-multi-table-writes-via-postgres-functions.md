# ADR-0002: Atomic multi-table writes via Postgres functions

> **Scope**: Documents the write pattern used whenever a single business operation must change
> rows in more than one table together — not a single-table CRUD decision.

- **Status:** Accepted
- **Date:** 2026-09-20
- **Feature:** 003b-traded-goods-purchasing (pattern originated in 001-supplier-directory)
- **Context:** 003b introduces unit-mode purchases: creating, editing, or deleting a unit-mode row
  in `raw_material_purchases` must also keep the referenced `products` row's
  `current_purchase_cost` and `quantity_on_hand` correct (FR-004/FR-005). That is a write to two
  tables that must succeed or fail together — the same shape of problem 001 already solved for
  `suppliers` + `supplier_contacts` + `supplier_materials` via `create_supplier`/`update_supplier`.
  003b's plan explicitly reuses that pattern (see
  [`specs/003b-traded-goods-purchasing/research.md`](../../specs/003b-traded-goods-purchasing/research.md))
  rather than inventing a new one, and this ADR records it as a named, reusable convention now
  that a second, independent feature needs it.

## Decision

When a single business operation must write to more than one table and those writes must never be
observed out of sync, the write is implemented as **one `plpgsql` Postgres function**, called once
from the Server Action / service layer via `supabase.rpc(...)`. The function performs all table
writes inside the implicit single-statement-call transaction Postgres gives a function body, and
returns only the data the caller needs (e.g. the new row's `id`, or `void`).

Concretely, in 003b:

- `record_unit_purchase(...)` inserts the purchase row and calls `recompute_product_purchase_stats`
  for the affected product in one function body.
- `update_unit_purchase(...)` updates the purchase row and recomputes stats for the old product
  (and the new one, if the product was changed).
- `delete_unit_purchase(...)` deletes the purchase row and recomputes stats for its product.
- `recompute_product_purchase_stats(p_product_id)` is a shared helper that **fully re-aggregates**
  a product's `quantity_on_hand` and `current_purchase_cost` from all of its current unit-mode
  purchase rows, rather than incrementally patching the previous stored value — see the second
  decision in `research.md` for why (drift risk with incremental deltas).

This does **not** replace the plain Server Actions pattern used everywhere a write touches only
one table (e.g. 002's weight-mode purchase create/edit, most of 003's product CRUD). Single-table
writes continue to go straight through `supabase-js` from the Server Action, with no RPC involved.
The Postgres-function pattern is reserved specifically for the multi-table case.

## Consequences

### Positive

- Structurally impossible for a purchase row and its product's derived cost/quantity to go out of
  sync — there is no window between two separate `supabase-js` calls where a crash, network blip,
  or constraint violation could leave one write applied and the other not.
- No application-level rollback/compensation logic to write, test, or get wrong — Postgres already
  gives a function body transaction semantics for free.
- One established convention now covers both features that have needed it (001's supplier writes,
  003b's unit-purchase writes), so a third future feature with the same shape (e.g. a Production
  Batch consuming a purchase lot while inserting a batch row) has a precedent to follow instead of
  a fresh design decision.

### Negative

- Business logic is split across two languages/layers: TypeScript Server Actions for
  validation/auth/single-table writes, `plpgsql` for the multi-table atomic case. A reader must
  know to look in `supabase/migrations/` for this class of logic, not just `lib/*/service.ts`.
  Mitigated by keeping the SQL functions colocated with the schema change that motivated them,
  with comments pointing at the relevant spec/research doc.
- Postgres functions are not covered by the project's TypeScript type checker or (currently
  unwired) Vitest suite — correctness relies on manual review of the SQL and the migration
  reviewer's own testing in the Supabase SQL editor before it reaches the live database.
- Adds a small amount of indirection (`supabase.rpc("record_unit_purchase", {...})` vs. a direct
  `.insert()`/`.update()` call) for the specific operations that use it.

## Alternatives Considered

**Two sequential `supabase-js` calls with manual rollback on failure** — Rejected. Reimplements
transaction semantics in application code (detect partial failure, undo the first write) that
Postgres already provides natively for a function body.

**A database trigger on `raw_material_purchases` that recomputes product stats on
`INSERT`/`UPDATE`/`DELETE`** — Considered, functionally equivalent atomicity guarantee. Rejected in
favor of the explicit function-per-operation approach so the entire effect of a write (purchase row
+ product recompute) is visible in one function body, rather than split between an RPC call the
caller can see and a trigger a future reader has to know to go look for separately.

**A Supabase Edge Function wrapping the two writes** — Rejected as unnecessary indirection; the
logic is naturally expressed as SQL operating on two tables already in the same database, with no
need for a separate compute layer.

**Extend the "pure Server Actions" pattern to this case too (two sequential `supabase-js` calls, no
rollback)** — Rejected outright as violating FR-004/FR-005's correctness requirement; this is the
option implicitly used for every single-table write in 001/002/003 and remains correct there
because there is nothing to go out of sync within one table.

## References

- Feature Spec: `specs/003b-traded-goods-purchasing/spec.md`
- Implementation Plan: `specs/003b-traded-goods-purchasing/plan.md`
- Research: `specs/003b-traded-goods-purchasing/research.md`
- Migration: `supabase/migrations/0003_traded_purchases.sql`
- Related ADRs: [ADR-0001](0001-firebase-to-supabase-backend.md) (Postgres adoption that made this
  pattern possible); prior art in `lib/suppliers/service.ts` (`create_supplier`/`update_supplier`,
  001-supplier-directory, not itself ADR-documented at the time)
