# ADR-0008: Production batches use an Issued → Completed / Voided lifecycle, with fabric consumed on the lot and packets added via `inventory_movements`

> **Scope**: Decision cluster for 010-production-batches that 011 (Labour / Commission Ledger),
> 012 (Finished Goods Inventory) and 013 (Profit & Reports) will build on: (1) where each side of
> a batch's stock effect is recorded, (2) the batch lifecycle and when each side effect fires,
> (3) how the labour rate is sourced and frozen, and where contractors first live, (4) how
> pre-existing manufactured stock enters the ledger at go-live. Continues
> [ADR-0004](0004-shared-tables-created-at-first-writer.md) and
> [ADR-0005](0005-inventory-movements-created-at-007-not-003b.md); does not revise either.

- **Status:** Accepted
- **Date:** 2026-09-24
- **Feature:** 010-production-batches
- **Context:** A production batch converts a weight of raw fabric into packets of a
  `manufactured` product via one external contractor. Checked against the shipped schema before
  deciding: raw fabric is **not** a product — weight-mode `raw_material_purchases` rows (002) are
  lots with `product_id` forced `NULL` (`0003_traded_purchases.sql` mode check), and their stock is
  `remaining_weight_kg`, whose first decrement triggers 002's edit/delete lock
  (`lib/purchases/service.ts` `isLockedPurchase`). `inventory_movements.product_id` is a `NOT NULL`
  FK to `products` (`0007_challans.sql`), so fabric cannot be recorded there. Separately,
  manufactured products' `quantity_on_hand` has had no writer since 003, and 007 documented that
  Challans against them cannot be accepted until one exists (`specs/007-challans/research.md`) —
  while real manufactured stock already sits on the shelf unrecorded. In the business's real
  workflow there is a gap of days to weeks between handing fabric to the contractor and receiving
  packets back; during that gap the fabric is physically gone but no sellable stock exists. The
  master spec's cost rule (raw material cost = weight **issued** × lot rate; wastage reported but
  absorbed, never deducted) and "actual entered figures are authoritative" rule were already
  settled and are not revisited here. Business input confirmed (2026-09-24): issued fabric is never
  returned unconverted; one contractor per batch; staged deliveries are handled by issuing smaller
  batches.

## Decision

1. **Stock split — two different stores, never mixed**:
   - *Fabric out (kg)* → the chosen lot's `raw_material_purchases.remaining_weight_kg`, decremented
     directly. Fabric never enters `products` or `inventory_movements`.
   - *Packets in (units)* → one `inventory_movements` row (`+qty`, `source_type =
     'production_batch'`, `source_id` = batch id), followed by `recompute_product_quantity_on_hand`
     — the ADR-0005 path, unchanged.
   - One batch = one lot = one manufactured product = one contractor (master spec resolved point 4).
2. **Lifecycle `issued → completed | voided`** (mirrors `challans.status`), each transition an
   atomic Postgres function per [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md):
   - *Issue*: records lot, weight issued, product, contractor, labour rate, issue date; locks the
     lot row (`FOR UPDATE`) and rejects if weight issued > `remaining_weight_kg`; decrements the
     lot. Writes **no** `inventory_movements` row.
   - *Edit* (issued only): re-adjusts the lot by the weight delta under the same guard.
   - *Void* (issued only): restores the full issued weight to the lot (002's lock releases on its
     own if the lot returns to full).
   - *Complete* (issued only): records packets produced (whole number; drives stock and costing),
     weighed total weight of the returned packets (informational cross-check; ≤ weight issued; never
     overrides or blocks on the packet count), and completion date; writes the `+packets` movement
     dated on the completion date; computes and freezes raw material cost, labour cost, total cost,
     average cost per packet, and wastage (kg / Rs / %). Yield variance vs.
     `expected_yield_per_kg` is displayed, never enforced.
   - *Completed* is fully read-only (like an accepted Challan). No returned-kg field: cost basis is
     always the full weight issued.
   - "Work in progress" is the list of `issued` batches — not a product, not a movement.
3. **Labour rate and contractors**:
   - The rate stored on the batch is authoritative, editable while `issued`, frozen at completion,
     never re-derived.
   - Pre-fill source in 010: `products.default_labour_rate_per_packet` only.
   - 010 creates a minimal `contractors` table (name, phone, `active`/`inactive`) so batches carry a
     real `contractor_id` FK — first-writer rule, ADR-0004. 011 extends it (payments, sub-contract
     rate). Any contractor-sourced rate is deferred to 011 and, if added, must be a
     contractor × product rate (a flat per-contractor rate is wrong because the rate depends mostly
     on the product); it would then precede the product default in pre-fill only.
   - 011 accrues contractor earnings from **completed** batches only.
