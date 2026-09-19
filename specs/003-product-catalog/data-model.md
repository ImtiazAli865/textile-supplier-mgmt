# Data Model: Product Catalog

**Feature**: `003-product-catalog` | **Date**: 2026-09-20

Postgres schema derived from spec Key Entities and Functional Requirements. DDL lives in
[`supabase/migrations/0002_products.sql`](../../supabase/migrations/0002_products.sql); this
document explains the shape and the FR each part satisfies.

## Table: `products`

One row per catalog item, traded or manufactured.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK, default `gen_random_uuid()`) | yes | |
| `name` | `text` check not blank | yes | Product name (FR-001). Duplicates permitted, same as supplier `company_name` — no uniqueness requirement in spec. |
| `internal_code` | `text` | no | Free-text, informal, business-only reference (FR-010, spec Assumptions). No uniqueness constraint — not a system lookup key. |
| `type` | `text` check in (`traded`, `manufactured`) | yes | Fixed at creation (FR-004); the service layer's update path never writes this column (see [research.md](./research.md)). |
| `stock_uom` | `text` check not blank | yes | Unit stock is held in (FR-001). |
| `default_selling_price` | `numeric(10,2)` check `> 0` | yes | (FR-001). |
| `expected_yield_per_kg` | `numeric(6,2)` check `> 0` | manufactured only | Single expected packets-per-kg figure, not a range (FR-002; see research.md). `NULL` for traded products. |
| `default_labour_rate_per_packet` | `numeric(10,2)` check `> 0` | manufactured only | (FR-002). `NULL` for traded products. |
| `current_purchase_cost` | `numeric(10,2)` check `> 0` when set | traded only, always optional | Weighted-average purchase cost per unit — derived, read-only in this feature (FR-003). Always `NULL` for manufactured products; starts `NULL` for traded products and is left for a future purchasing feature to populate. |
| `status` | `text` default `'active'` check in (`active`, `inactive`) | yes | (FR-008). |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` maintained by `trg_products_updated_at`, reusing `set_updated_at()` from `0001_init.sql` (FR-015). |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | Supabase Auth user id of the staff member. |

**Type-conditional check constraint** (`products_type_fields_check`): enforces that a
`manufactured` row has both `expected_yield_per_kg` and `default_labour_rate_per_packet`
non-null and `current_purchase_cost` null, while a `traded` row has both manufactured-only
columns null (`current_purchase_cost` is unconstrained either way for traded rows — `NULL`
until a future feature sets it). This is the DB-level backstop for FR-002/FR-003; the
service layer's Zod schemas also branch on `type` so a mismatched submission never reaches the
database in the first place.

**No foreign keys, in or out.** This table has no reference to `suppliers` or
`raw_material_purchases`, and nothing in 001/002 references it — Product Catalog is upstream of
the entire rest of the roadmap, not downstream of anything built so far.

**Deliberately excluded from this table: customer-specific item codes and per-customer selling
units of measure.** Both are described in `specs/PRODUCT-OVERVIEW.md` §2 as part of the product
catalog concept, but both are inherently a mapping between a Product and a Customer, and the
Customer entity does not exist until feature 005. This is not an oversight — see spec.md's Edge
Cases and Assumptions sections for the full reasoning. That mapping (with its own `customer_id`
foreign key) will be added as part of 005-customers or 006-customer-purchase-orders, whichever
spec first needs to resolve a customer's own PO item code to a product.

## Indexes

- `idx_products_status_type_name (status, type, lower(name))` — serves the default list view
  (active products, FR-012), the optional type filter (FR-011), and the default name sort in a
  single index.
- `idx_products_name_trgm` — `gin (lower(name) gin_trgm_ops)`, reusing the `pg_trgm` extension
  already enabled in `0001_init.sql`, for case-insensitive substring search on name (FR-010).
- `idx_products_code_trgm` — `gin (lower(internal_code) gin_trgm_ops) where internal_code is
  not null`, same pattern, for substring search on internal code (FR-010).

## State / Lifecycle

```
        create
          |
          v
      [ active ]  <---> [ inactive ]
          (deactivate / reactivate, FR-008)
```

Unlike 002's one-way consumption lock, status here is freely reversible in both directions —
there is no analogous "locked once referenced" rule in this feature, since no other feature yet
references a product. A future feature (e.g. Customer POs, 006) that references a product by
foreign key may need to reconsider whether a *referenced* product can still be freely
deactivated; that is out of scope here and left for that feature's own spec.

**Type is not part of this lifecycle** — it has no transition at all (FR-004); a product
created as `traded` stays `traded` for the life of the record.

## Derived/computed fields rationale

- `current_purchase_cost`: nullable and unwritten by this feature on purpose — see
  [research.md](./research.md) for why the column is added now even though nothing populates it
  until the future traded-goods-purchasing feature ships.
- `expected_yield_per_kg`: a planning figure only, never treated as authoritative by any future
  consumer (the future Production Batches feature always uses the batch's actually-entered
  figures for cost/inventory — this column is read-only input to a suggested pre-fill, not
  itself derived from anything).

## Row Level Security

Same trust boundary as `suppliers` and `raw_material_purchases`: all application reads/writes go
through Server Actions using the Supabase service-role key, which bypasses RLS. `products` gets
`alter table products enable row level security;` with no policies, denying any future direct/
anon/authenticated-role access by default.
