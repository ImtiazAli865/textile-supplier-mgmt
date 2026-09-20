-- 0006_customer_purchase_orders.sql
-- Customer purchase orders (006-customer-purchase-orders): captures an incoming customer PO
-- as received — header, line items resolved against 005's customer_product_mappings — without
-- generating Challans, Invoices, or posting to the ledger (007/008/009). See
-- specs/006-customer-purchase-orders/data-model.md.

-- ============================================================================
-- customer_pos
-- ============================================================================

create table customer_pos (
  id                      uuid primary key default gen_random_uuid(),
  customer_id             uuid not null references customers (id),
  po_number               varchar(30) not null check (btrim(po_number) <> ''),
  order_date              date not null,
  purchaser_name          text,
  requested_delivery_date date,
  destination_text        text,
  trade_name_id           uuid references trade_names (id),
  status                  text not null default 'open' check (status in ('open', 'cancelled')),
  created_at              timestamptz not null default now(),
  updated_at              timestamptz not null default now(),
  created_by              uuid not null references auth.users (id),
  updated_by              uuid not null references auth.users (id),
  constraint customer_pos_customer_po_number_unique unique (customer_id, po_number)
);

comment on table customer_pos is 'An incoming customer purchase order, captured as received (feature 006). Does not generate Challans/Invoices or post to the ledger — see specs/006-customer-purchase-orders/spec.md.';
comment on column customer_pos.po_number is 'Free-form, at least 30 characters of capacity, no minimum length or format restriction — accommodates both short PDF-style numbers (e.g. Habbitt''s "P14337") and long portal-style numbers (e.g. Chaseup''s "111202110000440639") verbatim. Unique per customer only (FR-004), not globally.';
comment on column customer_pos.destination_text is 'Free-text snapshot, never a live FK to customer_ship_to_addresses (research.md) — defaults to the customer''s current billing address, applied server-side by createCustomerPORecord/updateCustomerPORecord when submitted blank.';
comment on column customer_pos.trade_name_id is 'The trade name this PO bills under — a real, stable FK (research.md), pre-filled from the customer''s 005 usable-trade-name hint when unambiguous, always changeable.';

-- Default list view: status filter + customer + date sort (FR-012).
create index idx_customer_pos_status_customer on customer_pos (status, customer_id, order_date desc);

-- Reuses set_updated_at() defined in 0001_init.sql.
create trigger trg_customer_pos_updated_at
  before update on customer_pos
  for each row execute function set_updated_at();

-- ============================================================================
-- customer_po_lines (1:N)
-- ============================================================================

