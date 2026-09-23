# Research: Production Batches

**Feature**: `010-production-batches` | **Date**: 2026-09-24

The feature's architecture (stock split, lifecycle, labour-rate sourcing, contractors table,
manufactured opening stock) was settled with the user before the spec and is recorded in
[ADR-0008](../../history/adr/0008-production-batch-lifecycle-and-stock-split.md). This file
records only the implementation-level decisions made during planning, each checked against the
shipped code.

## Decision: every batch state change is one Postgres function (ADR-0002), with the lot row locked `FOR UPDATE`

- **Decision**: `issue_production_batch`, `update_production_batch`, `void_production_batch` and
  `complete_production_batch` each run as a single plpgsql function. Each starts with
  `SELECT … FOR UPDATE` on the batch row (for update/void/complete), then on every affected lot
  row.
- **Rationale**: FR-005/FR-028/SC-003. Two parallel issues from one lot must never both succeed.
  A row lock serialises them, so the second transaction re-reads the already-decremented
  `remaining_weight_kg`. The existing `check (remaining_weight_kg >= 0)` on
  `raw_material_purchases` (0001) stays as a last-line guarantee. This follows every prior feature's
  multi-table write pattern (ADR-0002); it's not a new pattern.
- **Deadlock avoidance**: When an edit moves a batch from lot A to lot B, both lots are locked in
  ascending `id` order before any update.
- **Alternatives considered**: An optimistic TypeScript check-then-update (rejected: that's exactly
  the race FR-005 forbids). A `SERIALIZABLE` transaction with retries (rejected: needs retry
  plumbing none of 001–009 have, and a row lock is enough).

## Decision: close 002's latent read-then-write race on weight-lot edit/delete

- **Finding**: `lib/purchases/service.ts` `updatePurchaseRecord` (weight branch) reads the lot,
  checks `remainingWeightKg === weightKg` in TypeScript, then runs a plain `UPDATE` that **resets
  `remaining_weight_kg = weight_kg`**. `deletePurchaseRecord` has the same check-then-`DELETE`
  shape. Until now nothing else wrote `remaining_weight_kg`, so the gap was harmless. Once 010 ships,
  a batch issued between the check and the update would be silently undone: the lot would go back
  to full while the batch still exists.
- **Decision**: Make both 002 writes conditional in the same statement. Add
  `.eq("weight_kg", existing.weightKg).eq("remaining_weight_kg", existing.weightKg)` to the
  `UPDATE`/`DELETE`, add `.select("id")`, and throw the existing `PurchaseLockedError` when zero
  rows are affected. This is a two-line change per function, with no signature, schema or UI change.
- **Rationale**: This is the smallest diff that makes the 002 lock atomic against the new writer. The
  unit-mode branch already goes through RPCs and doesn't touch `remaining_weight_kg`, so it's
  unaffected.
- **Alternatives considered**: Moving weight-lot edit/delete into new Postgres functions (rejected:
  larger diff to a shipped feature for the same guarantee). A trigger rejecting lot updates while
  batches exist (rejected: it would also block the batch functions' own decrements unless they
  bypass it, which adds hidden coupling).

## Decision: a lot referenced by any batch, including a voided one, cannot be deleted; it can be edited again once full

- **Finding**: `production_batches.lot_id` must be a real FK, as every other reference in this
  schema is. A voided batch keeps its `lot_id` so its history stays readable. Postgres will
  therefore reject `DELETE` of a lot that any batch row references (`23503`).
