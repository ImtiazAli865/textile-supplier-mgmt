-- 0007_challans.sql
-- Challans (007-challans): delivery challans against customer POs (006), issued under a trade
-- name (004), with a delivered-vs-accepted split and mandatory shortfall disposition. This
-- feature is the real first writer of inventory_movements (the master roadmap wrongly assumed
-- 003b already created it — see ADR-0005) and makes it the sole source of truth for
-- products.quantity_on_hand going forward, requiring 003b's own purchase-mutation functions to
-- be redefined here (via CREATE OR REPLACE, never editing 0003_traded_purchases.sql in place).
-- See specs/007-challans/data-model.md.

-- ============================================================================
-- inventory_movements (new, shared, insert-only — first written by this feature)
-- ============================================================================

create table inventory_movements (
  id            uuid primary key default gen_random_uuid(),
  product_id    uuid not null references products (id),
  qty_delta     numeric(10, 2) not null check (qty_delta <> 0),
  reason        text not null,
  source_type   text not null,
  source_id     uuid,
  movement_date date not null,
  created_at    timestamptz not null default now(),
  created_by    uuid references auth.users (id)
);

comment on table inventory_movements is 'Insert-only stock ledger (shared table, first written by 007-challans — see ADR-0005 for the correction of ADR-0004''s original claim that 003b created this). Purchases (003b, redefined below) and Challans (this feature) both write to it; a future Production Batches feature will too. No update/delete path anywhere. products.quantity_on_hand is always exactly the sum of a product''s movements (recompute_product_quantity_on_hand).';
comment on column inventory_movements.reason is 'Free text (not an enum) — e.g. ''Purchase recorded''/''Purchase updated''/''Purchase deleted'', ''Opening balance at 007 cutover'', ''Challan accepted''/''Challan shortfall returned to inventory''. Deliberately unconstrained so future writers (010-production-batches, any manual-adjustment capability) can introduce new values without a migration.';
comment on column inventory_movements.source_id is 'The originating row''s id (a raw_material_purchases.id or challan_lines.id); null for the one-time opening-balance backfill. No FK — deliberately polymorphic, matching ledger_entries.source_id (005).';
comment on column inventory_movements.created_by is 'Null only for the one-time opening-balance backfill below, which has no attributable staff action; always set for every application-inserted row (purchases, Challans).';

create index idx_inventory_movements_product_date on inventory_movements (product_id, movement_date desc);

-- One-time backfill: preserves 003b's purchase history as a single starting balance per
-- existing traded product, so inventory_movements becomes authoritative going forward without
-- replaying every individual historical purchase row (FR-011). Manufactured products are
-- excluded — their quantity_on_hand has always been 0 with no writer yet (research.md's
-- manufactured-product interim limitation, resolved by 010-production-batches later).
insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
select id, quantity_on_hand, 'Opening balance at 007 cutover', 'opening_balance', null, current_date, null
from products
where type = 'traded' and quantity_on_hand <> 0;

-- ============================================================================
-- recompute_product_quantity_on_hand: the sole writer of products.quantity_on_hand from here on
-- ============================================================================

create or replace function recompute_product_quantity_on_hand(p_product_id uuid)
returns void
language plpgsql
as $$
begin
  update products
  set quantity_on_hand = coalesce(
    (select sum(qty_delta) from inventory_movements where product_id = p_product_id), 0
  )
  where id = p_product_id;
end;
$$;

comment on column products.quantity_on_hand is 'The running sum of this product''s inventory_movements rows (recompute_product_quantity_on_hand) — never written to directly by anything, from 007-challans onward. Previously (003b) recomputed directly from purchase history; see ADR-0005.';

-- ============================================================================
-- Redefine 003b's purchase-mutation functions (CREATE OR REPLACE here, in this new
-- migration — 0003_traded_purchases.sql itself is never edited) so each writes its own
-- inventory_movements row instead of recompute_product_purchase_stats overwriting
-- quantity_on_hand directly. current_purchase_cost's own weighted-average logic is unchanged.
-- ============================================================================

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

  -- quantity_on_hand is intentionally no longer set here (ADR-0005) — only
  -- recompute_product_quantity_on_hand writes it, from inventory_movements.
  update products
  set current_purchase_cost = case when v_total_qty > 0 then round(v_total_cost / v_total_qty, 2) else null end
  where id = p_product_id;
end;
$$;

