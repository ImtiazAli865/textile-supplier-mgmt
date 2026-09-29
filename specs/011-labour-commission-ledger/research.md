# Research: Labour / Commission Ledger (Contractor Khata)

**Feature**: `011-labour-commission-ledger` | **Date**: 2026-09-29

The architecture was agreed before the spec and recorded in
[ADR-0010](../../history/adr/0010-contractor-payment-allocation-and-settlement-lock.md): a separate
contractor ledger posted at the source event, cash payments linked to batches through an
amount-bearing join table, period settlements that lock ledger dates, and one global lock order.
This file records the implementation decisions made while planning. There were no
`NEEDS CLARIFICATION` items in the Technical Context; every item below is a design decision.

---

## Decision: one migration, every write is one Postgres function, one global lock order

- **Decision**: `supabase/migrations/0011_labour_commission_ledger.sql` adds four tables and every
  write path as a `plpgsql` function called by RPC (ADR-0002). Every function that writes a
  contractor ledger entry, a payment, a settlement or a reopen first runs
  `select … from contractors where id = … for update`. Global order:
  **contractor → payment (reversal only) → production_batches (ascending id)**.
- **Rationale**: The contractor row is the per-contractor mutex (ADR-0010 §4). Two consequences
  must hold in every function, not just be implied (user confirmation, 2026-09-29):
  1. **Figures and checks are read after the lock**, in statements that start after
     `for update` returns. Postgres READ COMMITTED takes a fresh snapshot per statement, so a
     statement that starts after the lock sees everything committed by the transaction that held
     it. A read before the lock could miss a payment that commits while this function waits.
  2. **The settlement end date is read after the lock**, never passed in or read earlier.
- **Alternatives considered**: `SERIALIZABLE` isolation (needs retry handling in every caller;
  Supabase RPC runs READ COMMITTED; rejected); advisory locks keyed on contractor id (works, but a
  row lock on an existing row is simpler and visible in `pg_locks`; rejected); locking only the
  batches (does not serialise settlement against unlinked payments, adjustments or opening balance;
  rejected).

## Decision: "today" is passed in from `lib/dates.ts`, never `current_date`

- **Decision**: Functions that need today (`record_contractor_payment`,
  `reverse_contractor_payment`, `record_contractor_opening_balance`, `record_contractor_adjustment`,
  `settle_contractor_period`) take `p_today date`, supplied by the service layer from
  `todayInPakistan()`. SQL never calls `current_date` or `now()::date` for a business date.
  (`now()` is still used for audit timestamps.)
- **Rationale**: ADR-0009. The database session runs in UTC; between 00:00 and 05:00 Pakistan time
  `current_date` is yesterday. The reversal's entry date and the "not after today" checks are part
  of the settlement lock, so they must be the business date. 010 kept "not future" checks only in
  Zod (010 research.md); 011 cannot, because reversal needs today *inside* the locked transaction.
  The Zod schemas still check "not after today" too, for the friendly form error.
- **Trust**: Only the server, with the service-role key, can call these functions (RLS enabled, no
  policies, as in 0001–0010), so a caller-supplied `p_today` is as trusted as `p_user_id`, which
  every existing function already takes.
- **Alternatives considered**: `(now() at time zone 'Asia/Karachi')::date` in SQL (correct, but a
  second definition of "today" alongside `lib/dates.ts`, which ADR-0009 set out to avoid; rejected).

## Decision: ledger `source_type` is a closed set, with partial unique indexes as backstops

- **Decision**: `contractor_ledger_entries.source_type in ('production_batch', 'payment',
  'payment_reversal', 'opening_balance', 'adjustment')`, with:
  - `unique (source_type, source_id) where source_type in ('production_batch', 'payment',
    'payment_reversal')` — one earning per batch, one debit and at most one reversal per payment;
  - `unique (contractor_id) where source_type = 'opening_balance'` — one opening balance
    (FR-020);
  - `check` that `source_id` is present for the first three and null for the last two;
  - `check` that `description` is non-blank for `adjustment` (the reason, FR-021).
- **Rationale**: Unlike 005's `ledger_entries` (deliberately open, many future writers), this
  ledger's writers are all known now, and settlement figures are grouped by `source_type`. A
  typo'd value would silently fall out of every total. The unique indexes make double-posting
  impossible even if a function is later changed carelessly.
- **Alternatives considered**: free-text `source_type` like 005 (rejected for the reason above).

## Decision: insert-only is enforced by triggers, not only by omission

