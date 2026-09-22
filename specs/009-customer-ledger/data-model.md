# Data Model: Customer Ledger

**Feature**: `009-customer-ledger` | **Date**: 2026-09-23

Postgres schema derived from spec Key Entities and Functional Requirements. DDL will live in
[`supabase/migrations/0009_customer_ledger.sql`](../../supabase/migrations/0009_customer_ledger.sql)
(written at implementation time); this document explains the shape and the FR each part
satisfies, and is the basis for that migration. See [research.md](./research.md) for the
reasoning behind each design choice below.

## Table: `customer_payments` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `customer_id` | `uuid` → `customers(id)` | yes | No `on delete cascade` — customers are never hard-deleted (matching `ledger_entries.customer_id`). FR-004. |
| `payment_date` | `date` | yes | Also the `ledger_entries.entry_date` this payment's debit posts with. FR-004. |
| `amount` | `numeric(12,2)` check `> 0` | yes | The exact amount the debit ledger entry carries. FR-004. |
| `cheque_number` | `text` check `btrim(cheque_number) <> ''` | yes | FR-004. |
| `bank_name` | `text` check `btrim(bank_name) <> ''` | yes | FR-004. |
| `status` | `text` default `'received'` check `in ('received', 'cleared', 'bounced')` | yes | `received` at creation; final once `cleared` or `bounced` — enforced in `update_customer_payment_status`, not by a `CHECK` (a plain `CHECK` cannot compare `OLD`/`NEW`; research.md). FR-007. |
| `reference_type` | `text` check `is null or in ('customer_po', 'performa_invoice')` | no | Polymorphic, matching `ledger_entries.source_type` (005). Null for an untied lump-sum payment. FR-005. |
| `reference_id` | `uuid` | no | No FK — deliberately polymorphic across `customer_pos`/`performa_invoices`, matching `ledger_entries.source_id` (005). Null unless `reference_type` is set. Validated in `record_customer_payment` to belong to the same `customer_id` (FR-006), never re-validated afterward since it's never edited. |
| `created_at` | `timestamptz` default `now()` | yes | When the payment was recorded. FR-014. |
| `created_by` | `uuid` → `auth.users(id)` | yes | Who recorded it. FR-014. |
| `status_changed_at` | `timestamptz` | no | Null until the one allowed status transition happens. FR-014. |
| `status_changed_by` | `uuid` → `auth.users(id)` | no | Null until the one allowed status transition happens. FR-014. |

**No `updated_at` column and no `set_updated_at()` trigger.** `update_customer_payment_status`
(below) is the only code path in this feature that ever issues an `UPDATE` against this table,
and it only ever sets `status`/`status_changed_at`/`status_changed_by` — every other column has no
update path at all, anywhere, by omission (research.md). This is a deliberate, narrow exception to
this project's usual full immutability of posted records (spec.md Assumptions) — a cheque's status
genuinely changes once, unlike a Challan or Performa Invoice.

Constraint check: `reference_type is null` implies `reference_id is null`, and vice versa —
enforced as `constraint customer_payments_reference_pair check ((reference_type is null) =
(reference_id is null))`.

Index: `idx_customer_payments_customer_date on customer_payments (customer_id, payment_date
desc)` — for a customer's payment history and the ledger view's join (FR-001, FR-004).

## New Postgres function: `record_customer_payment(p_customer_id, p_payment_date, p_amount, p_cheque_number, p_bank_name, p_reference_type, p_reference_id, p_user_id) returns uuid`

1. Raises `CUSTOMER_NOT_FOUND` unless `p_customer_id` exists in `customers`.
2. If `p_reference_type` is not null:
   - `'customer_po'`: `select customer_id into v_ref_customer_id from customer_pos where id =
     p_reference_id`; raises `REFERENCE_NOT_FOUND` if no row, `REFERENCE_WRONG_CUSTOMER` if
     `v_ref_customer_id <> p_customer_id` (FR-006).
   - `'performa_invoice'`: same shape against `performa_invoices`.
3. Inserts the `customer_payments` row (`status = 'received'`) — `returning id into v_id`.
4. Inserts one `ledger_entries` row (`customer_id = p_customer_id`, `entry_date =
   p_payment_date`, `type = 'debit'`, `amount = p_amount`, `source_type = 'payment'`, `source_id
   = v_id`, `description = 'Cheque ' || p_cheque_number || ' received'`, `created_by =
   p_user_id`) — FR-004.
5. Returns `v_id`.

Steps 1-4 either all happen or none do (single function call = single transaction, ADR-0002),
mirroring `create_performa_invoice`'s own atomicity guarantee (008 data-model.md).

## New Postgres function: `update_customer_payment_status(p_id, p_new_status, p_user_id) returns void`

1. `select status, customer_id, amount, cheque_number into v_status, v_customer_id, v_amount,
   v_cheque_number from customer_payments where id = p_id for update`; raises `PAYMENT_NOT_FOUND`
   if no row.
2. Raises `PAYMENT_STATUS_FINAL: this payment is already %` (interpolating `v_status`) unless
   `v_status = 'received'` — both `cleared` and `bounced` are terminal (FR-007).
3. Raises `INVALID_STATUS: % is not a valid target status` (interpolating `p_new_status`) unless
   `p_new_status in ('cleared', 'bounced')` — a database-level guard independent of the calling
   Zod schema, matching how other functions in this project (e.g. `accept_challan`) validate
   their own inputs rather than relying solely on the client-side schema (resolved from
   `/sp.analyze` finding U1). Without this, a direct RPC call with `p_new_status = 'received'`
   would otherwise pass step 2 (status genuinely is `'received'`) and silently reset
   `status_changed_at`/`status_changed_by` to a fresh value with no real transition having
   occurred.
