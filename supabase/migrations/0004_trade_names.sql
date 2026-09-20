-- 0004_trade_names.sql
-- Trade name records (004-trade-names-and-document-settings): the business's billing
-- identities, replacing the previously hardcoded set of five. Also provisions the
-- project's first Supabase Storage bucket, for signature/stamp images. See
-- specs/004-trade-names-and-document-settings/data-model.md and
-- history/adr/0003-storage-access-via-server-only-signed-urls.md.

-- ============================================================================
-- trade_names
-- ============================================================================

create table trade_names (
  id                             uuid primary key default gen_random_uuid(),
  printed_name                   text not null check (btrim(printed_name) <> ''),
  printed_address                text not null check (btrim(printed_address) <> ''),
  ntn_number                     text,
  sales_tax_registration_number  text,
  signature_image_path           text,
  stamp_image_path               text,
  next_challan_number            integer not null default 1 check (next_challan_number > 0),
  next_invoice_number            integer not null default 1 check (next_invoice_number > 0),
  status                         text not null default 'active' check (status in ('active', 'inactive')),
  created_at                     timestamptz not null default now(),
  updated_at                     timestamptz not null default now(),
  created_by                     uuid not null references auth.users (id),
  updated_by                     uuid not null references auth.users (id)
);

comment on table trade_names is 'The business''s billing identities (feature 004). No child tables — plain single-table CRUD, no Postgres RPC needed (see research.md). See specs/004-trade-names-and-document-settings/data-model.md.';
comment on column trade_names.next_challan_number is 'Plain overridable counter. Increment-on-issue, month-suffix formatting, and reset behavior belong to the future Challans (007) feature, not this one.';
comment on column trade_names.next_invoice_number is 'Plain overridable counter. Increment-on-issue behavior belongs to the future Performa Invoicing (008) feature, not this one.';
comment on column trade_names.signature_image_path is 'Storage object path (not a URL) within the trade-name-assets bucket. Read as a short-lived signed URL, never a public URL (FR-010, ADR-0003).';
comment on column trade_names.stamp_image_path is 'Same shape as signature_image_path, independent value.';

-- Default list view: status filter + name sort (FR-003), mirroring idx_suppliers_status_name.
create index idx_trade_names_status_name on trade_names (status, lower(printed_name));

-- Reuses set_updated_at() defined in 0001_init.sql.
create trigger trg_trade_names_updated_at
  before update on trade_names
  for each row execute function set_updated_at();

-- ============================================================================
-- Storage: trade-name-assets (first Storage bucket in this project)
-- ============================================================================
-- Private bucket — never public. All uploads/deletes go through the server-only
-- Supabase admin client (service-role key), which bypasses Storage RLS the same
-- way it bypasses Postgres RLS. Reads are exposed to the browser only as
-- short-lived signed URLs, generated server-side at render time. No Storage RLS
-- policies are added, matching every table in this project. See
-- history/adr/0003-storage-access-via-server-only-signed-urls.md.

insert into storage.buckets (id, name, public)
values ('trade-name-assets', 'trade-name-assets', false)
on conflict (id) do nothing;

-- ============================================================================
-- Row Level Security
-- ============================================================================
-- Same trust boundary as every other table in this project: all application
-- reads/writes go through Server Actions using the Supabase service-role key,
-- which bypasses RLS entirely. RLS is enabled with no policies so any future
-- direct/anon/authenticated-role access is denied by default.

alter table trade_names enable row level security;
