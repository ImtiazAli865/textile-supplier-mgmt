-- 0008_performa_invoicing.sql
-- Performa Invoicing (008-performa-invoicing): generates and posts Performa Invoices for
-- customers flagged issues_performa_invoice = true (currently Habbitt only), against
-- delivered-but-not-yet-invoiced quantities on customer PO lines (006). Invoice lines
-- reference customer_po_lines directly (not challan_lines), snapshotting product/uom/unit_price
-- at creation time. Creating an invoice is a single, atomic action: it advances the trade
-- name's plain sequential invoice-number counter, increases each referenced PO line's
-- invoiced_quantity, computes gross/tax/net totals, and posts one ledger credit for the net
-- total — there is no separate confirmation step and no update/void/accept path at all.
-- See specs/008-performa-invoicing/data-model.md and research.md.

-- ============================================================================
-- customer_po_lines: new FR-015 database-level backstop (006's table, altered here)
-- ============================================================================

alter table customer_po_lines
  add constraint customer_po_lines_invoiced_le_delivered
  check (invoiced_quantity <= delivered_quantity);

comment on constraint customer_po_lines_invoiced_le_delivered on customer_po_lines is 'Hard backstop for FR-015 (008-performa-invoicing): even if create_performa_invoice''s own "for update" locking were ever bypassed by a future bug, the database itself refuses any update that would push invoiced_quantity past delivered_quantity.';

-- ============================================================================
-- performa_invoices
-- ============================================================================

create table performa_invoices (
  id             uuid primary key default gen_random_uuid(),
  customer_id    uuid not null references customers (id),
  trade_name_id  uuid not null references trade_names (id),
  invoice_number varchar(30) not null check (btrim(invoice_number) <> ''),
  invoice_date   date not null,
  tax_rate       numeric(5, 2) not null check (tax_rate >= 0 and tax_rate <= 100),
  created_at     timestamptz not null default now(),
  created_by     uuid not null references auth.users (id),
  constraint performa_invoices_trade_name_number_unique unique (trade_name_id, invoice_number)
);

comment on table performa_invoices is 'A Performa Invoice billing document, issued only to customers flagged issues_performa_invoice = true (feature 008). No updated_at/update trigger and no update/delete path anywhere — fully read-only from the moment it is created (FR-009, FR-010), unlike every editable header table in this project. See specs/008-performa-invoicing/data-model.md.';
comment on column performa_invoices.invoice_number is 'Auto-generated (a plain sequential value from trade_names.next_invoice_number, no padding or date suffix) or staff-overridden; unique per trade name (FR-004).';
comment on column performa_invoices.tax_rate is 'Percentage, defaulting to 18 at the form/schema layer, staff-overridable per invoice, applied once to the invoice''s summed gross total (FR-005) — never per line.';

create index idx_performa_invoices_customer_date on performa_invoices (customer_id, invoice_date desc);

-- ============================================================================
-- performa_invoice_lines (1:N)
-- ============================================================================

create table performa_invoice_lines (
  id                uuid primary key default gen_random_uuid(),
  invoice_id        uuid not null references performa_invoices (id) on delete cascade,
  position          smallint not null default 0,
  po_line_id        uuid not null references customer_po_lines (id),
  product_id        uuid not null references products (id),
  uom               text not null check (btrim(uom) <> ''),
  unit_price        numeric(12, 2) not null check (unit_price > 0),
  invoiced_quantity numeric(10, 2) not null check (invoiced_quantity > 0),
  created_at        timestamptz not null default now()
);

comment on table performa_invoice_lines is 'One line item on a Performa Invoice (feature 008). po_line_id has no on delete cascade — the ordinary FK RESTRICT default prevents a referenced customer_po_lines row from ever being deleted while any invoice still points to it (same reasoning as challan_lines, 007). No updated_at — a line is never edited after creation, stricter than challan_lines (editable pre-acceptance).';
comment on column performa_invoice_lines.product_id is 'Snapshot from the PO line at creation time — never re-read live afterward (same reasoning as challan_lines, 007).';
comment on column performa_invoice_lines.uom is 'Snapshot from the PO line at creation time — see product_id''s comment.';
comment on column performa_invoice_lines.unit_price is 'Snapshot from the PO line at creation time; this value drives this line''s contribution to the invoice''s gross total.';

create index idx_performa_invoice_lines_invoice on performa_invoice_lines (invoice_id, position);
create index idx_performa_invoice_lines_po_line on performa_invoice_lines (po_line_id);

-- ============================================================================
-- performa_invoice_attachments (1:N — zero or more GST Sales Tax Invoice PDFs)
-- ============================================================================

create table performa_invoice_attachments (
  id           uuid primary key default gen_random_uuid(),
  invoice_id   uuid not null references performa_invoices (id) on delete cascade,
  storage_path text not null,
  file_name    text not null,
  content_type text not null,
  uploaded_at  timestamptz not null default now(),
  uploaded_by  uuid not null references auth.users (id)
);

comment on table performa_invoice_attachments is 'Zero or more externally-prepared GST Sales Tax Invoice PDFs attached to a Performa Invoice for reference only (FR-011) — this feature never generates, calculates, or reads their content. A child table, not nullable columns on the header, since this cardinality is genuinely open-ended (contrast with challans.signed_copy_* — zero-or-one).';

create index idx_performa_invoice_attachments_invoice on performa_invoice_attachments (invoice_id);

-- ============================================================================
-- Storage: performa-invoice-attachments (fourth private bucket in this project)
-- ============================================================================
-- Same trust boundary as trade-name-assets/customer-po-documents/challan-attachments (ADR-0003).

insert into storage.buckets (id, name, public)
values ('performa-invoice-attachments', 'performa-invoice-attachments', false)
on conflict (id) do nothing;

-- ============================================================================
-- create_performa_invoice — the ONLY mutation this feature exposes (no update/void/accept
-- function exists at all; research.md).
-- ============================================================================

create or replace function create_performa_invoice(
  p_customer_id uuid,
  p_trade_name_id uuid,
  p_invoice_number varchar(30),
  p_invoice_date date,
  p_tax_rate numeric,
  p_lines jsonb,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_issues_performa_invoice boolean;
  v_invoice_number varchar(30);
  v_id uuid;
  v_lock_line record;
  v_line jsonb;
  v_ord bigint;
  v_po_line_id uuid;
  v_invoiced_quantity numeric;
  v_delivered numeric;
  v_invoiced numeric;
  v_po_customer_id uuid;
  v_po_status text;
  v_product_id uuid;
  v_uom text;
  v_unit_price numeric;
  v_gross_total numeric := 0;
  v_tax_amount numeric;
  v_net_total numeric;
begin
  select issues_performa_invoice into v_issues_performa_invoice
  from customers where id = p_customer_id;
  if not found or not v_issues_performa_invoice then
    raise exception 'CUSTOMER_NOT_INVOICE_ELIGIBLE: this customer does not issue Performa Invoices';
  end if;

  if not exists (select 1 from trade_names where id = p_trade_name_id) then
    raise exception 'TRADE_NAME_NOT_FOUND: the referenced trade name does not exist';
  end if;

  -- Reject a p_lines array referencing the same PO line more than once (mirrors
  -- create_challan's own DUPLICATE_PO_LINE guard, 007) — a pure in-memory check, no query.
  if exists (
    select 1 from (
      select (l ->> 'poLineId')::uuid as po_line_id, count(*) as cnt
      from jsonb_array_elements(p_lines) as l
      group by 1
    ) dupes
    where cnt > 1
  ) then
    raise exception 'DUPLICATE_PO_LINE: an invoice cannot reference the same PO line more than once';
  end if;

  -- Validate every line BEFORE inserting anything, locking each referenced customer_po_lines
  -- row (for update of cpl) as it's read. Iterated in po_line_id-sorted order — not
  -- client-submission order — so two concurrent multi-line invoices sharing lines always
  -- acquire their locks in the same fixed order, preventing a Postgres deadlock (research.md).
  -- The lock itself is what makes FR-015 hold under real concurrency: a second transaction
  -- targeting the same line blocks here until the first commits or rolls back, then reads
  -- genuinely current data — not a stale pre-update snapshot.
  for v_lock_line in
    select value ->> 'poLineId' as po_line_id,
           (value ->> 'invoicedQuantity')::numeric as invoiced_quantity
    from jsonb_array_elements(p_lines)
    order by (value ->> 'poLineId')
  loop
    select cpl.delivered_quantity, cpl.invoiced_quantity, cp.customer_id, cp.status
    into v_delivered, v_invoiced, v_po_customer_id, v_po_status
    from customer_po_lines cpl
    join customer_pos cp on cp.id = cpl.po_id
    where cpl.id = v_lock_line.po_line_id::uuid
    for update of cpl;

    if not found then
      raise exception 'PO_LINE_NOT_FOUND: line % does not exist', v_lock_line.po_line_id;
    end if;
    if v_po_customer_id <> p_customer_id then
      raise exception 'PO_LINE_WRONG_CUSTOMER: line % does not belong to this invoice''s customer', v_lock_line.po_line_id;
    end if;
    if v_po_status = 'cancelled' then
      raise exception 'PO_CANCELLED: the PO for line % is cancelled', v_lock_line.po_line_id;
    end if;
    if v_delivered - v_invoiced <= 0 then
      raise exception 'LINE_FULLY_INVOICED: line % has no remaining quantity to invoice', v_lock_line.po_line_id;
    end if;
    if v_lock_line.invoiced_quantity > v_delivered - v_invoiced then
      raise exception 'LINE_EXCEEDS_REMAINING_INVOICEABLE: line % has only % remaining to invoice', v_lock_line.po_line_id, v_delivered - v_invoiced;
    end if;
  end loop;

  if p_invoice_number is null or btrim(p_invoice_number) = '' then
    update trade_names
    set next_invoice_number = next_invoice_number + 1
    where id = p_trade_name_id
    returning (next_invoice_number - 1)::text into v_invoice_number;
  else
    v_invoice_number := p_invoice_number;
  end if;

  insert into performa_invoices (customer_id, trade_name_id, invoice_number, invoice_date, tax_rate, created_by)
  values (p_customer_id, p_trade_name_id, v_invoice_number, p_invoice_date, p_tax_rate, p_user_id)
  returning id into v_id;

  -- Insert lines and increment each PO line's invoiced_quantity, preserving the ORIGINAL
  -- client-submitted order for `position` (independent of the locking loop's sort order above,
  -- research.md). The rows read here are already locked by the loop above for the rest of this
  -- transaction, so no re-locking is needed.
  for v_line, v_ord in
    select l, ord from jsonb_array_elements(p_lines) with ordinality as t(l, ord)
  loop
    v_po_line_id := (v_line ->> 'poLineId')::uuid;
    v_invoiced_quantity := (v_line ->> 'invoicedQuantity')::numeric;

    select product_id, uom, unit_price into v_product_id, v_uom, v_unit_price
    from customer_po_lines where id = v_po_line_id;

    insert into performa_invoice_lines (
      invoice_id, position, po_line_id, product_id, uom, unit_price, invoiced_quantity
    ) values (
      v_id, (v_ord - 1)::smallint, v_po_line_id, v_product_id, v_uom, v_unit_price, v_invoiced_quantity
    );

    update customer_po_lines
    set invoiced_quantity = invoiced_quantity + v_invoiced_quantity
    where id = v_po_line_id;

    v_gross_total := v_gross_total + round(v_invoiced_quantity * v_unit_price, 2);
  end loop;

  v_tax_amount := round(v_gross_total * p_tax_rate / 100, 2);
  v_net_total := v_gross_total + v_tax_amount;

  -- No conditional guard on v_net_total > 0 is needed — at least one line is required
  -- (enforced by the calling Zod schema, matching create_challan's own convention of not
  -- duplicating that check in SQL) and every line's invoiced_quantity/unit_price are CHECK > 0,
  -- so v_net_total is always positive (ledger_entries.amount itself is CHECK > 0, 005).
  insert into ledger_entries (customer_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values (p_customer_id, p_invoice_date, 'credit', v_net_total, 'performa_invoice', v_id, 'Performa Invoice ' || v_invoice_number, p_user_id);

  return v_id;
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table performa_invoices enable row level security;
alter table performa_invoice_lines enable row level security;
alter table performa_invoice_attachments enable row level security;
