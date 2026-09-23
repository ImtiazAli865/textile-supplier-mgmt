-- 0010_production_batches.sql
-- Production Batches (010-production-batches): records each hand-over of a weight of raw fabric
-- from one lot (raw_material_purchases, weight mode) to one external contractor, to be made into
-- whole packets of one manufactured product. Lifecycle issued -> completed | voided. Issuing
-- deducts the weight from the lot at once (engaging 002's existing "used lot" lock); completing
-- adds the packets to stock via inventory_movements and freezes raw material cost (always on the
-- weight ISSUED), labour cost, total and average cost, wastage and yield variance. Fabric itself
-- never enters inventory_movements. Also adds a minimal contractors table (extended by 011) and a
-- one-time opening stock entry (plus at most one correction) for manufactured products, resolving
-- 007's manufactured-product interim limitation.
-- See specs/010-production-batches/data-model.md, research.md and
-- history/adr/0008-production-batch-lifecycle-and-stock-split.md.

-- ============================================================================
-- contractors (new — first writer per ADR-0004; 011 extends it)
-- ============================================================================

create table contractors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  phone      text,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id)
);

comment on table contractors is 'External manufacturing contractors fabric is issued to (feature 010). Deactivated, never deleted, so batch history always resolves a name. 011-labour-commission-ledger extends this table with payments/rates. See specs/010-production-batches/data-model.md.';

-- Case-insensitive, trim-insensitive uniqueness (FR-001).
create unique index idx_contractors_name_unique on contractors (lower(btrim(name)));
create index idx_contractors_status_name on contractors (status, lower(name));

create trigger trg_contractors_updated_at
  before update on contractors
  for each row execute function set_updated_at();

-- ============================================================================
-- production_batches (new)
-- ============================================================================

create sequence production_batch_number_seq;

create table production_batches (
  id                       uuid primary key default gen_random_uuid(),
  batch_number             varchar(20) not null unique,
  status                   text not null default 'issued' check (status in ('issued', 'completed', 'voided')),
  lot_id                   uuid not null references raw_material_purchases (id),
  product_id               uuid not null references products (id),
  contractor_id            uuid not null references contractors (id),
  weight_issued_kg         numeric(10, 2) not null check (weight_issued_kg > 0),
  labour_rate_per_packet   numeric(10, 2) not null check (labour_rate_per_packet > 0),
  issue_date               date not null,
  completion_date          date,
  packets_produced         integer check (packets_produced > 0),
  returned_weight_kg       numeric(10, 2) check (returned_weight_kg > 0),
  lot_rate_per_kg          numeric(10, 2),
  expected_packets         integer,
  raw_material_cost        numeric(12, 2),
  labour_cost              numeric(12, 2),
  total_cost               numeric(12, 2),
  avg_cost_per_packet      numeric(12, 2),
  wastage_kg               numeric(10, 2),
  wastage_value            numeric(12, 2),
  wastage_pct              numeric(6, 2),
  returned_weight_exceeded boolean,
  completed_at             timestamptz,
  completed_by             uuid references auth.users (id),
  voided_at                timestamptz,
  voided_by                uuid references auth.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid not null references auth.users (id),
  updated_by               uuid not null references auth.users (id),
  -- Completion fields are all set exactly when status = 'completed', never otherwise
  -- (FR-013/FR-016/FR-020: frozen once, absent before).
  constraint production_batches_completion_fields_check check (
    (status = 'completed'
      and completion_date is not null and packets_produced is not null and returned_weight_kg is not null
      and lot_rate_per_kg is not null and expected_packets is not null
      and raw_material_cost is not null and labour_cost is not null and total_cost is not null
      and avg_cost_per_packet is not null and wastage_kg is not null and wastage_value is not null
      and wastage_pct is not null and returned_weight_exceeded is not null
      and completed_at is not null and completed_by is not null)
    or
    (status <> 'completed'
      and completion_date is null and packets_produced is null and returned_weight_kg is null
      and lot_rate_per_kg is null and expected_packets is null
      and raw_material_cost is null and labour_cost is null and total_cost is null
      and avg_cost_per_packet is null and wastage_kg is null and wastage_value is null
      and wastage_pct is null and returned_weight_exceeded is null
      and completed_at is null and completed_by is null)
  ),
  constraint production_batches_void_fields_check check (
    (status = 'voided') = (voided_at is not null and voided_by is not null)
  ),
  constraint production_batches_completion_after_issue check (
    completion_date is null or completion_date >= issue_date
  )
);

