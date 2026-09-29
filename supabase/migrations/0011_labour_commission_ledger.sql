-- 0011_labour_commission_ledger.sql
-- Labour / Commission Ledger (011-labour-commission-ledger): a khata per external contractor of
-- what the business OWES them (a payable, kept apart from 005/009's customer receivable).
-- Completing a production batch (010) posts the batch's frozen labour cost as a credit in the
-- same transaction. Cash payments post a debit and may be linked to several completed batches
-- with an amount against each (never paying a batch above its labour cost). Payment reversals,
-- a one-time opening balance and manual adjustments complete the entry types. A settlement
-- freezes a period's figures and locks the contractor's khata, batch completion included, up to
-- its end date; only the most recent settlement can be reopened.
--
-- Lock order (every writer): contractors row -> contractor_payments row (reversal only) ->
-- production_batches rows in ascending id. Everything that decides an outcome is read after the
-- contractor lock. "Today" is passed in as p_today from lib/dates.ts (ADR-0009); no function
-- here uses current_date.
--
-- See specs/011-labour-commission-ledger/data-model.md, research.md and
-- history/adr/0010-contractor-payment-allocation-and-settlement-lock.md.
--
-- The whole migration runs in one explicit transaction: if any statement fails, nothing is
-- applied. After a failure, run `rollback;` on its own to close the aborted transaction.

begin;

-- ============================================================================
-- contractor_ledger_entries (new)
-- ============================================================================

create table contractor_ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors (id),
  entry_date    date not null,
  type          text not null check (type in ('credit', 'debit')),
  amount        numeric(12, 2) not null check (amount > 0),
  source_type   text not null check (source_type in
                  ('production_batch', 'payment', 'payment_reversal', 'opening_balance', 'adjustment')),
  source_id     uuid,
  description   text,
  created_at    timestamptz not null default now(),
  created_by    uuid not null references auth.users (id),
  constraint contractor_ledger_entries_source_id_check check (
    (source_type in ('production_batch', 'payment', 'payment_reversal')) = (source_id is not null)
  ),
  constraint contractor_ledger_entries_adjustment_reason_check check (
    source_type <> 'adjustment' or (description is not null and btrim(description) <> '')
  )
);

-- One earning per batch, one debit and at most one reversal per payment.
create unique index idx_contractor_ledger_entries_source
  on contractor_ledger_entries (source_type, source_id)
  where source_type in ('production_batch', 'payment', 'payment_reversal');
-- One opening balance per contractor (FR-020).
create unique index idx_contractor_ledger_entries_opening
  on contractor_ledger_entries (contractor_id)
  where source_type = 'opening_balance';
create index idx_contractor_ledger_entries_contractor_date
  on contractor_ledger_entries (contractor_id, entry_date, created_at);

comment on table contractor_ledger_entries is 'Contractor khata (feature 011). Sign convention: credit = the business owes the contractor more, debit = owes less; balance = sum of signed amounts (> 0 owed, < 0 advance). Insert-only, enforced by trigger. See specs/011-labour-commission-ledger/data-model.md.';
comment on column contractor_ledger_entries.source_id is 'Polymorphic, no FK (as 005): production_batches.id for production_batch, contractor_payments.id for payment and payment_reversal; null for opening_balance and adjustment.';
comment on column contractor_ledger_entries.description is 'Display text; for adjustment rows it is the required reason.';

-- ============================================================================
-- contractor_payments (new)
-- ============================================================================

create table contractor_payments (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid not null references contractors (id),
  payment_date    date not null,
  amount          numeric(12, 2) not null check (amount > 0),
  note            text,
  status          text not null default 'active' check (status in ('active', 'reversed')),
  reversal_reason text,
  reversed_at     timestamptz,
  reversed_by     uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  created_by      uuid not null references auth.users (id),
  constraint contractor_payments_reversal_fields_check check (
    (status = 'active' and reversal_reason is null and reversed_at is null and reversed_by is null)
    or
    (status = 'reversed' and reversal_reason is not null and btrim(reversal_reason) <> ''
      and reversed_at is not null and reversed_by is not null)
  )
);
create index idx_contractor_payments_contractor_date on contractor_payments (contractor_id, payment_date desc);

