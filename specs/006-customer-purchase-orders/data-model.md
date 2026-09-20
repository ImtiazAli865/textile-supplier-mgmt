# Data Model: Customer Purchase Orders

**Feature**: `006-customer-purchase-orders` | **Date**: 2026-09-20

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0006_customer_purchase_orders.sql`](../../supabase/migrations/0006_customer_purchase_orders.sql)
(written at implementation time); this document explains the shape and the FR each part
satisfies, and is the basis for that migration.

## Table: `customer_pos` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `customer_id` | `uuid` → `customers(id)` | yes | No `on delete cascade` — customers are never hard-deleted (research.md, mirroring `ledger_entries.customer_id`). FR-001. |
| `po_number` | `varchar(30)` | yes | Storage capacity of at least 30 characters, no minimum length or format check — accommodates both Habbitt's short PDF-style numbers ("P14337") and Chaseup's long portal-style numbers ("111202110000440639") verbatim. FR-003. |
| `order_date` | `date` | yes | FR-001. |
| `purchaser_name` | `text` | no | Free text, not linked to a 005 Contact (research.md/spec Assumptions). |
| `requested_delivery_date` | `date` | no | |
| `destination_text` | `text` | no | Free-text snapshot, never a live FK to `customer_ship_to_addresses` — see research.md for why. When the caller submits it blank, `createCustomerPORecord`/`updateCustomerPORecord` (the TypeScript service layer, not the Postgres function) fill it with the customer's current billing address before calling the RPC, per spec Assumptions. |
| `trade_name_id` | `uuid` → `trade_names(id)` | no | The trade name this PO bills under — a real, stable FK (research.md), pre-filled from the customer's 005 usable-trade-name hint when unambiguous, always changeable. |
| `status` | `text` check `in ('open','cancelled')` | yes | Defaults to `'open'`. FR-015. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` via the shared trigger (`set_updated_at()`, `0001_init.sql`). FR-019. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | |

Constraint: `unique (customer_id, po_number)` — enforces FR-004 (unique per customer, not
globally) at the database level.

Index: `idx_customer_pos_status_customer on customer_pos (status, customer_id, order_date desc)`
— for the default open-POs list, filterable by customer (FR-012).

