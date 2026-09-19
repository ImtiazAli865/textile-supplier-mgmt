# Data Model: Traded-Goods Purchasing

**Feature**: `003b-traded-goods-purchasing` | **Date**: 2026-09-20

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0003_traded_purchases.sql`](../../supabase/migrations/0003_traded_purchases.sql)
(written at implementation time); this document explains the shape and the FR each part
satisfies, and is the basis for that migration.

## Table: `raw_material_purchases` (altered)

Existing columns from [002's data-model.md](../002-raw-material-purchases/data-model.md) that
change:

| Column | Change | Notes |
|---|---|---|
| `weight_kg` | becomes nullable | Required only when `purchase_mode = 'weight'` (enforced by the new table-level `CHECK`, not a column-level `NOT NULL`). |
| `rate_per_kg` | becomes nullable | Same. |
| `remaining_weight_kg` | becomes nullable | Same. |
| `total_cost` | generated expression changes | Was `generated always as (round(weight_kg * rate_per_kg, 2)) stored`; becomes mode-conditional (below). Postgres does not support altering a generated column's expression in place, so the migration drops and re-adds this column — existing weight-mode rows recompute to the identical value they already had. |

New columns:

| Column | Type | Required | Notes |
|---|---|---|---|
| `purchase_mode` | `text` check in (`weight`, `unit`), default `'weight'` | yes | Existing rows (all weight-mode, from 002) backfill to `'weight'` via the column default (FR-001). |
| `product_id` | `uuid` → `products(id)` | unit mode only | The traded product purchased. `NULL` for weight-mode rows — fabric lots still don't reference a product, unchanged from 002 (FR-002). |
| `quantity_units` | `numeric(10,2)` check `> 0` | unit mode only | (FR-002). |
| `rate_per_unit` | `numeric(10,2)` check `> 0` | unit mode only | (FR-002). |
| `remaining_units` | `numeric(10,2)` check `>= 0` | unit mode only | Set equal to `quantity_units` on create, reset to the new `quantity_units` on edit; never decremented by this feature — reserved for a future feature (goods shipped to a customer) to consume, exactly parallel to `remaining_weight_kg` (FR-006). |

**`total_cost` (re-created)**:

```
generated always as (
  case purchase_mode
    when 'weight' then round(weight_kg * rate_per_kg, 2)
    when 'unit'   then round(quantity_units * rate_per_unit, 2)
  end
) stored
```

**Type-conditional check constraint** (`purchases_mode_fields_check`): enforces that a
`weight`-mode row has `weight_kg`/`rate_per_kg`/`remaining_weight_kg` non-null and
`product_id`/`quantity_units`/`rate_per_unit`/`remaining_units` all null, while a `unit`-mode row
has exactly the reverse. This is the DB-level backstop for FR-001/FR-002, mirroring 003's
`products_type_fields_check` pattern; the service layer's Zod discriminated union also branches
on mode so a mismatched submission never reaches the database.

**Consumption lock (derived, unchanged in spirit from 002)**: a purchase is locked for edit/
delete whenever, for its mode, remaining is strictly less than the original purchased amount —
`remaining_weight_kg < weight_kg` for weight-mode (unchanged), `remaining_units <
quantity_units` for unit-mode (FR-013, new). Still computed at read/action time, never stored.

## Table: `products` (altered)

| Column | Type | Required | Notes |
|---|---|---|---|
| `quantity_on_hand` | `numeric(10,2)` not null, default `0`, check `>= 0` | yes | Increases (and is fully recomputed, see below) whenever a unit-mode purchase referencing this product is created, edited, or deleted (FR-005). Existing products (from 003) backfill to `0` via the column default. Not type-restricted at the schema level — a future feature (Production Batches) will maintain it for manufactured products too, by the same column. |

`current_purchase_cost` (already present from 003, previously always `NULL`) is now actively
written by this feature for traded products with at least one unit-mode purchase (FR-004).

## New Postgres functions

Mirrors the `create_supplier`/`update_supplier` pattern from `0001_init.sql` — multi-table
writes that must be atomic go through a function, not sequential client calls (see
[research.md](./research.md)).

### `record_unit_purchase(p_supplier_id, p_product_id, p_purchase_date, p_quantity_units, p_rate_per_unit, p_user_id) returns uuid`

Inserts a new `unit`-mode row into `raw_material_purchases` (`remaining_units` set equal to
`quantity_units`), then recomputes and writes `products.current_purchase_cost` and
`products.quantity_on_hand` for `p_product_id` from that product's full current set of
unit-mode purchase rows (including the one just inserted). Returns the new purchase's `id`.

### `update_unit_purchase(p_id, p_supplier_id, p_product_id, p_purchase_date, p_quantity_units, p_rate_per_unit, p_user_id) returns void`

Updates the existing `unit`-mode row (resetting `remaining_units` to the new `quantity_units`,
same reasoning as 002's weight-mode edit), then recomputes `current_purchase_cost`/
`quantity_on_hand` for **both** the old and new `product_id` if the purchase was reassigned to a
different product (the common case: old = new, one recompute). Caller (the service layer) is
responsible for the lock check (`remaining_units <> quantity_units` on the existing row) before
calling this function, exactly as 002's `updatePurchaseRecord` already checks the weight-mode
lock before its `UPDATE`.

### `delete_unit_purchase(p_id) returns void`

Deletes the row, then recomputes `current_purchase_cost`/`quantity_on_hand` for the product it
referenced (reverting to `NULL`/`0` respectively if no unit-mode purchases remain for that
product). Same caller-side lock-check responsibility as above.

All three run as the same Postgres role the service-role `supabase-js` client already uses
(`SECURITY INVOKER`, the default) — they don't change the RLS trust boundary, since the
service-role key already bypasses RLS entirely.

## Indexes

- `idx_purchases_product_date (product_id, purchase_date desc) where product_id is not null` —
  the new product filter (FR-008) combined with the default sort, partial so weight-mode rows
  (which never match this filter) don't bloat the index.
- Existing `idx_purchases_supplier_date` and `idx_purchases_date` from 002 continue to serve
  both modes unchanged, since `supplier_id` and `purchase_date` exist on every row regardless of
  mode.

## State / Lifecycle

```
        create (either mode)
              |
              v
   [ unconsumed ]  (remaining_* = purchased_*)
     |  edit/delete allowed (FR-011, FR-012)
     |
     v  (future: goods-shipped-to-customer feature consumes remaining_units;
     |   Production Batches, already planned, consumes remaining_weight_kg)
   [ partially/fully consumed ]  (remaining_* < purchased_*)
     |  edit/delete blocked (FR-013) — record becomes read-only
```

Identical shape to 002's lifecycle, now parameterized by mode. No new transition exists; this
feature only adds a second set of columns the same two states apply to.

## Derived/computed fields rationale

- `total_cost`: stays a Postgres `generated always as` column post-migration — still
  structurally impossible to store a mismatched value, now for either mode (FR-003).
- `remaining_units`: exists purely so a future feature (recording goods shipped to a customer)
  has a column to consume against, exactly parallel to `remaining_weight_kg`'s role for the
  future Production Batches feature.
- `products.current_purchase_cost` / `products.quantity_on_hand`: both fully recomputed (not
  incrementally patched) on every unit-mode write, so they can never drift from the true set of
  purchases that exist — see research.md's rationale.

## Row Level Security

Unchanged trust boundary from 001/002/003: all application reads/writes go through Server
Actions using the Supabase service-role key, which bypasses RLS. No new `alter table` RLS
statements are needed — `raw_material_purchases` and `products` already have RLS enabled with
no policies from their original migrations.