comment on table contractor_payments is 'Cash payments to a contractor (feature 011). Never edited or deleted; the only allowed update is active -> reversed (enforced by trigger). Any amount not linked to a batch via contractor_payment_allocations is an unlinked advance / opening-balance payment.';

-- ============================================================================
-- contractor_payment_allocations (new)
-- ============================================================================

create table contractor_payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references contractor_payments (id),
  batch_id   uuid not null references production_batches (id),
  amount     numeric(12, 2) not null check (amount > 0),
  constraint contractor_payment_allocations_unique unique (payment_id, batch_id)
);
create index idx_contractor_payment_allocations_batch on contractor_payment_allocations (batch_id);

comment on table contractor_payment_allocations is 'Amount of one contractor payment applied to one completed batch of the same contractor (feature 011, ADR-0010). A batch''s paid amount counts only allocations of ACTIVE payments. Insert-only, enforced by trigger; over-allocation is backstopped by trg_contractor_payment_allocations_guard.';

-- ============================================================================
-- contractor_settlements (new)
-- ============================================================================

create table contractor_settlements (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid not null references contractors (id),
  period_start    date not null,
  period_end      date not null,
  opening_balance numeric(12, 2) not null,
  earned          numeric(12, 2) not null check (earned >= 0),
  paid            numeric(12, 2) not null,
  adjustments     numeric(12, 2) not null,
  closing_balance numeric(12, 2) not null,
  note            text,
  settled_at      timestamptz not null default now(),
  settled_by      uuid not null references auth.users (id),
  reopened_at     timestamptz,
  reopened_by     uuid references auth.users (id),
  reopen_reason   text,
  constraint contractor_settlements_period_check check (period_end >= period_start),
  constraint contractor_settlements_figures_check check (
    closing_balance = opening_balance + earned - paid + adjustments
  ),
  constraint contractor_settlements_reopen_fields_check check (
    (reopened_at is null and reopened_by is null and reopen_reason is null)
    or
    (reopened_at is not null and reopened_by is not null
      and reopen_reason is not null and btrim(reopen_reason) <> '')
  )
);
-- At most one CURRENT settlement starting on a given day per contractor: no overlaps.
create unique index idx_contractor_settlements_current_start
  on contractor_settlements (contractor_id, period_start) where reopened_at is null;
create index idx_contractor_settlements_contractor_end
  on contractor_settlements (contractor_id, period_end desc);

comment on table contractor_settlements is 'A settled period of one contractor''s khata (feature 011). The figures are frozen at settlement; a current (not reopened) settlement refuses every new khata entry dated on or before period_end. Only the latest current settlement can be reopened; reopening is the only allowed update (enforced by trigger).';
comment on column contractor_settlements.paid is 'Payments minus payment reversals dated inside the period; negative only when a period''s reversals exceed its payments.';

-- ============================================================================
-- Triggers — five in all. Four block deletes and unwanted updates
-- (trg_contractor_ledger_entries_immutable, trg_contractor_payment_allocations_immutable,
-- trg_contractor_payments_guard, trg_contractor_settlements_guard); the QA cleanup script
-- disables exactly these four by name. The fifth, trg_contractor_payment_allocations_guard, is
-- the over-allocation backstop on insert/update and is never disabled.
-- ============================================================================

create or replace function contractor_ledger_reject_change()
returns trigger
language plpgsql
as $$
begin
  raise exception 'IMMUTABLE_RECORD: rows in % cannot be changed or deleted', tg_table_name;
end;
$$;

create trigger trg_contractor_ledger_entries_immutable
  before update or delete on contractor_ledger_entries
  for each row execute function contractor_ledger_reject_change();

create trigger trg_contractor_payment_allocations_immutable
  before update or delete on contractor_payment_allocations
  for each row execute function contractor_ledger_reject_change();

-- Payments: no delete; the only update is active -> reversed with nothing else changed.
create or replace function contractor_payments_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE_RECORD: contractor payments cannot be deleted';
  end if;
  if not (old.status = 'active' and new.status = 'reversed'
          and new.id = old.id
          and new.contractor_id = old.contractor_id
          and new.payment_date = old.payment_date
          and new.amount = old.amount
          and new.note is not distinct from old.note
          and new.created_at = old.created_at
          and new.created_by = old.created_by) then
    raise exception 'IMMUTABLE_RECORD: a contractor payment can only change from active to reversed';
  end if;
  return new;
