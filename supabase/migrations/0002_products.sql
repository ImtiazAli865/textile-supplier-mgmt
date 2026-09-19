-- 0002_products.sql
-- Product Catalog schema (feature 003-product-catalog). Run after 0001_init.sql
-- against the same Supabase project. See specs/003-product-catalog/data-model.md.

-- ============================================================================
-- 003-product-catalog
-- ============================================================================

create table products (
  id                             uuid primary key default gen_random_uuid(),
  name                           text not null check (btrim(name) <> ''),
  internal_code                  text,
  type                           text not null check (type in ('traded', 'manufactured')),
  stock_uom                      text not null check (btrim(stock_uom) <> ''),
  default_selling_price          numeric(10, 2) not null check (default_selling_price > 0),
  expected_yield_per_kg          numeric(6, 2) check (expected_yield_per_kg > 0),
  default_labour_rate_per_packet numeric(10, 2) check (default_labour_rate_per_packet > 0),
  current_purchase_cost          numeric(10, 2) check (current_purchase_cost is null or current_purchase_cost > 0),
  status                         text not null default 'active' check (status in ('active', 'inactive')),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  created_by                     uuid not null references auth.users (id),
  updated_by                     uuid not null references auth.users (id),
  -- Manufactured products require a yield ratio + labour rate and never carry
  -- a purchase cost (they aren't purchased); traded products carry neither of
  -- the manufactured-only fields. current_purchase_cost stays unconstrained
  -- for traded rows (NULL until a future purchasing feature sets it). FR-002, FR-003.
  constraint products_type_fields_check check (
    (type = 'manufactured'
      and expected_yield_per_kg is not null
      and default_labour_rate_per_packet is not null
      and current_purchase_cost is null)
    or
    (type = 'traded'
      and expected_yield_per_kg is null
      and default_labour_rate_per_packet is null)
  )
);

comment on table products is 'Product catalog, traded or manufactured (feature 003). current_purchase_cost is populated by a future traded-goods-purchasing feature, not this one. See specs/003-product-catalog/data-model.md.';

-- Default list view: status + optional type filter + name sort (FR-011, FR-012).
create index idx_products_status_type_name on products (status, type, lower(name));
-- Case-insensitive substring search on name (FR-010). Reuses pg_trgm from 0001_init.sql.
create index idx_products_name_trgm on products using gin (lower(name) gin_trgm_ops);
-- Same, for internal code (FR-010).
create index idx_products_code_trgm on products using gin (lower(internal_code) gin_trgm_ops) where internal_code is not null;

-- Reuses set_updated_at() defined in 0001_init.sql.
create trigger trg_products_updated_at
  before update on products
  for each row execute function set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as suppliers/raw_material_purchases: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table products enable row level security;