comment on table production_batches is 'One issue of fabric from one weight-mode lot to one contractor, to make one manufactured product (feature 010). issued -> completed | voided, both terminal. Issue/edit/void adjust raw_material_purchases.remaining_weight_kg; completion writes one +packets inventory_movements row. See ADR-0008 and specs/010-production-batches/data-model.md.';
comment on column production_batches.lot_id is 'A weight-mode raw_material_purchases row (enforced in the functions). RESTRICT: a lot referenced by any batch, voided included, can never be deleted (spec US4-5, FR-012).';
comment on column production_batches.batch_number is 'PB-NNNN from production_batch_number_seq, assigned only after validation passes (FR-009).';
comment on column production_batches.raw_material_cost is 'Frozen at completion: round(weight_issued_kg x lot_rate_per_kg, 2) — always on the weight ISSUED, wastage absorbed (FR-016).';
comment on column production_batches.avg_cost_per_packet is 'Frozen, rounded to 2 dp. Stock valuation (012) should derive from total_cost / packets_produced, not from this rounded figure.';
comment on column production_batches.wastage_kg is 'weight_issued_kg - returned_weight_kg, or 0 when returned_weight_exceeded (FR-017/FR-019). Reported only, never deducted from any cost.';
comment on column production_batches.expected_packets is 'Snapshot at completion of floor(weight_issued_kg x products.expected_yield_per_kg), so the displayed variance (FR-018) never changes if the yield is recalibrated.';

create index idx_production_batches_status_issue_date on production_batches (status, issue_date desc);
create index idx_production_batches_contractor on production_batches (contractor_id);
create index idx_production_batches_product on production_batches (product_id);
create index idx_production_batches_lot on production_batches (lot_id);

create trigger trg_production_batches_updated_at
  before update on production_batches
  for each row execute function set_updated_at();

-- ============================================================================
-- manufactured_opening_stock (new)
-- ============================================================================

create table manufactured_opening_stock (
  product_id        uuid primary key references products (id),
  quantity          integer not null check (quantity >= 1),
  entry_date        date not null,
  cost_per_packet   numeric(10, 2) check (cost_per_packet is null or cost_per_packet > 0),
  correction_qty    integer check (correction_qty is null or correction_qty <> 0),
  correction_reason text,
  correction_date   date,
  corrected_at      timestamptz,
  corrected_by      uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references auth.users (id),
  -- The correction is all-or-nothing and, once set, is the row's only ever change (FR-025).
  constraint manufactured_opening_stock_correction_check check (
    (correction_qty is null and correction_reason is null and correction_date is null
      and corrected_at is null and corrected_by is null)
    or
    (correction_qty is not null and correction_reason is not null and btrim(correction_reason) <> ''
      and correction_date is not null and correction_date >= entry_date
      and corrected_at is not null and corrected_by is not null)
  )
);

comment on table manufactured_opening_stock is 'One-time go-live opening quantity per manufactured product (feature 010, FR-024/FR-025), with an optional cost per packet for 012/013 valuation and at most one correction. Each entry/correction also writes an inventory_movements row (source_type opening_balance, source_id = product_id).';

-- ============================================================================
-- Comments on shared/existing objects
-- ============================================================================