end;
$$;

create trigger trg_contractor_payments_guard
  before update or delete on contractor_payments
  for each row execute function contractor_payments_guard();

-- Settlements: no delete; the only update sets the three reopen columns once.
create or replace function contractor_settlements_guard()
returns trigger
language plpgsql
as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'IMMUTABLE_RECORD: contractor settlements cannot be deleted';
  end if;
  if not (old.reopened_at is null
          and new.reopened_at is not null and new.reopened_by is not null
          and new.reopen_reason is not null
          and new.id = old.id
          and new.contractor_id = old.contractor_id
          and new.period_start = old.period_start
          and new.period_end = old.period_end
          and new.opening_balance = old.opening_balance
          and new.earned = old.earned
          and new.paid = old.paid
          and new.adjustments = old.adjustments
          and new.closing_balance = old.closing_balance
          and new.note is not distinct from old.note
          and new.settled_at = old.settled_at
          and new.settled_by = old.settled_by) then
    raise exception 'IMMUTABLE_RECORD: a contractor settlement can only be reopened, once';
  end if;
  return new;
end;
$$;

create trigger trg_contractor_settlements_guard
  before update or delete on contractor_settlements
  for each row execute function contractor_settlements_guard();

-- Over-allocation backstop (ADR-0010 §4). Declared for UPDATE as well, so it still protects if
-- the immutability trigger is ever removed.
create or replace function contractor_payment_allocations_guard()
returns trigger
language plpgsql
as $$
declare
  v_batch production_batches%rowtype;
  v_payment_contractor uuid;
  v_allocated numeric;
begin
  select * into v_batch from production_batches where id = new.batch_id for update;
  if not found then
    raise exception 'BATCH_NOT_FOUND: batch % does not exist', new.batch_id;
  end if;
  select contractor_id into v_payment_contractor from contractor_payments where id = new.payment_id;
  if v_batch.status <> 'completed' then
    raise exception 'BATCH_NOT_COMPLETED:%', v_batch.batch_number;
  end if;
  if v_batch.contractor_id is distinct from v_payment_contractor then
    raise exception 'BATCH_OTHER_CONTRACTOR:%', v_batch.batch_number;
  end if;
  -- Only ACTIVE payments count: a reversed payment frees its batches immediately.
  select coalesce(sum(a.amount), 0) into v_allocated
  from contractor_payment_allocations a
  join contractor_payments p on p.id = a.payment_id
  where a.batch_id = new.batch_id and p.status = 'active' and a.id <> new.id;
  if v_allocated + new.amount > v_batch.labour_cost then
    raise exception 'OVER_ALLOCATED:%', v_batch.batch_number;
  end if;
  return new;
end;
$$;

create trigger trg_contractor_payment_allocations_guard
  before insert or update on contractor_payment_allocations
  for each row execute function contractor_payment_allocations_guard();

-- ============================================================================
-- Row Level Security — same trust boundary as 0001–0010: all access is server-side through the
-- service-role key, which bypasses RLS. Enabled with no policies so any other key sees nothing.
-- ============================================================================

alter table contractor_ledger_entries enable row level security;
alter table contractor_payments enable row level security;
alter table contractor_payment_allocations enable row level security;
alter table contractor_settlements enable row level security;

-- ============================================================================
-- Helper: contractor_settled_until
-- ============================================================================

-- Caller MUST already hold the contractor row lock (see the lock order at the top).
create or replace function contractor_settled_until(p_contractor_id uuid)
returns date
language sql
stable
as $$
  select max(period_end) from contractor_settlements
  where contractor_id = p_contractor_id and reopened_at is null;
$$;

