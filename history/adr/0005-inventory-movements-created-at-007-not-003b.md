# ADR-0005: `inventory_movements` was actually created at 007-challans, not 003b — and became the sole source of truth for `products.quantity_on_hand`

> **Scope**: Corrects a factual claim in [ADR-0004](0004-shared-tables-created-at-first-writer.md)
> about which feature first created the `inventory_movements` table, and records the
> follow-on decision this correction required: making that table the sole source of truth for
> `products.quantity_on_hand`, which 003b had been maintaining directly. Does not revisit or
> weaken ADR-0004's underlying principle (a shared insert-only table is created at its first real
> writer) — this ADR is a second, corrected application of that same principle, not a competing
> one.

- **Status:** Accepted
- **Date:** 2026-09-21
- **Feature:** 007-challans
- **Context:** ADR-0004 (written during 005-customers' plan, 2026-09-20) states that
  `inventory_movements` was *"first applied by 003b-traded-goods-purchasing's
  `inventory_movements`"* — i.e., that 003b's migration already created this table. While
  specifying and planning 007-challans (2026-09-21), this was checked against the actual shipped
  code rather than taken on faith: `supabase/migrations/0003_traded_purchases.sql` contains no
  `inventory_movements` table at all. 003b instead added a directly-maintained
  `products.quantity_on_hand` column, recomputed from scratch on every unit-mode purchase
  create/edit/delete by `recompute_product_purchase_stats()`. ADR-0004's factual claim was wrong
  from the moment it was written; no table by that name existed anywhere in this codebase until
  this feature. Compounding this, 007-challans needs auditable, reversible stock effects (accept a
  Challan → decrement; a shortfall returned to inventory → increment; a shortfall written off → no
  reversal) that a single mutable `quantity_on_hand` column cannot express safely once both 003b
  and 007 write to the same product's stock — the user caught this exact risk in spec review:
  leaving `recompute_product_purchase_stats()` unchanged would silently reset a product's
  quantity-on-hand to a purchase-only figure the next time any unrelated purchase for that product
  was edited, discarding every Challan-driven change with no error. Both facts — the mistaken
  origin claim, and the deeper reconciliation this feature's real first-write required — are
  recorded here.

## Decision

1. **Origin correction**: `inventory_movements` (`id`, `product_id`, `qty_delta`, `reason`,
   `source_type`, `source_id`, `movement_date`, `created_at`, `created_by`) is created by
   **007-challans**, using the exact column shape `specs/PRODUCT-OVERVIEW.md` already specified —
   ADR-0004's principle (master-spec shape, first real writer, not deferred to the presentation
   feature) is followed exactly; only *which* feature is the first writer changes, from the
   mistaken "003b" to the actual "007". ADR-0004 is amended with a pointer to this ADR (see
   [ADR-0004](0004-shared-tables-created-at-first-writer.md)'s Context) rather than marked
   Superseded — its decision and rationale remain fully in force.
2. **`products.quantity_on_hand` becomes purely derived from `inventory_movements`, for every
   writer, from this feature forward**: `recompute_product_purchase_stats()` keeps computing
   `current_purchase_cost` (unchanged), but stops writing `quantity_on_hand`. A new
   `recompute_product_quantity_on_hand(product_id)` sets it to
   `coalesce(sum(inventory_movements.qty_delta), 0)`. 003b's three purchase-mutation functions
   (`record_unit_purchase`, `update_unit_purchase`, `delete_unit_purchase`) are `CREATE OR
   REPLACE`d — via a new migration (`0007_challans.sql`), never by editing
   `0003_traded_purchases.sql` in place — so each writes its own movement (a net-delta on edit, a
   reversal on delete) instead of the old full-table-scan overwrite. One opening movement per
   existing traded product backfills 003b's purchase history as a single starting balance at
   cutover.

## Consequences

### Positive

- A single historical record now correctly states who created `inventory_movements` and why — a
  future reader of ADR-0004 is not misled by a factual claim that was never true.
- `quantity_on_hand` can never again silently diverge between what purchases and what Challans
  (and, later, 010-production-batches) believe it should be: exactly one function
  (`recompute_product_quantity_on_hand`) writes it, always from the same ledger.
- 003b's existing `raw_material_purchases` table, its cost-basis logic, and its callers'
  signatures are all untouched — only the quantity-on-hand side effect moves, which is the
  smallest change that closes the collision.
- Every future writer of `inventory_movements` (010-production-batches next) inherits a
  proven-correct, already-reconciled ledger instead of needing to discover and fix this same
  collision itself.

### Negative

- A feature's migration now redefines Postgres functions that another, already-shipped feature
  (003b) originally authored — a less clean "one feature, one set of functions" story, and it
  means anyone auditing `quantity_on_hand`'s behavior must read two migration files
  (`0003_traded_purchases.sql` for the original shape, `0007_challans.sql` for what actually runs
  today) to understand it fully.
- The one-time backfill is a point-in-time snapshot of 003b's purchase history collapsed into a
  single opening movement, not a replay of every individual historical purchase — a full per-
  purchase audit trail only exists for purchases made after this feature ships, not before.
- Manufactured products still have no `inventory_movements` writer at all until
  010-production-batches ships; a Challan accepted against one before then will correctly fail a
  `quantity_on_hand >= 0` check rather than succeed, a real interim limitation this ADR does not
  resolve (see `specs/007-challans/research.md`).

## Alternatives Considered

**Leave ADR-0004's claim uncorrected, since the underlying principle is still followed** —
Rejected. A historical record asserting a fact that a two-minute check of the actual migration
disproves is worse than no record at all; future planning for 010/012 would inherit the same wrong
assumption ADR-0004 already caused once.

**Keep `inventory_movements` audit-only, leave `products.quantity_on_hand` purchase-driven
(`spec.md`'s rejected "Option B")** — Rejected. Does not fix the collision: 003b's
`recompute_product_purchase_stats()` would still overwrite `quantity_on_hand` from raw purchase
history on every purchase edit, discarding Challan-driven changes silently. This was the whole
reason this reconciliation was needed in the first place.

**Combined formula — `quantity_on_hand = purchase_total + movements_net` (`spec.md`'s rejected
"Option C")** — Rejected. Avoids a one-time backfill migration, but still requires editing
003b's functions, and leaves two formulas (a full purchase re-sum plus a separate movements sum)
that must always be added together correctly everywhere `quantity_on_hand` is read or written —
more ongoing complexity than converging to one ledger, for less safety.

**Edit `0003_traded_purchases.sql` directly instead of a new migration** — Rejected. This
project's migrations are an append-only record of what was actually applied to a real database
over time; every other cross-feature schema change in this codebase (006 adding FKs to new tables
referencing 001-005's rows, 005 adding `ledger_entries` ahead of its real presentation feature) has
been made via a new migration file, never by rewriting an already-applied one.

## References

- Feature Spec: `specs/007-challans/spec.md` (Assumptions, FR-010, FR-011)
- Implementation Plan: `specs/007-challans/plan.md` (Constitution Check)
- Research: `specs/007-challans/research.md` (the two decisions this ADR formalizes)
- Data Model: `specs/007-challans/data-model.md` (`inventory_movements` DDL, the redefined 003b
  functions, `recompute_product_quantity_on_hand`)
- Related ADRs: [ADR-0004](0004-shared-tables-created-at-first-writer.md) (the principle this ADR
  continues to follow; amended with a pointer to this ADR for the factual correction), [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md) (the atomic-write pattern `accept_challan` also follows, unrelated to this ADR's own subject)
- Prompt History: `history/prompts/007-challans/0001-challans-feature-specification.spec.prompt.md`,
  `history/prompts/007-challans/0002-fr013-wording-and-inventory-source-of-truth-fix.spec.prompt.md`
  (where the user caught the collision this ADR resolves)
