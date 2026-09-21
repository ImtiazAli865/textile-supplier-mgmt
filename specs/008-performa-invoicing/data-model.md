# Data Model: Performa Invoicing

**Feature**: `008-performa-invoicing` | **Date**: 2026-09-22

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0008_performa_invoicing.sql`](../../supabase/migrations/0008_performa_invoicing.sql)
(written at implementation time); this document explains the shape and the FR each part satisfies,
and is the basis for that migration. See [research.md](./research.md) for the reasoning behind
each design choice below.

## Table: `performa_invoices` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `customer_id` | `uuid` → `customers(id)` | yes | No `on delete cascade` — customers are never hard-deleted (matching `ledger_entries.customer_id`, `customer_pos.customer_id`). Must reference a customer with `issues_performa_invoice = true` at creation time — enforced in `create_performa_invoice`, not by a `CHECK` (research.md — the rule reads another table's current value, which a `CHECK` cannot do). FR-001. |
| `trade_name_id` | `uuid` → `trade_names(id)` | yes | Supplies the printed letterhead and the `next_invoice_number` counter. FR-004, FR-006. |
| `invoice_number` | `varchar(30)` | yes | Auto-generated (the trade name's `next_invoice_number`, as a plain integer, no padding or date suffix) or staff-overridden. FR-004. |
| `invoice_date` | `date` | yes | Defaults to today in the form; also the `ledger_entries.entry_date` this invoice posts. |
| `tax_rate` | `numeric(5,2)` check `>= 0 and <= 100` | yes | Defaults to `18.00` at the form/schema layer, staff-overridable per invoice; always explicitly submitted to `create_performa_invoice` (no DB default). FR-005. |
| `created_at` | `timestamptz` default `now()` | yes | |
| `created_by` | `uuid` → `auth.users(id)` | yes | |

**No `updated_at`/`updated_by`, no update trigger, and no update/delete path in any Server Action
or service function — ever, not just after some state transition** — immutability is structural
from the row's creation, matching `ledger_entries` (005 FR-013) more closely than any editable
header table in this project (research.md). FR-009, FR-010.

Constraint: `unique (trade_name_id, invoice_number)` — enforces FR-004's per-trade-name uniqueness
at the database level (mirrors `challans`' own `unique (trade_name_id, challan_number)`).

Index: `idx_performa_invoices_customer_date on performa_invoices (customer_id, invoice_date desc)`
— for the customer ledger's invoice list and this feature's own invoice list (FR-012).

## Table: `performa_invoice_lines` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `invoice_id` | `uuid` → `performa_invoices(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves form entry order (the printed line table's order), mirroring `customer_po_lines.position`/`challan_lines.position`. |
| `po_line_id` | `uuid` → `customer_po_lines(id)` | yes | No `on delete cascade` — the ordinary `RESTRICT` default prevents a referenced PO line from ever being deleted while any invoice points to it (same reasoning as `challan_lines.po_line_id`, 007 data-model.md). Also how each line's source PO is resolved for FR-006's per-line PO attribution: `po_line_id → customer_po_lines.po_id → customer_pos.po_number`, live, not snapshotted (research.md — `customer_item_code` is likewise resolved live). |
| `product_id` | `uuid` → `products(id)` | yes | **Snapshot** from the PO line at creation time — never re-read live afterward (research.md). |
| `uom` | `text` | yes | **Snapshot** from the PO line at creation time. |
| `unit_price` | `numeric(12,2)` check `> 0` | yes | **Snapshot** from the PO line at creation time; this value, not any later PO-line state, drives this line's contribution to the invoice's gross total. |
| `invoiced_quantity` | `numeric(10,2)` check `> 0` | yes | The quantity this line invoices (FR-003). |
| `created_at` | `timestamptz` default `now()` | yes | No `updated_at` — a line is never edited after creation (research.md, stricter even than `challan_lines`, which is editable pre-acceptance). |

## Table: `performa_invoice_attachments` (new, 1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `invoice_id` | `uuid` → `performa_invoices(id)` `on delete cascade` | yes | |
| `storage_path` | `text` | yes | Object path (not a URL) within the `performa-invoice-attachments` bucket. Read as a short-lived signed URL, never a public URL (ADR-0003). |
| `file_name` | `text` | yes | Original filename, for display. |
| `content_type` | `text` | yes | |
| `uploaded_at` | `timestamptz` default `now()` | yes | |
| `uploaded_by` | `uuid` → `auth.users(id)` | yes | |

Zero or more per invoice (FR-011) — a child table, not nullable columns on the header, since this
cardinality is genuinely open-ended (research.md — contrast with Challan's zero-or-one signed
copy). Uploaded any time after the invoice exists; never blocks or is required by invoice creation.
No content of this file is ever read, parsed, or relied upon by this feature (FR-011).

## Altered table: `customer_po_lines` (from 006) — one new constraint added by this feature's migration

`customer_po_lines.invoiced_quantity` currently only carries `check (invoiced_quantity >= 0)`
(006 data-model.md) — no upper bound tying it to `delivered_quantity` exists yet, since 006
deliberately deferred that relationship to "whichever feature actually writes above zero" (006
data-model.md's own note on this column). This feature's migration adds it:

```sql
alter table customer_po_lines
  add constraint customer_po_lines_invoiced_le_delivered
  check (invoiced_quantity <= delivered_quantity);
```

This is a genuine `ALTER TABLE` against 006's already-applied table, via this feature's own new
migration file — not an edit to `0006_customer_purchase_orders.sql` in place, the same "modify an
earlier feature's table via a later migration, never rewrite its file" pattern 007 already used
against 003b's functions. It is the hard database-level backstop for FR-015: even if every
application-level check below had a bug, the database itself refuses any `UPDATE` that would push
`invoiced_quantity` past `delivered_quantity`, for any reason, from any code path, forever.

## New Postgres function: `create_performa_invoice(p_customer_id, p_trade_name_id, p_invoice_number, p_invoice_date, p_tax_rate, p_lines jsonb, p_user_id) returns uuid`

1. Raises `CUSTOMER_NOT_INVOICE_ELIGIBLE` unless the customer exists and
   `customers.issues_performa_invoice = true` (FR-001, FR-008).
2. Raises `TRADE_NAME_NOT_FOUND` unless the trade name exists.
3. Raises `DUPLICATE_PO_LINE` if the same `po_line_id` appears more than once in `p_lines` (a
   pure in-memory check over the submitted array, no query needed).
4. Iterates `p_lines` **sorted by `po_line_id` ascending** — not client-submission order — and for
   each element (`{ po_line_id, invoiced_quantity }`), in a single query per line:

   ```sql
   for v_line in
     select value ->> 'po_line_id' as po_line_id,
            (value ->> 'invoiced_quantity')::numeric as invoiced_quantity
     from jsonb_array_elements(p_lines)
     order by (value ->> 'po_line_id')
   loop
     select cpl.delivered_quantity, cpl.invoiced_quantity, cp.customer_id, cp.status
     into v_delivered, v_invoiced, v_po_customer_id, v_po_status
     from customer_po_lines cpl
     join customer_pos cp on cp.id = cpl.po_id
     where cpl.id = v_line.po_line_id
     for update of cpl;
     -- ... validations below, using v_line ...
   end loop;
   ```

   `for update of cpl` takes a row-level exclusive lock on that specific `customer_po_lines` row
   for the rest of this transaction — this is the mechanism, not just a convention, that makes
   FR-015 hold under real concurrency (see "Concurrency guarantee" below). Locking only `cpl` (not
   `cp`) means two invoices touching *different* lines of the *same* PO never block each other —
   only two attempts to invoice the *same* line serialize. **Sorting by `po_line_id` before this
   loop** is what makes that serialization safe rather than deadlock-prone: this is the first
   feature where a single transaction can lock more than one `customer_po_lines` row at once
   (User Story 2's multi-PO invoices), and two concurrent invoices sharing two or more of the same
   lines but listing them in different orders would otherwise each hold one lock while waiting on
   the other, forcing Postgres to abort one with a `deadlock_detected` error instead of a clean
   validation rejection. Acquiring locks in one fixed, deterministic order across every call
   eliminates that possibility entirely (standard lock-ordering deadlock avoidance) — this sort
   order affects only lock-acquisition sequence, never the invoice's stored line order, which step
   7 derives separately from `p_lines`' original client-submitted order via `with ordinality`.
   - Raises `PO_LINE_WRONG_CUSTOMER` if `v_po_customer_id <> p_customer_id` (FR-002).
   - Raises `PO_CANCELLED` if `v_po_status = 'cancelled'` (FR-002).
   - Raises `LINE_FULLY_INVOICED` if `v_delivered - v_invoiced <= 0`, or
     `LINE_EXCEEDS_REMAINING_INVOICEABLE` if the submitted `invoiced_quantity` exceeds
     `v_delivered - v_invoiced` (FR-003, FR-015).
5. Resolves `invoice_number`: if `p_invoice_number` is null/blank, casts
   `trade_names.next_invoice_number` directly to text (no padding, no date suffix), then increments
   the counter; otherwise uses `p_invoice_number` as given (uniqueness enforced by the table's own
   constraint) (FR-004).
6. Inserts the `performa_invoices` row.
7. Inserts each `performa_invoice_lines` row via `jsonb_array_elements(p_lines) with ordinality`
   for `position`, snapshotting `product_id`/`uom`/`unit_price` from the referenced
   `customer_po_lines` row (FR-006).
8. For each line: `update customer_po_lines set invoiced_quantity = invoiced_quantity +
   p_line.invoiced_quantity where id = po_line_id` (FR-007, FR-015) — this `UPDATE` targets the
   exact row step 4 already locked with `for update of cpl`, so it applies instantly with no
   further wait.
9. Computes `v_gross_total = sum(invoiced_quantity * unit_price)` across the lines just inserted;
   `v_tax_amount = round(v_gross_total * p_tax_rate / 100, 2)`; `v_net_total = v_gross_total +
   v_tax_amount` (FR-005).
10. Inserts one `ledger_entries` row (`customer_id = p_customer_id`, `entry_date = p_invoice_date`,
    `type = 'credit'`, `amount = v_net_total`, `source_type = 'performa_invoice'`, `source_id` = the
    new invoice's `id`, `description = 'Performa Invoice ' || invoice_number`, `created_by =
    p_user_id`) (FR-007). No conditional guard on `v_net_total > 0` is needed — at least one line is
    required (enforced by the calling Zod schema, matching `create_challan`'s own convention of not
    duplicating that check in SQL) and both `invoiced_quantity` and `unit_price` are `CHECK > 0` on
    every line, so `v_net_total` is always positive.
11. Returns the new invoice's `id`.

Steps 1-10 either all happen or none do (single function call = single transaction), mirroring
`accept_challan`'s atomicity guarantee (007 data-model.md). Runs `SECURITY INVOKER` (the default)
under the service-role client, same trust boundary as every other RPC in this project.

### Concurrency guarantee for FR-015

Two overlapping calls to `create_performa_invoice` that both target the **same** `po_line_id`
cannot both succeed if their combined `invoiced_quantity` would exceed that line's
`delivered_quantity`, even if both transactions start before either commits:

1. Transaction A's step 4 executes `select ... for update of cpl where cpl.id = X`. Postgres grants
   A an exclusive row lock on that `customer_po_lines` row and lets A's `SELECT` return
   immediately (no prior lock held by anyone else).
2. Transaction B, running concurrently against the *same* `po_line_id = X`, executes the identical
   `select ... for update of cpl` — Postgres **blocks** B's query at that line until A's
   transaction ends (commit or rollback). B does not read stale data and does not proceed past
   this point while blocked.
3. If A commits (its full invoice, including the `invoiced_quantity` increment in step 8, is now
   durable), B's blocked `SELECT` unblocks and returns the **post-A** values —
   `v_invoiced` already reflects A's increment. B's own remaining-quantity check in step 4 now
   correctly evaluates against the true current state and rejects B if A's invoice already
   consumed the quantity B is requesting.
4. If A rolls back (any later step in A's function raises an exception), B's blocked `SELECT`
   unblocks and returns the **pre-A** values, exactly as if A had never run — no partial effect
   from A leaks into B's decision.

**Multi-line invoices and deadlock avoidance**: when an invoice covers more than one PO line
(User Story 2), a single transaction holds more than one `customer_po_lines` lock at once. If two
concurrent invoices shared two or more of the same lines and each acquired its locks in whatever
order its own `p_lines` happened to list them, transaction A could hold line X's lock while waiting
on line Y, while transaction B simultaneously holds line Y's lock while waiting on line X — a
circular wait, which Postgres resolves by aborting one transaction with a `deadlock_detected`
error rather than a clean, friendly validation rejection. Sorting `p_lines` by `po_line_id`
ascending before the locking loop (step 4) ensures every call to `create_performa_invoice`
acquires its locks in the same fixed order regardless of how the client submitted them, so two
transactions sharing lines never form a cycle — one simply blocks cleanly behind the other, exactly
as described in points 1-4 above, instead of deadlocking.

This is the same row-locking discipline Postgres's own documentation prescribes for
"check constraint, then update" patterns that a plain `CHECK` cannot express alone (because the
rule spans two rows being compared — `customer_po_lines.invoiced_quantity` against
`customer_po_lines.delivered_quantity`, both on the same row here, but only knowable together at
transaction time, not at single-row-insert time). The `customer_po_lines_invoiced_le_delivered`
`CHECK` constraint (added above) is the defense-in-depth backstop: even a future code path that
forgot the `for update of cpl` lock would still have its `UPDATE` rejected outright by the database
the instant it tried to push `invoiced_quantity` past `delivered_quantity`, turning a silent
data-integrity bug into a loud, immediate transaction failure instead.

**No `update_performa_invoice`, `void_performa_invoice`, or `accept_performa_invoice` function
exists** — this feature has no edit, void, or separate-posting path at all (research.md); FR-009's
read-only guarantee holds from the moment a row is created, not from some later state transition.

## Storage bucket: `performa-invoice-attachments` (new)

Fourth private bucket in this project (after `trade-name-assets`, `customer-po-documents`,
`challan-attachments`), same trust boundary (ADR-0003): service-role-only uploads/deletes,
short-lived signed URLs for reads, no Storage RLS policies.

```sql
insert into storage.buckets (id, name, public)
values ('performa-invoice-attachments', 'performa-invoice-attachments', false)
on conflict (id) do nothing;
```

Uploading a GST Sales Tax Invoice file is a plain insert into `performa_invoice_attachments` after
the Storage upload succeeds — no replace/delete-previous step, since this is an append-only,
zero-to-many relationship (contrast with Challan's signed-copy replace flow, 007 data-model.md).

## Row Level Security

Unchanged trust boundary from 001-007: all application reads/writes go through Server Actions
using the Supabase service-role key, which bypasses RLS. All new tables are created with RLS
enabled and no policies, exactly like every other table in this project's migrations.

## Read-only computations (not stored)

- **An invoice's gross/tax/net totals**: computed in `lib/performa-invoices/service.ts`
  (`getPerformaInvoice`/`listPerformaInvoices`) from the invoice's already-fetched lines and its
  own `tax_rate` — `gross_total = sum(line.invoicedQuantity * line.unitPrice)`, `tax_amount =
  round(gross_total * tax_rate / 100, 2)`, `net_total = gross_total + tax_amount` (research.md —
  safe to recompute given the immutability guarantees above; matches 006/007's own
  total-computation precedent).
- **An invoice's included PO numbers**: derived by joining each line's `po_line_id →
  customer_po_lines.po_id → customer_pos.po_number` and de-duplicating — never stored on the
  invoice header (spec.md Assumptions, `specs/PRODUCT-OVERVIEW.md`'s resolved multi-PO point).
- **Amount in words**: computed from the invoice's `net_total` at read/print time by
  `lib/performa-invoices/number-to-words.ts` (research.md) — never stored.
