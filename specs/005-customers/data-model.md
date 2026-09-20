# Data Model: Customers

**Feature**: `005-customers` | **Date**: 2026-09-20

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0005_customers.sql`](../../supabase/migrations/0005_customers.sql) (written
at implementation time); this document explains the shape and the FR each part satisfies, and is
the basis for that migration.

## Table: `customers` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `display_name` | `text` | yes | FR-001, FR-002. |
| `legal_name` | `text` | yes | The legal/billing name for tax documents — distinct from `display_name` (e.g. Habbitt's `display_name` is "Habbitt", `legal_name` is "Universal Retail (Pvt) Ltd"). FR-001, FR-002. |
| `billing_address_line1` … `billing_address_country` | `text` (flat columns, mirroring `suppliers.address_*`) | line1/city/country required, others optional | The address tied to `legal_name` (research.md). FR-001, FR-002. |
| `telephone` | `text` | no | |
| `ntn_number` | `text` | no | `null` if not applicable. FR-001. |
| `sales_tax_registration_number` | `text` | no | `null` if not applicable. FR-001. |
| `issues_performa_invoice` | `boolean` default `false` | yes | True for Habbitt; false by default for everyone else. FR-009. |
| `payment_terms_min_days` | `integer` default `0`, check `>= 0` | yes | Expected minimum days in the customer's typical payment range — see research.md/checklist. FR-010. |
| `payment_terms_max_days` | `integer` default `0`, check `>= 0` and check `>= payment_terms_min_days` | yes | Expected maximum days. Read only by 009-customer-ledger, to classify an actual payment as "within" or "beyond" the expected range for ageing/reporting — never to block, reject, or auto-flag a payment. FR-010. |
| `status` | `text` check `in ('active','inactive')` | yes | Defaults to `'active'`. FR-001, FR-006. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` maintained by a trigger reusing `set_updated_at()` from `0001_init.sql`. FR-020. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | |

No unique constraint on `display_name`/`legal_name` — duplicates permitted (spec Edge Cases).

## Table: `customer_contacts` (new, 1:N)