-- ============================================================================
-- complete_production_batch (REDEFINED from 0010, same signature). Differences from 0010, and
-- nothing else: two new declarations; a pre-lock lookup of the batch's contractor that takes over
-- the NOT_FOUND check; the contractor lock before the batch lock plus BATCH_CONTRACTOR_CHANGED;
-- the PERIOD_SETTLED check; and the earning insert after the batch update.
-- ============================================================================

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
  v_contractor_id uuid;
  v_settled_until date;
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

  -- 011: find the contractor without a lock, lock the contractor first (global lock order),
  -- then the batch, and make sure the batch's contractor didn't change in between.
  select contractor_id into v_contractor_id from production_batches where id = p_id;
  if not found then
    raise exception 'NOT_FOUND: batch % does not exist', p_id;
  end if;
  perform 1 from contractors where id = v_contractor_id for update;

  select * into v_batch from production_batches where id = p_id for update;
  if v_batch.contractor_id <> v_contractor_id then
    raise exception 'BATCH_CONTRACTOR_CHANGED: the batch contractor changed; try again';
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

  -- 011 (FR-003): read after the contractor lock, so a settlement committed just before us is seen.
  v_settled_until := contractor_settled_until(v_batch.contractor_id);
  if v_settled_until is not null and p_completion_date <= v_settled_until then
    raise exception 'PERIOD_SETTLED:%', v_settled_until;
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

  -- 011 (FR-001): the contractor's earning, in the same transaction as the completion.
  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (v_batch.contractor_id, p_completion_date, 'credit', v_labour, 'production_batch', p_id,
     'Batch ' || v_batch.batch_number, p_user_id);
end;
$$;