- **Decision**: Keep the FK with the default `RESTRICT`. After a void, the lot becomes **editable**
  again (002's own `remaining == weight` rule, unchanged). **Deletion** stays blocked while any batch
  row references it, and the service maps `23503` to a friendly `PurchaseLockedError`: "This lot is
  referenced by a production batch (voided batches included) and cannot be deleted."
- **Spec impact**: **Confirmed by the user on 2026-09-24 (Option A).** Spec US4-5 and FR-012 are
  narrowed to "editable again, undeletable while any batch (voided included) references it".
- **Alternatives considered**: `ON DELETE SET NULL` limited to voided batches (keeps deletability,
  but voided batches then lose which lot they were from, and a conditional nullability check is
  needed). Hard-deleting voided batches on lot delete (rejected: destroys an audit record).

## Decision: batch number is `PB-NNNN` from a dedicated Postgres sequence, assigned after validation

- **Decision**: `create sequence production_batch_number_seq`. `issue_production_batch` calls
  `nextval` only **after** every validation passes, and formats the result as
  `'PB-' || lpad(n::text, 4, '0')`. The column has a `unique` constraint.
- **Rationale**: FR-009 asks for unique, sequential and human-readable. Unlike Challans (004's
  per-trade-name counters) and Performa Invoices, batches aren't issued under a trade name, so a
  counter column has no natural home, and a global sequence is the simplest fit. Calling `nextval`
  last means ordinary rejections (not enough weight, inactive contractor) never use up a number. A
  gap can only come from an unexpected error after that point, which is acceptable at this scale.
  Staff cannot override the number (unlike Challans), since there's no external document to match.
- **Alternatives considered**: `max(batch_number)+1` under a table lock (rejected: needs a lock on
  the whole table). A single-row counter table (rejected: re-implements a sequence).

## Decision: completion figures are computed in SQL and stored as plain columns, not generated columns

- **Decision**: `complete_production_batch` computes and writes these values once, in the same
  transaction as the stock movement:
  - `lot_rate_per_kg` (snapshot)
  - `expected_packets` (snapshot = `floor(weight_issued_kg × expected_yield_per_kg)`)
  - `raw_material_cost`, `labour_cost`, `total_cost`, `avg_cost_per_packet`
  - `wastage_kg`, `wastage_value`, `wastage_pct`
  - `returned_weight_exceeded`
- **Rationale**: FR-016/FR-020/SC-007 require the figures to be frozen. A generated column would read
  the product's yield and the lot's rate live, and Postgres generated columns can't reference other
  tables anyway. Snapshotting `expected_packets` also freezes the variance (FR-018), even if the
  product's yield is later recalibrated. The lot's rate can't change once used (002 lock), but
  snapshotting it makes the batch self-contained for 011/012/013.
- **Rounding**: every money figure uses `round(x, 2)`. `avg_cost_per_packet = round(total_cost /
  packets_produced, 2)`. `wastage_pct = round(wastage_kg / weight_issued_kg × 100, 2)`. The worked
  example reproduces exactly: 200,010.00 / 25,000.00 / 225,010.00 / 90.00 / 100.00 kg / 6,667.00 /
  3.33.
- **Note for 012**: the stored `avg_cost_per_packet` is rounded. Stock valuation should derive from
  `total_cost ÷ packets_produced`, not from multiplying out the rounded average.

## Decision: the "returned weight > weight issued" soft warning is enforced server-side via an explicit confirm flag

- **Decision**: `completeProductionBatch` takes `confirmReturnedWeightExceeded: boolean`. The form
  already knows the batch's weight issued, so it shows the warning and asks for confirmation before
  submitting. The Postgres function independently raises `RETURNED_WEIGHT_UNCONFIRMED` if
  `returned > issued` and the flag is false. On confirmation it stores wastage 0 / 0 / 0 and
  `returned_weight_exceeded = true` (FR-019, US2-6).
- **Rationale**: The warning can't be bypassed by a stale or crafted request, yet it never blocks a
  confirmed entry. The packet count is never read or validated against the weight.
- **Alternatives considered**: A client-only warning (rejected: not enforced). Storing negative
  wastage (rejected: the user chose 0 plus a flag).

## Decision: manufactured opening stock is a one-row-per-product table plus `inventory_movements` rows

- **Decision**: A new `manufactured_opening_stock` table keyed by `product_id` (the primary key
  gives FR-025's "only one" rule at the database level). It holds the quantity, entry date and the
  optional `cost_per_packet`, plus nullable correction columns that are filled at most once. Each of
  the opening entry and the correction also inserts one `inventory_movements` row with
  `source_type = 'opening_balance'` and `source_id = product_id`. The reason text is `'Opening
  balance'` or `'Opening balance correction'`. Both are followed by
  `recompute_product_quantity_on_hand`.
- **Rationale**:
  - The user asked for 007's `opening_balance` source type. 007's traded backfill used
    `source_id = null`; this feature points `source_id` at the product so the entry can be traced.
    Manufactured products have no existing `opening_balance` rows, because 007's backfill excluded
    them.
  - The optional cost can't live in `inventory_movements`, which has no cost column and whose shape
    is shared across features, so it needs its own row for 012/013 to read.
  - The stock ledger stays insert-only. The one allowed update to `manufactured_opening_stock` is
    filling the correction columns from null, guarded by a check constraint (all set or all null).
- **"No accepted Challan has taken stock out" (FR-025)**: this means no `inventory_movements` row
  exists for the product with `source_type = 'challan_line' and qty_delta < 0`. That matches
  exactly what `accept_challan` writes (`0007_challans.sql`, "Challan accepted" rows).
- **Below-zero guard**: an explicit check (`quantity_on_hand + correction < 0` raises
  `CORRECTION_BELOW_ZERO`) runs before the insert, with `products`' own `check (quantity_on_hand >=
  0)` as the backstop.
- **Concurrency**: the correction function locks the `products` row first. A Challan accepted at
  exactly the same moment could still slip past the "no Challan yet" check, because `accept_challan`
  inserts its movement before it updates the product row. Stock stays correct and non-negative
  either way; only the business rule is momentarily not enforced. That's acceptable at this scale
  (a one-time go-live action) and noted here rather than solved by changing 007.
- **Alternatives considered**: Movements only, with cost in the `reason` text (rejected: not
  queryable). A generic stock-adjustment feature (rejected: out of scope, spec's Out of Scope).

## Decision: "not in the future" date checks live in the Zod schemas, not in SQL

- **Decision**: Issue, completion, opening and correction dates are checked for "not in the future"
  in Zod, on the client and again on the server. The check compares the entered `YYYY-MM-DD`
  against **today's date in Asia/Karachi** (`todayInPakistan()` in
  `lib/production-batches/schema.ts`). Ordering rules that don't depend on the clock are enforced in
  SQL: issue ≥ lot purchase date, completion ≥ issue, correction ≥ opening entry date.
- **Rationale**: Postgres `current_date` is UTC. Between 00:00 and 05:00 Pakistan time, UTC is still
  on the previous day, so a SQL "not future" check would wrongly reject today's Pakistan date.
- **Correction (made during implementation)**: an earlier draft of this note said 010 would reuse
  002's end-of-UTC-day rule (`lib/purchases/schema.ts`) because it "already avoids" that problem. It
  doesn't. That rule has the same defect: during 00:00–05:00 PKT, today's Pakistan date falls after
  the end of the current UTC day and is rejected as "future". 010 uses the Pakistan-date comparison
  instead. **Follow-up done (2026-09-24, at the user's request):** 002 now uses the same rule, via the shared
  `lib/dates.ts`, and the convention is recorded as [ADR-0009](../../history/adr/0009-business-today-is-the-pakistan-calendar-date.md).

## Decision: a small read-only stock history section on the product detail page

- **Decision**: Add `listProductStockMovements(productId)` to `lib/products/service.ts` and render a
  "Stock history" table on `app/(dashboard)/products/[productId]/page.tsx` (date, reason, ±qty,
  source link for batches).
- **Rationale**: Several spec items assume a product's stock history can be seen: US3-1 ("labelled
  'Opening balance' in the product's stock history"), the stock-history edge case, and FR-015
  ("traceable to the batch"). No such view exists in 001–009. A plain read of `inventory_movements`
  is the smallest way to satisfy them without pulling 012's inventory views forward.
  - Batch rows link to `/production-batches/<id>`.
  - Challan rows show their reason text only, because `source_id` is a `challan_lines` id and
    resolving it to a Challan link would need an extra lookup, which is 012's job.

## Decision: pickers and eligibility reuse existing services, with thin additions

- **Manufactured product picker**: add `listActiveManufacturedProductsForSelect()` to
  `lib/products/service.ts`, a thin wrapper over `listProducts({ type: 'manufactured', status:
  'active' })` with the same shape as 003b's `listActiveTradedProductsForSelect`. It returns
  `defaultLabourRatePerPacket` and `expectedYieldPerKg` too, for the pre-fill and the suggestion.
- **Lot picker**: `listAvailableLotsForBatch()` in the new `lib/production-batches/service.ts`.
  - Filters to `purchase_mode = 'weight' and remaining_weight_kg > 0`, joins the supplier name, and
    orders oldest first.
  - On the edit form, the batch's own current lot is always included, with the batch's own weight
    added back to its remaining weight.
- **Eligibility on edit**: follows 002's precedent. Active status is re-checked only when the product
  or contractor is actually changed (edge cases: a deactivated product or contractor keeps working on
  its existing Issued batch).

## Decision: no new dependencies, no new Storage, no print route

- The spec requires no printed batch document and no attachments. Everything uses packages that are
  already installed (Zod, react-hook-form, Supabase clients). Implementation must follow the
  Next.js 16.3.4 conventions already used by 007–009, and check `node_modules/next/dist/docs/` for
  any API not already used in this codebase (per CLAUDE.md).

## Decision: testing stays manual via quickstart.md

- Vitest is still not wired into `package.json` (same as 001–009). Verification is the
  [quickstart.md](./quickstart.md) walkthrough, which exercises the worked example, the parallel-issue
  guard, void and restore, opening stock and its correction, and the 007 limitation being resolved.