create table customer_po_lines (
  id                 uuid primary key default gen_random_uuid(),
  po_id              uuid not null references customer_pos (id) on delete cascade,
  position           smallint not null default 0,
  customer_item_code text,
  product_id         uuid not null references products (id),
  description        text,
  quantity_ordered   numeric(10, 2) not null check (quantity_ordered > 0),
  uom                text not null check (btrim(uom) <> ''),
  unit_price         numeric(12, 2) not null check (unit_price > 0),
  line_total         numeric(12, 2) generated always as (round(quantity_ordered * unit_price, 2)) stored,
  delivered_quantity numeric(10, 2) not null default 0 check (delivered_quantity >= 0),
  invoiced_quantity  numeric(10, 2) not null default 0 check (invoiced_quantity >= 0),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

comment on table customer_po_lines is 'One line item on a customer PO (feature 006). See specs/006-customer-purchase-orders/data-model.md.';
comment on column customer_po_lines.customer_item_code is 'As entered by staff — a plain snapshot, not a live reference to the customer_product_mappings row that resolved it (research.md), since a mapping may be edited/removed later without retroactively changing history.';
comment on column customer_po_lines.description is 'Free text, stored and displayed exactly as entered — never parsed, even when it embeds another reference (e.g. a Chaseup portal description embedding a Challan number). FR-008.';
comment on column customer_po_lines.unit_price is 'Pre-filled from a customer_product_mappings default_price when resolved, but always the authoritative, staff-entered value once saved (FR-006) — never re-validated against the mapping after the fact.';
comment on column customer_po_lines.delivered_quantity is 'Reserved for 007-Challans to write this line''s cumulative *accepted* quantity across its Challans (spec FR-017/Assumptions). This feature never sets it above zero and exposes no path to do so.';
comment on column customer_po_lines.invoiced_quantity is 'Reserved for 008-Performa-Invoicing (spec FR-017). Same rule — never written above zero by this feature.';

create index idx_customer_po_lines_po on customer_po_lines (po_id, position);
create index idx_customer_po_lines_product on customer_po_lines (product_id);

create trigger trg_customer_po_lines_updated_at
  before update on customer_po_lines
  for each row execute function set_updated_at();

-- ============================================================================
-- customer_po_attachments (1:N)
-- ============================================================================

create table customer_po_attachments (
  id           uuid primary key default gen_random_uuid(),
  po_id        uuid not null references customer_pos (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid not null references auth.users (id)
);

comment on table customer_po_attachments is 'Zero or more documents attached to a PO (e.g. the received PDF), uploaded/linked as a follow-up step after the PO itself is created (research.md) — never required to save a PO (FR-009).';
comment on column customer_po_attachments.storage_path is 'Object path (not a URL) within the customer-po-documents bucket. Read as a short-lived signed URL, never a public URL (ADR-0003), mirroring trade_names.signature_image_path.';

create index idx_customer_po_attachments_po on customer_po_attachments (po_id);

-- ============================================================================
-- Storage: customer-po-documents (second private bucket in this project)
-- ============================================================================
-- Same trust boundary as trade-name-assets (ADR-0003): service-role-only uploads/deletes,
-- short-lived signed URLs for reads, no Storage RLS policies.

insert into storage.buckets (id, name, public)
values ('customer-po-documents', 'customer-po-documents', false)
on conflict (id) do nothing;

-- ============================================================================
-- create_customer_po / update_customer_po / set_customer_po_status
-- ============================================================================
-- create_customer_po mirrors create_customer's single-transaction shape (ADR-0002).
-- update_customer_po replaces 001/005's delete-then-reinsert child-row shape with a
-- per-line upsert, because FR-014's edit lock is per-line AND per-field (only quantity,
-- UOM, price, and product resolution lock — item code and description never do) — see
-- specs/006-customer-purchase-orders/research.md.

create or replace function create_customer_po(
  p_customer_id uuid,
  p_po_number varchar(30),
  p_order_date date,
  p_purchaser_name text,
  p_requested_delivery_date date,
  p_destination_text text,
  p_trade_name_id uuid,
  p_lines jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into customer_pos (
    customer_id, po_number, order_date, purchaser_name, requested_delivery_date,
    destination_text, trade_name_id, created_by, updated_by
  ) values (
    p_customer_id, p_po_number, p_order_date, p_purchaser_name, p_requested_delivery_date,
    p_destination_text, p_trade_name_id, p_user_id, p_user_id
  )
  returning id into v_id;

  -- delivered_quantity/invoiced_quantity are never set here; they take their 0 defaults.
  insert into customer_po_lines (
    po_id, position, customer_item_code, product_id, description, quantity_ordered, uom, unit_price
  )
  select
    v_id,
    (ord - 1)::smallint,
    nullif(l ->> 'customerItemCode', ''),
    (l ->> 'productId')::uuid,
    nullif(l ->> 'description', ''),
    (l ->> 'quantityOrdered')::numeric,
    l ->> 'uom',
    (l ->> 'unitPrice')::numeric
  from jsonb_array_elements(p_lines) with ordinality as t(l, ord);

  return v_id;
end;
$$;

create or replace function update_customer_po(
  p_id uuid,
  p_po_number varchar(30),
  p_order_date date,
  p_purchaser_name text,
  p_requested_delivery_date date,
  p_destination_text text,
  p_trade_name_id uuid,
  p_lines jsonb,
  p_user_id uuid
)
returns void
language plpgsql
as $$
declare
  v_line jsonb;
  v_ord bigint;
  v_line_id uuid;
  v_current customer_po_lines%rowtype;
  v_keep_ids uuid[];
begin
  update customer_pos set
    po_number = p_po_number,
    order_date = p_order_date,
    purchaser_name = p_purchaser_name,
    requested_delivery_date = p_requested_delivery_date,
    destination_text = p_destination_text,
    trade_name_id = p_trade_name_id,
    updated_by = p_user_id
    -- status is intentionally omitted — only set_customer_po_status may change it.
  where id = p_id;

  -- Every line id this call wants to keep/update; anything else currently on the PO is a
  -- deletion attempt.
  select array_agg((l ->> 'id')::uuid) into v_keep_ids
  from jsonb_array_elements(p_lines) as l
  where l ->> 'id' is not null;

  if exists (
    select 1 from customer_po_lines
    where po_id = p_id
      and (delivered_quantity > 0 or invoiced_quantity > 0)
      and (v_keep_ids is null or not (id = any (v_keep_ids)))
  ) then
    raise exception 'LOCKED_LINE: cannot remove a line with delivery or invoicing activity recorded against it';
  end if;

  delete from customer_po_lines
  where po_id = p_id
    and (v_keep_ids is null or not (id = any (v_keep_ids)));

  -- Per-line upsert (not delete-then-reinsert — research.md). FR-014 locks only an existing
  -- locked line's quantity, UOM, price, and product resolution — description and
  -- customer_item_code are purely informational and remain editable even on a locked line.
  for v_line, v_ord in
    select l, ord from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
  loop
    v_line_id := nullif(v_line ->> 'id', '')::uuid;

    if v_line_id is not null then
      select * into v_current from customer_po_lines where id = v_line_id;

      if v_current.delivered_quantity > 0 or v_current.invoiced_quantity > 0 then
        if v_current.product_id <> (v_line ->> 'productId')::uuid
          or v_current.quantity_ordered <> (v_line ->> 'quantityOrdered')::numeric
          or v_current.uom <> (v_line ->> 'uom')
          or v_current.unit_price <> (v_line ->> 'unitPrice')::numeric
        then
          raise exception 'LOCKED_LINE: this line has delivery or invoicing activity recorded against it — its quantity, unit of measure, price, and product cannot be changed here';
        end if;

        -- Locked: only customer_item_code/description/position may change.
        update customer_po_lines set
          position = (v_ord - 1)::smallint,
          customer_item_code = nullif(v_line ->> 'customerItemCode', ''),
          description = nullif(v_line ->> 'description', '')
        where id = v_line_id;
      else
        update customer_po_lines set
          position = (v_ord - 1)::smallint,
          customer_item_code = nullif(v_line ->> 'customerItemCode', ''),
          product_id = (v_line ->> 'productId')::uuid,
          description = nullif(v_line ->> 'description', ''),
          quantity_ordered = (v_line ->> 'quantityOrdered')::numeric,
          uom = v_line ->> 'uom',
          unit_price = (v_line ->> 'unitPrice')::numeric
        where id = v_line_id;
      end if;
    else
      insert into customer_po_lines (
        po_id, position, customer_item_code, product_id, description, quantity_ordered, uom, unit_price
      ) values (
        p_id,
        (v_ord - 1)::smallint,
        nullif(v_line ->> 'customerItemCode', ''),
        (v_line ->> 'productId')::uuid,
        nullif(v_line ->> 'description', ''),
        (v_line ->> 'quantityOrdered')::numeric,
        v_line ->> 'uom',
        (v_line ->> 'unitPrice')::numeric
      );
    end if;
  end loop;
end;
$$;

create or replace function set_customer_po_status(
  p_id uuid,
  p_status text,
  p_user_id uuid
)
returns void
language plpgsql
as $$
begin
  -- Reactivating ('open') is an unconditional set, mirroring set_customer_status's
  -- no-op-safe shape (005). Cancelling checks-and-writes atomically in one call, closing
  -- the TOCTOU gap two separate supabase-js round-trips would reopen (research.md).
  if p_status = 'cancelled' then
    if exists (
      select 1 from customer_po_lines
      where po_id = p_id and (delivered_quantity > 0 or invoiced_quantity > 0)
    ) then
      raise exception 'LOCKED_PO: this PO has delivery or invoicing activity recorded against it and can no longer be cancelled here';
    end if;
  end if;

  update customer_pos set status = p_status, updated_by = p_user_id where id = p_id;
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table customer_pos enable row level security;
alter table customer_po_lines enable row level security;
alter table customer_po_attachments enable row level security;