- **Decision**: `BEFORE UPDATE OR DELETE` triggers:
  - `contractor_ledger_entries`, `contractor_payment_allocations`: always raise
    `IMMUTABLE_RECORD`.
  - `contractor_payments`: no delete; the only allowed update is `status 'active' → 'reversed'`
    setting the three reversal columns, with every other column unchanged.
  - `contractor_settlements`: no delete; the only allowed update sets the three reopen columns
    once (null → value), every other column unchanged.
- **Rationale**: 005/008/009 rely on "no update path exists". Here a settlement is a signed
  agreement whose frozen figures are only valid if the rows under them never change, and the
  over-allocation trigger's correctness depends on payments only ever moving to `reversed`. Making
  those guarantees hold for a manual SQL fix too is cheap. A deliberate data repair can still
  disable the trigger explicitly.
- **Alternatives considered**: omission only, as in 009 (rejected: the settlement lock would be a
  convention for anything outside the functions, which ADR-0010 rejected for over-allocation for
  the same reason).

## Decision: settlement figures — definitions and the stored check

- **Decision**: For a period `[start, end]` of one contractor:
  - `opening_balance` = Σ signed entries dated `< start` **plus** any `opening_balance` entry dated
    within the period. (FR-020 forces the go-live opening entry to be the contractor's earliest
    entry, and the first period starts at the earliest entry, so it always sits on the first
    period's start date. Counting it as "opening" makes the statement read naturally.)
  - `earned` = Σ `production_batch` credits in the period.
  - `paid` = Σ `payment` debits − Σ `payment_reversal` credits in the period (net, FR-025).
  - `adjustments` = Σ `adjustment` credits − Σ `adjustment` debits in the period (signed).
  - `closing_balance` = `opening_balance + earned − paid + adjustments`, stored, and enforced by a
    table `check` so a stored settlement can never be internally inconsistent.
  - Signed entry = `+amount` for credit, `−amount` for debit (positive = the business owes the
    contractor; spec Assumptions).
- **Period start**: day after the latest *current* settlement's `period_end`, else the
  contractor's earliest entry date. A partial unique index on
  `(contractor_id, period_start) where reopened_at is null` rejects overlapping current
  settlements.
- **Refusals**: no entries → `NOTHING_TO_SETTLE`; `p_period_end > p_today` → `SETTLE_DATE_FUTURE`;
  `p_period_end < start` → `SETTLE_BEFORE_PERIOD_START:<start>`; closing ≠ 0 without
  `p_confirm_nonzero` → `SETTLEMENT_BALANCE_NOT_ZERO:<closing>` (the same confirm-flag technique as
  010's `RETURNED_WEIGHT_UNCONFIRMED`).
- **Alternatives considered**: storing only dates and deriving figures (rejected by business: the
  statement's numbers must be frozen); a separate `opening_entry` figure (rejected: one more column
  for a value that is always the first period's opening).

## Decision: one helper gives the lock date; every writer calls it after locking the contractor

- **Decision**: `contractor_settled_until(p_contractor_id uuid) returns date` — the latest
  `period_end` among current settlements, or null. Not `security definer`, no lock of its own;
  its comment states it must only be called after the caller holds the contractor lock. Writers
  raise `PERIOD_SETTLED:<date>` when their entry date `<= contractor_settled_until(...)`.
- **Callers**: `complete_production_batch` (completion date), `record_contractor_payment` (payment
  date), `reverse_contractor_payment` (original payment date **and** `p_today`, FR-019),
  `record_contractor_adjustment` (entry date), `settle_contractor_period` (to compute the start).
  `record_contractor_opening_balance` refuses any current settlement outright
  (`OPENING_BALANCE_AFTER_SETTLEMENT`, FR-020), which is stricter than the date check.
- **Alternatives considered**: a `locked_until` column on `contractors` kept in sync by
  settle/reopen (a cached copy of derived data; rejected — the query is one indexed row).

## Decision: `complete_production_batch` is redefined with the same signature

- **Decision**: 0011 `create or replace`s `complete_production_batch` with its 0010 signature
  unchanged, so `lib/production-batches/service.ts`'s RPC call does not change. Differences from
  0010:
  1. Read the batch's `contractor_id` without a lock, lock that contractor row, then lock the batch
     row, and raise `BATCH_CONTRACTOR_CHANGED` if the contractor differs (an `issued` batch's
     contractor is editable; the user retries).
  2. After the existing validations: raise `PERIOD_SETTLED:<date>` if the completion date is on or
     before `contractor_settled_until(contractor)` (FR-003).
  3. After the existing `update production_batches`: insert the earning credit
     (`source_type 'production_batch'`, `source_id` = batch id, amount = the just-computed
     `labour_cost`, `entry_date` = completion date, description `'Batch ' || batch_number`).
  Everything else (inventory movement, cost freezing) is copied verbatim.
- **Backfill**: the migration inserts one earning per already-completed batch that has none
  (`created_by = completed_by`). The live database had 0 batches on 2026-09-29, so this is a no-op
  there, but it keeps the migration correct for any copy with data.
- **Rationale**: One transaction for completion + earning (FR-001); lock order contractor → batch
  (ADR-0010 §4). `update_production_batch` and `void_production_batch` never lock a contractor, so
  they cannot form a cycle with it.
- **Alternatives considered**: a trigger on `production_batches` posting the earning (hides a money
  write inside a status update and cannot take the contractor lock first; rejected).

## Decision: payment allocations are passed as a JSON array; duplicates are rejected

- **Decision**: `record_contractor_payment(…, p_allocations jsonb, …)` where `p_allocations` is
  `[{ "batch_id": uuid, "amount": numeric }, …]` (possibly empty). The function rejects duplicate
  batch ids (`DUPLICATE_BATCH`), locks the distinct batch rows `order by id for update`, then
  validates each: exists (`BATCH_NOT_FOUND`), `completed` (`BATCH_NOT_COMPLETED`), same contractor
  (`BATCH_OTHER_CONTRACTOR`), completion date ≤ payment date
  (`BATCH_COMPLETED_AFTER_PAYMENT:<batch_number>`), amount > 0, amount ≤ unpaid
  (`ALLOCATION_EXCEEDS_UNPAID:<batch_number>:<unpaid>`); then Σ ≤ payment amount
  (`ALLOCATIONS_EXCEED_PAYMENT`).
- **Rationale**: Supabase RPC passes JSON natively; 008's `create_performa_invoice` already takes
  its lines as `jsonb` and iterates in sorted order. Validation happens before any insert so a
  refusal names the specific batch.
- **Alternatives considered**: two parallel arrays (`uuid[]`, `numeric[]`) (easy to misalign;
  rejected).

## Decision: the over-allocation trigger (ADR-0010 §4 backstop)

- **Decision**: `contractor_payment_allocations_guard()` `BEFORE INSERT OR UPDATE`, per row:
  1. `select … from production_batches where id = new.batch_id for update` (a no-op re-lock inside
     `record_contractor_payment`, which already holds it);
  2. refuse if the batch is not `completed` or its contractor differs from the payment's;
  3. `allocated := coalesce(sum(a.amount), 0)` over `contractor_payment_allocations a join
     contractor_payments p on p.id = a.payment_id where a.batch_id = new.batch_id and p.status =
     'active' and a.id <> new.id` (excluding the row itself on update);
  4. raise `OVER_ALLOCATED:<batch_number>` if `allocated + new.amount > labour_cost`.
- **Why `status = 'active'`**: a reversed payment's allocations must not count, or a batch whose
  only payment was reversed would stay "fully allocated" forever (user confirmation,
  2026-09-29). The new payment's own row is inserted with `status 'active'` before its
  allocations, so its sibling allocations count as they are inserted.
- **Alternatives considered**: see ADR-0010 (in-function assertion only; stored `paid_amount`
  column on `production_batches`, which would add an 011-owned mutable column to a 010 table).

## Decision: reads are computed live in TypeScript over fetched rows

- **Decision**: `lib/contractor-ledger/service.ts` fetches a contractor's entries ordered by
  `entry_date, created_at` (009's order) and computes running balance, brought-forward for a date
  range, and batch paid/unpaid in TypeScript. The contractors list fetches all entries'
  `(contractor_id, type, amount)` once and sums per contractor.
- **Rationale**: Same approach as 009 (`getCustomerLedger`, `getCustomerLedgerBalance`) at the same
  scale (a handful of contractors, a few thousand rows over years). No views or RPCs for reads.
- **Alternatives considered**: a SQL view with window functions (a second pattern for the same
  job; rejected until scale requires it).

## Decision: settlement statement is an ADR-0006 print route

- **Decision**: `app/contractors/[contractorId]/settlements/[settlementId]/print/page.tsx`, outside
  `(dashboard)`, with its own `getCurrentUser()` check, exactly like
  `app/customers/[customerId]/ledger/print/page.tsx`. It shows the frozen figures from the
  settlement row and lists the period's ledger rows read live. A current settlement's rows cannot
  change (lock + immutability), so they always add up to the frozen figures; the view still
  recomputes and shows a warning banner if they ever disagree. A reopened settlement prints with a
  "REOPENED — NOT VALID" banner (FR-030).
- **Alternatives considered**: storing a copy of the rows on the settlement (redundant given the
  lock; rejected).

## Decision: UI placement

- **Decision**:
  - `/contractors` (existing) gains a **Balance** column and each row links to the khata.
  - `/contractors/[contractorId]` (new) is the khata: balance summary, action links, ledger table
    with date-range filter and brought-forward row, completed batches with paid status, payments
    list (with reverse), settlements list (with reopen and print).
  - Forms on their own pages: `payments/new`, `adjustments/new`, `opening-balance`,
    `settlements/new` (shows a live preview of the period's figures and the non-zero warning).
  - Reverse and reopen are inline controls with a required reason field (not `window.confirm`,
    which cannot collect a reason).
  - The batch detail page (010) gains a read-only "Labour payment" section for completed batches.
  - No new top-level nav entry; "Contractors" is already in the nav.
- **Deactivate confirmation** (FR-031): the existing `window.confirm` in
  `components/contractors/contractor-list.tsx` adds "Current balance: Rs X owed / Rs X advance"
  when non-zero. The list already has the balance, so no extra fetch.

## Decision: testing stays manual via quickstart.md, plus a concurrency script

- **Decision**: As 001–010, Vitest is not wired in. `quickstart.md` covers every user story. The
  two concurrency guarantees (FR-015, User Story 2 scenario 6, User Story 5 scenario 10) are
  checked with a scratchpad `tsx` script that fires two RPCs with `Promise.all` (the 010 live-QA
  pattern), plus a deterministic two-session `psql` variant using an open transaction.
- **Alternatives considered**: introducing Vitest now (unrelated scope; rejected).

## Decision: race tests run on live Supabase; QA data is removed by a trigger-disabling cleanup script

- **Decision (user, 2026-09-29)**:
  1. **Where**: single-session logic (validation, figures, triggers, the active-payment filter,
     immutability) may be pre-checked in scratch PGlite as in 010, but the two-transaction races
     (payment vs payment, payment vs settlement, completion vs settlement) run on **live
     Supabase**. PGlite is a single-connection engine, so row locks never contend there. No
     Docker is available for a local Supabase stack.
  2. **QA tagging**: every QA row hangs off contractors named `QA-011 …`; the QA lot, product and
     any other seed rows also carry the `QA-011` prefix. The seed script records the number of
     rows it created per table.
  3. **Cleanup**: `specs/011-labour-commission-ledger/qa/cleanup-qa-011.sql`, run in the Supabase
     SQL editor (or `psql`), never from the app. In **one transaction** it:
     - `alter table … disable trigger` on exactly the four named guards
       (`trg_contractor_ledger_entries_immutable`, `trg_contractor_payment_allocations_immutable`,
       `trg_contractor_payments_guard`, `trg_contractor_settlements_guard`);
     - deletes QA rows children-first (allocations → ledger entries → settlements → payments →
       010 rows: QA batches' `inventory_movements`, then `recompute_product_quantity_on_hand`,
       `production_batches`, QA lot and product → QA contractors);
     - checks each delete's row count equals the recorded seed count, and raises (rolling
       everything back) on any mismatch;
     - re-enables the four triggers; runs zero-residue queries.
     The first run ends in `rollback` (dry run); only then is it run with `commit`.
- **Rationale**: `ALTER TABLE … DISABLE TRIGGER` is transactional. Other sessions never see the
  triggers disabled, and wait briefly on the table lock instead. Any error restores them. Foreign
  keys stay enforced, so a wrong delete order fails loudly instead of leaving orphans.
- **Alternatives considered**: `SET session_replication_role = replica` (user's first suggestion).
  It also disables Postgres's internal foreign-key triggers, so a wrong delete order would
  silently orphan rows. A plain `SET` could leak through the connection pooler if the script
  failed before resetting; `SET LOCAL` would fix that, but not the FK issue. Rejected in favour of
  disabling only the named triggers. A local Supabase stack was rejected because no Docker is
  available.

## Decision: no new dependencies, no Storage

Everything uses packages already installed. No file uploads.