comment on column raw_material_purchases.remaining_weight_kg is 'Weight-mode lots only. Decremented by production_batches (010) at issue, restored on void/edit, via the batch functions below. A lot is "used" (002 edit/delete lock) whenever remaining < weight_kg.';
comment on column inventory_movements.reason is 'Free text (not an enum) — e.g. ''Purchase recorded''/''Purchase updated''/''Purchase deleted'', ''Opening balance at 007 cutover'', ''Challan accepted''/''Challan shortfall returned to inventory'', and from 010 ''Production batch completed'', ''Opening balance'', ''Opening balance correction''. Deliberately unconstrained so future writers can introduce new values without a migration.';
comment on column inventory_movements.source_id is 'The originating row''s id: a raw_material_purchases.id, challan_lines.id, production_batches.id (source_type production_batch), or for 010 manufactured opening balances the products.id; null only for 007''s one-time traded opening-balance backfill. No FK — deliberately polymorphic.';

-- ============================================================================
-- issue_production_batch / update_production_batch / void_production_batch /
-- complete_production_batch — ADR-0002 atomic writes, lot rows locked FOR UPDATE
-- ============================================================================

create or replace function issue_production_batch(
  p_lot_id uuid,
  p_product_id uuid,
  p_contractor_id uuid,
  p_weight_issued_kg numeric,
  p_labour_rate_per_packet numeric,
  p_issue_date date,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_lot raw_material_purchases%rowtype;
  v_product_type text;
  v_product_status text;
  v_contractor_status text;
  v_id uuid;
begin
  -- Explicit input guards (the app's Zod schemas enforce the same rules; these make the
  -- function safe on its own and give friendly errors instead of raw constraint violations).
  if p_weight_issued_kg is null or p_weight_issued_kg <= 0 then
    raise exception 'INVALID_WEIGHT: weight issued must be greater than zero';
  end if;
  if p_labour_rate_per_packet is null or p_labour_rate_per_packet <= 0 then
    raise exception 'INVALID_LABOUR_RATE: labour rate must be greater than zero';
  end if;
  if p_issue_date is null then
    raise exception 'INVALID_DATE: issue date is required';
  end if;

  -- Serialises every issue against this lot (FR-005): a concurrent issue waits here, then
  -- re-reads the already-decremented remaining weight.
  select * into v_lot from raw_material_purchases where id = p_lot_id for update;
  if not found then
    raise exception 'LOT_NOT_FOUND: lot % does not exist', p_lot_id;
  end if;
  if v_lot.purchase_mode <> 'weight' then
    raise exception 'LOT_NOT_WEIGHT_MODE: only weight-based fabric lots can be issued';
  end if;
  if p_issue_date < v_lot.purchase_date then
    raise exception 'ISSUE_BEFORE_PURCHASE:%', v_lot.purchase_date;
  end if;
  if p_weight_issued_kg > v_lot.remaining_weight_kg then
    raise exception 'LOT_INSUFFICIENT_WEIGHT:%', v_lot.remaining_weight_kg;
  end if;

  select type, status into v_product_type, v_product_status from products where id = p_product_id;
  if not found or v_product_type <> 'manufactured' or v_product_status <> 'active' then
    raise exception 'PRODUCT_NOT_ELIGIBLE: select an active manufactured product';
  end if;

  select status into v_contractor_status from contractors where id = p_contractor_id;
  if not found or v_contractor_status <> 'active' then
    raise exception 'CONTRACTOR_NOT_ACTIVE: select an active contractor';
  end if;

  update raw_material_purchases
  set remaining_weight_kg = remaining_weight_kg - p_weight_issued_kg
  where id = p_lot_id;

  -- nextval only after every validation, so ordinary rejections never consume a number.
  insert into production_batches (
    batch_number, lot_id, product_id, contractor_id, weight_issued_kg, labour_rate_per_packet,
    issue_date, created_by, updated_by
  ) values (
    'PB-' || lpad(nextval('production_batch_number_seq')::text, 4, '0'),
    p_lot_id, p_product_id, p_contractor_id, p_weight_issued_kg, p_labour_rate_per_packet,
    p_issue_date, p_user_id, p_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function update_production_batch(
  p_id uuid,
  p_lot_id uuid,
  p_product_id uuid,
  p_contractor_id uuid,
  p_weight_issued_kg numeric,
  p_labour_rate_per_packet numeric,
  p_issue_date date,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_batch production_batches%rowtype;
  v_new_lot raw_material_purchases%rowtype;
  v_product_type text;
  v_product_status text;
  v_contractor_status text;
begin
  -- Explicit input guards (the app's Zod schemas enforce the same rules; these make the
  -- function safe on its own and give friendly errors instead of raw constraint violations).
  if p_weight_issued_kg is null or p_weight_issued_kg <= 0 then
    raise exception 'INVALID_WEIGHT: weight issued must be greater than zero';
  end if;
  if p_labour_rate_per_packet is null or p_labour_rate_per_packet <= 0 then
    raise exception 'INVALID_LABOUR_RATE: labour rate must be greater than zero';
  end if;
  if p_issue_date is null then
    raise exception 'INVALID_DATE: issue date is required';
  end if;

  select * into v_batch from production_batches where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: batch % does not exist', p_id;
  end if;
  if v_batch.status <> 'issued' then
    raise exception 'BATCH_NOT_EDITABLE:%', v_batch.status;
  end if;

  -- Lock old and new lots in ascending id order so two cross-lot edits can never deadlock.
  perform 1 from raw_material_purchases
  where id in (v_batch.lot_id, p_lot_id)
  order by id
  for update;

  select * into v_new_lot from raw_material_purchases where id = p_lot_id;
  if not found then
    raise exception 'LOT_NOT_FOUND: lot % does not exist', p_lot_id;
  end if;
  if v_new_lot.purchase_mode <> 'weight' then
    raise exception 'LOT_NOT_WEIGHT_MODE: only weight-based fabric lots can be issued';
  end if;
  if p_issue_date < v_new_lot.purchase_date then
    raise exception 'ISSUE_BEFORE_PURCHASE:%', v_new_lot.purchase_date;
  end if;

  -- Eligibility is re-checked only for a changed value: a batch keeps working with a product or
  -- contractor deactivated after it was issued (spec edge cases, FR-002).
  if p_product_id is distinct from v_batch.product_id then
    select type, status into v_product_type, v_product_status from products where id = p_product_id;
    if not found or v_product_type <> 'manufactured' or v_product_status <> 'active' then
      raise exception 'PRODUCT_NOT_ELIGIBLE: select an active manufactured product';
    end if;
  end if;
  if p_contractor_id is distinct from v_batch.contractor_id then
    select status into v_contractor_status from contractors where id = p_contractor_id;
    if not found or v_contractor_status <> 'active' then
      raise exception 'CONTRACTOR_NOT_ACTIVE: select an active contractor';
    end if;
  end if;

  -- Restore first, then check and deduct; any raise below rolls the restore back too.
  update raw_material_purchases
  set remaining_weight_kg = remaining_weight_kg + v_batch.weight_issued_kg
  where id = v_batch.lot_id;

  select * into v_new_lot from raw_material_purchases where id = p_lot_id;
  if p_weight_issued_kg > v_new_lot.remaining_weight_kg then
    raise exception 'LOT_INSUFFICIENT_WEIGHT:%', v_new_lot.remaining_weight_kg;
  end if;

  update raw_material_purchases
  set remaining_weight_kg = remaining_weight_kg - p_weight_issued_kg
  where id = p_lot_id;

  update production_batches
  set lot_id = p_lot_id,
      product_id = p_product_id,
      contractor_id = p_contractor_id,
      weight_issued_kg = p_weight_issued_kg,
      labour_rate_per_packet = p_labour_rate_per_packet,
      issue_date = p_issue_date,
      updated_by = p_user_id
  where id = p_id;
end;
$$;

create or replace function void_production_batch(p_id uuid, p_user_id uuid)
returns void
language plpgsql
as $$
declare
  v_batch production_batches%rowtype;
begin
  select * into v_batch from production_batches where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: batch % does not exist', p_id;
  end if;
  if v_batch.status <> 'issued' then
    raise exception 'BATCH_NOT_VOIDABLE:%', v_batch.status;
  end if;

  perform 1 from raw_material_purchases where id = v_batch.lot_id for update;
  update raw_material_purchases
  set remaining_weight_kg = remaining_weight_kg + v_batch.weight_issued_kg
  where id = v_batch.lot_id;

  update production_batches
  set status = 'voided', voided_at = now(), voided_by = p_user_id, updated_by = p_user_id
  where id = p_id;
end;
$$;

create or replace function complete_production_batch(
  p_id uuid,
  p_packets_produced integer,
  p_returned_weight_kg numeric,
  p_completion_date date,
  p_confirm_returned_weight_exceeded boolean,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_batch production_batches%rowtype;
  v_rate numeric;
  v_yield numeric;
  v_exceeded boolean;
  v_raw numeric;
  v_labour numeric;
  v_total numeric;
  v_wastage_kg numeric;
begin
  -- Explicit guards: packets >= 1 is what makes avg_cost_per_packet's division safe (never
  -- rely on statement order or column checks for that); weight_issued_kg > 0 is guaranteed by
  -- its column check, which keeps wastage_pct's division safe.
  if p_packets_produced is null or p_packets_produced < 1 then
    raise exception 'INVALID_PACKETS: packets produced must be a whole number of at least 1';
  end if;
  if p_returned_weight_kg is null or p_returned_weight_kg <= 0 then
    raise exception 'INVALID_RETURNED_WEIGHT: returned packet weight must be greater than zero';
  end if;
  if p_completion_date is null then
    raise exception 'INVALID_DATE: completion date is required';
  end if;

  select * into v_batch from production_batches where id = p_id for update;
  if not found then
    raise exception 'NOT_FOUND: batch % does not exist', p_id;
  end if;
  if v_batch.status <> 'issued' then
    raise exception 'BATCH_NOT_ISSUED:%', v_batch.status;
  end if;
  if p_completion_date < v_batch.issue_date then
    raise exception 'COMPLETION_BEFORE_ISSUE: completion date cannot be before the issue date';
  end if;

  -- Soft warning, enforced server-side (FR-019): allowed only once staff have confirmed.
  v_exceeded := p_returned_weight_kg > v_batch.weight_issued_kg;
  if v_exceeded and not coalesce(p_confirm_returned_weight_exceeded, false) then
    raise exception 'RETURNED_WEIGHT_UNCONFIRMED: returned weight exceeds the weight issued';
  end if;

  select rate_per_kg into v_rate from raw_material_purchases where id = v_batch.lot_id;
  select expected_yield_per_kg into v_yield from products where id = v_batch.product_id;

  v_raw := round(v_batch.weight_issued_kg * v_rate, 2);
  v_labour := round(p_packets_produced * v_batch.labour_rate_per_packet, 2);
  v_total := v_raw + v_labour;
  v_wastage_kg := case when v_exceeded then 0 else v_batch.weight_issued_kg - p_returned_weight_kg end;

  insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
  values (v_batch.product_id, p_packets_produced, 'Production batch completed', 'production_batch', p_id, p_completion_date, p_user_id);

  perform recompute_product_quantity_on_hand(v_batch.product_id);

  update production_batches
  set status = 'completed',
      completion_date = p_completion_date,
      packets_produced = p_packets_produced,
      returned_weight_kg = p_returned_weight_kg,
      lot_rate_per_kg = v_rate,
      expected_packets = floor(v_batch.weight_issued_kg * v_yield),
      raw_material_cost = v_raw,
      labour_cost = v_labour,
      total_cost = v_total,
      avg_cost_per_packet = round(v_total / p_packets_produced, 2),
      wastage_kg = v_wastage_kg,
      wastage_value = round(v_wastage_kg * v_rate, 2),
      wastage_pct = round(v_wastage_kg / v_batch.weight_issued_kg * 100, 2),
      returned_weight_exceeded = v_exceeded,
      completed_at = now(),
      completed_by = p_user_id,
      updated_by = p_user_id
  where id = p_id;
end;
$$;

-- ============================================================================
-- record_manufactured_opening_stock / record_manufactured_opening_stock_correction
-- ============================================================================

create or replace function record_manufactured_opening_stock(
  p_product_id uuid,
  p_quantity integer,
  p_entry_date date,
  p_cost_per_packet numeric,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_type text;
begin
  if p_quantity is null or p_quantity < 1 then
    raise exception 'INVALID_QUANTITY: opening quantity must be a whole number of at least 1';
  end if;
  if p_cost_per_packet is not null and p_cost_per_packet <= 0 then
    raise exception 'INVALID_COST: cost per packet must be greater than zero when given';
  end if;
  if p_entry_date is null then
    raise exception 'INVALID_DATE: entry date is required';
  end if;

  select type into v_type from products where id = p_product_id for update;
  if not found then
    raise exception 'NOT_FOUND: product % does not exist', p_product_id;
  end if;
  if v_type <> 'manufactured' then
    raise exception 'PRODUCT_NOT_MANUFACTURED: opening stock is only for manufactured products';
  end if;
  if exists (select 1 from manufactured_opening_stock where product_id = p_product_id) then
    raise exception 'OPENING_STOCK_EXISTS: opening stock already recorded for this product';
  end if;

  insert into manufactured_opening_stock (product_id, quantity, entry_date, cost_per_packet, created_by)
  values (p_product_id, p_quantity, p_entry_date, p_cost_per_packet, p_user_id);

  insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
  values (p_product_id, p_quantity, 'Opening balance', 'opening_balance', p_product_id, p_entry_date, p_user_id);

  perform recompute_product_quantity_on_hand(p_product_id);
end;
$$;

create or replace function record_manufactured_opening_stock_correction(
  p_product_id uuid,
  p_correction_qty integer,
  p_reason text,
  p_correction_date date,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_quantity_on_hand numeric;
  v_opening manufactured_opening_stock%rowtype;
begin
  if p_correction_qty is null or p_correction_qty = 0 then
    raise exception 'INVALID_CORRECTION: correction must be a non-zero whole number';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'REASON_REQUIRED: a reason is required for the correction';
  end if;
  if p_correction_date is null then
    raise exception 'INVALID_DATE: correction date is required';
  end if;

  select quantity_on_hand into v_quantity_on_hand from products where id = p_product_id for update;
  if not found then
    raise exception 'NOT_FOUND: product % does not exist', p_product_id;
  end if;

  select * into v_opening from manufactured_opening_stock where product_id = p_product_id for update;
  if not found then
    raise exception 'OPENING_STOCK_NOT_FOUND: no opening stock recorded for this product';
  end if;
  if v_opening.correction_qty is not null then
    raise exception 'CORRECTION_EXISTS: opening stock already corrected once';
  end if;

  -- "No accepted Challan has taken this product's stock out" (FR-025) — exactly the rows
  -- accept_challan (0007) writes for accepted quantities.
  if exists (
    select 1 from inventory_movements
    where product_id = p_product_id and source_type = 'challan_line' and qty_delta < 0
  ) then
    raise exception 'STOCK_ALREADY_SHIPPED: stock already went out on an accepted Challan';
  end if;

  if p_correction_date < v_opening.entry_date then
    raise exception 'CORRECTION_BEFORE_ENTRY: correction date cannot be before the opening entry date';
  end if;
  if v_quantity_on_hand + p_correction_qty < 0 then
    raise exception 'CORRECTION_BELOW_ZERO: correction would take stock below zero';
  end if;

  update manufactured_opening_stock
  set correction_qty = p_correction_qty,
      correction_reason = btrim(p_reason),
      correction_date = p_correction_date,
      corrected_at = now(),
      corrected_by = p_user_id
  where product_id = p_product_id;

  insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id, movement_date, created_by)
  values (p_product_id, p_correction_qty, 'Opening balance correction', 'opening_balance', p_product_id, p_correction_date, p_user_id);

  perform recompute_product_quantity_on_hand(p_product_id);
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table contractors enable row level security;
alter table production_batches enable row level security;
alter table manufactured_opening_stock enable row level security;