-- record_unit_purchase: unchanged purchase-row insert, plus one new movement for the full
-- quantity purchased.
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

  insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
  values (p_product_id, p_quantity_units, 'Purchase recorded', 'purchase', v_id, p_purchase_date, p_user_id);

  perform recompute_product_purchase_stats(p_product_id);
  perform recompute_product_quantity_on_hand(p_product_id);

  return v_id;
end;
$$;

-- update_unit_purchase: writes a net-delta movement (or a full reversal+addition if the
-- purchase moved to a different product) instead of relying on a full recompute — the ledger
-- stays insert-only even when a purchase is corrected (research.md).
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
  v_old_quantity_units numeric;
begin
  select product_id, quantity_units into v_old_product_id, v_old_quantity_units
  from raw_material_purchases where id = p_id;

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

  if p_product_id is distinct from v_old_product_id then
    if v_old_quantity_units <> 0 then
      insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
      values (v_old_product_id, -v_old_quantity_units, 'Purchase updated (moved to a different product)', 'purchase', p_id, p_purchase_date, p_user_id);
    end if;
    if p_quantity_units <> 0 then
      insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
      values (p_product_id, p_quantity_units, 'Purchase updated (moved to a different product)', 'purchase', p_id, p_purchase_date, p_user_id);
    end if;
  elsif p_quantity_units <> v_old_quantity_units then
    insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
    values (p_product_id, p_quantity_units - v_old_quantity_units, 'Purchase updated', 'purchase', p_id, p_purchase_date, p_user_id);
  end if;

  perform recompute_product_purchase_stats(v_old_product_id);
  if p_product_id is distinct from v_old_product_id then
    perform recompute_product_purchase_stats(p_product_id);
    perform recompute_product_quantity_on_hand(p_product_id);
  end if;
  perform recompute_product_quantity_on_hand(v_old_product_id);
end;
$$;

