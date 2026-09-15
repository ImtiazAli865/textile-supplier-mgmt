-- 0001_init.sql
-- Initial relational schema for 001-supplier-directory and 002-raw-material-purchases.
-- Run this once in the Supabase SQL editor (or via the Supabase CLI/migration tool)
-- against the project before testing the app end-to-end. See history/adr/0001-firebase-to-supabase-backend.md.

create extension if not exists pgcrypto;   -- gen_random_uuid()
create extension if not exists pg_trgm;    -- fast ILIKE/substring search on company_name

-- Generic "touch updated_at on every UPDATE" trigger, reused by every table below.
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================================
-- 001-supplier-directory
-- ============================================================================

create table suppliers (
  id                 uuid primary key default gen_random_uuid(),
  company_name       text not null check (btrim(company_name) <> ''),
  address_line1      text not null check (btrim(address_line1) <> ''),
  address_line2      text,
  address_city       text not null check (btrim(address_city) <> ''),
  address_state      text,
  address_postal_code text,
  address_country    text not null check (btrim(address_country) <> ''),
  payment_terms      text not null check (btrim(payment_terms) <> ''),
  status             text not null default 'active' check (status in ('active', 'inactive')),
  notes              text not null default '',
  rating             smallint check (rating between 1 and 5),
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  created_by         uuid not null references auth.users (id),
  updated_by         uuid not null references auth.users (id)
);

comment on table suppliers is 'Fabric/material supplier companies (feature 001). See specs/001-supplier-directory/data-model.md.';

-- Default list view: status filter + name sort (FR-011).
create index idx_suppliers_status_name on suppliers (status, lower(company_name));
-- Case-insensitive substring search on company name (FR-009) and exact-match duplicate check.
create index idx_suppliers_name_trgm on suppliers using gin (lower(company_name) gin_trgm_ops);

create trigger trg_suppliers_updated_at
  before update on suppliers
  for each row execute function set_updated_at();

-- One row per contact person (spec Key Entities: Contact belongs to exactly one Supplier).
create table supplier_contacts (
  id          uuid primary key default gen_random_uuid(),
  supplier_id uuid not null references suppliers (id) on delete cascade,
  position    smallint not null default 0,  -- preserves display order from the form
  name        text not null check (btrim(name) <> ''),
  phone       text,
  email       text,
  role        text,
  constraint supplier_contacts_phone_or_email check (phone is not null or email is not null)
);

comment on table supplier_contacts is 'Per-supplier contact people, min 1 per supplier (FR-002, FR-013), enforced in the service layer.';

create index idx_supplier_contacts_supplier on supplier_contacts (supplier_id, position);

-- Free-text material/fabric tags per supplier (spec Assumptions: no fixed taxonomy).
-- Stored lowercased (same normalization the Firestore version applied) so filtering
-- and the "previously used materials" suggestion list stay consistent.
create table supplier_materials (
  supplier_id uuid not null references suppliers (id) on delete cascade,
  material    text not null check (btrim(material) <> ''),
  primary key (supplier_id, material)
);

comment on table supplier_materials is 'Material/fabric tags per supplier, min 1 per supplier (FR-002, FR-010), enforced in the service layer.';

create index idx_supplier_materials_material on supplier_materials (material);

-- create_supplier / update_supplier: write the suppliers row plus its
-- supplier_contacts and supplier_materials rows in one transaction (a plain
-- multi-statement PostgREST call from supabase-js would not be atomic).
-- Called via supabase.rpc(...) with the service-role client, which already
-- bypasses RLS, so these run as SECURITY INVOKER (the default).
create or replace function create_supplier(
  p_company_name text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_state text,
  p_address_postal_code text,
  p_address_country text,
  p_payment_terms text,
  p_notes text,
  p_rating smallint,
  p_contacts jsonb,
  p_materials text[],
  p_user_id uuid
)
returns uuid
language plpgsql
as $$
declare
  v_id uuid;
