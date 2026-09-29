---

description: "Task list for Labour / Commission Ledger (Contractor Khata) implementation"
---

# Tasks: Labour / Commission Ledger (Contractor Khata)

**Input**: Design documents from `/specs/011-labour-commission-ledger/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md), [ADR-0010](../../history/adr/0010-contractor-payment-allocation-and-settlement-lock.md)

**Tests**: The spec doesn't ask for automated tests, so there are no test-writing tasks (the same
call as 001–010). Verification is the [quickstart.md](./quickstart.md) walkthrough plus the
live-Supabase QA seed/race script and cleanup script in the Polish phase (research.md, "race tests
run on live Supabase").

**Organization**: Grouped by user story in spec priority order: US1 → US2 → US3 (P1), US4 → US5
(P2), US6 (P3). All SQL goes into one migration in the Foundational phase, so the user applies it
once.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story the task belongs to (US1–US6)

## Path Conventions

Single Next.js project at the repository root (plan.md, Project Structure):

- `supabase/migrations/0011_labour_commission_ledger.sql`: new migration (0001–0010 are never edited)
- `lib/contractor-ledger/{schema,service}.ts`: new module
- `app/actions/contractor-ledger.ts`: new Server Actions
- `components/contractor-ledger/*`: new components
- `app/(dashboard)/contractors/[contractorId]/**`: new routes
- `app/contractors/[contractorId]/settlements/[settlementId]/print/page.tsx`: new print route
- `specs/011-labour-commission-ledger/qa/*`: QA seed/race script and cleanup SQL
- Extended: `lib/production-batches/service.ts`, `app/actions/production-batches.ts`,
  `app/(dashboard)/contractors/page.tsx`, `components/contractors/contractor-list.tsx`,
  `app/(dashboard)/production-batches/[batchId]/page.tsx`

**Conventions to mirror**:
- **Code patterns**: follow 009 and 010 exactly: `lib/production-batches/service.ts`
  (`toFriendlyBatchError`, `round2`, RPC wrappers), `app/actions/customer-payments.ts`
  (`ActionResult`, `fail`, `revalidatePath`), `lib/customer-ledger/service.ts` (running balance
  over all entries, then date filter), `app/customers/[customerId]/ledger/print/page.tsx` (print
  route with its own auth check).
- **Dates**: `todayInPakistan()` / `isNotAfterTodayInPakistan()` from `lib/dates.ts` only
  (ADR-0009). Never `new Date().toISOString().slice(0, 10)`, never `current_date` in SQL.
- **Tables**: new tables set `text-zinc-900` on body text (010's dark-mode fix).
- **Next.js APIs**: for any API not already used in this codebase, check
  `node_modules/next/dist/docs/` first (CLAUDE.md).

---

## Phase 1: Setup

**Purpose**: Scaffold the migration. No new dependencies.

- [X] T001 Create `supabase/migrations/0011_labour_commission_ledger.sql` with a header comment in the style of `0010_production_batches.sql`: what the feature does, the lock order, and pointers to `specs/011-labour-commission-ledger/data-model.md`, research.md and ADR-0010.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: All schema, triggers and functions (applied once), the shared schemas, the service
skeleton and error mapping.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete, including T006
(migration applied).

- [X] T002 In `supabase/migrations/0011_labour_commission_ledger.sql`, create exactly as in [data-model.md](./data-model.md):
  - tables `contractor_ledger_entries`, `contractor_payments`, `contractor_payment_allocations`, `contractor_settlements` with every named constraint (`contractor_ledger_entries_source_id_check`, `…_adjustment_reason_check`, `contractor_payments_reversal_fields_check`, `contractor_payment_allocations_unique`, `contractor_settlements_period_check`, `…_figures_check`, `…_reopen_fields_check`);
  - indexes `idx_contractor_ledger_entries_source`, `idx_contractor_ledger_entries_opening`, `idx_contractor_ledger_entries_contractor_date`, `idx_contractor_payments_contractor_date`, `idx_contractor_payment_allocations_batch`, `idx_contractor_settlements_current_start`, `idx_contractor_settlements_contractor_end`;
  - `enable row level security` with no policies on all four tables;
  - table and column comments (sign convention, polymorphic `source_id`, "insert-only, enforced by trigger").
- [X] T003 In the same migration, add the **five** triggers from data-model.md:
  - `trg_contractor_ledger_entries_immutable` and `trg_contractor_payment_allocations_immutable` (`BEFORE UPDATE OR DELETE`, raise `IMMUTABLE_RECORD`);
  - `trg_contractor_payments_guard` (no delete; update only `active → reversed` with the three reversal columns set and every other column unchanged);
  - `trg_contractor_settlements_guard` (no delete; update only sets the three reopen columns once, every other column unchanged);
  - `contractor_payment_allocations_guard()` + `trg_contractor_payment_allocations_guard` (`BEFORE INSERT OR UPDATE`): locks the batch `FOR UPDATE`, refuses non-completed / other-contractor batches, sums allocations **joined to `contractor_payments` with `status = 'active'`** excluding `new.id`, raises `OVER_ALLOCATED:<batch_number>` above `labour_cost`.

  Names are exact. The cleanup script (T041) disables by name exactly the four triggers that block deletes: `trg_contractor_ledger_entries_immutable`, `trg_contractor_payment_allocations_immutable`, `trg_contractor_payments_guard`, `trg_contractor_settlements_guard`. The fifth, `trg_contractor_payment_allocations_guard` (the over-allocation guard), fires only on insert/update and is never disabled.
- [X] T004 In the same migration, create `contractor_settled_until` and the six write functions per the "Functions" section of data-model.md: `record_contractor_payment`, `reverse_contractor_payment`, `record_contractor_opening_balance`, `record_contractor_adjustment`, `settle_contractor_period`, `reopen_contractor_settlement`. Each must:
  - lock the `contractors` row `FOR UPDATE` **before** reading `contractor_settled_until`, any figure, unpaid amount, existing opening balance or earliest entry (data-model.md, "Locking rules" 2–3);
  - take `p_today date` where listed and never call `current_date`;
  - in `record_contractor_payment`, reject duplicate batch ids, lock distinct batches `order by id for update`, validate every allocation before any insert, then insert payment → allocations → one debit entry;
  - in `reverse_contractor_payment`, lock contractor → payment → its batches (by id), and refuse on `payment_date <= settled_until` and on `p_today <= settled_until`;
  - in `settle_contractor_period`, compute the four figures with the SQL in data-model.md, and raise `SETTLEMENT_BALANCE_NOT_ZERO:<closing>` unless `p_confirm_nonzero`;
  - raise exactly the codes listed in [contracts/server-actions.md](./contracts/server-actions.md).
- [X] T005 In the same migration, `create or replace function complete_production_batch` with the **0010 signature unchanged**: copy the 0010 body verbatim, then apply only the three changes in data-model.md (lock contractor before batch + `BATCH_CONTRACTOR_CHANGED`; `PERIOD_SETTLED` check after the existing validations; insert the earning credit after the `update production_batches`). Then add the backfill `insert … select` for completed batches without an earning. Before marking done, diff the new function against 0010's and confirm the only differences are:
  - two new `declare` entries, `v_contractor_id uuid` and `v_settled_until date`;
  - the pre-lock lookup `select contractor_id into v_contractor_id from production_batches where id = p_id` (no lock), with the `NOT_FOUND` check moved onto it from 0010's locked read;
  - the three changes above.

  Anything else in the diff is a copying mistake.
- [X] T006 Hand **only** `0011_labour_commission_ledger.sql` to the user to apply in the Supabase SQL editor (they apply migrations manually). 0001–0010 are already live: 0010 was applied 2026-09-24 and re-verified 2026-09-29 (its three tables and six functions are present), so never ask for them to be reapplied. Then verify on live with **real selects** (GET with `select=*&limit=0`, never HEAD counts) that all four tables exist. (The redefined `complete_production_batch` is exercised end to end in T042.)
- [X] T007 [P] Create `lib/contractor-ledger/schema.ts`: Zod schemas and inferred types for `ContractorPaymentInput` (with `allocations: { batchId, amount }[]`, no duplicate `batchId`, Σ ≤ `amount`), `ReversePaymentInput`, `OpeningBalanceInput` (`direction: 'owed' | 'advance'`), `AdjustmentInput` (`type: 'credit' | 'debit'`, reason required), `SettleInput` (`confirmNonZero`), `ReopenSettlementInput`. Amounts > 0 and rounded to 2 dp; dates `YYYY-MM-DD` and `isNotAfterTodayInPakistan()`. Also export the read types from contracts/ (`KhataRow`, `ContractorKhata`, `BatchPaymentStatus`, `ContractorPaymentItem`, `SettlementItem`, `SettlementPreview`, `SettlementStatement`).
- [X] T008 Create `lib/contractor-ledger/service.ts` (`server-only`) skeleton (depends on T007):
  - error classes and `toFriendlyContractorLedgerError` mapping every code in contracts/ (parse `CODE:<value>` suffixes the way `toFriendlyBatchError` does), including `SettlementBalanceNotZeroError` carrying the amount;
  - `fetchContractorEntries(contractorId)` ordered by `entry_date, created_at` (009 order), and a `signed(entry)` helper (credit +, debit −);
  - `round2` imported from `lib/production-batches/service.ts` (don't duplicate).
- [X] T009 [P] In `lib/production-batches/service.ts`, extend `toFriendlyBatchError` with `PERIOD_SETTLED:<date>` → `ContractorPeriodSettledError` ("This contractor is settled up to {date}. Use a completion date after {date}, or reopen that settlement.") and `BATCH_CONTRACTOR_CHANGED` → "This batch's contractor was just changed. Reload and try again." (contracts/, "Changed actions").
- [X] T010 [P] In `app/actions/production-batches.ts`, make `completeProductionBatch` also `revalidatePath('/contractors')` and `/contractors/{contractorId}` (read the contractor id from the batch before or after the call).

**Checkpoint**: Migration applied; schemas, service skeleton and error mapping ready.

---

## Phase 3: User Story 1 - See what each contractor has earned and is owed (Priority: P1) 🎯 MVP

**Goal**: Completed batches appear automatically in a per-contractor khata with running balance
and per-batch paid status; the contractors list shows balances.

**Independent Test**: Complete two batches (Rs 15,000 and Rs 9,000) for one contractor; the khata
shows two earnings dated on completion and Rs 24,000 owed; both batches Unpaid; the list shows
Rs 24,000 (quickstart §1).

- [X] T011 [US1] In `lib/contractor-ledger/service.ts`, add the reads `listContractorBalances()`, `getContractorKhata(contractorId, { from?, to? })` (running balance over **all** entries first, then filter; `broughtForward` = balance before `from`; description resolves batch numbers for `production_batch` rows), `listContractorBatchesWithPaymentStatus(contractorId)` and `getBatchPaymentStatus(batchId)` (paid = Σ allocations of **active** payments; status Unpaid / Part-paid / Paid per data-model.md "Derived values").
- [X] T012 [P] [US1] Create `components/contractor-ledger/khata-table.tsx`: columns Date, Description, Reference (batch link / payment), Earned / owed up, Paid / owed down, Balance; a brought-forward first row when filtered; balances below zero shown as "Rs X advance".
- [X] T013 [P] [US1] Create `components/contractor-ledger/batch-payment-status-table.tsx`: batch number (link to `/production-batches/{id}`), completion date, labour cost, paid, unpaid, status badge. Reusable with a single row for the batch page.
- [X] T014 [US1] Create `app/(dashboard)/contractors/[contractorId]/page.tsx` and `loading.tsx` (depends on T011–T013): contractor name, phone, status, current balance ("owed" / "advance"); a from/to date filter via GET `searchParams` (like 009's ledger page); `KhataTable`; a "Batches" section with `BatchPaymentStatusTable`; placeholder areas for payments and settlements filled in by later stories. `notFound()` for an unknown id.
- [X] T015 [US1] Extend `app/(dashboard)/contractors/page.tsx` and `components/contractors/contractor-list.tsx`: fetch `listContractorBalances()` in the page; add a Balance column ("Rs X owed" / "Rs X advance" / "—"); link the name to `/contractors/{id}`; in the deactivate `window.confirm`, append "Current balance: Rs X owed/advance." when non-zero (FR-031). Keep the existing Edit link.
- [X] T016 [US1] Extend `app/(dashboard)/production-batches/[batchId]/page.tsx`: for completed batches, a "Labour payment" section using `getBatchPaymentStatus` and `BatchPaymentStatusTable`, plus the list of linked payments (date, amount, active/reversed) and a link to the contractor's khata (FR-006).

**Checkpoint**: US1 is fully usable; khata is read-only so far.

---

## Phase 4: User Story 2 - Record a cash payment covering one or more batches (Priority: P1)

**Goal**: One cash payment linked to several batches with per-batch amounts and an optional
unlinked remainder; never over-pays a batch, even under simultaneous submissions.

**Independent Test**: Pay PB-0001 (15,000) and PB-0002 (9,000) with one Rs 30,000 payment; both
Paid, Rs 6,000 unlinked, balance Rs 6,000 advance (quickstart §2).

- [X] T017 [US2] In `lib/contractor-ledger/service.ts`, add `listPayableBatches(contractorId)` (completed, unpaid > 0, with completion date), `listContractorPayments(contractorId)` (allocations with batch numbers, unlinked amount, status, reversal details) and `recordContractorPaymentRecord(input, userId)` calling `record_contractor_payment` with `p_allocations` as `[{ batch_id, amount }]` and `p_today: todayInPakistan()`.
- [X] T018 [US2] Create `app/actions/contractor-ledger.ts` with `recordContractorPayment` (contracts/): `requireCurrentUser`, parse, call, revalidate `/contractors`, `/contractors/{id}` and each linked `/production-batches/{batchId}`.
- [X] T019 [P] [US2] Create `components/contractor-ledger/payment-form.tsx` (react-hook-form + zod, like `components/customer-payments/customer-payment-form.tsx`): payment date (default today in Pakistan), a checklist of payable batches **filtered to completion date ≤ chosen date**, ticking pre-fills the amount with the unpaid amount (editable, ≤ unpaid), a total field that defaults to the sum of ticked amounts and can be raised, a live "Unlinked (advance)" figure, note; shows server errors verbatim.
- [X] T020 [US2] Create `app/(dashboard)/contractors/[contractorId]/payments/new/page.tsx` (depends on T017–T019); allowed for inactive contractors too (US2-8).
- [X] T021 [US2] Create `components/contractor-ledger/payment-list.tsx` (read-only for now: date, amount, batches with amounts, unlinked, note, status) and add it plus a "Record payment" link to the khata page.

**Checkpoint**: US1 + US2 cover the day-to-day khata.

---

## Phase 5: User Story 3 - Record the opening balance at go-live (Priority: P1)

**Goal**: One opening balance per contractor in either direction, first in time, never after a
current settlement.

**Independent Test**: New contractor, opening Rs 12,000 owed → first row, balance 12,000; a
12,000 unlinked payment → 0 (quickstart §3).

- [X] T022 [US3] In `lib/contractor-ledger/service.ts`, add `recordContractorOpeningBalanceRecord` and a read `getOpeningBalanceState(contractorId)` (has opening? has current settlement? earliest entry date) for showing/hiding the action; in `app/actions/contractor-ledger.ts`, add `recordContractorOpeningBalance`.
- [X] T023 [P] [US3] Create `components/contractor-ledger/opening-balance-form.tsx`: direction radio ("Owed to contractor" / "Advance already given"), amount, date (max = the earliest entry date when there is one, and today).
- [X] T024 [US3] Create `app/(dashboard)/contractors/[contractorId]/opening-balance/page.tsx`; on the khata page show "Record opening balance" only when none exists; when a current settlement exists, show instead the note "Opening balance can no longer be recorded; post an adjustment" (FR-020).

**Checkpoint**: All P1 stories done — Excel khatas can be carried over.

---

## Phase 6: User Story 4 - Correct mistakes: reverse a payment, or post an adjustment (Priority: P2)

**Goal**: Reversal with reason (frees its batches), and adjustments up or down with reason.

**Independent Test**: Reverse a Rs 9,000 payment → reversed, offsetting row, batch back to Unpaid,
balance restored; re-pay the batch in full → accepted; post a Rs 500 deduction (quickstart §4).

- [X] T025 [US4] In `lib/contractor-ledger/service.ts`, add `reverseContractorPaymentRecord` and `recordContractorAdjustmentRecord` (both pass `p_today`); in `app/actions/contractor-ledger.ts`, add `reverseContractorPayment` (also revalidates the payment's batches) and `recordContractorAdjustment`.
- [X] T026 [US4] In `components/contractor-ledger/payment-list.tsx`, add a per-row "Reverse" control for active payments: an inline reason field + confirm button (not `window.confirm`); show reversed payments greyed with reason, date and user.
- [X] T027 [P] [US4] Create `components/contractor-ledger/adjustment-form.tsx`: "Increase amount owed" / "Decrease amount owed (deduction)", amount, date (default today), required reason.
- [X] T028 [US4] Create `app/(dashboard)/contractors/[contractorId]/adjustments/new/page.tsx` and add a "Post adjustment" link on the khata page.

**Checkpoint**: Mistakes can be corrected without editing history.

---

## Phase 7: User Story 5 - Settle a period and print the statement (Priority: P2)

**Goal**: Freeze a period's figures, lock its dates (including batch completion), print a
statement.

**Independent Test**: Settle up to D2; payment dated ≤ D2 refused, after D2 accepted; completion
dated ≤ D2 refused; print shows matching figures (quickstart §5).

- [X] T029 [US5] In `lib/contractor-ledger/service.ts`, add `getSettlementPreview(contractorId, periodEnd)` (same formula as data-model.md step 4, in TypeScript), `listContractorSettlements(contractorId)`, `settleContractorPeriodRecord` and `getSettlementStatement(settlementId)` (period rows with running balance, recomputed totals, `matchesFrozen`); in `app/actions/contractor-ledger.ts`, add `settleContractorPeriod`.
- [X] T030 [P] [US5] Create `components/contractor-ledger/settle-form.tsx`: period start (read-only), end date (default today, ≥ start, ≤ today), live preview of opening / earned / paid / adjustments / closing, note; on `SettlementBalanceNotZeroError` show the closing balance and a "Settle anyway" button that resubmits with `confirmNonZero: true` (010 returned-weight pattern).
- [X] T031 [US5] Create `app/(dashboard)/contractors/[contractorId]/settlements/new/page.tsx`; when there is nothing to settle, show the reason instead of the form.
- [X] T032 [P] [US5] Create `components/contractor-ledger/settlement-list.tsx` (period, the five figures, settled by/at, current/reopened badge, print link) and add it plus a "Settle" link to the khata page.
- [X] T033 [P] [US5] Create `components/contractor-ledger/settlement-print-view.tsx`: contractor name and phone, period, opening, rows with running balance, totals, closing, signature lines for "MA Textile" and the contractor; a warning banner if `!matchesFrozen`; print CSS like the existing print views.
- [X] T034 [US5] Create `app/contractors/[contractorId]/settlements/[settlementId]/print/page.tsx` outside `(dashboard)` with its own `getCurrentUser()` / `redirect('/login')`, mirroring `app/customers/[customerId]/ledger/print/page.tsx` (ADR-0006); `notFound()` if the settlement doesn't belong to the contractor.
- [X] T035 [US5] Confirm the batch complete form (`components/production-batches/batch-complete-form.tsx`) shows `ContractorPeriodSettledError`'s message as a normal form error (US5-4); adjust only if it doesn't.

**Checkpoint**: Formal settlements work end to end.

---

## Phase 8: User Story 6 - Reopen the latest settlement (Priority: P3)

**Goal**: Reopen only the most recent current settlement, with reason, kept for audit.

**Independent Test**: Settle, reopen with reason, record an entry inside the period, settle again;
two records for the period (quickstart §6).

- [X] T036 [US6] In `lib/contractor-ledger/service.ts` and `app/actions/contractor-ledger.ts`, add `reopenContractorSettlementRecord` / `reopenContractorSettlement`.
- [X] T037 [US6] In `components/contractor-ledger/settlement-list.tsx`, add a "Reopen" control (inline reason + confirm) on the latest current settlement only; show reopen reason/by/at on reopened rows.
- [X] T038 [US6] In `components/contractor-ledger/settlement-print-view.tsx`, add the "REOPENED — NOT VALID" banner for reopened settlements (FR-030).

**Checkpoint**: All six user stories complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T039 Run `npm run lint` and `npm run build`; fix every error and warning introduced by this feature. Don't touch unrelated files.
- [X] T040 Create `specs/011-labour-commission-ledger/qa/seed-and-race-qa-011.mts` (run with `tsx`, `--conditions=react-server` and the project tsconfig, the 010 live-QA pattern), calling the service-layer functions directly:
  - seeds only rows tagged with the `QA-011 ` prefix (contractor `name`, supplier `company_name`, product `name`; the lot belongs to the QA supplier), completes batches, and prints the row count created per table (informational only; T041 counts for itself);
  - runs the quickstart §7 races: two simultaneous payments against one batch (10 runs) and payment vs settlement (10 runs, reopening between runs), asserting the outcomes listed there;
  - runs the §8 reconciliation query and reports pass/fail per check.
- [X] T041 Create `specs/011-labour-commission-ledger/qa/cleanup-qa-011.sql` per research.md ("race tests run on live Supabase"): one transaction, with no values to fill in, that:
  - first **counts at run time** the QA-scoped rows in every table it will delete from (scope: contractors with `name like 'QA-011 %'`, suppliers with `company_name like 'QA-011 %'` and their lots, products with `name like 'QA-011 %'`, and everything hanging off them), saves the counts in a temp table and prints them with `raise notice`. No pasted counts: T042's UI pass adds rows that T040 never saw;
  - `disable trigger`s exactly these four and no others: `trg_contractor_ledger_entries_immutable`, `trg_contractor_payment_allocations_immutable`, `trg_contractor_payments_guard`, `trg_contractor_settlements_guard`. It never touches `trg_contractor_payment_allocations_guard`;
  - deletes QA rows children-first (allocations → ledger entries → settlements → payments → QA batches' `inventory_movements` → `recompute_product_quantity_on_hand` → `production_batches` → QA lot, product, supplier rows → QA contractors), raising if any delete's row count ≠ that table's count from the start;
  - re-enables the same four triggers, runs the zero-residue queries, and **ends in `rollback`** (a comment says to change it to `commit` only after the dry run passes).
- [X] T042 With the user, run the full [quickstart.md](./quickstart.md) §1–§8 on live Supabase (UI in a signed-in browser + T040 script), tick each item, and fix any failure in the relevant task's files before marking done. **Every row created through the UI must carry the `QA-011 ` prefix**: every contractor name (`QA-011 Rashid`, `QA-011 Kamal`, `QA-011 Naveed`, `QA-011 Imran`, `QA-011 Advance`, `QA-011 Empty`), the supplier's company name and the product name. The QA lot goes only under the QA supplier. No QA data under a real contractor, supplier or product, ever: ledger entries, payments and settlements can't be deleted except by T041, and T041 finds rows only by this prefix. Before T043, do quickstart §9's untagged-row check.
- [X] T043 Run cleanup per quickstart §9: dry run (ends in `rollback`; QA rows still present; direct `update` on `contractor_ledger_entries` still refused), then the real run with `commit`; verify zero residue and that the triggers are enabled again; reset `production_batch_number_seq` if needed.
- [X] T044 [P] Update `specs/PRODUCT-OVERVIEW.md`: set the Module Roadmap row for 011 to "Implemented" and note that contractor payments are cash-only with period settlements (ADR-0010).

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T010)**; T006 (migration applied) gates all stories.
- **US1 (T011–T016)** → **US2 (T017–T021)**: the payment list and paid status live on the khata page.
- **US3 (T022–T024)** needs only Foundational + the khata page (T014); can run alongside US2.
- **US4 (T025–T028)** needs US2 (payments to reverse).
- **US5 (T029–T035)** needs US1; best after US2–US4 so every entry type is on the statement.
- **US6 (T036–T038)** needs US5.
- **Polish (T039–T044)** after all stories; T040 → T041 → T042 → T043.

### Within-phase ordering notes

- T002 → T003 → T004 → T005 all edit the one migration file: strictly sequential.
- `lib/contractor-ledger/service.ts` is appended to by T008, T011, T017, T022, T025, T029, T036 — one at a time.
- `app/actions/contractor-ledger.ts` is created in T018 and appended to by T022, T025, T029, T036 — one at a time.
- The khata page (T014) is touched again by T021, T024, T028, T032 — one at a time.
- `payment-list.tsx` (T021 → T026) and `settlement-list.tsx` (T032 → T037), `settlement-print-view.tsx` (T033 → T038): sequential.

### Parallel opportunities

- Foundational: T007, T009, T010 in parallel once T001 exists (different files); T008 after T007.
- US1: T012 and T013 in parallel with T011.
- US2: T019 in parallel with T017/T018.
- US3: T023 in parallel with T022.
- US4: T027 in parallel with T025/T026.
- US5: T030, T032, T033 in parallel after T029.
- Polish: T044 any time after the stories.

## Parallel Example: User Story 5

```text
# After T029 (service + action):
Task: "T030 [US5] settle-form.tsx"
Task: "T032 [US5] settlement-list.tsx + khata link"
Task: "T033 [US5] settlement-print-view.tsx"
# Then: T031 (settle page), T034 (print route), T035 (complete-form error check)
```

## Implementation Strategy

### MVP first

1. Phases 1–2 (migration written, applied by the user, verified).
2. Phase 3 (US1): earnings post automatically and every contractor's balance is visible. **Stop and
   validate** with quickstart §1 — this alone replaces reading the Excel khata.

### Incremental delivery

- US2 + US3 complete the P1 scope: payments and go-live balances, so the Excel files can be retired.
- US4 adds corrections; US5 adds settlements and printing; US6 adds the reopen escape hatch.
- Live QA (T040–T043) runs once at the end, with a dry-run-first cleanup.
