---

description: "Task list for Customer Ledger implementation"
---

# Tasks: Customer Ledger

**Input**: Design documents from `/specs/009-customer-ledger/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001-008). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3, US4 = P4, US5 = P5) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1-US5)

## Path Conventions

Single Next.js project at repository root. This feature adds two new modules
(`lib/customer-payments/*`, `lib/customer-ledger/*`), one new dashboard route tree, two standalone
print routes (ADR-0006), and this project's first two Route Handlers (ADR-0007) — it makes **no**
changes to 005/007/008's existing routes or services beyond one small link added to the existing
customer detail page:

- `supabase/migrations/0009_customer_ledger.sql` — new migration file
- `lib/customer-payments/{schema.ts, service.ts}` — new module
- `lib/customer-ledger/{types.ts, service.ts, ageing.ts, csv.ts}` — new module
- `app/actions/customer-payments.ts` — new Server Actions file
- `components/customer-payments/{customer-payment-form.tsx, payment-status-actions.tsx}` — new components
- `components/customer-ledger/{ledger-table.tsx, ledger-date-filter.tsx, ageing-summary.tsx, ledger-summary-list.tsx, ledger-print-view.tsx, ledger-summary-print-view.tsx}` — new components
- `app/(dashboard)/customers/[customerId]/ledger/**`, `app/(dashboard)/customers/[customerId]/payments/new/**`, `app/(dashboard)/customer-ledger/**` — new routes
- `app/customers/[customerId]/ledger/print/page.tsx`, `app/customer-ledger/print/page.tsx` — new standalone routes, outside `(dashboard)`
- `app/api/customer-ledger/route.ts`, `app/api/customer-ledger/[customerId]/route.ts` — new Route Handlers (ADR-0007)
- `app/(dashboard)/customers/[customerId]/page.tsx`, `app/(dashboard)/layout.tsx` — extended (one link each)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001-008 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0009_customer_ledger.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, both Postgres functions every payment-related user story depends on, and the shared TypeScript types.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 In `supabase/migrations/0009_customer_ledger.sql` per [data-model.md](./data-model.md): create `customer_payments` (`customer_id` FK to `customers(id)` no cascade, `payment_date date`, `amount numeric(12,2) check > 0`, `cheque_number text check <> ''`, `bank_name text check <> ''`, `status text default 'received' check in ('received','cleared','bounced')`, `reference_type text check is null or in ('customer_po','performa_invoice')`, `reference_id uuid` no FK, `constraint customer_payments_reference_pair check ((reference_type is null) = (reference_id is null))`, `created_at`/`created_by`, nullable `status_changed_at`/`status_changed_by` — **no** `updated_at`/`updated_by`/update trigger, `idx_customer_payments_customer_date` index); RLS enabled with no policies
- [X] T003 In the same migration file per [data-model.md](./data-model.md): create `record_customer_payment(p_customer_id, p_payment_date, p_amount, p_cheque_number, p_bank_name, p_reference_type, p_reference_id, p_user_id) returns uuid` — raises `CUSTOMER_NOT_FOUND` unless the customer exists; if `p_reference_type` is not null, validates the referenced `customer_pos`/`performa_invoices` row exists and belongs to `p_customer_id`, raising `REFERENCE_NOT_FOUND`/`REFERENCE_WRONG_CUSTOMER`; inserts the `customer_payments` row (`status = 'received'`); inserts one `ledger_entries` debit row (`source_type = 'payment'`, `source_id` = the new payment's id, `description = 'Cheque ' || p_cheque_number || ' received'`); returns the new id (depends on T002)
- [X] T004 In the same migration file per [data-model.md](./data-model.md): create `update_customer_payment_status(p_id, p_new_status, p_user_id) returns void` — `select ... for update` the target row (row-level exclusive lock, closes the concurrent-status-change race), raises `PAYMENT_NOT_FOUND` if missing, raises `PAYMENT_STATUS_FINAL: this payment is already %` unless current status is `received`, raises `INVALID_STATUS: % is not a valid target status` unless `p_new_status in ('cleared', 'bounced')` — a DB-level guard independent of the calling Zod schema, closing the gap where a direct RPC call with `p_new_status = 'received'` would otherwise silently no-op-reset `status_changed_at`/`status_changed_by` (`/sp.analyze` finding U1); updates `status`/`status_changed_at = now()`/`status_changed_by`; when `p_new_status = 'bounced'`, additionally inserts one `ledger_entries` credit row (`entry_date = current_date`, **not** the original payment's date, `source_type = 'payment_reversal'`, `source_id = p_id`, `description = 'Cheque ' || cheque_number || ' bounced — reversal'`); `cleared` posts no further ledger effect (depends on T002)
- [X] T005 [P] Create `lib/customer-payments/schema.ts`: `customerPaymentInputSchema` (Zod — `customerId` uuid, `paymentDate`, `amount` positive number, `chequeNumber`/`bankName` non-empty, `referenceType`/`referenceId` both-or-neither via `superRefine`), `updateCustomerPaymentStatusInputSchema` (`id` uuid, `newStatus` enum `'cleared' | 'bounced'`), and TS types `CustomerPaymentInput`, `CustomerPaymentStatusUpdateInput` per [contracts/server-actions.md](./contracts/server-actions.md)
- [X] T006 [P] Create `lib/customer-ledger/types.ts`: shared TS types `CustomerLedgerRow` (incl. optional `paymentStatus`), `CustomerLedgerView`, `CustomerAgeingView`, `CustomerLedgerSummary` per [contracts/server-actions.md](./contracts/server-actions.md), used across `service.ts`/`ageing.ts`/`csv.ts`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - View a customer's running-balance ledger (Priority: P1) 🎯 MVP

**Goal**: Staff can open a single customer's ledger and see every posted entry (opening balance, Challan/Performa Invoice credits, payment debits) listed chronologically with a running balance and PO Number/description columns, matching the manual Excel layout, plus a date-range filter.

**Independent Test**: Open a customer with an opening balance and at least one Challan or Performa Invoice credit, and confirm every entry appears in date order with correct Debit/Credit columns and a running balance correct after each row, including a multi-PO Performa Invoice row showing all covered PO numbers joined (spec Acceptance Scenarios 1-5 for User Story 1).

### Implementation for User Story 1

- [X] T007 [US1] Implement `getCustomerLedger(customerId, filters?: { from?, to? })` in `lib/customer-ledger/service.ts` per [data-model.md](./data-model.md): fetches the customer (`getCustomer`, 005) and all matching `ledger_entries` ordered `entry_date asc, created_at asc`; groups `source_id`s by `source_type` and issues one batched query per group — `'challan'` → `challans.po_id → customer_pos.po_number`; `'performa_invoice'` → `performa_invoices` joined through `performa_invoice_lines → customer_po_lines → customer_pos`, de-duplicated and joined `" / "`; `'payment'`/`'payment_reversal'` → `customer_payments` for cheque number/bank (description is already stored on `ledger_entries.description` for every source type, no join needed for it); `'opening_balance'` needs no join — computes each row's running balance (credit adds, debit subtracts) over **all** entries first, then narrows the *returned* `rows` to the `from`/`to` filter so the balance still reflects everything before the filter's start (FR-001, FR-002, FR-003, FR-010); returns `null` if the customer doesn't exist
- [X] T008 [P] [US1] Create `components/customer-ledger/ledger-table.tsx`: renders `CustomerLedgerRow[]` as Date/Description/PO Number/Debit/Credit/Balance columns (depends on T006)
- [X] T009 [P] [US1] Create `components/customer-ledger/ledger-date-filter.tsx`: a plain `method="GET"` from/to date-range form (server round trip, matching 008's own preference over client-side fetching, research.md) (depends on T006)
- [X] T010 [US1] Create `app/(dashboard)/customers/[customerId]/ledger/page.tsx` and `loading.tsx`: Server Component reading `searchParams: Promise<{ from?, to? }>`, calling `getCustomerLedger`, rendering the customer's name, current balance prominently (FR-003), `LedgerDateFilter`, and `LedgerTable`; not-found state if `null` (depends on T007, T008, T009)
- [X] T011 [P] [US1] Add a "View full ledger" link on `app/(dashboard)/customers/[customerId]/page.tsx` (005's existing customer detail page) alongside its existing "Running ledger balance" display, pointing at `/customers/[customerId]/ledger` — no change to that page's own data fetch (depends on T010)

**Checkpoint**: User Story 1 is fully functional and independently testable — a customer's complete running-balance ledger can be viewed, correctly attributed and filtered. This is the MVP.

---

## Phase 4: User Story 2 - Record a customer payment (cheque) (Priority: P2)

**Goal**: Staff can record a payment (date, amount, cheque number, bank name, optional invoice/PO reference) against a customer, immediately posting a Debit ledger entry and reducing their balance.

**Independent Test**: Record a payment against a customer with an outstanding balance, and confirm it saves with status Received, exactly one new Debit ledger entry equal to the amount appears, and the balance decreases accordingly; confirm an untied lump-sum payment (no reference) also saves successfully (spec Acceptance Scenarios 1-6 for User Story 2).

### Implementation for User Story 2

- [X] T012 [US2] Implement `recordCustomerPaymentRecord(input: CustomerPaymentInput): Promise<{ id: string }>` in `lib/customer-payments/service.ts` — calls `record_customer_payment` (T003), translating `CUSTOMER_NOT_FOUND`/`REFERENCE_NOT_FOUND`/`REFERENCE_WRONG_CUSTOMER` into friendly `Error`s matching `toFriendlyChallanError`'s pattern in `lib/challans/service.ts` (depends on T003, T005)
- [X] T013 [P] [US2] Implement `recordCustomerPayment` Server Action in `app/actions/customer-payments.ts` — `requireCurrentUser()` (FR-013), Zod validation with `customerPaymentInputSchema`, calls `recordCustomerPaymentRecord`, `revalidatePath` the customer's ledger page, matching the shape of `app/actions/performa-invoices.ts` (depends on T012)
- [X] T014 [P] [US2] Create `components/customer-payments/customer-payment-form.tsx`: `react-hook-form` + `zodResolver` — date (default today), amount, cheque number, bank name inputs, and an optional reference picker (a PO via `listCustomerPOs({ customerId, status: 'open' })`, 006, or a Performa Invoice via a `listPerformaInvoices({ customerId })`-style filter, 008, both already exported), defaulting to no reference (depends on T005)
- [X] T015 [US2] Create `app/(dashboard)/customers/[customerId]/payments/new/page.tsx`: customer pre-selected via the route param, renders `CustomerPaymentForm` wired to the `recordCustomerPayment` Server Action (depends on T013, T014)
- [X] T016 [P] [US2] Add a "Record Payment" link on the customer ledger page (`app/(dashboard)/customers/[customerId]/ledger/page.tsx`, T010) pointing at `.../payments/new` (depends on T010, T015)

**Checkpoint**: User Stories 1 AND 2 both work — a payment can be recorded and its Debit entry is immediately visible on the customer's ledger, correctly reducing the balance.

---

## Phase 5: User Story 3 - Reverse a bounced cheque (Priority: P3)

**Goal**: Staff can mark a Received payment as Bounced, immediately posting a new, separately visible Credit entry equal to the original amount, dated to today, restoring the customer's balance, without ever editing the original Debit entry.

**Independent Test**: Take a payment recorded with status Received, mark it Bounced, and confirm its status updates, a new Credit ledger entry equal to the original amount appears (dated today, not the original payment date), the original Debit entry is unchanged, and the balance is restored; confirm a second status change on the same payment is rejected (spec Acceptance Scenarios 1-5 for User Story 3).

### Implementation for User Story 3

- [X] T017 [US3] Implement `updateCustomerPaymentStatusRecord(input: CustomerPaymentStatusUpdateInput): Promise<void>` in `lib/customer-payments/service.ts` — calls `update_customer_payment_status` (T004), translating `PAYMENT_NOT_FOUND`/`PAYMENT_STATUS_FINAL`/`INVALID_STATUS` into friendly `Error`s (depends on T004, T005)
- [X] T018 [P] [US3] Implement `updateCustomerPaymentStatus` Server Action in `app/actions/customer-payments.ts` — `requireCurrentUser()`, Zod validation with `updateCustomerPaymentStatusInputSchema`, calls `updateCustomerPaymentStatusRecord`, `revalidatePath` the customer's ledger page (depends on T017)
- [X] T019 [US3] Extend `getCustomerLedger` (`lib/customer-ledger/service.ts`, T007) — for rows where `sourceType === 'payment'`, additionally resolve and include that payment's current `status` as `paymentStatus`, plus `createdAt`/`createdBy` (always) and `statusChangedAt`/`statusChangedBy` (once set), all from the same batched `customer_payments` join T007 already performs for cheque number/bank — no new query — per [contracts/server-actions.md](./contracts/server-actions.md)'s updated row shape; the latter four fields satisfy FR-014's "record and display" requirement (`/sp.analyze` finding G1) (depends on T007)
- [X] T020 [P] [US3] Create `components/customer-payments/payment-status-actions.tsx`: "Mark Cleared"/"Mark Bounced" buttons calling `updateCustomerPaymentStatus`, rendered only when the row's `paymentStatus === 'received'` (depends on T018)
- [X] T021 [US3] Wire `PaymentStatusActions` into `components/customer-ledger/ledger-table.tsx` (T008), rendered inline on any row where `sourceType === 'payment'`; on that same row, also render `createdAt`/`createdBy` and, when present, `statusChangedAt`/`statusChangedBy` as a small tooltip or expandable detail (e.g. "Recorded 2026-09-20 by <user> · Marked Bounced 2026-09-23 by <user>") — the actual display half of FR-014, not just the stored columns from T002 (`/sp.analyze` finding G1) (depends on T008, T019, T020)

**Checkpoint**: User Stories 1, 2, AND 3 all work — a payment can be recorded, viewed, and bounced, with the ledger correctly showing both the original Debit and the reversing Credit as separate, immutable rows.

---

## Phase 6: User Story 4 - See ageing and overdue status across a customer's balance (Priority: P4)

**Goal**: Staff can view a customer's outstanding ledger entries classified as within or beyond that customer's expected payment-terms range, purely informationally.

**Independent Test**: Take a customer with a known payment-terms range and an outstanding credit entry older than that range's maximum, and confirm it's classified beyond the expected range while a more recent one is classified within it; confirm nothing about recording a payment or viewing the ledger is blocked or altered by this classification (spec Acceptance Scenarios 1-3 for User Story 4).

### Implementation for User Story 4

- [X] T022 [US4] Implement `getCustomerAgeing(customerId): Promise<CustomerAgeingView>` in `lib/customer-ledger/ageing.ts` — runs the FIFO (oldest-credit-first) allocation exactly as specified in [research.md](./research.md)'s pseudocode over the customer's `ledger_entries` (reusing `getCustomerLedger`'s underlying fetch rather than a duplicate query where practical), classifying each still-open credit's remaining amount as within/beyond `payment_terms_max_days` **only** — `payment_terms_min_days` is never read or used by this function (depends on T007)
- [X] T023 [P] [US4] Create `components/customer-ledger/ageing-summary.tsx`: lists each open entry's date/remaining amount/within-or-beyond classification plus the total overdue amount, styled as plain informational content — no error/warning visual treatment (FR-009); additionally renders a static context label next to each open entry using the customer's `paymentTermsMinDays`/`paymentTermsMaxDays` (already returned by `getCustomerLedger`'s `customer` object, T007) — e.g. "Expected within 15-30 days" — purely presentational, with no role in the within/beyond classification itself (`/sp.analyze` finding A1; resolves FR-009's reworded min-days-is-context-only wording)
- [X] T024 [US4] Wire `AgeingSummary` into `app/(dashboard)/customers/[customerId]/ledger/page.tsx` (T010), calling `getCustomerAgeing` alongside `getCustomerLedger` (depends on T010, T022, T023)

**Checkpoint**: User Stories 1-4 all work — a customer's ledger view now also shows their ageing breakdown.

---

## Phase 7: User Story 5 - View and export a summary across all customers (Priority: P5)

**Goal**: Staff can see every customer's current balance and overdue amount in one all-customers list, and export either a single customer's ledger or the all-customers summary to PDF or CSV.

**Independent Test**: Open the all-customers summary and confirm each customer's balance/overdue amount match their individual ledger/ageing views; export a customer's ledger and the all-customers summary and confirm both match what's on screen, including active filters (spec Acceptance Scenarios 1-2 for User Story 5).

### Implementation for User Story 5

- [X] T025 [US5] Implement `listCustomerLedgerSummaries(): Promise<CustomerLedgerSummary[]>` in `lib/customer-ledger/service.ts` — iterates `listCustomers()` (005), computing `balance` via `getCustomerLedgerBalance` (`lib/customers/ledger.ts`, reused as-is) and `overdueAmount` via `getCustomerAgeing` (T022) per customer, sorted by display name (depends on T022)
- [X] T026 [P] [US5] Create `components/customer-ledger/ledger-summary-list.tsx`: table of customer display name / current balance / overdue amount (depends on T006)
- [X] T027 [US5] Create `app/(dashboard)/customer-ledger/page.tsx` and `loading.tsx`: Server Component calling `listCustomerLedgerSummaries`, rendering `LedgerSummaryList` (depends on T025, T026)
- [X] T028 [P] [US5] Add a "Ledger" link to the dashboard nav in `app/(dashboard)/layout.tsx`, pointing at `/customer-ledger`, alongside the existing Suppliers/Products/Purchases/Trade Names/Customers/Customer POs/Challans/Performa Invoices links (depends on T027)
- [X] T029 [US5] Implement `getCustomerLedgerForPrint(customerId, filters?)` in `lib/customer-ledger/service.ts` — same underlying fetch as `getCustomerLedger`, shaped for the print route (no signature/stamp images — this is a report, not a business document, research.md) per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T007)
- [X] T030 [US5] Implement `getCustomerLedgerSummaryForPrint()` in `lib/customer-ledger/service.ts` — same underlying data as `listCustomerLedgerSummaries`, shaped for its print route (depends on T025)
- [X] T031 [P] [US5] Create `components/customer-ledger/ledger-print-view.tsx`: printable per-customer ledger layout (customer name, generated-at, from/to if filtered, the row table, current balance), `@media print` rules (ADR-0006, third application)
- [X] T032 [P] [US5] Create `components/customer-ledger/ledger-summary-print-view.tsx`: printable all-customers summary layout, `@media print` rules (ADR-0006)
- [X] T033 [US5] Create `app/customers/[customerId]/ledger/print/page.tsx`: standalone route **outside** the `(dashboard)` route group with its own `getCurrentUser()`/`redirect("/login")` gate (mirroring `(dashboard)/layout.tsx`'s check, per ADR-0006), calling `getCustomerLedgerForPrint(id, { from, to })` from `searchParams` and rendering `LedgerPrintView` (depends on T029, T031)
- [X] T034 [US5] Create `app/customer-ledger/print/page.tsx`: standalone route, same auth-gate pattern, calling `getCustomerLedgerSummaryForPrint()` and rendering `LedgerSummaryPrintView` (depends on T030, T032)
- [X] T035 [US5] Create `lib/customer-ledger/csv.ts`: `renderLedgerCsv(customerDisplayName, rows)` and `renderSummaryCsv(rows)` — plain string-join CSV rendering (Date/Description/PO Number/Debit/Credit/Balance; Customer/Current Balance/Overdue Amount), no new dependency (ADR-0007) (depends on T006)
- [X] T036 [US5] Create `app/api/customer-ledger/[customerId]/route.ts`: `GET` Route Handler — `requireCurrentUser()`, parses `?from=&to=` query params, calls `getCustomerLedger`, renders via `renderLedgerCsv`, responds `text/csv` with `Content-Disposition: attachment; filename="<sanitized-customer-display-name>-ledger.csv"` — strip/replace any character outside `[A-Za-z0-9-_ ]` from `display_name` before interpolating it into the header, since `customers.display_name` has no format restriction (`/sp.analyze` finding U2); 404 if the customer doesn't exist (ADR-0007, this project's first Route Handler) (depends on T007, T035)
- [X] T037 [P] [US5] Create `app/api/customer-ledger/route.ts`: `GET` Route Handler — same auth pattern, calls `listCustomerLedgerSummaries`, renders via `renderSummaryCsv`, responds `text/csv` with `Content-Disposition: attachment; filename="customer-ledger-summary.csv"` (ADR-0007) (depends on T025, T035)
- [X] T038 [P] [US5] Add "Print" and "Export CSV" links on the customer ledger page (T010) and the all-customers summary page (T027), pointing at the new print routes and Route Handlers, preserving any active date filter as query params on the customer-ledger links (depends on T010, T027, T033, T034, T036, T037)

**Checkpoint**: All five user stories are independently functional — the full Customer Ledger feature (view, record, reverse, age, summarize, export) works end-to-end.

---

## Phase 8: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories, and manual verification of the feature's structural correctness rules — especially the concurrency/locking design and the FIFO ageing mechanism hardened during plan review.

- [X] T039 [P] Review that no Server Action, service function, or exposed Postgres function anywhere provides an update or delete path for `ledger_entries`, or for any `customer_payments` column beyond `status`/`status_changed_at`/`status_changed_by` — confirm `record_customer_payment` and `update_customer_payment_status` are the *only* two RPCs this feature ever calls (FR-008, FR-015)
- [X] T040 Verify `update_customer_payment_status`'s concurrency guarantee manually per quickstart.md: fire two concurrent status-change calls against the same Received payment → confirm exactly one succeeds and the other is rejected with `PAYMENT_STATUS_FINAL` (data-model.md's `for update` guarantee, research.md)
- [X] T041 Verify FR-006 manually: attempt to record a payment whose optional reference belongs to a different customer than the payment's own customer → confirm `ReferenceWrongCustomerError`
- [X] T042 Verify the bounce-reversal/ageing interplay manually per research.md's flagged consequence: record a payment, mark it Bounced, confirm the customer's balance is restored (matches `getCustomerLedgerBalance`) and the reversal's outstanding portion is aged from the bounce date, not the original payment date
- [X] T043 Verify FR-002/multi-PO rendering manually: open a customer's ledger with a Performa Invoice credit spanning two POs → confirm that row's PO Number column shows both, joined (e.g. "PO-10284 / PO-10291")
- [X] T044 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all five user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. Includes both Postgres functions (`record_customer_payment`, `update_customer_payment_status`) with their full, final behavior in one migration, matching 007/008's precedent of bundling every RPC for a feature into Foundational even though `update_customer_payment_status` is only *exercised end-to-end through the UI* by User Story 3.
- **User Stories (Phase 3-7)**: All depend on Foundational completion.
  - US1 has no dependency on US2-US5 and is the MVP.
  - US2 depends on US1 only for the "Record Payment" link's target page existing conceptually first (T016), but its own service/action/form/page (T012-T015) build independently against Foundational alone.
  - US3 depends on US1's `getCustomerLedger`/`ledger-table.tsx` (T007, T008) to extend rather than duplicate.
  - US4 depends on US1's `getCustomerLedger` (T007) as the data FIFO ageing walks, and on its ledger page (T010) to render into.
  - US5 depends on US4's `getCustomerAgeing` (T022) for the summary's overdue column, and on US1's `getCustomerLedger` (T007) for both print/export paths.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its own phase completes, per each story's Independent Test above.
- **Polish (Phase 8)**: Depends on all five user stories being complete.

### Parallel Opportunities

- Foundational: T005, T006 can run in parallel once T002-T004 exist (different files); T002-T004 are sequential (same migration file).
- US1: T008, T009 can run in parallel once T006 exists; T011 once T010 exists.
- US2: T013, T014 can run in parallel once T005/T012 exist.
- US3: T018, T020 can run in parallel once their own dependencies exist.
- US5: T026 can run in parallel with T025; T031, T032 can run in parallel; T037 can run in parallel with T036 once T035 exists.
- Polish: T039 can run in parallel with T040-T043.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Create ledger-table.tsx in components/customer-ledger/ledger-table.tsx"
Task: "Create ledger-date-filter.tsx in components/customer-ledger/ledger-date-filter.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — staff can view any customer's complete running-balance ledger

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → deploy/demo (MVP)
3. User Story 2 → validate independently → deploy/demo (payments post debits)
4. User Story 3 → validate independently → deploy/demo (bounce reversal)
5. User Story 4 → validate independently → deploy/demo (ageing)
6. User Story 5 → validate independently → deploy/demo (summary + export)
7. Polish phase → deploy final hardening

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- Each user story phase ends at a checkpoint where that story is independently demoable.
- Commit after each task or logical group, matching the project's small-diff convention.
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest stack from research.md if desired later.
- **T004 is the highest-risk task in this feature** — its `for update` row lock is what makes
  FR-007's "at most one status transition" guarantee hold under real concurrency, not just
  sequential "close succession." **Do not "simplify" T004 during implementation by dropping the
  `for update` lock** — research.md and data-model.md both document why it's load-bearing.
- **T022's FIFO ageing algorithm has an intentional, non-obvious consequence documented in
  research.md**: a bounced payment's reversal is aged from the bounce-discovery date, not the
  original delivery/invoice date it was indirectly offsetting. Do not "fix" this during
  implementation by trying to re-date the reversal to an earlier date — that would contradict the
  already-agreed "a reversal documents a new event" design principle (spec.md Assumptions).
- **T033/T034's standalone print routes and their duplicated auth checks** are per
  [ADR-0006](../../history/adr/0006-printed-documents-via-server-rendered-print-routes.md) — the
  third application of that ADR. Do not "simplify" this by moving either page inside `(dashboard)`.
- **T036/T037's CSV Route Handlers** are per
  [ADR-0007](../../history/adr/0007-csv-export-via-route-handler.md) — this project's first Route
  Handlers. Do not introduce an `xlsx`/spreadsheet-generation dependency here; that decision was
  explicitly evaluated and rejected in ADR-0007 for the current requirement's flat, unformatted
  tabular shape.
- **No task touches `app/(dashboard)/customer-pos/**`, `app/(dashboard)/challans/**`, or
  `app/(dashboard)/performa-invoices/**`** — this feature only reads from 006/007/008's already-
  exported functions and never modifies their own routes or services.
- **`/sp.analyze` remediation (applied before `/sp.implement`)**: T004/T017 gained the
  `INVALID_STATUS` DB-level guard (finding U1); T019/T021 gained the `createdAt`/`createdBy`/
  `statusChangedAt`/`statusChangedBy` fields and their actual on-screen display (finding G1 —
  FR-014's "display" half was previously unmet); T022/T023 and FR-009 itself were clarified so
  `payment_terms_min_days` is explicitly context-only, never part of the within/beyond
  classification (finding A1); T036 gained CSV filename sanitization (finding U2). See
  `research.md`, `data-model.md`, and `contracts/server-actions.md` for the corresponding
  artifact edits.

## Implementation Notes (post `/sp.implement`)

- **T002-T004 applied by the user** in the Supabase SQL editor after the initial implementation
  pass (this environment has no direct Postgres/DDL access — no `DATABASE_URL`, no linked
  Supabase CLI project — the same sequencing as 002/003b/004/005/006/007/008).
- **T040-T044 (live verification) — all complete, all PASS.** Run in two passes against the real
  Supabase project, via `.qa-scratch/verify.mts` (deleted after use) executed with `npx tsx
  --conditions=react-server`, which imports and calls the actual production functions
  (`recordCustomerPaymentRecord`, `updateCustomerPaymentStatusRecord`, `getCustomerLedger`,
  `getCustomerAgeing`, `listCustomerLedgerSummaries`, `renderLedgerCsv`, `sanitizeFilenamePart`)
  directly — not reimplemented logic:
  1. **DB-layer pass** (7/7 assertions PASS): seeded real prerequisite data via the actual RPCs
     (`create_supplier` → `record_unit_purchase` → `create_customer_po` → `create_challan`/
     `accept_challan` → `create_performa_invoice`, not a shortcut — traded-product stock needed a
     real purchase first, since `products.quantity_on_hand` has a `>= 0` CHECK that a first
     attempt without it correctly caught). **T040** (concurrency): one payment, two concurrent
     `update_customer_payment_status` calls (`bounced` vs. `cleared`) via `Promise.allSettled` —
     exactly one fulfilled, the other rejected with `PAYMENT_STATUS_FINAL`, confirming the
     `for update` row lock serializes them rather than racing. **T041** (cross-customer
     reference): a payment on Customer A referencing Customer B's PO was rejected with "That
     invoice/PO does not belong to this customer." **T042** (bounce/ageing interplay): an old
     Performa Invoice credit (dated 20 days before the test) was partially consumed by a payment
     (dated 10 days before), then that payment was marked Bounced — the reversal's
     `ledger_entries.entry_date` was confirmed as *today*, not the original payment date or the
     invoice date, and `getCustomerAgeing`'s output showed a fresh today-dated open entry for the
     reversed amount sitting alongside the still-separately-aged 20-day-old invoice remainder —
     exactly the FIFO/dating interplay research.md describes. **T043** (multi-PO rendering): a
     Performa Invoice covering two POs showed `poNumbers: ["ZZZQA-PO-1", "ZZZQA-PO-2"]` on its
     `getCustomerLedger` row. Plus two independent cross-checks: a raw `SUM` over `ledger_entries`
     matched `getCustomerLedger.currentBalance` exactly, and `listCustomerLedgerSummaries`'s
     balance matched the same customer's own ledger.
  2. **Live app / browser walkthrough**: signed in as a throwaway QA staff account (password
     reset via `admin.auth.admin.updateUserById` so a real login could be driven) and drove the
     actual running app end to end — the per-customer ledger view rendered all 5 seeded rows
     correctly (multi-PO row, both bounce reversals dated to today, correct running balance at
     every row); recorded a new payment live through the "Record Payment" form (including
     selecting a PO reference via the dropdown), confirming it appeared with a "Received" badge
     and Mark Cleared/Bounced buttons; clicked "Mark Cleared" and confirmed the badge updated with
     zero ledger effect (balance unchanged); the all-customers summary page listed both QA
     customers with correct balances; both print routes (`/customers/[id]/ledger/print` and
     `/customer-ledger/print`) rendered correctly, standalone, no dashboard chrome; **T044's CSV
     export with special characters** — the QA customer's display name deliberately included `&`,
     `"`, and `/` (`ZZZ QA Customer A & Co. "Textiles" / Ltd`); clicking "Export CSV" produced a
     real downloaded file named `ZZZ QA Customer A  Co Textiles  Ltd-ledger.csv` (confirmed on
     disk in the Downloads folder — all three special characters correctly stripped, U2's fix
     verified end-to-end, not just at the function level) whose contents matched the on-screen
     table exactly. One gap in the QA seed script's own cleanup tracking was caught here: the
     live-recorded payment's id wasn't in `seeded-ids.json` (only script-created rows were
     tracked) — caught by the cleanup script's own residue check (`customer_payments: 1` remained)
     and fixed with a small follow-up script before finishing, rather than leaving it.
  All seeded rows (2 customers, 1 trade name, 1 product, 1 supplier, 1 purchase, 3 POs, 2
  challans, 1 Performa Invoice, 3 payments, all their ledger entries) and the throwaway auth user
  were deleted afterward; a final residue check confirmed 0 remaining across every table this
  feature or its prerequisites touch. One genuinely pre-existing, non-QA row (a supplier "Alpha
  Textiles Ltd" and its purchase, dated a week before this session) was correctly identified and
  left untouched throughout. The dev server was stopped and the `.qa-scratch/` scratch directory
  (never committed) was deleted.
- **Several tasks were consolidated during implementation rather than built incrementally in
  strict task order**, each noted inline at the task it landed on, mirroring 008's own precedent:
  - T007 (US1's `getCustomerLedger`) and T019 (US3's extension adding `paymentStatus`/
    `createdAt`/`createdBy`/`statusChangedAt`/`statusChangedBy`) were built together from the
    start — the extra fields cost nothing to include upfront once the same `customer_payments`
    batched join already existed for cheque-derived PO-number resolution.
  - T008 (US1's `ledger-table.tsx`) and T021 (US3's wiring of `PaymentStatusActions` plus the
    attribution tooltip) were likewise built as one component from the start.
  - T010 (US1's ledger page), T016 (US2's "Record Payment" link), T024 (US4's `AgeingSummary`
    wiring), and T038 (US5's Print/Export CSV links) were all built into one `page.tsx` in a
    single pass, since they're all small additions to the same file with no reason to touch it
    four separate times.
  - T012/T017 (both `lib/customer-payments/service.ts` functions) and T013/T018 (both Server
    Actions in `app/actions/customer-payments.ts`) were each written together, being two small
    functions in the same new file.
  - T025 (`listCustomerLedgerSummaries`), T029 (`getCustomerLedgerForPrint`), and T030
    (`getCustomerLedgerSummaryForPrint`) were all written together in `lib/customer-ledger/service.ts`
    during the initial pass, since T029/T030 are thin reshapings of T007/T025's already-built
    output with no independent logic of their own.
- **One structural decision made during implementation, not fully specified in the design
  docs**: `getCustomerAgeing` (T022) and `getCustomerLedger` (T007) both need the same raw,
  chronologically-sorted `ledger_entries` fetch. Rather than importing one from the other
  (`service.ts` and `ageing.ts` each need the other's exports, which would create a circular
  module dependency), the shared fetch was extracted into a third module,
  `lib/customer-ledger/entries.ts` (`fetchLedgerEntries`), that both import from — satisfying
  research.md's "reusing getCustomerLedger's underlying fetch rather than a duplicate query"
  intent without the cycle. This is a one-file addition beyond what `plan.md`'s Project Structure
  originally listed for `lib/customer-ledger/`, made for a concrete, verified reason (avoiding a
  circular import that `npx tsc --noEmit` would not have caught but a bundler could), not scope
  creep.
- **`listCustomerLedgerSummaries` fetches active and inactive customers separately and merges
  them**, rather than adding a new "all statuses" export to `lib/customers/service.ts` — that
  file's `listCustomers()` only ever filters to exactly one status per call (verified by reading
  it before writing this function), and `plan.md`'s Project Structure committed to leaving
  `lib/customers/service.ts` unchanged. FR-011 requires every customer regardless of status
  (005's deactivation never hides historical ledger data), so `listCustomers({status:'active'})`
  and `listCustomers({status:'inactive'})` are both called and merged in
  `lib/customer-ledger/service.ts` instead.
- **A small lint fix applied during implementation**: the "Export CSV" links
  (`app/(dashboard)/customer-ledger/page.tsx`, `app/(dashboard)/customers/[customerId]/ledger/page.tsx`)
  point at a Route Handler that returns a raw file download, not a page — `next/link` would
  attempt a client-side RSC transition where a plain browser navigation triggering a download is
  actually correct. ESLint's `@next/next/no-html-link-for-pages` flagged the literal-string case
  (the summary page); fixed with a scoped `eslint-disable-next-line` and a comment explaining why,
  rather than switching to `next/link` (which lint did not flag on the dynamic-`href` case, so no
  disable was added there).
- **Verification performed**: `npx tsc --noEmit` (clean), `npm run lint` (0 errors; one
  pre-existing warning pattern from React Hook Form's `watch()`, already present elsewhere in
  this codebase — `components/customers/customer-form.tsx`, `components/customer-pos/customer-po-line-row.tsx`
  — not introduced by this feature), and `npm run build` (clean) all pass on the full repo. The
  build's route table confirms `/api/customer-ledger`, `/api/customer-ledger/[customerId]`,
  `/customer-ledger`, `/customer-ledger/print`, `/customers/[customerId]/ledger`,
  `/customers/[customerId]/ledger/print`, and `/customers/[customerId]/payments/new` all resolved
  as distinct routes, coexisting correctly with every existing 001-008 route.
- **Feature complete**: all 44 tasks done, all verification (static and live) passes. No further
  action needed before this feature is considered shipped.
