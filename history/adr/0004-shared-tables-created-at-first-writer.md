# ADR-0004: Shared, insert-only aggregate tables are created at their first real writer, not their presentation feature

> **Scope**: Documents where in the module roadmap a shared table that multiple future features
> will write to (a ledger, a movement log) gets its schema created — not a decision specific to
> `ledger_entries` or `inventory_movements` alone.

- **Status:** Accepted
- **Date:** 2026-09-20
- **Feature:** 005-customers (second application; first applied by 003b-traded-goods-purchasing's
  `inventory_movements`). Both were pre-agreed at the master-spec level in
  `specs/PRODUCT-OVERVIEW.md` § "Shared-table decisions" before either feature's own `/sp.plan`
  ran; this ADR is the first formal write-up of that already-agreed pattern, surfaced during
  005's Constitution Check for consent.
- **Context:** Several tables in this system's data model are written to by more than one
  feature over time but don't "belong" to any single one: `inventory_movements` (written by
  003b's traded-goods purchases now, and will be written by 010-production-batches and
  012-finished-goods-inventory later) and `ledger_entries` (written by 005-customers' opening
  balance now, and will be written by 007-challans and 008-performa-invoicing later). Each such
  table also has its own dedicated *presentation* feature later in the roadmap
  (012-finished-goods-inventory for movements-as-stock-view; 009-customer-ledger for
  entries-as-ledger-view) that owns reporting, ageing, and any UI beyond raw inserts. The question
  this ADR answers: when a feature needs to *write* to one of these tables before its
  presentation feature exists yet, does that table's schema get created now, or does the earlier
  feature wait / get blocked / duplicate a private table until the "real" owner ships?

## Decision

A shared, insert-only aggregate table is created in the migration of whichever feature is the
**first real writer** to need it — not deferred until its presentation feature, and not
duplicated as a feature-private table in the meantime. Concretely:

- The table's DDL (columns, constraints, RLS-enabled-no-policies, indexes) is fully specified by
  the first writer's `data-model.md`, using the shape already agreed at the master-spec level
  (`specs/PRODUCT-OVERVIEW.md`'s literal column definitions for that table), not a shape the first
  writer invents unilaterally.
- The first writer's own scope is limited to inserting rows it's responsible for
  (003b: purchase/consumption movements; 005: the opening-balance entry) and to any read the first
  writer itself needs (003b: `products.current_purchase_cost` recomputation; 005: a live `SUM` for
  the customer detail view). It does **not** build the table's full presentation (running views,
  ageing, filtering, editing history) — that remains the presentation feature's job when it ships.
- Later writers (007/008 for `ledger_entries`; 010/012 for `inventory_movements`) add new
  `source_type` values and their own insert paths without a migration to widen any `CHECK` — both
  tables' `source_type`/equivalent discriminator columns are deliberately free text for exactly
  this reason.
- No update/delete path is ever added to these tables by an earlier writer on behalf of a later
  feature; each table's own immutability rules (e.g. `ledger_entries` has no update/delete path
  anywhere per FR-013) are decided by that table's own governing spec, not assumed by this ADR.

## Consequences

### Positive

- A customer's opening balance (005) and a traded purchase's stock effect (003b) can be recorded
  correctly and immediately, without inventing a throwaway private table that would later need a
  painful data migration into the "real" shared table once 009 or 012 ships.
- The master spec's own literal column definitions become the single source of truth for a shared
  table's shape from the moment it first exists, rather than each writer guessing independently
  and converging by luck.
- Later features (007, 008, 010, 012) inherit a table whose shape and immutability guarantees are
  already proven correct by an earlier feature's real usage, rather than designing it from
  scratch under time pressure when they ship.
- Keeps each writer's own `/sp.plan` honest about scope: a feature that only needs to *insert* a
  handful of rows is not forced to also build a presentation feature it doesn't need yet, and a
  presentation feature is not forced to also retroactively design the schema for data that already
  exists.

### Negative

- A table's full lifecycle (who can read it, how it's indexed, what its presentation feature will
  eventually need) is decided incrementally across multiple features rather than once, up front —
  a later presentation feature could in principle discover the earlier writer's shape doesn't
  serve a reporting need well, requiring a schema change at that point. Mitigated in practice by
  the master spec already stating the full column shape (including columns the first writer
  doesn't use, like `ledger_entries.source_id`) before any writer's migration is written.
- Two different features (a writer and its presentation feature) now share ownership of one
  table's migration history, which is a slightly less clean story than "one feature, one table"
  and requires anyone reading a later feature's `data-model.md` to know the table already exists
  and check the earlier feature's migration for its actual DDL.
- If a first writer is ever reverted or descoped after shipping, the shared table it created
  persists for later features regardless — there's no clean single-feature rollback boundary for
  a shared table the way there is for a feature-private one.

## Alternatives Considered

**Defer the shared table entirely until its presentation feature ships** — Rejected. This would
have blocked 005 from recording a customer's real opening balance (and 003b from recording a
traded purchase's stock effect) until 009/012 exist, several features later in the roadmap —
directly at odds with the business need to capture correct, real data (opening balances at
go-live) at the point that data first exists, not months later.

**Each early writer creates its own private table (`customer_opening_balances`,
`traded_purchase_movements`), migrated into the shared table once the presentation feature
ships** — Rejected. Defers real complexity (a data migration reconciling multiple
feature-private tables into one shared shape) to whichever feature ships last, instead of paying
a small, well-understood cost (agreeing the shared shape up front) at the point it's cheapest to
pay. Also risks the private tables diverging in shape from each other before the merge ever
happens.

**Have the presentation feature "own" the table and require every writer to depend on it as a
library/service, even before the presentation feature's own UI exists** — Rejected as inventing an
artificial feature-ordering dependency (005 would depend on 009; 003b would depend on 012) purely
for schema ownership, when the actual technical need (a table + an insert function) has nothing to
do with the presentation feature's own scope (reporting, ageing, UI).

## References

- Feature Spec: `specs/005-customers/spec.md` (`ledger_entries`'s introduction), `specs/003b-traded-goods-purchasing/spec.md` (`inventory_movements`'s introduction)
- Implementation Plan: `specs/005-customers/plan.md` (Constitution Check — where this decision was surfaced for consent), `specs/003b-traded-goods-purchasing/plan.md`
- Data Model: `specs/005-customers/data-model.md` (`ledger_entries` table + read-only balance helper), `specs/003b-traded-goods-purchasing/data-model.md` (`inventory_movements` table)
- Master Spec: `specs/PRODUCT-OVERVIEW.md` § "Shared-table decisions" (the original 2026-09-20 agreement this ADR formally records)
- Related ADRs: [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md) (the sibling pattern for how a single feature writes atomically across its own tables — this ADR is about which feature owns a shared table's schema, not how any one write is made atomic)