Identical shape to `supplier_contacts` from `0001_init.sql`:

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK) | yes | |
| `customer_id` | `uuid` → `customers(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves form entry order. |
| `name` | `text` | yes | FR-017. |
| `phone` | `text` | conditionally | Required if `email` is null. FR-002, FR-017. |
| `email` | `text` | conditionally | Required if `phone` is null. FR-002, FR-017. |
| `role` | `text` | no | |

Constraint `customer_contacts_phone_or_email check (phone is not null or email is not null)`,
mirroring `supplier_contacts`'s equivalent constraint.

## Table: `customer_ship_to_addresses` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK) | yes | |
| `customer_id` | `uuid` → `customers(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves form entry order. |
| `label` | `text` | no | e.g. "Main Warehouse" — optional free text. |
| `line1` / `city` / `country` | `text` | yes | |
| `line2` / `state` / `postal_code` | `text` | no | |

Zero or more per customer (FR-018) — no minimum, unlike contacts.

## Table: `customer_trade_names` (new, join table — hint only)

| Column | Type | Required | Notes |
|---|---|---|---|
| `customer_id` | `uuid` → `customers(id)` `on delete cascade` | yes | Part of composite PK. |
| `trade_name_id` | `uuid` → `trade_names(id)` | yes | Part of composite PK. No `on delete cascade` from `trade_names` — a trade name is only ever deactivated, never hard-deleted (004), so this FK is never exercised by a delete in practice. |
| `position` | `smallint` default `0`, not null | yes | First position = the customer's primary/default hint (spec: "a default/sort-order hint only"). |

Primary key `(customer_id, trade_name_id)` — a trade name can be hinted at most once per customer.

**This table is read by no enforcement logic anywhere in this feature or any planned future one**
(FR-008) — it exists purely so a later document-creation UI (006+) can pre-select/sort by it. No
`CHECK`, trigger, or application code may ever use it to reject a trade-name choice.

## Table: `customer_product_mappings` (new, join table)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `customer_id` | `uuid` → `customers(id)` `on delete cascade` | yes | |
| `product_id` | `uuid` → `products(id)` | yes | |
| `customer_item_code` | `text` | conditionally | At least one of `customer_item_code`/`selling_uom` required (research.md). |
| `selling_uom` | `text` | conditionally | Same. |
| `default_price` | `numeric(12,2)` check `> 0` | conditionally | The customer's fixed/agreed rate for this product (e.g. Ball Fiber to Habbitt is consistently Rs 2600), when one exists. Pure pre-fill data — read only by 006-customer-purchase-orders to suggest a starting price on a new PO line; a PO's own entered price is always authoritative and this column is never re-read or re-validated against it after the fact. Counts toward the "at least one of the three" check below (FR-014). |
| `conversion_factor` | `numeric(10,4)` default `1`, check `> 0` | yes | Hedge column per `specs/PRODUCT-OVERVIEW.md`'s Resolved Open Point #6 — relative to the product's stock UOM. Not used/interpreted by this feature; stored for a future feature to consume if a real conversion is ever needed. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` via the shared trigger. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | |

Constraints:
- `customer_product_mappings_has_value_check check (customer_item_code is not null or selling_uom is not null or default_price is not null)` — renamed from the earlier `..._code_or_uom_check` now that a mapping may also exist for `default_price` alone (spec Assumptions: "at least one of the three"), e.g. a customer whose only need is a pre-fill price with no code/UOM override.
- `unique (customer_id, product_id)` — one mapping row per customer-product pair (edit in place
  rather than creating a second row for the same pair).
- Partial unique index `idx_customer_product_mappings_code on customer_product_mappings
  (customer_id, customer_item_code) where customer_item_code is not null` — enforces FR-016 at
  the database level, not just in the service layer (research.md).

## Table: `ledger_entries` (new — shared, insert-only; first writer is this feature)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `customer_id` | `uuid` → `customers(id)` | yes | No `on delete cascade` — customers are never hard-deleted, and a ledger row must never silently disappear even in principle. |
| `entry_date` | `date` | yes | The opening balance's as-of date, for this feature's only entries. |
| `type` | `text` check `in ('debit','credit')` | yes | Matches `specs/PRODUCT-OVERVIEW.md`'s literal ledger column shape (research.md). |
| `amount` | `numeric(12,2)` check `> 0` | yes | Always positive; `type` carries the direction. |
| `source_type` | `text` | yes | `'opening_balance'` for every row this feature writes. Free text (not an enum), since 007/008 will introduce their own values (`'invoice'`, `'payment'`, etc.) without a migration to widen a `CHECK`. |
| `source_id` | `uuid` | no | `null` for this feature's rows (there is no other row an opening balance "comes from"). No FK — deliberately polymorphic across tables that don't all exist yet (007/008's own rows). |
| `description` | `text` | no | e.g. "Opening balance at go-live". |
| `created_at` | `timestamptz` default `now()` | yes | |
| `created_by` | `uuid` → `auth.users(id)` | yes | |

**No `updated_at`/`updated_by`, no update trigger, and no update/delete path in any Server
Action or service function in this feature** — immutability (FR-013) is structural, not a UI
convention (research.md).

Index: `idx_ledger_entries_customer_date on ledger_entries (customer_id, entry_date desc)` — for
the live balance `SUM` and for a future ledger view (009) to order by.

## New Postgres functions

Mirrors the `create_supplier`/`update_supplier` pattern from `0001_init.sql` exactly, extended by
one conditional insert into a different table on create (see research.md).

### `create_customer(p_display_name, p_legal_name, p_billing_address_line1, …, p_telephone, p_ntn_number, p_sales_tax_registration_number, p_issues_performa_invoice, p_payment_terms_min_days, p_payment_terms_max_days, p_contacts jsonb, p_ship_to_addresses jsonb, p_trade_name_ids uuid[], p_opening_balance_amount numeric, p_opening_balance_type text, p_opening_balance_date date, p_user_id uuid) returns uuid`

Inserts the `customers` row, then its `customer_contacts`, `customer_ship_to_addresses`, and
`customer_trade_names` rows (contacts/ship-to via `jsonb_array_elements ... with ordinality` for
`position`, trade names via `unnest(p_trade_name_ids) with ordinality`, exactly like
`create_supplier`'s materials/contacts inserts). Then, only if `p_opening_balance_amount > 0`,
inserts one `ledger_entries` row with `source_type = 'opening_balance'`. Returns the new
customer's `id`.

### `update_customer(p_id, p_display_name, …, p_contacts jsonb, p_ship_to_addresses jsonb, p_trade_name_ids uuid[], p_user_id uuid) returns void`

Updates the `customers` row (every column above `status`, which this function never touches —
only `setCustomerStatusRecord` may change it), then deletes and re-inserts
`customer_contacts`/`customer_ship_to_addresses`/`customer_trade_names`, exactly matching
`update_supplier`'s delete-then-reinsert shape. **Takes no opening-balance parameters at all** —
there is no code path in this function that can touch `ledger_entries` (FR-013).

Both functions run `SECURITY INVOKER` (the default) under the service-role client, same trust
boundary as every other RPC in this project.

## Read-only helper: customer ledger balance

Not a Postgres function — a plain query in `lib/customers/ledger.ts`, run at read time from
`getCustomer`:

```sql
select coalesce(sum(case when type = 'credit' then amount else -amount end), 0) as balance
from ledger_entries
where customer_id = $1;
```

Never cached on `customers` (research.md) — recomputed on every `getCustomer` call.

## Row Level Security

Unchanged trust boundary from 001-004: all application reads/writes go through Server Actions
using the Supabase service-role key, which bypasses RLS. All six new tables are created with RLS
enabled and no policies, exactly like every other table in this project's migrations.