4. **Manufactured opening stock at go-live**: a one-time entry per manufactured product,
   written as an `inventory_movements` row with `source_type = 'opening_balance'`, `source_id` null
   — the same shape as 007's traded-product backfill — since the real on-shelf quantity is not in
   the database and must be entered by staff rather than migrated. The entry carries an optional
   cost per packet (for 012/013 valuation). At most one correcting entry is allowed per product,
   with a reason, only while no accepted Challan has taken that product's stock out and never
   below 0; the original is never edited or deleted (spec clarifications, 2026-09-24).
5. **Returned packet weight** exceeding weight issued (packaging weight) is a soft warning, never a
   block; wastage is then stored as 0 with a flag.

## Consequences

### Positive

- Fabric sitting with a contractor is visible (issued batches: kg, contractor, since when, Rs
  value) instead of being invisible between purchase and packets.
- The same kilograms cannot be issued to two contractors: the lot row lock + remaining-weight guard
  enforce it at the database level.
- `quantity_on_hand` for manufactured products finally has a writer, and it stays on ADR-0005's
  single-ledger path — no second formula, no direct column writes. 007's interim limitation is
  resolved without touching 007.
- No rework of 002/003b: the lot model, the consumption lock, and the product type check
  constraints are all used as-is.
- 011 gets a stable contract: completed, frozen `(contractor_id, packets, rate)` rows to accrue
  from, and a `contractors` table to extend rather than migrate free-text names into.

### Negative

- Stock lives in two places with different units (kg on lots, units in the ledger); 012's
  inventory view must read both to show fabric and finished goods together.
- Issued (not yet completed) batches produce no stock, so packets being made cannot be promised
  against a Challan until completion; staged deliveries require staff to split into smaller
  batches rather than record partial receipts.
- Completed batches cannot be corrected in-app. A reversal would need a compensating movement and
  could fail `quantity_on_hand >= 0` once packets are sold — accepted, matching Challans.
- Per-batch *realised* profit is not derivable: Challans don't record which batch packets came
  from. 013 must use product-level profit or projected per-batch figures; manufactured cost basis
  lives only on batches (`products.current_purchase_cost` stays `NULL` for manufactured), leaving
  the stock valuation method to 012.
- Opening balances are a point-in-time staff entry with no source document behind them.

## Alternatives Considered

**Model fabric as a product and move it through `inventory_movements`** — Rejected. Would require
reworking 002/003b (weight-mode `product_id` constraint, the consumption lock, products'
type-specific field check) and a kg-denominated product type, for no gain the lot model doesn't
already provide.

**Single atomic batch action (like Performa Invoicing)** — Rejected. Cannot represent the real
handover-to-return gap: fabric would either stay "available" on the lot while physically with the
contractor (risking double issue) or be deducted with no record of where it is. The Complete form
can still be opened straight after Issue for after-the-fact entry.

**Decrement the lot at Complete instead of at Issue** — Rejected. Same double-issue risk, and 002's
lock would engage late.

**Partial receipts (`batch_receipts` child table)** — Rejected for v1 given business input (one
contractor, staged delivery is rare); multiple smaller batches cover it. Revisit only if staged
deliveries become routine.

**"Returned kg" at Complete, restoring unused fabric to the lot** — Rejected: business confirmed
issued fabric is never returned unconverted.

**Contractor-level default rate in 010 / precedence contractor > product** — Rejected: rate depends
mostly on product; deferred to 011 as a contractor × product rate if needed at all.

**Store the contractor as free text on the batch until 011** — Rejected: forces a data migration in
011 and weakens 011's per-contractor accrual joins.

## References

- Master spec: `specs/PRODUCT-OVERVIEW.md` (Production Batches — Stream B; Labour / Commission
  Ledger; Finished Goods Inventory; Resolved Open Points 4; carried-forward labour-rate point)
- Schema: `supabase/migrations/0001_init.sql` (`raw_material_purchases`),
  `0002_products.sql` (`products_type_fields_check`), `0003_traded_purchases.sql` (mode check),
  `0007_challans.sql` (`inventory_movements`, opening-balance backfill,
  `recompute_product_quantity_on_hand`)
- Code: `lib/purchases/service.ts` (`isLockedPurchase`)
- 007 interim limitation: `specs/007-challans/research.md`
- Related ADRs: [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md),
  [ADR-0004](0004-shared-tables-created-at-first-writer.md),
  [ADR-0005](0005-inventory-movements-created-at-007-not-003b.md)
- Prompt History: `history/prompts/general/0015-production-batches-pre-spec-analysis.general.prompt.md`
  (analysis and agreement; plan.md for 010 does not yet exist — to be referenced once written)
