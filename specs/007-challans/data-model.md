# Data Model: Challans

**Feature**: `007-challans` | **Date**: 2026-09-21

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0007_challans.sql`](../../supabase/migrations/0007_challans.sql) (written at
implementation time); this document explains the shape and the FR each part satisfies, and is the
basis for that migration. See [research.md](./research.md) for the reasoning behind each design
choice below.

## Table: `inventory_movements` (new, shared, insert-only — first written by this feature)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `product_id` | `uuid` → `products(id)` | yes | No `on delete cascade` — products are never hard-deleted. |
| `qty_delta` | `numeric(10,2)`, check `<> 0` | yes | Positive = stock returning/added; negative = stock leaving. |
| `reason` | `text` | yes | Free text (not an enum) — e.g. `'Purchase recorded'`, `'Purchase updated'`, `'Purchase deleted'`, `'Opening balance at 007 cutover'`, `'Challan accepted'`, `'Challan shortfall returned to inventory'`. Deliberately unconstrained so 010-production-batches and any future manual-adjustment capability can introduce new values without a migration (ADR-0004; `specs/PRODUCT-OVERVIEW.md`'s stated purpose for this column). |
| `source_type` | `text` | yes | `'purchase'`, `'opening_balance'`, or `'challan_line'` as written by this feature. Free text for the same reason as `reason`. |
| `source_id` | `uuid` | no | The originating row's id (a `raw_material_purchases.id` or `challan_lines.id`); `null` for the one-time opening-balance backfill. No FK — deliberately polymorphic, matching `ledger_entries.source_id` (005). |
| `movement_date` | `date` | yes | The date the stock event actually happened (see research.md's movement-dating decision) — not necessarily `created_at`'s date. |
| `created_at` | `timestamptz` default `now()` | yes | |
| `created_by` | `uuid` → `auth.users(id)` | yes | |

**No `updated_at`/`updated_by`, no update trigger, and no update/delete path in any Server Action
or service function** — immutability is structural, matching `ledger_entries` (005 FR-013).

Index: `idx_inventory_movements_product_date on inventory_movements (product_id, movement_date
desc)` — supports `recompute_product_quantity_on_hand`'s `SUM` and a future 012-finished-goods-
inventory view.

### One-time backfill (part of this migration, not a Server Action)

For every existing product with `type = 'traded'` and `quantity_on_hand <> 0`, insert one opening
movement: `(product_id, qty_delta = current quantity_on_hand, reason = 'Opening balance at 007
cutover', source_type = 'opening_balance', source_id = null, movement_date = current_date)`. This
preserves 003b's purchase history as a single starting balance rather than replaying every
individual purchase row into the ledger (FR-011). Manufactured products are excluded — their
`quantity_on_hand` has always been `0` with no writer yet (research.md's manufactured-product
limitation).

## Redefined function: `recompute_product_purchase_stats(p_product_id uuid)` (from 003b; `CREATE OR REPLACE`d here, not edited in place)

Unchanged behavior for `current_purchase_cost` (still the full weighted-average recompute over
current per-unit purchase rows). **Removed**: the `quantity_on_hand = round(v_total_qty, 2)`
assignment — this function no longer touches that column at all (FR-011).

## New function: `recompute_product_quantity_on_hand(p_product_id uuid) returns void`

```sql
update products
set quantity_on_hand = coalesce(
  (select sum(qty_delta) from inventory_movements where product_id = p_product_id), 0
)
where id = p_product_id;
```

The sole writer of `products.quantity_on_hand` from this migration forward (FR-011). Called by
every function below that inserts a movement.

## Redefined functions: `record_unit_purchase`, `update_unit_purchase`, `delete_unit_purchase` (from 003b; `CREATE OR REPLACE`d here)

Each keeps its existing signature and its existing write to `raw_material_purchases`, and its
existing call to `recompute_product_purchase_stats`. Each additionally:

- `record_unit_purchase`: inserts one `inventory_movements` row (`qty_delta = +p_quantity_units`,
  `reason = 'Purchase recorded'`, `source_type = 'purchase'`, `source_id` = the new purchase's
  `id`, `movement_date = p_purchase_date`), then calls `recompute_product_quantity_on_hand`.
- `update_unit_purchase`: if `p_product_id` is unchanged, inserts one net-delta movement
  (`qty_delta = p_quantity_units - (the purchase's stored quantity_units before this update)`,
  `reason = 'Purchase updated'`, same `source_type`/`source_id`, `movement_date = p_purchase_date`)
  and recomputes that one product; if `p_product_id` changed, inserts a full reversal on the old
  product (`qty_delta = -(old quantity_units)`) and a full addition on the new product (`qty_delta
  = +p_quantity_units`), recomputing both.
- `delete_unit_purchase`: inserts one reversing movement (`qty_delta = -(the purchase's stored
  quantity_units)`, `reason = 'Purchase deleted'`, same `source_type`/`source_id`, `movement_date =
  current_date`) before deleting the purchase row, then recomputes.

## Table: `challans` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `po_id` | `uuid` → `customer_pos(id)` | yes | No `on delete cascade` — POs are never hard-deleted. FR-001. |
| `trade_name_id` | `uuid` → `trade_names(id)` | yes | FR-001, FR-005. |
| `challan_number` | `varchar(30)` | yes | Auto-generated (`CH #NNN/Mon`, zero-padded to 3 digits) or staff-overridden. FR-004. |
| `challan_date` | `date` | yes | Defaults to today in the form; the date goods physically left. |
| `status` | `text` check `in ('issued','accepted','voided')` | yes | Defaults to `'issued'`. FR-013, FR-014. |
| `accepted_at` | `timestamptz` | no | `null` until accepted. FR-018. |
| `accepted_by` | `uuid` → `auth.users(id)` | no | `null` until accepted. FR-018. |
| `signed_copy_storage_path` | `text` | no | Object path (not URL) within `challan-attachments`; `null` until uploaded. FR-006. |
| `signed_copy_file_name` | `text` | no | Original filename, for display. |
| `signed_copy_content_type` | `text` | no | |
| `signed_copy_uploaded_at` | `timestamptz` | no | |
| `signed_copy_uploaded_by` | `uuid` → `auth.users(id)` | no | |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` via the shared trigger. FR-018. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | |

Constraint: `unique (trade_name_id, challan_number)` — enforces FR-004's per-trade-name uniqueness
at the database level (Edge Cases).

Index: `idx_challans_po_status on challans (po_id, status)` — for a PO detail page listing its
Challans and for the remaining-quantity check.

## Table: `challan_lines` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `challan_id` | `uuid` → `challans(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves form entry order (the printed S.NO column), mirroring `customer_po_lines.position`. |
| `po_line_id` | `uuid` → `customer_po_lines(id)` | yes | No `on delete cascade` — the ordinary `RESTRICT` default prevents a referenced PO line from ever being deleted while any Challan (issued, accepted, or voided) points to it (research.md). |
| `product_id` | `uuid` → `products(id)` | yes | **Snapshot** from the PO line at creation time — never re-read live afterward (research.md). |
| `uom` | `text` | yes | **Snapshot** from the PO line at creation time. |
| `unit_price` | `numeric(12,2)` check `> 0` | yes | **Snapshot** from the PO line at creation time; this value, not any later PO-line edit, drives the ledger credit at acceptance (FR-012). |
| `delivered_quantity` | `numeric(10,2)` check `> 0` | yes | FR-001, FR-002. |
| `accepted_quantity` | `numeric(10,2)` check `>= 0 and accepted_quantity <= delivered_quantity` | yes | Defaults equal to `delivered_quantity` at creation (application-set, not a DB default, since it must track whatever `delivered_quantity` was submitted); editable down while `status = 'issued'`. FR-003. |
| `shortfall_disposition` | `text` check `in ('return_to_inventory','write_off')` | no | `null` unless `accepted_quantity < delivered_quantity`; required by `accept_challan` (not by a `CHECK`, since the requirement is conditional on two other columns — mirrors 006's function-body-not-CHECK precedent for cross-field rules) before acceptance can complete. FR-007. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` via the shared trigger. |

`customer_item_code` ("Article" on the printed document) and `product name`/`stock_uom` ("Item
Name") are **not** columns here — resolved at read time by joining `po_line_id →
customer_po_lines.customer_item_code` (live) and this row's own snapshot `product_id →
products.name` (research.md).

## New Postgres functions

### `create_challan(p_po_id, p_trade_name_id, p_challan_number, p_challan_date, p_lines jsonb, p_user_id) returns uuid`

1. Validates the PO exists and `status = 'open'` (FR-001).
2. For each element of `p_lines` (`{ po_line_id, delivered_quantity }`): validates `po_line_id`
   belongs to `p_po_id`; computes that line's remaining quantity as `quantity_ordered -
   delivered_quantity` (the PO line's own stored, accepted-only figure); rejects if remaining is
   `0` or `delivered_quantity` submitted exceeds it (FR-002).
3. Resolves `challan_number`: if `p_challan_number` is null/blank, formats
   `'CH #' || lpad(trade_names.next_challan_number::text, 3, '0') || '/' ||
   to_char(p_challan_date, 'Mon')`, then increments `trade_names.next_challan_number`; otherwise
   uses `p_challan_number` as given (uniqueness enforced by the table's own constraint) (FR-004).
4. Inserts the `challans` row (`status = 'issued'`).
5. Inserts each `challan_lines` row via `jsonb_array_elements(p_lines) with ordinality` for
   `position`, snapshotting `product_id`/`uom`/`unit_price` from the referenced `customer_po_lines`
   row, and setting `accepted_quantity = delivered_quantity`, `shortfall_disposition = null`
   (FR-003).

Mirrors `create_customer_po`'s single-transaction shape (ADR-0002). Returns the new Challan's `id`.

### `update_challan(p_id, p_trade_name_id, p_challan_number, p_challan_date, p_lines jsonb, p_user_id) returns void`

1. Raises an exception (`CHALLAN_NOT_EDITABLE`) unless `status = 'issued'` (FR-013).
2. Updates the header columns (`trade_name_id`, `challan_number`, `challan_date`) — never
   `status`/`accepted_at`/`accepted_by`.
3. Deletes all existing `challan_lines` for this Challan and reinserts from `p_lines`, exactly like
   `create_challan`'s own line-insertion step, including remaining-quantity re-validation and
   re-snapshotting (research.md — no per-line lock exists within an Issued Challan, so this is a
   full replace, not 006's per-line upsert). `p_lines` here also accepts `accepted_quantity` and
   `shortfall_disposition` per line, so staff can record the signed copy's actual figures before
   finalizing acceptance (FR-003, FR-007).

### `void_challan(p_id, p_user_id) returns void`

Raises an exception (`CHALLAN_NOT_VOIDABLE`) unless `status = 'issued'`; otherwise sets `status =
'voided'` (FR-013, FR-014). Does not touch `challan_lines`, any PO line, `inventory_movements`, or
`ledger_entries` — none of those were ever written for a Challan that never reached acceptance.

### `accept_challan(p_id, p_user_id) returns void`

Performs, in one transaction (research.md):

1. Raises `CHALLAN_NOT_ISSUED` unless `status = 'issued'` (covers both "already accepted" and
   "already voided" — FR-013).
2. Raises `PO_CANCELLED` if the referenced PO's `status = 'cancelled'` (Edge Cases).
3. Raises `NO_ACCEPTED_QUANTITY` unless at least one line has `accepted_quantity > 0` (FR-008).
4. Raises `MISSING_SHORTFALL_DISPOSITION` (naming the offending line ids) if any line has
   `accepted_quantity < delivered_quantity` and `shortfall_disposition is null` (FR-007).
5. For each line with `accepted_quantity > 0`: inserts one `inventory_movements` row (`qty_delta =
   -accepted_quantity`, `reason = 'Challan accepted'`, `source_type = 'challan_line'`, `source_id =
   challan_lines.id`, `movement_date = challans.challan_date`).
6. For each line with `shortfall_disposition = 'return_to_inventory'`: inserts one more
   `inventory_movements` row (`qty_delta = +(delivered_quantity - accepted_quantity)`, `reason =
   'Challan shortfall returned to inventory'`, `source_type = 'challan_line'`, `source_id =
   challan_lines.id`, `movement_date = current_date`). A `'write_off'` disposition writes nothing
   (FR-010).
7. Calls `recompute_product_quantity_on_hand` once per distinct `product_id` touched above.
8. For each line: `update customer_po_lines set delivered_quantity = delivered_quantity +
   accepted_quantity where id = po_line_id` (FR-009).
9. Selects the PO's customer's `issues_performa_invoice` flag; if `false`, inserts one
   `ledger_entries` row (`customer_id`, `entry_date = challans.challan_date`, `type = 'credit'`,
   `amount = sum(accepted_quantity * unit_price)` across all lines, `source_type = 'challan'`,
   `source_id = challans.id`, `description = 'Challan ' || challan_number`, `created_by =
   p_user_id`) — only if that sum is `> 0` (`ledger_entries.amount` has a `check (amount > 0)`,
   matching 005). If `true`, posts nothing (FR-012).
10. Sets `challans.status = 'accepted'`, `accepted_at = now()`, `accepted_by = p_user_id`.

Steps 5-10 either all happen or none do (single function call = single transaction). All new
functions run `SECURITY INVOKER` (the default) under the service-role client, same trust boundary
as every other RPC in this project.

## Storage bucket: `challan-attachments` (new)

Third private bucket in this project (after `trade-name-assets`, `customer-po-documents`), same
trust boundary (ADR-0003): service-role-only uploads/deletes, short-lived signed URLs for reads, no
Storage RLS policies.

```sql
insert into storage.buckets (id, name, public)
values ('challan-attachments', 'challan-attachments', false)
on conflict (id) do nothing;
```

Uploading a signed copy follows 004's three-step ordering (`lib/trade-names/storage.ts`): upload
the new file to a fresh, timestamped path, update `challans`' `signed_copy_*` columns to point at
it, then best-effort delete the previous object if one existed (FR-006).

## Row Level Security

Unchanged trust boundary from 001-006: all application reads/writes go through Server Actions
using the Supabase service-role key, which bypasses RLS. All new tables are created with RLS
enabled and no policies, exactly like every other table in this project's migrations.
