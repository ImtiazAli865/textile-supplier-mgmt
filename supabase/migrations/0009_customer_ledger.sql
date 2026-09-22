-- 0009_customer_ledger.sql
-- Customer Ledger (009-customer-ledger): presents each customer's ledger_entries (opening
-- balance from 005, Challan-acceptance credits from 007, Performa Invoice credits from 008) as
-- a running-balance view, and introduces the missing piece none of those features write:
-- recording actual customer payments (cheques) — date, amount, cheque number, bank name,
-- status (Received/Cleared/Bounced) — which post as Debit entries. A bounced cheque reverses via
-- a new, separately visible Credit entry dated at the bounce-discovery date, never by editing the
-- original entry. See specs/009-customer-ledger/data-model.md and research.md.

-- ============================================================================
-- customer_payments (new)
-- ============================================================================

create table customer_payments (
  id                 uuid primary key default gen_random_uuid(),
  customer_id        uuid not null references customers (id),
  payment_date       date not null,
  amount             numeric(12, 2) not null check (amount > 0),
  cheque_number      text not null check (btrim(cheque_number) <> ''),
  bank_name          text not null check (btrim(bank_name) <> ''),
  status             text not null default 'received' check (status in ('received', 'cleared', 'bounced')),
  reference_type     text check (reference_type is null or reference_type in ('customer_po', 'performa_invoice')),
  reference_id       uuid,
  created_at         timestamptz not null default now(),
  created_by         uuid not null references auth.users (id),
  status_changed_at  timestamptz,
  status_changed_by  uuid references auth.users (id),
  constraint customer_payments_reference_pair check ((reference_type is null) = (reference_id is null))
);

comment on table customer_payments is 'One recorded cheque/payment against a customer (feature 009). status is received at creation and final once cleared or bounced — enforced in update_customer_payment_status, not a CHECK (a plain CHECK cannot compare OLD/NEW). No updated_at/generic update trigger: update_customer_payment_status is the only code path that ever UPDATEs this table, and it only ever sets status/status_changed_at/status_changed_by — every other column has no update path anywhere, by omission, matching ledger_entries (005) and performa_invoices (008) own immutability shape. See specs/009-customer-ledger/data-model.md and research.md.';
comment on column customer_payments.reference_type is 'Polymorphic, matching ledger_entries.source_type (005). Null for an untied lump-sum payment (FR-005).';
comment on column customer_payments.reference_id is 'No FK — deliberately polymorphic across customer_pos/performa_invoices, matching ledger_entries.source_id (005). Validated in record_customer_payment to belong to the same customer_id (FR-006), never re-validated afterward since it is never edited.';
comment on column customer_payments.status_changed_at is 'Null until the one allowed status transition (received -> cleared or received -> bounced) happens (FR-014).';

create index idx_customer_payments_customer_date on customer_payments (customer_id, payment_date desc);

-- ============================================================================
-- record_customer_payment: inserts the payment row and its ledger_entries debit atomically
-- (ADR-0002), mirroring create_performa_invoice's own atomicity guarantee (008).
-- ============================================================================

create or replace function record_customer_payment(
  p_customer_id uuid,
  p_payment_date date,
  p_amount numeric,
  p_cheque_number text,
  p_bank_name text,
  p_reference_type text,
  p_reference_id uuid,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
  v_ref_customer_id uuid;
begin
  if not exists (select 1 from customers where id = p_customer_id) then
    raise exception 'CUSTOMER_NOT_FOUND: customer % does not exist', p_customer_id;
  end if;

  if p_reference_type is not null then
    if p_reference_type = 'customer_po' then
      select customer_id into v_ref_customer_id from customer_pos where id = p_reference_id;
    elsif p_reference_type = 'performa_invoice' then
      select customer_id into v_ref_customer_id from performa_invoices where id = p_reference_id;
    else
      raise exception 'INVALID_REFERENCE_TYPE: % is not a valid reference type', p_reference_type;
    end if;

    if v_ref_customer_id is null then
      raise exception 'REFERENCE_NOT_FOUND: referenced % % does not exist', p_reference_type, p_reference_id;
    end if;
    if v_ref_customer_id <> p_customer_id then
      raise exception 'REFERENCE_WRONG_CUSTOMER: referenced % does not belong to this payment''s customer', p_reference_type;
    end if;
  end if;

  insert into customer_payments (
    customer_id, payment_date, amount, cheque_number, bank_name, reference_type, reference_id, created_by
  ) values (
    p_customer_id, p_payment_date, p_amount, p_cheque_number, p_bank_name, p_reference_type, p_reference_id, p_user_id
  )
  returning id into v_id;

  insert into ledger_entries (customer_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values (p_customer_id, p_payment_date, 'debit', p_amount, 'payment', v_id, 'Cheque ' || p_cheque_number || ' received', p_user_id);

  return v_id;
end;
$$;

-- ============================================================================
-- update_customer_payment_status: the only status-transition path for a payment. Locks the row
-- (for update) so two concurrent status-change calls against the same payment cannot both
-- succeed (research.md, "Concurrency guarantee" precedent from create_performa_invoice, 008).
-- ============================================================================

create or replace function update_customer_payment_status(
  p_id uuid,
  p_new_status text,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_status text;
  v_customer_id uuid;
  v_amount numeric;
  v_cheque_number text;
begin
  select status, customer_id, amount, cheque_number
  into v_status, v_customer_id, v_amount, v_cheque_number
  from customer_payments where id = p_id
  for update;

  if not found then
    raise exception 'PAYMENT_NOT_FOUND: payment % does not exist', p_id;
  end if;

  if v_status <> 'received' then
    raise exception 'PAYMENT_STATUS_FINAL: this payment is already %', v_status;
  end if;

  if p_new_status not in ('cleared', 'bounced') then
    raise exception 'INVALID_STATUS: % is not a valid target status', p_new_status;
  end if;

  update customer_payments
  set status = p_new_status, status_changed_at = now(), status_changed_by = p_user_id
  where id = p_id;

  if p_new_status = 'bounced' then
    insert into ledger_entries (customer_id, entry_date, type, amount, source_type, source_id, description, created_by)
    values (v_customer_id, current_date, 'credit', v_amount, 'payment_reversal', p_id, 'Cheque ' || v_cheque_number || ' bounced — reversal', p_user_id);
  end if;
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table customer_payments enable row level security;
