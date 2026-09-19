-- 0003_traded_purchases.sql
-- Extends 002-raw-material-purchases so raw_material_purchases also records per-unit
-- purchases of traded catalog items (003-product-catalog), alongside the existing
-- per-kg raw fabric purchases. See specs/003b-traded-goods-purchasing/data-model.md.

-- ============================================================================
-- raw_material_purchases: add purchase_mode + unit-mode columns
-- ============================================================================

alter table raw_material_purchases
  alter column weight_kg drop not null,
  alter column rate_per_kg drop not null,
  alter column remaining_weight_kg drop not null;

alter table raw_material_purchases
  add column purchase_mode text not null default 'weight' check (purchase_mode in ('weight', 'unit')),
  add column product_id uuid references products (id),
  add column quantity_units numeric(10, 2) check (quantity_units > 0),
  add column rate_per_unit numeric(10, 2) check (rate_per_unit > 0),
  add column remaining_units numeric(10, 2) check (remaining_units >= 0);

-- Postgres does not support altering a generated column's expression in place —
-- drop and re-add with the mode-conditional expression. Existing weight-mode rows
-- recompute to the identical value they already had.
alter table raw_material_purchases drop column total_cost;
alter table raw_material_purchases
  add column total_cost numeric(12, 2) generated always as (
    case purchase_mode
      when 'weight' then round(weight_kg * rate_per_kg, 2)
      when 'unit'   then round(quantity_units * rate_per_unit, 2)
    end
  ) stored;

-- DB-level backstop mirroring 003's products_type_fields_check pattern (FR-001, FR-002).
alter table raw_material_purchases
  add constraint purchases_mode_fields_check check (
    (
      purchase_mode = 'weight'
      and weight_kg is not null and rate_per_kg is not null and remaining_weight_kg is not null
      and product_id is null and quantity_units is null and rate_per_unit is null and remaining_units is null
    )
    or
    (
      purchase_mode = 'unit'
      and product_id is not null and quantity_units is not null and rate_per_unit is not null and remaining_units is not null
      and weight_kg is null and rate_per_kg is null and remaining_weight_kg is null
    )
  );

-- New product filter (FR-008) combined with the default sort; partial so weight-mode
-- rows (which never match this filter) don't bloat the index.
create index idx_purchases_product_date on raw_material_purchases (product_id, purchase_date desc) where product_id is not null;

-- ============================================================================
-- products: quantity_on_hand
-- ============================================================================

alter table products
  add column quantity_on_hand numeric(10, 2) not null default 0 check (quantity_on_hand >= 0);

comment on column products.quantity_on_hand is 'Maintained by traded-goods purchasing (003b) for traded products; a future Production Batches feature will maintain it for manufactured products too, via the same column.';
comment on column products.current_purchase_cost is 'Weighted-average cost across a product''s per-unit purchases (003b); null until at least one exists. Always null for manufactured products.';

-- ============================================================================
-- Atomic multi-table writes for unit-mode purchases
-- ============================================================================
-- Mirrors the create_supplier/update_supplier pattern from 0001_init.sql: a
-- unit-mode purchase's row and the affected product's recalculated cost/quantity
-- must never go out of sync, so both writes happen in one Postgres function
-- rather than two sequential supabase-js calls. See research.md.

-- Shared helper: fully recomputes (never incrementally patches) a product's
-- current_purchase_cost and quantity_on_hand from its complete set of current
-- unit-mode purchase rows. Used by all three functions below.
create or replace function recompute_product_purchase_stats(p_product_id uuid)
returns void
language plpgsql
as $$
declare
  v_total_qty numeric;
  v_total_cost numeric;
begin
  select coalesce(sum(quantity_units), 0), coalesce(sum(quantity_units * rate_per_unit), 0)
  into v_total_qty, v_total_cost
  from raw_material_purchases
  where product_id = p_product_id and purchase_mode = 'unit';

  update products
  set
    quantity_on_hand = round(v_total_qty, 2),
    current_purchase_cost = case when v_total_qty > 0 then round(v_total_cost / v_total_qty, 2) else null end
  where id = p_product_id;
end;
$$;

create or replace function record_unit_purchase(
  p_supplier_id uuid,
  p_product_id uuid,
  p_purchase_date date,
  p_quantity_units numeric,
  p_rate_per_unit numeric,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into raw_material_purchases (
    supplier_id, purchase_date, purchase_mode, product_id,
    quantity_units, rate_per_unit, remaining_units, created_by, updated_by
  ) values (
    p_supplier_id, p_purchase_date, 'unit', p_product_id,
    p_quantity_units, p_rate_per_unit, p_quantity_units, p_user_id, p_user_id
  )
  returning id into v_id;

  perform recompute_product_purchase_stats(p_product_id);

  return v_id;
end;
$$;

create or replace function update_unit_purchase(
  p_id uuid,
  p_supplier_id uuid,
  p_product_id uuid,
  p_purchase_date date,
  p_quantity_units numeric,
  p_rate_per_unit numeric,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_old_product_id uuid;
begin
  select product_id into v_old_product_id from raw_material_purchases where id = p_id;

  update raw_material_purchases set
    supplier_id = p_supplier_id,
    product_id = p_product_id,
    purchase_date = p_purchase_date,
    quantity_units = p_quantity_units,
    rate_per_unit = p_rate_per_unit,
    -- Reset to the new quantity — edit is only reachable while unconsumed, so
    -- remaining always equals the (possibly updated) full quantity again.
    remaining_units = p_quantity_units,
    updated_by = p_user_id
  where id = p_id;

  perform recompute_product_purchase_stats(v_old_product_id);
  if p_product_id is distinct from v_old_product_id then
    perform recompute_product_purchase_stats(p_product_id);
  end if;
end;
$$;

create or replace function delete_unit_purchase(p_id uuid)
returns void
language plpgsql
as $$
declare
  v_product_id uuid;
begin
  select product_id into v_product_id from raw_material_purchases where id = p_id;

  delete from raw_material_purchases where id = p_id;

  perform recompute_product_purchase_stats(v_product_id);
end;
$$;