4. `update customer_payments set status = p_new_status, status_changed_at = now(),
   status_changed_by = p_user_id where id = p_id`.
5. If `p_new_status = 'bounced'`: inserts one `ledger_entries` row (`customer_id =
   v_customer_id`, `entry_date = current_date`, `type = 'credit'`, `amount = v_amount`,
   `source_type = 'payment_reversal'`, `source_id = p_id`, `description = 'Cheque ' ||
   v_cheque_number || ' bounced — reversal'`, `created_by = p_user_id`) — dated to today, never
   backdated to the original payment (research.md, spec.md Assumptions). If `p_new_status =
   'cleared'`: no further effect (FR-007).

`for update` in step 1 takes a row-level exclusive lock, preventing two concurrent status-change
calls against the same payment from both passing the `status = 'received'` guard — the second
call's `SELECT` blocks until the first's transaction ends, then re-reads the now-`cleared`/
`bounced` status and correctly rejects, the same discipline `create_performa_invoice` already
uses for `customer_po_lines` (008 data-model.md, "Concurrency guarantee").

**No `update_customer_payment` function exists for anything besides status** — a payment's
`amount`, `payment_date`, `cheque_number`, `bank_name`, and reference fields have no update path
anywhere in this feature, ever (FR-008).

## Read-only computations (not stored)

- **A customer's running balance**: unchanged — `lib/customers/ledger.ts`'s existing
  `getCustomerLedgerBalance` (005) is reused as-is for the summary balance shown on the existing
  customer detail page; the full ledger view (below) computes its own running balance per row
  from the same underlying rows.
- **Per-row running balance and display fields** (`lib/customer-ledger/service.ts`,
  `getCustomerLedger(customerId, dateRange?)`): fetches every matching `ledger_entries` row for
  the customer ordered by `entry_date asc, created_at asc`; computes a running balance
  (`credit` adds, `debit` subtracts) alongside each row (FR-001, FR-003); resolves each row's
  Invoice #/Description (already stored in `ledger_entries.description` for every source type,
  including this feature's own `'payment'`/`'payment_reversal'`, per 005/007/008's own insert
  convention — no join needed) and PO Number column via one batched query per distinct
  `source_type` present (research.md):
  - `'opening_balance'`: no PO number.
  - `'challan'`: `source_id → challans.po_id → customer_pos.po_number` (single PO).
  - `'performa_invoice'`: `source_id → performa_invoices` joined through
    `performa_invoice_lines → customer_po_lines → customer_pos`, de-duplicated, joined
    `" / "` — FR-002, matching 008's own multi-PO invoice display.
  - `'payment'` / `'payment_reversal'`: `source_id → customer_payments`, itself optionally
    resolving its own `reference_type`/`reference_id` the same way (`'customer_po'` → that PO's
    single number; `'performa_invoice'` → that invoice's joined PO-number list); null if the
    payment has no reference at all. This same `customer_payments` join also resolves
    `createdAt`/`createdBy` (when the payment was recorded, and by whom) and, when set,
    `statusChangedAt`/`statusChangedBy` (when its status last changed, and by whom) — carried on
    the row alongside `paymentStatus` so FR-014's "record and display" requirement is actually met,
    not just the "record" half (resolved from `/sp.analyze` finding G1; `createdBy`/
    `statusChangedBy` are the raw `auth.users.id`, matching how `getPerformaInvoice` already
    exposes `createdBy`, 008).
  A date-range filter (FR-010) is applied to which rows are *displayed*, but the running-balance
  computation always starts from the customer's very first entry, so the balance shown for a
  filtered view still reflects everything before the filter's start.
- **Ageing classification and overdue amounts** (`lib/customer-ledger/ageing.ts`,
  `getCustomerAgeing(customerId)`): the FIFO allocation described in research.md, run over the
  same already-fetched `ledger_entries` rows `getCustomerLedger` uses — no separate query.
  Returns each still-open (or partially-open) credit entry's remaining amount, original
  `entry_date`, and its `within`/`beyond` classification against that customer's
  `payment_terms_max_days` **only** (FR-009), plus the summed `overdueAmount` (the `beyond`
  portions only) used by the all-customers summary. `payment_terms_min_days` plays no role in this
  computation — it is a separate, presentation-only value (already part of `getCustomerLedger`'s
  returned `customer` object) that the ageing view renders alongside each open entry as context
  (e.g. "Expected within 15-30 days"), never consumed by `getCustomerAgeing` itself
  (research.md, resolved from `/sp.analyze` finding A1).
- **All-customers summary** (`lib/customer-ledger/service.ts`, `listCustomerLedgerSummaries()`):
  for every customer, `{ id, displayName, balance, overdueAmount }` — `balance` from
  `getCustomerLedgerBalance`, `overdueAmount` from `getCustomerAgeing`'s summed beyond-range
  portions (FR-011).
- **CSV export rows**: `lib/customer-ledger/csv.ts` renders the exact same rows
  `getCustomerLedger`/`listCustomerLedgerSummaries` already produce as `text/csv` — no separate
  data path, so an export can never diverge from what's on screen (FR-012, SC-007). The per-customer
  Route Handler's `Content-Disposition` filename is built from the customer's `display_name`, which
  (005) has no format restriction — the handler MUST sanitize it (strip/replace characters outside
  `[A-Za-z0-9-_ ]`) before interpolating it into the header, rather than using the raw value
  (resolved from `/sp.analyze` finding U2).

## Row Level Security

Unchanged trust boundary from 001-008: all application reads/writes go through Server Actions
using the Supabase service-role key, which bypasses RLS. `customer_payments` is created with RLS
enabled and no policies, exactly like every other table in this project's migrations.