begin
  insert into suppliers (
    company_name, address_line1, address_line2, address_city, address_state,
    address_postal_code, address_country, payment_terms, notes, rating,
    created_by, updated_by
  ) values (
    p_company_name, p_address_line1, p_address_line2, p_address_city, p_address_state,
    p_address_postal_code, p_address_country, p_payment_terms, p_notes, p_rating,
    p_user_id, p_user_id
  )
  returning id into v_id;

  insert into supplier_contacts (supplier_id, position, name, phone, email, role)
  select v_id, (ord - 1)::smallint, c ->> 'name', nullif(c ->> 'phone', ''), nullif(c ->> 'email', ''), nullif(c ->> 'role', '')
  from jsonb_array_elements(p_contacts) with ordinality as t(c, ord);

  insert into supplier_materials (supplier_id, material)
  select distinct v_id, lower(btrim(m))
  from unnest(p_materials) as m
  where btrim(m) <> '';

  return v_id;
end;
$$;

create or replace function update_supplier(
  p_id uuid,
  p_company_name text,
  p_address_line1 text,
  p_address_line2 text,
  p_address_city text,
  p_address_state text,
  p_address_postal_code text,
  p_address_country text,
  p_payment_terms text,
  p_notes text,
  p_rating smallint,
  p_contacts jsonb,
  p_materials text[],
  p_user_id uuid
)
returns void
language plpgsql
as $$
begin
  update suppliers set
    company_name = p_company_name,
    address_line1 = p_address_line1,
    address_line2 = p_address_line2,
    address_city = p_address_city,
    address_state = p_address_state,
    address_postal_code = p_address_postal_code,
    address_country = p_address_country,
    payment_terms = p_payment_terms,
    notes = p_notes,
    rating = p_rating,
    updated_by = p_user_id
  where id = p_id;

  delete from supplier_contacts where supplier_id = p_id;
  insert into supplier_contacts (supplier_id, position, name, phone, email, role)
  select p_id, (ord - 1)::smallint, c ->> 'name', nullif(c ->> 'phone', ''), nullif(c ->> 'email', ''), nullif(c ->> 'role', '')
  from jsonb_array_elements(p_contacts) with ordinality as t(c, ord);

  delete from supplier_materials where supplier_id = p_id;
  insert into supplier_materials (supplier_id, material)
  select distinct p_id, lower(btrim(m))
  from unnest(p_materials) as m
  where btrim(m) <> '';
end;
$$;

-- ============================================================================
-- 002-raw-material-purchases
-- ============================================================================

create table raw_material_purchases (
  id                  uuid primary key default gen_random_uuid(),
  supplier_id         uuid not null references suppliers (id),
  purchase_date       date not null,
  weight_kg           numeric(10, 2) not null check (weight_kg > 0),
  rate_per_kg         numeric(10, 2) not null check (rate_per_kg > 0),
  total_cost          numeric(12, 2) generated always as (round(weight_kg * rate_per_kg, 2)) stored,
  remaining_weight_kg numeric(10, 2) not null check (remaining_weight_kg >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  created_by          uuid not null references auth.users (id),
  updated_by          uuid not null references auth.users (id)
);

comment on table raw_material_purchases is 'Raw material purchase lots (feature 002). remaining_weight_kg is consumed by the future Production Batches feature (003). See specs/002-raw-material-purchases/data-model.md.';

-- Default list sort (FR-004) and supplier + date-range filter combined (FR-005).
create index idx_purchases_supplier_date on raw_material_purchases (supplier_id, purchase_date desc);
create index idx_purchases_date on raw_material_purchases (purchase_date desc);

create trigger trg_purchases_updated_at
  before update on raw_material_purchases
  for each row execute function set_updated_at();

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- All application reads/writes go through Server Actions using the Supabase
-- service-role (secret) key, which bypasses RLS entirely — the same trust
-- boundary the Firebase Admin SDK provided over Firestore. RLS is enabled with
-- no policies so any future direct/anon/authenticated-role access is denied by
-- default, mirroring the old firestore.rules "allow read, write: if false".

alter table suppliers enable row level security;
alter table supplier_contacts enable row level security;
alter table supplier_materials enable row level security;
alter table raw_material_purchases enable row level security;
