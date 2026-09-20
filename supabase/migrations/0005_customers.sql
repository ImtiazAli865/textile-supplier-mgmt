-- 0005_customers.sql
-- Customer records (005-customers): the businesses this company sells to, at minimum
-- Habbitt, Chaseup, ChaseValue, and Kifayat. Introduces the shared ledger_entries table
-- (this feature is its first writer — see history/adr/0004-shared-tables-created-at-first-writer.md)
-- and the customer-product mapping deferred from 003-product-catalog. See
-- specs/005-customers/data-model.md.

-- ============================================================================
-- customers
-- ============================================================================

create table customers (
  id                            uuid primary key default gen_random_uuid(),
  display_name                  text not null check (btrim(display_name) <> ''),
  legal_name                    text not null check (btrim(legal_name) <> ''),
  billing_address_line1         text not null check (btrim(billing_address_line1) <> ''),
  billing_address_line2         text,
  billing_address_city          text not null check (btrim(billing_address_city) <> ''),
  billing_address_state         text,
  billing_address_postal_code   text,
  billing_address_country       text not null check (btrim(billing_address_country) <> ''),
  telephone                     text,
  ntn_number                    text,
  sales_tax_registration_number text,
  issues_performa_invoice       boolean not null default false,
  payment_terms_min_days        integer not null default 0 check (payment_terms_min_days >= 0),
  payment_terms_max_days        integer not null default 0 check (payment_terms_max_days >= 0),
  status                        text not null default 'active' check (status in ('active', 'inactive')),
  created_at                    timestamptz not null default now(),
  updated_at                    timestamptz not null default now(),
  created_by                    uuid not null references auth.users (id),
  updated_by                    uuid not null references auth.users (id),
  constraint customers_payment_terms_range_check check (payment_terms_max_days >= payment_terms_min_days)
);

comment on table customers is 'Businesses this company sells to (feature 005). No unique constraint on display_name/legal_name — duplicates permitted (spec Edge Cases). See specs/005-customers/data-model.md.';
comment on column customers.legal_name is 'The legal/billing name for tax documents — distinct from display_name (e.g. Habbitt''s display_name is "Habbitt", legal_name is "Universal Retail (Pvt) Ltd").';
comment on column customers.payment_terms_min_days is 'Expected minimum days in this customer''s typical payment range (FR-010) — not a strict rule; see payment_terms_max_days.';
comment on column customers.payment_terms_max_days is 'Expected maximum days. Read only by 009-customer-ledger, to classify an actual payment as "within" or "beyond" the expected range for ageing/reporting — never to block, reject, or auto-flag a payment.';

-- Default list view: status filter + name sort (FR-003), mirroring idx_suppliers_status_name.
create index idx_customers_status_name on customers (status, lower(display_name));

-- Reuses set_updated_at() defined in 0001_init.sql.
create trigger trg_customers_updated_at
  before update on customers
  for each row execute function set_updated_at();

-- ============================================================================
-- customer_contacts (1:N, min 1 per customer per FR-002 — enforced in the service layer)
-- ============================================================================

create table customer_contacts (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  position    smallint not null default 0,
  name        text not null check (btrim(name) <> ''),
  phone       text,
  email       text,
  role        text,
  constraint customer_contacts_phone_or_email check (phone is not null or email is not null)
);

comment on table customer_contacts is 'Per-customer contact people, min 1 per customer (FR-002, FR-017), enforced in the service layer.';

create index idx_customer_contacts_customer on customer_contacts (customer_id, position);

-- ============================================================================
-- customer_ship_to_addresses (1:N, zero or more per customer — FR-018)
-- ============================================================================

create table customer_ship_to_addresses (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id) on delete cascade,
  position    smallint not null default 0,
  label       text,
  line1       text not null check (btrim(line1) <> ''),
  line2       text,
  city        text not null check (btrim(city) <> ''),
  state       text,
  postal_code text,
  country     text not null check (btrim(country) <> '')
);

comment on table customer_ship_to_addresses is 'Zero or more ship-to/warehouse addresses per customer, distinct from the billing address (FR-018).';

create index idx_customer_ship_to_customer on customer_ship_to_addresses (customer_id, position);

-- ============================================================================
-- customer_trade_names (join table — hint only, never an enforced restriction, FR-008)
-- ============================================================================

create table customer_trade_names (
  customer_id   uuid not null references customers (id) on delete cascade,
  trade_name_id uuid not null references trade_names (id),
  position      smallint not null default 0,
  primary key (customer_id, trade_name_id)
);

comment on table customer_trade_names is 'A customer''s "usable trade names" — a non-enforcing default/sort hint only (FR-008). Read by no enforcement logic anywhere in this feature or any planned future one; no CHECK, trigger, or application code may ever use it to reject a trade-name choice. position 0 = the customer''s primary/default hint.';

create index idx_customer_trade_names_customer on customer_trade_names (customer_id, position);

-- ============================================================================
-- customer_product_mappings (join table — customer-specific item code / selling UOM / default price)
-- ============================================================================