-- Backfill: an earning for every completed batch that has none (a no-op on the live database,
-- which had 0 batches on 2026-09-29; safe to re-run).
insert into contractor_ledger_entries
  (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
select b.contractor_id, b.completion_date, 'credit', b.labour_cost, 'production_batch', b.id,
       'Batch ' || b.batch_number, b.completed_by
from production_batches b
where b.status = 'completed'
  and not exists (select 1 from contractor_ledger_entries e
                  where e.source_type = 'production_batch' and e.source_id = b.id);

-- ============================================================================
-- record_contractor_payment
-- ============================================================================

create or replace function record_contractor_payment(
  p_contractor_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_note text,
  p_allocations jsonb,
  p_today date,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_allocs jsonb := coalesce(p_allocations, '[]'::jsonb);
  v_ids uuid[];
  v_total numeric;
  v_all_valid boolean;
  v_settled_until date;
  v_alloc jsonb;
  v_batch production_batches%rowtype;
  v_amount numeric;
  v_paid numeric;
  v_unpaid numeric;
  v_note text := nullif(btrim(p_note), '');
  v_payment_id uuid;
begin
  -- 1. Guards (the Zod schema enforces the same rules first).
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'INVALID_AMOUNT: the payment amount must be greater than zero';
  end if;
  if p_payment_date is null or p_today is null or p_payment_date > p_today then
    raise exception 'INVALID_DATE: the payment date is required and cannot be in the future';
  end if;
  if jsonb_typeof(v_allocs) <> 'array' then
    raise exception 'INVALID_ALLOCATION: allocations must be a list';
  end if;
  begin
    select coalesce(array_agg((e ->> 'batch_id')::uuid), '{}'),
           coalesce(sum(round((e ->> 'amount')::numeric, 2)), 0),
           coalesce(bool_and(jsonb_typeof(e) = 'object'
                             and e ->> 'batch_id' is not null
                             and coalesce(round((e ->> 'amount')::numeric, 2) > 0, false)), true)
    into v_ids, v_total, v_all_valid
    from jsonb_array_elements(v_allocs) e;
  exception when invalid_text_representation or invalid_parameter_value then
    raise exception 'INVALID_ALLOCATION: every allocation needs a batch and an amount above zero';
  end;
  if not v_all_valid then
    raise exception 'INVALID_ALLOCATION: every allocation needs a batch and an amount above zero';
  end if;
  if cardinality(v_ids) <> (select count(distinct x) from unnest(v_ids) x) then
    raise exception 'DUPLICATE_BATCH: a batch can appear only once on a payment';
  end if;

  -- 2. Lock the contractor first. Inactive contractors can still be paid (US2-8).
  perform 1 from contractors where id = p_contractor_id for update;
  if not found then
    raise exception 'CONTRACTOR_NOT_FOUND: contractor % does not exist', p_contractor_id;
  end if;

  -- 3. Settlement lock, read after the contractor lock.
  v_settled_until := contractor_settled_until(p_contractor_id);
  if v_settled_until is not null and p_payment_date <= v_settled_until then
    raise exception 'PERIOD_SETTLED:%', v_settled_until;
  end if;

  -- 4. Lock the distinct batches in id order.
  perform 1 from production_batches where id = any(v_ids) order by id for update;

  -- 5. Validate every allocation before any insert, in batch-id order, under the locks.
  for v_alloc in
    select value from jsonb_array_elements(v_allocs) order by (value ->> 'batch_id')::uuid
  loop
    v_amount := round((v_alloc ->> 'amount')::numeric, 2);
    select * into v_batch from production_batches where id = (v_alloc ->> 'batch_id')::uuid;
    if not found then
      raise exception 'BATCH_NOT_FOUND: batch % does not exist', v_alloc ->> 'batch_id';
    end if;
    if v_batch.status <> 'completed' then
      raise exception 'BATCH_NOT_COMPLETED:%', v_batch.batch_number;
    end if;
    if v_batch.contractor_id <> p_contractor_id then
      raise exception 'BATCH_OTHER_CONTRACTOR:%', v_batch.batch_number;
    end if;
    if v_batch.completion_date > p_payment_date then
      raise exception 'BATCH_COMPLETED_AFTER_PAYMENT:%', v_batch.batch_number;
    end if;
    select coalesce(sum(a.amount), 0) into v_paid
    from contractor_payment_allocations a
    join contractor_payments p on p.id = a.payment_id
    where a.batch_id = v_batch.id and p.status = 'active';
    v_unpaid := v_batch.labour_cost - v_paid;
    if v_amount > v_unpaid then
      raise exception 'ALLOCATION_EXCEEDS_UNPAID:%:%', v_batch.batch_number, v_unpaid;
    end if;
  end loop;

  -- 6. The amounts against batches cannot exceed the payment.
  if v_total > round(p_amount, 2) then
    raise exception 'ALLOCATIONS_EXCEED_PAYMENT: the amounts against batches exceed the payment';
  end if;

  -- 7. Payment -> allocations (the guard trigger re-checks each) -> one debit entry.
  insert into contractor_payments (contractor_id, payment_date, amount, note, created_by)
  values (p_contractor_id, p_payment_date, round(p_amount, 2), v_note, p_user_id)
  returning id into v_payment_id;

  insert into contractor_payment_allocations (payment_id, batch_id, amount)
  select v_payment_id, (e ->> 'batch_id')::uuid, round((e ->> 'amount')::numeric, 2)
  from jsonb_array_elements(v_allocs) e
  order by (e ->> 'batch_id')::uuid;

  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (p_contractor_id, p_payment_date, 'debit', round(p_amount, 2), 'payment', v_payment_id,
     case when v_note is null then 'Cash payment' else 'Cash payment: ' || v_note end, p_user_id);

  return v_payment_id;
end;
$$;

-- ============================================================================
-- reverse_contractor_payment
-- ============================================================================

create or replace function reverse_contractor_payment(
  p_payment_id uuid,
  p_reason text,
  p_today date,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_contractor_id uuid;
  v_payment contractor_payments%rowtype;
  v_settled_until date;
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED: a reason is required to reverse a payment';
  end if;
  if p_today is null then
    raise exception 'INVALID_DATE: today''s date is required';
  end if;

  select contractor_id into v_contractor_id from contractor_payments where id = p_payment_id;
  if not found then
    raise exception 'NOT_FOUND: payment % does not exist', p_payment_id;
  end if;

  -- Lock order: contractor -> payment -> its batches by id.
  perform 1 from contractors where id = v_contractor_id for update;
  select * into v_payment from contractor_payments where id = p_payment_id for update;
  perform 1 from production_batches
  where id in (select batch_id from contractor_payment_allocations where payment_id = p_payment_id)
  order by id
  for update;

  if v_payment.status <> 'active' then
    raise exception 'PAYMENT_ALREADY_REVERSED: this payment has already been reversed';
  end if;

  v_settled_until := contractor_settled_until(v_contractor_id);
  if v_settled_until is not null and v_payment.payment_date <= v_settled_until then
    raise exception 'PAYMENT_IN_SETTLED_PERIOD:%', v_settled_until;
  end if;
  if v_settled_until is not null and p_today <= v_settled_until then
    raise exception 'PERIOD_SETTLED:%', v_settled_until;
  end if;

  update contractor_payments
  set status = 'reversed', reversal_reason = v_reason, reversed_at = now(), reversed_by = p_user_id
  where id = p_payment_id;

  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (v_contractor_id, p_today, 'credit', v_payment.amount, 'payment_reversal', p_payment_id,
     'Reversal: ' || v_reason, p_user_id);
end;
$$;

-- ============================================================================
-- record_contractor_opening_balance
-- ============================================================================

create or replace function record_contractor_opening_balance(
  p_contractor_id uuid,
  p_direction text,
  p_amount numeric,
  p_entry_date date,
  p_today date,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_earliest date;
begin
  if p_direction is null or p_direction not in ('owed', 'advance') then
    raise exception 'INVALID_DIRECTION: choose owed to the contractor or advance already given';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'INVALID_AMOUNT: the amount must be greater than zero';
  end if;
  if p_entry_date is null or p_today is null or p_entry_date > p_today then
    raise exception 'INVALID_DATE: the date is required and cannot be in the future';
  end if;

  perform 1 from contractors where id = p_contractor_id for update;
  if not found then
    raise exception 'CONTRACTOR_NOT_FOUND: contractor % does not exist', p_contractor_id;
  end if;

  if contractor_settled_until(p_contractor_id) is not null then
    raise exception 'OPENING_BALANCE_AFTER_SETTLEMENT: post an adjustment instead';
  end if;
  if exists (select 1 from contractor_ledger_entries
             where contractor_id = p_contractor_id and source_type = 'opening_balance') then
    raise exception 'OPENING_BALANCE_EXISTS: an opening balance is already recorded';
  end if;
  select min(entry_date) into v_earliest
  from contractor_ledger_entries where contractor_id = p_contractor_id;
  if v_earliest is not null and v_earliest < p_entry_date then
    raise exception 'OPENING_BALANCE_AFTER_FIRST_ENTRY:%', v_earliest;
  end if;

  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (p_contractor_id, p_entry_date,
     case when p_direction = 'owed' then 'credit' else 'debit' end,
     round(p_amount, 2), 'opening_balance', null,
     case when p_direction = 'owed' then 'Opening balance' else 'Opening advance' end,
     p_user_id);
end;
$$;

-- ============================================================================
-- record_contractor_adjustment
-- ============================================================================

create or replace function record_contractor_adjustment(
  p_contractor_id uuid,
  p_type text,
  p_amount numeric,
  p_entry_date date,
  p_reason text,
  p_today date,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_settled_until date;
begin
  if p_type is null or p_type not in ('credit', 'debit') then
    raise exception 'INVALID_TYPE: choose increase or decrease';
  end if;
  if p_amount is null or round(p_amount, 2) <= 0 then
    raise exception 'INVALID_AMOUNT: the amount must be greater than zero';
  end if;
  if p_entry_date is null or p_today is null or p_entry_date > p_today then
    raise exception 'INVALID_DATE: the date is required and cannot be in the future';
  end if;
  if v_reason is null then
    raise exception 'REASON_REQUIRED: a reason is required for an adjustment';
  end if;

  perform 1 from contractors where id = p_contractor_id for update;
  if not found then
    raise exception 'CONTRACTOR_NOT_FOUND: contractor % does not exist', p_contractor_id;
  end if;

  v_settled_until := contractor_settled_until(p_contractor_id);
  if v_settled_until is not null and p_entry_date <= v_settled_until then
    raise exception 'PERIOD_SETTLED:%', v_settled_until;
  end if;

  -- No batch is touched (FR-022).
  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (p_contractor_id, p_entry_date, p_type, round(p_amount, 2), 'adjustment', null, v_reason, p_user_id);
end;
$$;

-- ============================================================================
-- settle_contractor_period
-- ============================================================================

create or replace function settle_contractor_period(
  p_contractor_id uuid,
  p_period_end date,
  p_note text,
  p_confirm_nonzero boolean,
  p_today date,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_until date;
  v_start date;
  v_opening numeric;
  v_earned numeric;
  v_paid numeric;
  v_adjustments numeric;
  v_closing numeric;
  v_id uuid;
begin
  if p_period_end is null or p_today is null then
    raise exception 'INVALID_DATE: the settlement date is required';
  end if;

  -- 1. Lock the contractor; everything below is read after it.
  perform 1 from contractors where id = p_contractor_id for update;
  if not found then
    raise exception 'CONTRACTOR_NOT_FOUND: contractor % does not exist', p_contractor_id;
  end if;

  -- 2. Period start.
  v_until := contractor_settled_until(p_contractor_id);
  if v_until is not null then
    v_start := v_until + 1;
  else
    select min(entry_date) into v_start
    from contractor_ledger_entries where contractor_id = p_contractor_id;
    if v_start is null then
      raise exception 'NOTHING_TO_SETTLE: this contractor has no khata entries';
    end if;
  end if;

  -- 3. End date.
  if p_period_end > p_today then
    raise exception 'SETTLE_DATE_FUTURE: the settlement date cannot be after today';
  end if;
  if p_period_end < v_start then
    raise exception 'SETTLE_BEFORE_PERIOD_START:%', v_start;
  end if;

  -- 4. Figures (research.md, "settlement figures"): the go-live opening entry counts in opening;
  -- paid is net of reversals.
  select
    coalesce(sum(case when entry_date < v_start or source_type = 'opening_balance'
                      then signed end), 0),
    coalesce(sum(case when source_type = 'production_batch' and entry_date >= v_start
                      then amount end), 0),
    coalesce(sum(case when entry_date >= v_start and source_type = 'payment' then amount
                      when entry_date >= v_start and source_type = 'payment_reversal' then -amount end), 0),
    coalesce(sum(case when entry_date >= v_start and source_type = 'adjustment' then signed end), 0)
  into v_opening, v_earned, v_paid, v_adjustments
  from (select *, case when type = 'credit' then amount else -amount end as signed
        from contractor_ledger_entries
        where contractor_id = p_contractor_id and entry_date <= p_period_end) e;
  v_closing := v_opening + v_earned - v_paid + v_adjustments;

  -- 5. Non-zero closing needs explicit confirmation (FR-026).
  if v_closing <> 0 and not coalesce(p_confirm_nonzero, false) then
    raise exception 'SETTLEMENT_BALANCE_NOT_ZERO:%', v_closing;
  end if;

  -- 6. Save.
  insert into contractor_settlements (
    contractor_id, period_start, period_end, opening_balance, earned, paid, adjustments,
    closing_balance, note, settled_by
  ) values (
    p_contractor_id, v_start, p_period_end, v_opening, v_earned, v_paid, v_adjustments,
    v_closing, nullif(btrim(p_note), ''), p_user_id
  )
  returning id into v_id;

  return v_id;
end;
$$;

-- ============================================================================
-- reopen_contractor_settlement
-- ============================================================================

create or replace function reopen_contractor_settlement(
  p_settlement_id uuid,
  p_reason text,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_reason text := nullif(btrim(p_reason), '');
  v_contractor_id uuid;
  v_settlement contractor_settlements%rowtype;
begin
  if v_reason is null then
    raise exception 'REASON_REQUIRED: a reason is required to reopen a settlement';
  end if;

  select contractor_id into v_contractor_id from contractor_settlements where id = p_settlement_id;
  if not found then
    raise exception 'NOT_FOUND: settlement % does not exist', p_settlement_id;
  end if;
  perform 1 from contractors where id = v_contractor_id for update;

  select * into v_settlement from contractor_settlements where id = p_settlement_id;
  if v_settlement.reopened_at is not null then
    raise exception 'SETTLEMENT_ALREADY_REOPENED: this settlement has already been reopened';
  end if;
  if exists (select 1 from contractor_settlements
             where contractor_id = v_contractor_id and reopened_at is null
               and period_end > v_settlement.period_end) then
    raise exception 'NOT_LATEST_SETTLEMENT: only the most recent settlement can be reopened';
  end if;

  update contractor_settlements
  set reopened_at = now(), reopened_by = p_user_id, reopen_reason = v_reason
  where id = p_settlement_id;
end;
$$;

commit;