## Table: `customer_po_lines` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `po_id` | `uuid` → `customer_pos(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves form entry order, mirroring every other 1:N child table in this project. |
| `customer_item_code` | `text` | no | As entered by staff; a plain snapshot, not a live reference to the mapping row that resolved it (research.md). FR-005. |
| `product_id` | `uuid` → `products(id)` | yes | The resolved product — auto-filled via mapping lookup or manually picked (FR-005/FR-007); a real, stable FK (research.md). |
| `description` | `text` | no | Free text, stored and displayed exactly as entered — never parsed, even when it embeds another reference (e.g. Chaseup's Challan number). FR-008. |
| `quantity_ordered` | `numeric(10,2)` check `> 0` | yes | FR-010. |
| `uom` | `text` | yes | Pre-filled from the mapping's `selling_uom` when resolved, editable. |
| `unit_price` | `numeric(12,2)` check `> 0` | yes | Pre-filled from the mapping's `default_price` when resolved, but always the authoritative, staff-entered value once saved (FR-006). |
| `line_total` | `numeric(12,2)` generated always as (`round(quantity_ordered * unit_price, 2)`) stored | yes | Matches the `total_cost` generated-column pattern already used in `0001_init.sql`/`0003_traded_purchases.sql`. FR-011. |
| `delivered_quantity` | `numeric(10,2)` default `0` check `>= 0` | yes | Reserved for 007-Challans to write the line's cumulative *accepted* quantity across its Challans (spec FR-017/Assumptions). This feature never sets it above zero and exposes no path to do so. |
| `invoiced_quantity` | `numeric(10,2)` default `0` check `>= 0` | yes | Reserved for 008-Performa-Invoicing (spec FR-017). Same rule — never written above zero by this feature. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` via the shared trigger. |

**"Locked" line** (spec FR-014/FR-015): a line where `delivered_quantity > 0 or
invoiced_quantity > 0`. Enforced inside `update_customer_po` and `set_customer_po_status`
(below), not by a `CHECK` constraint — the rule spans an update decision ("may this line be
replaced/removed right now"), not a single row's own validity, so it belongs in the function
body per research.md.

## Table: `customer_po_attachments` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `po_id` | `uuid` → `customer_pos(id)` `on delete cascade` | yes | |
| `storage_path` | `text` | yes | Object path (not a URL) within the `customer-po-documents` bucket. Read as a short-lived signed URL, never a public URL (ADR-0003), mirroring `trade_names.signature_image_path`. |
| `file_name` | `text` | yes | Original filename, for display. |
| `content_type` | `text` | yes | |
| `uploaded_at` | `timestamptz` default `now()` | yes | |
| `uploaded_by` | `uuid` → `auth.users(id)` | yes | |

Zero or more per PO (FR-009) — no minimum, uploaded/linked as a follow-up step after the PO
itself is created (research.md), not part of `create_customer_po`.

## New Postgres functions

### `create_customer_po(p_customer_id, p_po_number, p_order_date, p_purchaser_name, p_requested_delivery_date, p_destination_text, p_trade_name_id, p_lines jsonb, p_user_id) returns uuid`

Inserts the `customer_pos` row (`status` defaults to `'open'`), then its `customer_po_lines` rows
via `jsonb_array_elements(p_lines) with ordinality` for `position` — each element supplying
`customer_item_code`, `product_id`, `description`, `quantity_ordered`, `uom`, `unit_price`
(`delivered_quantity`/`invoiced_quantity` are never set here; they take their `0` defaults).
Mirrors `create_customer`'s single-transaction shape (ADR-0002). Returns the new PO's `id`.

### `update_customer_po(p_id, p_po_number, p_order_date, p_purchaser_name, p_requested_delivery_date, p_destination_text, p_trade_name_id, p_lines jsonb, p_user_id) returns void`

1. Updates the `customer_pos` header columns (never `status` — only `set_customer_po_status` may
   change it).
2. Per-line upsert against `p_lines` (each element optionally carrying an existing line `id`; see
   research.md for why this replaces 001/005's delete-then-reinsert shape):
   - Any existing line **not** present in `p_lines` is a deletion attempt: raises an exception if
     that line is locked (`delivered_quantity > 0 or invoiced_quantity > 0`); otherwise deletes it.
   - Any element in `p_lines` carrying an existing line's `id`, where that line is currently
     locked: raises an exception only if the submitted `product_id`, `quantity_ordered`, `uom`,
     or `unit_price` differs from the stored value (FR-014 locks exactly these four fields, no
     more); otherwise updates `customer_item_code`/`description`/`position` in place — locking a
     line never blocks fixing a typo in its description or item code, both purely informational.
   - Any element in `p_lines` carrying an existing, *unlocked* line's `id`: updates
     `customer_item_code`, `product_id`, `description`, `quantity_ordered`, `uom`, `unit_price`,
     and `position` in place.
   - Any element with no `id`: inserted as a new line at the given `position`.

### `set_customer_po_status(p_id, p_status, p_user_id) returns void`

- `p_status = 'open'` (reactivate): unconditional set, mirroring `setCustomerStatusRecord`'s
  no-op-safe shape from 005.
- `p_status = 'cancelled'`: raises an exception if any of the PO's lines is locked
  (`delivered_quantity > 0 or invoiced_quantity > 0`); otherwise sets the status (FR-015). Does
  the check-and-write atomically in one function call (research.md) rather than as two
  `supabase-js` round-trips.

Both `create_customer_po` and `update_customer_po` run `SECURITY INVOKER` (the default) under the
service-role client, same trust boundary as every other RPC in this project.

## Read-only helper: item-code resolution

Not a Postgres function — a plain query in `lib/customer-pos/item-code-resolution.ts`, called
from the form as the staff member enters a line's item code (research.md — never re-run at
save time):

```sql
select product_id, selling_uom, default_price
from customer_product_mappings
where customer_id = $1 and customer_item_code = $2;
```

## Read-only computation: a PO's total value

Not stored or generated — computed in `lib/customer-pos/service.ts` (`getCustomerPO`/
`listCustomerPOs`) as `sum(line_total)` over the PO's already-fetched `customer_po_lines` rows
(research.md — a database aggregate or cached column would be unneeded indirection at this
feature's 1-10-lines-per-PO scale).

## New Storage bucket: `customer-po-documents`

Second private bucket in this project (after `trade-name-assets`), same trust boundary (ADR-0003):
service-role-only uploads/deletes, short-lived signed URLs for reads, no Storage RLS policies.

```sql
insert into storage.buckets (id, name, public)
values ('customer-po-documents', 'customer-po-documents', false)
on conflict (id) do nothing;
```

## Row Level Security

Unchanged trust boundary from 001-005: all application reads/writes go through Server Actions
using the Supabase service-role key, which bypasses RLS. Both new tables are created with RLS
enabled and no policies, exactly like every other table in this project's migrations.