create table customer_product_mappings (
  id                  uuid primary key default gen_random_uuid(),
  customer_id         uuid not null references customers (id) on delete cascade,
  product_id          uuid not null references products (id),
  customer_item_code  text,
  selling_uom         text,
  default_price       numeric(12, 2) check (default_price > 0),
  conversion_factor   numeric(10, 4) not null default 1 check (conversion_factor > 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid not null references auth.users (id),
  updated_by          uuid not null references auth.users (id),
  constraint customer_product_mappings_has_value_check check (
    customer_item_code is not null or selling_uom is not null or default_price is not null
  ),
  constraint customer_product_mappings_customer_product_unique unique (customer_id, product_id)
);

comment on table customer_product_mappings is 'Customer-specific item codes/selling units/default prices per product (deferred from 003-product-catalog). A mapping row only exists once at least one of customer_item_code/selling_uom/default_price is set (FR-014).';
comment on column customer_product_mappings.default_price is 'The customer''s fixed/agreed rate for this product, when one exists (e.g. Ball Fiber to Habbitt is consistently Rs 2600). Pure pre-fill data — read only by 006-customer-purchase-orders to suggest a starting price on a new PO line; a PO''s own entered price is always authoritative and this column is never re-read or re-validated against it after the fact (FR-014).';
comment on column customer_product_mappings.conversion_factor is 'Hedge column per specs/PRODUCT-OVERVIEW.md''s Resolved Open Point #6 — relative to the product''s stock UOM. Not used/interpreted by this feature; stored for a future feature to consume if a real conversion is ever needed.';

-- FR-016: a customer's item code must resolve to exactly one product — enforced at the
-- database level (partial unique index), not just application validation, to close the
-- TOCTOU gap of two staff members entering the same code for different products at once.
create unique index idx_customer_product_mappings_code
  on customer_product_mappings (customer_id, customer_item_code)
  where customer_item_code is not null;

create index idx_customer_product_mappings_product on customer_product_mappings (product_id);

create trigger trg_customer_product_mappings_updated_at
  before update on customer_product_mappings
  for each row execute function set_updated_at();

-- ============================================================================
-- ledger_entries (new — shared, insert-only; this feature is its first writer)
-- ============================================================================
-- See history/adr/0004-shared-tables-created-at-first-writer.md: this table's shape is
-- fixed here per specs/PRODUCT-OVERVIEW.md's "Shared-table decisions" so that 007-challans
-- and 008-performa-invoicing can become writers later without a migration to widen anything.

create table ledger_entries (
  id          uuid primary key default gen_random_uuid(),
  customer_id uuid not null references customers (id),
  entry_date  date not null,
  type        text not null check (type in ('debit', 'credit')),
  amount      numeric(12, 2) not null check (amount > 0),
  source_type text not null,
  source_id   uuid,
  description text,
  created_at  timestamptz not null default now(),
  created_by  uuid not null references auth.users (id)
);

comment on table ledger_entries is 'Insert-only debit/credit postings to a customer''s account (shared table, first written by 005-customers as the opening-balance entry; 007-challans and 008-performa-invoicing become writers later). No updated_at/updated_by, no update trigger, and no update/delete path in any Server Action or service function in this feature — immutability (FR-013) is structural, not a UI convention.';
comment on column ledger_entries.source_type is 'Free text (not an enum) — ''opening_balance'' for every row this feature writes; 007/008 introduce their own values without a migration to widen a CHECK.';
comment on column ledger_entries.source_id is 'No FK — deliberately polymorphic across tables that don''t all exist yet (007/008''s own rows). Null for this feature''s rows.';

create index idx_ledger_entries_customer_date on ledger_entries (customer_id, entry_date desc);

-- ============================================================================
-- create_customer / update_customer: mirror create_supplier/update_supplier (0001_init.sql)
-- ============================================================================
-- Writes the customers row plus its customer_contacts/customer_ship_to_addresses/
-- customer_trade_names rows, and — on create only, only if p_opening_balance_amount > 0 —
-- one ledger_entries row, all in one transaction (ADR-0002).

create or replace function create_customer(
  p_display_name text,
  p_legal_name text,
  p_billing_address_line1 text,
  p_billing_address_line2 text,
  p_billing_address_city text,
  p_billing_address_state text,
  p_billing_address_postal_code text,
  p_billing_address_country text,
  p_telephone text,
  p_ntn_number text,
  p_sales_tax_registration_number text,
  p_issues_performa_invoice boolean,
  p_payment_terms_min_days integer,
  p_payment_terms_max_days integer,
  p_contacts jsonb,
  p_ship_to_addresses jsonb,
  p_trade_name_ids uuid[],
  p_opening_balance_amount numeric,
  p_opening_balance_type text,
  p_opening_balance_date date,
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into customers (
    display_name, legal_name, billing_address_line1, billing_address_line2,
    billing_address_city, billing_address_state, billing_address_postal_code,
    billing_address_country, telephone, ntn_number, sales_tax_registration_number,
    issues_performa_invoice, payment_terms_min_days, payment_terms_max_days,
    created_by, updated_by
  ) values (
    p_display_name, p_legal_name, p_billing_address_line1, p_billing_address_line2,
    p_billing_address_city, p_billing_address_state, p_billing_address_postal_code,
    p_billing_address_country, p_telephone, p_ntn_number, p_sales_tax_registration_number,
    p_issues_performa_invoice, p_payment_terms_min_days, p_payment_terms_max_days,
    p_user_id, p_user_id
  )
  returning id into v_id;

  insert into customer_contacts (customer_id, position, name, phone, email, role)
  select v_id, (ord - 1)::smallint, c ->> 'name', nullif(c ->> 'phone', ''), nullif(c ->> 'email', ''), nullif(c ->> 'role', '')
  from jsonb_array_elements(p_contacts) with ordinality as t(c, ord);

  insert into customer_ship_to_addresses (customer_id, position, label, line1, line2, city, state, postal_code, country)
  select v_id, (ord - 1)::smallint, nullif(a ->> 'label', ''), a ->> 'line1', nullif(a ->> 'line2', ''),
         a ->> 'city', nullif(a ->> 'state', ''), nullif(a ->> 'postalCode', ''), a ->> 'country'
  from jsonb_array_elements(p_ship_to_addresses) with ordinality as t(a, ord);

  insert into customer_trade_names (customer_id, trade_name_id, position)
  select v_id, tn, (ord - 1)::smallint
  from unnest(p_trade_name_ids) with ordinality as t(tn, ord);

  if p_opening_balance_amount is not null and p_opening_balance_amount > 0 then
    insert into ledger_entries (customer_id, entry_date, type, amount, source_type, description, created_by)
    values (v_id, p_opening_balance_date, p_opening_balance_type, p_opening_balance_amount, 'opening_balance', 'Opening balance at go-live', p_user_id);
  end if;

  return v_id;
end;
$$;

create or replace function update_customer(
  p_id uuid,
  p_display_name text,
  p_legal_name text,
  p_billing_address_line1 text,
  p_billing_address_line2 text,
  p_billing_address_city text,
  p_billing_address_state text,
  p_billing_address_postal_code text,
  p_billing_address_country text,
  p_telephone text,
  p_ntn_number text,
  p_sales_tax_registration_number text,
  p_issues_performa_invoice boolean,
  p_payment_terms_min_days integer,
  p_payment_terms_max_days integer,
  p_contacts jsonb,
  p_ship_to_addresses jsonb,
  p_trade_name_ids uuid[],
  p_user_id uuid
)
returns void
language plpgsql
as $$
begin
  update customers set
    display_name = p_display_name,
    legal_name = p_legal_name,
    billing_address_line1 = p_billing_address_line1,
    billing_address_line2 = p_billing_address_line2,
    billing_address_city = p_billing_address_city,
    billing_address_state = p_billing_address_state,
    billing_address_postal_code = p_billing_address_postal_code,
    billing_address_country = p_billing_address_country,
    telephone = p_telephone,
    ntn_number = p_ntn_number,
    sales_tax_registration_number = p_sales_tax_registration_number,
    issues_performa_invoice = p_issues_performa_invoice,
    payment_terms_min_days = p_payment_terms_min_days,
    payment_terms_max_days = p_payment_terms_max_days,
    updated_by = p_user_id
    -- status is intentionally omitted — only setCustomerStatusRecord may change it (FR-005/FR-006/FR-007).
  where id = p_id;

  delete from customer_contacts where customer_id = p_id;
  insert into customer_contacts (customer_id, position, name, phone, email, role)
  select p_id, (ord - 1)::smallint, c ->> 'name', nullif(c ->> 'phone', ''), nullif(c ->> 'email', ''), nullif(c ->> 'role', '')
  from jsonb_array_elements(p_contacts) with ordinality as t(c, ord);

  delete from customer_ship_to_addresses where customer_id = p_id;
  insert into customer_ship_to_addresses (customer_id, position, label, line1, line2, city, state, postal_code, country)
  select p_id, (ord - 1)::smallint, nullif(a ->> 'label', ''), a ->> 'line1', nullif(a ->> 'line2', ''),
         a ->> 'city', nullif(a ->> 'state', ''), nullif(a ->> 'postalCode', ''), a ->> 'country'
  from jsonb_array_elements(p_ship_to_addresses) with ordinality as t(a, ord);

  delete from customer_trade_names where customer_id = p_id;
  insert into customer_trade_names (customer_id, trade_name_id, position)
  select p_id, tn, (ord - 1)::smallint
  from unnest(p_trade_name_ids) with ordinality as t(tn, ord);

  -- No opening-balance parameters exist on this function at all — there is no code path
  -- here that can touch ledger_entries (FR-013).
end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table customers enable row level security;
alter table customer_contacts enable row level security;
alter table customer_ship_to_addresses enable row level security;
alter table customer_trade_names enable row level security;
alter table customer_product_mappings enable row level security;
alter table ledger_entries enable row level security;