-- delete_unit_purchase: signature extended with p_user_id (needed to attribute the reversing
-- movement; every other created_by in this schema is threaded through explicitly the same way,
-- since RPCs run under the service-role client where auth.uid() is unavailable). Its one caller,
-- deletePurchaseRecord (lib/purchases/service.ts), is updated to pass it through.
create or replace function delete_unit_purchase(p_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_product_id uuid;
  v_quantity_units numeric;
  v_purchase_date date;
begin
  select product_id, quantity_units, purchase_date into v_product_id, v_quantity_units, v_purchase_date
  from raw_material_purchases where id = p_id;

  delete from raw_material_purchases where id = p_id;

  if v_quantity_units <> 0 then
    insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
    values (v_product_id, -v_quantity_units, 'Purchase deleted', 'purchase', p_id, current_date, p_user_id);
  end if;

  perform recompute_product_purchase_stats(v_product_id);
  perform recompute_product_quantity_on_hand(v_product_id);
end;
$$;

-- ============================================================================
-- challans
-- ============================================================================

create table challans (
  id                          uuid primary key default gen_random_uuid(),
  po_id                       uuid not null references customer_pos (id),
  trade_name_id               uuid not null references trade_names (id),
  challan_number              varchar(30) not null check (btrim(challan_number) <> ''),
  challan_date                date not null,
  status                      text not null default 'issued' check (status in ('issued', 'accepted', 'voided')),
  accepted_at                 timestamptz,
  accepted_by                 uuid references auth.users (id),
  signed_copy_storage_path    text,
  signed_copy_file_name       text,
  signed_copy_content_type    text,
  signed_copy_uploaded_at     timestamptz,
  signed_copy_uploaded_by     uuid references auth.users (id),
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now(),
  created_by                  uuid not null references auth.users (id),
  updated_by                  uuid not null references auth.users (id),
  constraint challans_trade_name_number_unique unique (trade_name_id, challan_number)
);

comment on table challans is 'A delivery note issued against a single customer PO (feature 007). See specs/007-challans/data-model.md.';
comment on column challans.challan_number is 'Auto-generated (CH #NNN/Mon, per-trade-name sequence via trade_names.next_challan_number) or staff-overridden; unique per trade name (FR-004).';
comment on column challans.status is 'issued (created/printable/editable) -> accepted (finalized, fully read-only, FR-013) or voided (cancelled before acceptance, FR-013/FR-014). No further transitions.';

create index idx_challans_po_status on challans (po_id, status);

create trigger trg_challans_updated_at
  before update on challans
  for each row execute function set_updated_at();

-- ============================================================================
-- challan_lines (1:N)
-- ============================================================================

create table challan_lines (
  id                    uuid primary key default gen_random_uuid(),
  challan_id            uuid not null references challans (id) on delete cascade,
  position              smallint not null default 0,
  po_line_id            uuid not null references customer_po_lines (id),
  product_id            uuid not null references products (id),
  uom                   text not null check (btrim(uom) <> ''),
  unit_price            numeric(12, 2) not null check (unit_price > 0),
  delivered_quantity    numeric(10, 2) not null check (delivered_quantity > 0),
  accepted_quantity     numeric(10, 2) not null check (accepted_quantity >= 0 and accepted_quantity <= delivered_quantity),
  shortfall_disposition text check (shortfall_disposition in ('return_to_inventory', 'write_off')),
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

comment on table challan_lines is 'One line item on a Challan (feature 007). po_line_id has no on delete cascade — the ordinary FK RESTRICT default prevents a referenced customer_po_lines row from ever being deleted while any Challan still points to it (research.md).';
comment on column challan_lines.product_id is 'Snapshot from the PO line at creation time — never re-read live afterward (research.md), since 006''s own edit-lock on that PO line only engages once delivered_quantity is nonzero, which happens only at Challan acceptance, not issuance.';
comment on column challan_lines.uom is 'Snapshot from the PO line at creation time — see product_id''s comment.';
comment on column challan_lines.unit_price is 'Snapshot from the PO line at creation time; this value, not any later PO-line edit, drives the ledger credit at acceptance (FR-012).';
comment on column challan_lines.shortfall_disposition is 'Null unless accepted_quantity < delivered_quantity; required by accept_challan (not a CHECK, since the requirement is conditional on two other columns) before acceptance can complete (FR-007).';

create index idx_challan_lines_challan on challan_lines (challan_id, position);
create index idx_challan_lines_po_line on challan_lines (po_line_id);

create trigger trg_challan_lines_updated_at
  before update on challan_lines
  for each row execute function set_updated_at();

-- ============================================================================
-- Storage: challan-attachments (third private bucket in this project)
-- ============================================================================
-- Same trust boundary as trade-name-assets/customer-po-documents (ADR-0003).

insert into storage.buckets (id, name, public)
values ('challan-attachments', 'challan-attachments', false)
on conflict (id) do nothing;

-- ============================================================================
-- create_challan / update_challan / void_challan / accept_challan
-- ============================================================================

create or replace function create_challan(
  p_po_id uuid,
  p_trade_name_id uuid,
  p_challan_number varchar(30),
  p_challan_date date,
  p_lines jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_po_status text;
  v_id uuid;
  v_number_seq integer;
  v_challan_number varchar(30);
  v_line jsonb;
  v_ord bigint;
  v_po_line customer_po_lines%rowtype;
  v_remaining numeric;
  v_delivered_quantity numeric;
begin
  select status into v_po_status from customer_pos where id = p_po_id;
  if not found or v_po_status <> 'open' then
    raise exception 'PO_NOT_OPEN: the referenced PO does not exist or is not open';
  end if;

  -- Reject a p_lines array referencing the same PO line more than once. Without this, two
  -- lines pointing at the same po_line_id could each individually pass the remaining-quantity
  -- check below while together exceeding it — this function never writes to customer_po_lines
  -- itself (only accept_challan does), so every iteration of the loop re-reads the *same*
  -- stale remaining figure. A second partial delivery of the same PO line belongs on a
  -- separate Challan, not a second line on this one.
  if exists (
    select 1 from (
      select (l ->> 'poLineId')::uuid as po_line_id, count(*) as cnt
      from jsonb_array_elements(p_lines) as l
      group by 1
    ) dupes
    where cnt > 1
  ) then
    raise exception 'DUPLICATE_PO_LINE: a Challan cannot reference the same PO line more than once';
  end if;

  if p_challan_number is null or btrim(p_challan_number) = '' then
    update trade_names
    set next_challan_number = next_challan_number + 1
    where id = p_trade_name_id
    returning next_challan_number - 1 into v_number_seq;

    if not found then
      raise exception 'TRADE_NAME_NOT_FOUND: the referenced trade name does not exist';
    end if;

    v_challan_number := 'CH #' || lpad(v_number_seq::text, 3, '0') || '/' || to_char(p_challan_date, 'Mon');
  else
    v_challan_number := p_challan_number;
  end if;

  insert into challans (po_id, trade_name_id, challan_number, challan_date, created_by, updated_by)
  values (p_po_id, p_trade_name_id, v_challan_number, p_challan_date, p_user_id, p_user_id)
  returning id into v_id;

  for v_line, v_ord in
    select l, ord from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
  loop
    select * into v_po_line
    from customer_po_lines
    where id = (v_line ->> 'poLineId')::uuid and po_id = p_po_id;

    if not found then
      raise exception 'PO_LINE_NOT_FOUND: line % does not belong to this PO', v_line ->> 'poLineId';
    end if;

    v_remaining := v_po_line.quantity_ordered - v_po_line.delivered_quantity;
    if v_remaining <= 0 then
      raise exception 'LINE_FULLY_DELIVERED: line % has no remaining quantity to deliver', v_po_line.id;
    end if;

    v_delivered_quantity := (v_line ->> 'deliveredQuantity')::numeric;
    if v_delivered_quantity > v_remaining then
      raise exception 'LINE_EXCEEDS_REMAINING: line % has only % remaining', v_po_line.id, v_remaining;
    end if;

    insert into challan_lines (
      challan_id, position, po_line_id, product_id, uom, unit_price,
      delivered_quantity, accepted_quantity, shortfall_disposition
    ) values (
      v_id, (v_ord - 1)::smallint, v_po_line.id, v_po_line.product_id, v_po_line.uom, v_po_line.unit_price,
      v_delivered_quantity, v_delivered_quantity, null
    );
  end loop;

  return v_id;
end;
$$;

create or replace function update_challan(
  p_id uuid,
  p_trade_name_id uuid,
  p_challan_number varchar(30),
  p_challan_date date,
  p_lines jsonb,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_po_id uuid;
  v_line jsonb;
  v_ord bigint;
  v_po_line customer_po_lines%rowtype;
  v_remaining numeric;
  v_delivered_quantity numeric;
  v_accepted_quantity numeric;
  v_disposition text;
begin
  select status, po_id into v_status, v_po_id from challans where id = p_id;
  if not found then
    raise exception 'NOT_FOUND: Challan % does not exist', p_id;
  end if;
  if v_status <> 'issued' then
    raise exception 'CHALLAN_NOT_EDITABLE: this Challan has already been % and can no longer be edited', v_status;
  end if;

  -- Same duplicate-po_line_id guard as create_challan, for the same reason (this function
  -- deletes and reinserts challan_lines below but, like create_challan, never writes to
  -- customer_po_lines itself).
  if exists (
    select 1 from (
      select (l ->> 'poLineId')::uuid as po_line_id, count(*) as cnt
      from jsonb_array_elements(p_lines) as l
      group by 1
    ) dupes
    where cnt > 1
  ) then
    raise exception 'DUPLICATE_PO_LINE: a Challan cannot reference the same PO line more than once';
  end if;

  update challans set
    trade_name_id = p_trade_name_id,
    challan_number = p_challan_number,
    challan_date = p_challan_date,
    updated_by = p_user_id
    -- status/accepted_at/accepted_by are intentionally omitted — only void_challan/accept_challan may change them.
  where id = p_id;

  -- No per-line lock exists within an Issued Challan (research.md) — full replace, not 006's
  -- per-line upsert.
  delete from challan_lines where challan_id = p_id;

  for v_line, v_ord in
    select l, ord from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
  loop
    select * into v_po_line
    from customer_po_lines
    where id = (v_line ->> 'poLineId')::uuid and po_id = v_po_id;

    if not found then
      raise exception 'PO_LINE_NOT_FOUND: line % does not belong to this Challan''s PO', v_line ->> 'poLineId';
    end if;

    v_remaining := v_po_line.quantity_ordered - v_po_line.delivered_quantity;
    if v_remaining <= 0 then
      raise exception 'LINE_FULLY_DELIVERED: line % has no remaining quantity to deliver', v_po_line.id;
    end if;

    v_delivered_quantity := (v_line ->> 'deliveredQuantity')::numeric;
    if v_delivered_quantity > v_remaining then
      raise exception 'LINE_EXCEEDS_REMAINING: line % has only % remaining', v_po_line.id, v_remaining;
    end if;

    v_accepted_quantity := (v_line ->> 'acceptedQuantity')::numeric;
    if v_accepted_quantity > v_delivered_quantity then
      raise exception 'ACCEPTED_EXCEEDS_DELIVERED: line % accepted quantity cannot exceed delivered quantity', v_po_line.id;
    end if;

    v_disposition := nullif(v_line ->> 'shortfallDisposition', '');

    insert into challan_lines (
      challan_id, position, po_line_id, product_id, uom, unit_price,
      delivered_quantity, accepted_quantity, shortfall_disposition
    ) values (
      p_id, (v_ord - 1)::smallint, v_po_line.id, v_po_line.product_id, v_po_line.uom, v_po_line.unit_price,
      v_delivered_quantity, v_accepted_quantity, v_disposition
    );
  end loop;
end;
$$;

create or replace function void_challan(p_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
begin
  select status into v_status from challans where id = p_id;
  if not found then
    raise exception 'NOT_FOUND: Challan % does not exist', p_id;
  end if;
  if v_status <> 'issued' then
    raise exception 'CHALLAN_NOT_VOIDABLE: this Challan has already been %', v_status;
  end if;

  update challans set status = 'voided', updated_by = p_user_id where id = p_id;
end;
$$;

create or replace function accept_challan(p_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_po_id uuid;
  v_po_status text;
  v_customer_id uuid;
  v_issues_performa_invoice boolean;
  v_challan_date date;
  v_challan_number text;
  v_line challan_lines%rowtype;
  v_missing_ids uuid[] := '{}';
  v_has_accepted boolean := false;
  v_credit_amount numeric := 0;
  v_shortfall numeric;
begin
  select status, po_id, challan_date, challan_number into v_status, v_po_id, v_challan_date, v_challan_number
  from challans where id = p_id;
  if not found then
    raise exception 'NOT_FOUND: Challan % does not exist', p_id;
  end if;
  if v_status <> 'issued' then
    raise exception 'CHALLAN_NOT_ISSUED: this Challan has already been %', v_status;
  end if;

  select status, customer_id into v_po_status, v_customer_id from customer_pos where id = v_po_id;
  if v_po_status = 'cancelled' then
    raise exception 'PO_CANCELLED: the referenced PO is cancelled';
  end if;

  -- Pass 1: validate (no writes yet) — every shortfall line must have a disposition, and at
  -- least one line must have a positive accepted quantity.
  for v_line in select * from challan_lines where challan_id = p_id loop
    if v_line.accepted_quantity > 0 then
      v_has_accepted := true;
    end if;
    if v_line.accepted_quantity < v_line.delivered_quantity and v_line.shortfall_disposition is null then
      v_missing_ids := array_append(v_missing_ids, v_line.id);
    end if;
  end loop;

  if not v_has_accepted then
    raise exception 'NO_ACCEPTED_QUANTITY: at least one line must have a positive accepted quantity';
  end if;
  if array_length(v_missing_ids, 1) > 0 then
    raise exception 'MISSING_SHORTFALL_DISPOSITION:%', array_to_string(v_missing_ids, ',');
  end if;

  -- Pass 2: post every effect.
  for v_line in select * from challan_lines where challan_id = p_id loop
    if v_line.accepted_quantity > 0 then
      insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
      values (v_line.product_id, -v_line.accepted_quantity, 'Challan accepted', 'challan_line', v_line.id, v_challan_date, p_user_id);

      v_credit_amount := v_credit_amount + round(v_line.accepted_quantity * v_line.unit_price, 2);
    end if;

    v_shortfall := v_line.delivered_quantity - v_line.accepted_quantity;
    if v_shortfall > 0 and v_line.shortfall_disposition = 'return_to_inventory' then
      insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
      values (v_line.product_id, v_shortfall, 'Challan shortfall returned to inventory', 'challan_line', v_line.id, current_date, p_user_id);
    end if;

    perform recompute_product_quantity_on_hand(v_line.product_id);

    update customer_po_lines
    set delivered_quantity = delivered_quantity + v_line.accepted_quantity
    where id = v_line.po_line_id;
  end loop;

  select issues_performa_invoice into v_issues_performa_invoice from customers where id = v_customer_id;
  if not v_issues_performa_invoice and v_credit_amount > 0 then
    insert into ledger_entries (customer_id, entry_date, type, amount, source_type, source_id, description, created_by)
    values (v_customer_id, v_challan_date, 'credit', v_credit_amount, 'challan', p_id, 'Challan ' || v_challan_number, p_user_id);
  end if;

  update challans set status = 'accepted', accepted_at = now(), accepted_by = p_user_id where id = p_id;
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table inventory_movements enable row level security;
alter table challans enable row level security;
alter table challan_lines enable row level security;
