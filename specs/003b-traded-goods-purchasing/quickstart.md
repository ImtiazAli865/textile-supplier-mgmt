# Quickstart: Traded-Goods Purchasing

**Feature**: `003b-traded-goods-purchasing` | **Date**: 2026-09-20

Extends the app already scaffolded for 001/002/003 — no new environment variables. Uses the
same Supabase project (Postgres + Auth) and the same local dev setup; the schema changes and
new Postgres functions are added in
[`supabase/migrations/0003_traded_purchases.sql`](../../supabase/migrations/0003_traded_purchases.sql).

## Prerequisites

- Everything from [003's quickstart.md](../003-product-catalog/quickstart.md) (Node.js 20+,
  Supabase project with `0001_init.sql` and `0002_products.sql` applied, a staff user in
  Supabase Auth) already set up.
- `0003_traded_purchases.sql` applied to the same Supabase project before testing this feature.
- At least one **active, traded-type** product already exists in the Product Catalog (003) —
  per-unit purchases cannot be created without one.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Record a per-unit purchase & see the product update** (User Story 1): Go to "Add
   Purchase", switch mode to per-unit, select an existing active supplier and an existing
   active traded product, enter a purchase date, quantity, and rate per unit → confirm it saves
   with an auto-calculated total cost and appears at the top of the unified purchase list. Open
   the purchased product's catalog detail page → confirm its current purchase cost now shows
   the rate just entered and its quantity on hand increased by the purchased amount. Record a
   second purchase of the same product at a different rate → confirm the cost updates to the
   weighted average and quantity on hand increases again. Try submitting with no supplier or
   product selected, or with quantity/rate ≤ 0 → confirm a validation error and nothing saved.
   Open the product picker → confirm only active, traded-type products appear.
3. **Browse the unified list** (User Story 2): With a mix of per-kg and per-unit purchases
   seeded, confirm the list shows both together, most-recent-first, each row clearly labeled
   with its mode and correct unit. Filter by supplier and by date range → confirm both modes'
   matching rows show and totals narrow accordingly. Filter by product → confirm only that
   product's per-unit purchases show. Confirm the totals panel shows weight and unit totals
   separately (omitting whichever mode has no rows in the current filter) plus a combined grand
   total cost.
4. **Edit & delete a per-unit purchase** (User Story 3): Open an unconsumed per-unit purchase,
   edit its quantity and rate, save → confirm the total cost, remaining quantity, and the
   product's cost/quantity-on-hand all update to match. Delete an unconsumed per-unit purchase
   → confirm it's removed and the product's cost/quantity-on-hand recompute as if it never
   existed (reverting to "not yet established"/zero if it was the product's only purchase). To
   verify the lock (FR-013) without waiting for the future goods-shipped feature, manually
   reduce a test row's `remaining_units` below its `quantity_units` in the Supabase SQL editor,
   then confirm the app blocks editing and deleting that record with a clear message.
5. **Regression check**: Repeat 002's existing per-kg purchase flow (create, edit, delete,
   consumption lock) end-to-end → confirm it behaves identically to before this feature shipped
   (SC-006).

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
