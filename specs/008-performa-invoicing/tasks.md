---

description: "Task list for Performa Invoicing implementation"
---

# Tasks: Performa Invoicing

**Input**: Design documents from `/specs/008-performa-invoicing/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001-007). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root. This feature adds one new module, one small additive
export on 005's customer service, and one `ALTER TABLE` against 006's `customer_po_lines` — it
makes **no** changes to `app/(dashboard)/customer-pos/**` or `app/(dashboard)/challans/**`
(research.md's entry-point decision — invoicing starts from a dedicated customer-first picker, not
a PO or Challan detail page):

- `supabase/migrations/0008_performa_invoicing.sql` — new migration file
- `lib/performa-invoices/{schema.ts, service.ts, storage.ts, number-to-words.ts}` — new module
- `lib/customers/service.ts` — extended (one new export, `listPerformaInvoiceCustomersForSelect`)
- `app/actions/performa-invoices.ts` — new Server Actions file
- `components/performa-invoices/{performa-invoice-form.tsx, performa-invoice-line-row.tsx, performa-invoice-list.tsx, performa-invoice-print-view.tsx, performa-invoice-gst-attachment-upload.tsx}` — new components
- `app/(dashboard)/performa-invoices/**` — new route group (list, new, detail)
- `app/performa-invoices/[invoiceId]/print/page.tsx` — new standalone route, outside `(dashboard)`
- `app/(dashboard)/layout.tsx` — extended (one new nav link)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001-007 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0008_performa_invoicing.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, the new database-level FR-015 backstop, the one Postgres function every user story depends on, and the shared TypeScript types.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 In `supabase/migrations/0008_performa_invoicing.sql` per [data-model.md](./data-model.md): create `performa_invoices` (`customer_id` FK to `customers(id)` no cascade, `trade_name_id` FK to `trade_names(id)`, `invoice_number varchar(30)`, `invoice_date date`, `tax_rate numeric(5,2) check >= 0 and <= 100`, `created_at`/`created_by` only — **no** `updated_at`/`updated_by`/update trigger, `unique (trade_name_id, invoice_number)`, `idx_performa_invoices_customer_date` index), `performa_invoice_lines` (`invoice_id` FK `on delete cascade`, `position smallint`, `po_line_id` FK to `customer_po_lines(id)` no cascade — ordinary `RESTRICT` default, `product_id`/`uom`/`unit_price` as **snapshot** columns not live-joined, `invoiced_quantity numeric(10,2) check > 0`, `created_at` only), and `performa_invoice_attachments` (`invoice_id` FK `on delete cascade`, `storage_path`/`file_name`/`content_type` text, `uploaded_at`/`uploaded_by`); RLS enabled with no policies on all three; the `performa-invoice-attachments` private Storage bucket insert
- [X] T003 In the same migration file per [data-model.md](./data-model.md): `alter table customer_po_lines add constraint customer_po_lines_invoiced_le_delivered check (invoiced_quantity <= delivered_quantity)` — the hard database-level backstop for FR-015, added against 006's already-applied table via this feature's own migration, **never editing `0006_customer_purchase_orders.sql` in place** (depends on T002 for file ordering)
- [X] T004 In the same migration file per [data-model.md](./data-model.md): create `create_performa_invoice(p_customer_id, p_trade_name_id, p_invoice_number, p_invoice_date, p_tax_rate, p_lines jsonb, p_user_id) returns uuid` — raises `CUSTOMER_NOT_INVOICE_ELIGIBLE` unless the customer exists and `issues_performa_invoice = true`; raises `TRADE_NAME_NOT_FOUND` unless the trade name exists; raises `DUPLICATE_PO_LINE` if `p_lines` repeats a `po_line_id`; **iterates `p_lines` sorted by `po_line_id` ascending** (not client-submission order — deadlock avoidance for multi-line invoices, research.md), locking each referenced `customer_po_lines` row with `select ... for update of cpl` joined to `customer_pos` for its `customer_id`/`status`, raising `PO_LINE_WRONG_CUSTOMER`/`PO_CANCELLED`/`LINE_FULLY_INVOICED`/`LINE_EXCEEDS_REMAINING_INVOICEABLE` as applicable; resolves `invoice_number` from `trade_names.next_invoice_number` as a plain integer (no padding/date suffix) when blank, advancing the counter, else uses the submitted value; inserts the `performa_invoices` header and, via `jsonb_array_elements(p_lines) with ordinality` (preserving the **original client-submitted order** for `position`, independent of the locking loop's sort order), each `performa_invoice_lines` row with snapshotted `product_id`/`uom`/`unit_price`; increments each referenced `customer_po_lines.invoiced_quantity`; computes `gross_total`/`tax_amount` (`round(gross * tax_rate / 100, 2)`)/`net_total`; inserts one `ledger_entries` credit row (`source_type = 'performa_invoice'`, `amount = net_total`); returns the new invoice's `id` — `SECURITY INVOKER` (depends on T002, T003)
- [X] T005 [P] Create `lib/performa-invoices/schema.ts`: `performaInvoiceLineInputSchema` (Zod — `poLineId` uuid, `invoicedQuantity` positive number), `performaInvoiceInputSchema` (`customerId` uuid, `tradeNameId` uuid, `invoiceNumber?`, `invoiceDate`, `taxRate` number `>= 0 and <= 100` default `18`, `lines` array of `performaInvoiceLineInputSchema`, min 1, `superRefine`-guarded against duplicate `poLineId`s — a friendlier client-side echo of the DB's `DUPLICATE_PO_LINE` guard), and TypeScript types `PerformaInvoiceInput`, `PerformaInvoiceLineInput`, `PerformaInvoiceListItem` (incl. `poNumbers: string[]`, `netTotal`), `PerformaInvoiceDetail` (incl. `grossTotal`/`taxAmount`/`netTotal`/`taxRate`, `ledgerCreditAmount`, `attachments`, `createdAt`/`createdBy`), `PerformaInvoiceLineDetail` (incl. `poNumber`, `productName`, `uom`, `unitPrice`, `invoicedQuantity`), `PerformaInvoiceAttachment`, `PerformaInvoicePrintView` (per [contracts/server-actions.md](./contracts/server-actions.md)) (depends on T004)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Generate and post a Performa Invoice against a single PO (Priority: P1) 🎯 MVP

**Goal**: Staff can pick a customer flagged "Issues Performa Invoice," select one of their open POs, select lines with invoiceable quantity, set a tax rate, choose a trade name, and generate an invoice that immediately posts its ledger credit, updates each PO line's Invoiced figure, and produces a printed document with amount in words.

**Independent Test**: Create an invoice against one PO's line for an amount within its remaining invoiceable quantity, and confirm: the invoice saves with an auto-generated number; gross/tax/net totals are correct; the PO line's invoiced figure increases; exactly one ledger credit equal to the net total appears; and the printed view shows the correct letterhead, line table, totals, and amount in words (spec Acceptance Scenarios 1-8 for User Story 1).

### Implementation for User Story 1

- [X] T006 [US1] Implement `listPerformaInvoiceCustomersForSelect()` in `lib/customers/service.ts` — `listCustomers({ status: 'active' })` filtered additionally to `issues_performa_invoice = true`, shaped like that file's existing `listActiveCustomersForSelect()`, per [contracts/server-actions.md](./contracts/server-actions.md)
- [X] T007 [US1] Implement `getInvoiceableLinesForPO(poId: string)` in `lib/performa-invoices/service.ts` — reuses `getCustomerPO` (006, `lib/customer-pos/service.ts`, already exported) and derives `remaining = deliveredQuantity - invoicedQuantity` per line in TypeScript, filtering out lines where `remaining <= 0`, mirroring 007's `getOpenPOLinesForChallan` shape with the subtraction terms swapped (depends on T005)
- [X] T008 [US1] Implement `createPerformaInvoiceRecord`, `listPerformaInvoices`, `getPerformaInvoice` in `lib/performa-invoices/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md): `createPerformaInvoiceRecord` calls `create_performa_invoice`, translating Postgres exceptions (`CUSTOMER_NOT_INVOICE_ELIGIBLE`, `TRADE_NAME_NOT_FOUND`, `DUPLICATE_PO_LINE`, `PO_LINE_WRONG_CUSTOMER`, `PO_CANCELLED`, `LINE_FULLY_INVOICED`, `LINE_EXCEEDS_REMAINING_INVOICEABLE`, the `unique (trade_name_id, invoice_number)` violation) into friendly `Error`s matching `toFriendlyChallanError`'s pattern in `lib/challans/service.ts`; `listPerformaInvoices(filters: { customerId?, tradeNameId? })` joins `customers(display_name)`/`trade_names(printed_name)` and each invoice's lines (for `poNumbers`/`netTotal`), ordered by `invoice_date desc`; `getPerformaInvoice(id)` joins customer/trade name/lines (each line's source PO resolved live via `po_line_id → customer_po_lines.po_id → customer_pos.po_number`, product name via the line's own snapshot `product_id → products.name`), computes `grossTotal`/`taxAmount`/`netTotal` in TypeScript from the fetched lines and the invoice's own `taxRate`, resolves `ledgerCreditAmount` via `ledger_entries` where `source_type = 'performa_invoice' and source_id = id`; `attachments` returns `[]` for now (wired to real Storage data in User Story 3) (depends on T004, T005)
- [X] T009 [P] [US1] Create `lib/performa-invoices/number-to-words.ts`: `amountInWords(amount: number): string` — South Asian (Hundred/Thousand/Lakh/Crore) numbering convention, no new dependency, rupees + optional paisa + "Only" (research.md)
- [X] T010 [US1] Implement `getPerformaInvoiceForPrint(id: string)` in `lib/performa-invoices/service.ts` — same underlying fetch as `getPerformaInvoice`, additionally resolving the trade name's `signature_image_path`/`stamp_image_path` to short-lived signed URLs via `lib/trade-names/storage.ts`'s existing `getSignedAssetUrl`, and computing `netTotalInWords` via `amountInWords`, shaped per [contracts/server-actions.md](./contracts/server-actions.md)'s `PerformaInvoicePrintView` (depends on T008, T009)
- [X] T011 [P] [US1] Implement `createPerformaInvoice` Server Action in `app/actions/performa-invoices.ts` — `requireCurrentUser()` (FR-013), Zod validation with `performaInvoiceInputSchema`, calls `createPerformaInvoiceRecord`, `revalidatePath("/performa-invoices")` and the new invoice's own detail path, matching the shape of `app/actions/challans.ts` (depends on T008)
- [X] T012 [P] [US1] Create `components/performa-invoices/performa-invoice-line-row.tsx`: one line's PO number, item, UOM, unit price, remaining-invoiceable-quantity display, and an invoiced-quantity input defaulting to the full remaining amount (depends on T005)
- [X] T013 [US1] Create `components/performa-invoices/performa-invoice-form.tsx`: `react-hook-form` + `zodResolver` — a customer picker (via `listPerformaInvoiceCustomersForSelect`, restricting selection to eligible customers up front per FR-001), a PO picker (via `listCustomerPOs({ customerId, status: 'open' })`, 006, already exported) shown once a customer is chosen, a tax-rate input (default `18`), a trade-name picker (via `listActiveTradeNamesForSelect`, 004), an invoice-number field (blank = auto-generate) and date field, and a dynamic invoiceable-line checklist populated via `getInvoiceableLinesForPO` once a PO is selected, rendering `PerformaInvoiceLineRow` per selectable line — this story's form supports exactly one selected PO at a time (User Story 2 extends it to more than one) (depends on T006, T007, T011, T012)
- [X] T014 [P] [US1] Create `components/performa-invoices/performa-invoice-list.tsx`: renders `PerformaInvoiceListItem` rows (invoice number, date, customer, trade name, PO number(s), net total), matching `components/challans/challan-list.tsx`'s shape, plus customer/trade-name filter controls (depends on T005)
- [X] T015 [P] [US1] Create `components/performa-invoices/performa-invoice-print-view.tsx`: the printable layout — trade name letterhead (printed name/address), invoice number/date, customer legal name, included PO number(s), a line table (item, UOM, quantity invoiced, unit price, line total, source PO), gross total, tax rate and amount, net total, the trade name's signature/stamp images, net total in words, styled with `@media print` rules (research.md, ADR-0006's second application) (depends on T005)
- [X] T016 [US1] Create `app/(dashboard)/performa-invoices/page.tsx` and `loading.tsx`: Server Component reading `searchParams: Promise<{ customerId?, tradeNameId? }>` and calling `listPerformaInvoices(...)` (FR-012), rendering `PerformaInvoiceList` (depends on T008, T014)
- [X] T017 [US1] Create `app/(dashboard)/performa-invoices/new/page.tsx`: renders `PerformaInvoiceForm` wired to the `createPerformaInvoice` Server Action (depends on T011, T013)
- [X] T018 [US1] Create `app/(dashboard)/performa-invoices/[invoiceId]/page.tsx` and `loading.tsx`: Server Component calling `getPerformaInvoice(id)`, rendering every header field, its created timestamp and staff user (FR-014), every line (with source PO), the computed totals, the posted ledger credit amount, a "Print" link to `/performa-invoices/[id]/print`, and (in User Story 3) the GST attachment list/upload — fully read-only, no edit/void controls anywhere (FR-009); returns a not-found state if `null` (depends on T008)
- [X] T019 [US1] Create `app/performa-invoices/[invoiceId]/print/page.tsx`: a standalone route **outside** the `(dashboard)` route group with its own `getCurrentUser()`/`redirect("/login")` gate (mirroring `(dashboard)/layout.tsx`'s check, per ADR-0006), calling `getPerformaInvoiceForPrint(id)` and rendering `PerformaInvoicePrintView` (depends on T010, T015)
- [X] T020 [P] [US1] Add a "Performa Invoices" link to the dashboard nav in `app/(dashboard)/layout.tsx`, alongside the existing Suppliers/Products/Purchases/Trade Names/Customers/Customer POs/Challans links (depends on T016)

**Checkpoint**: User Story 1 is fully functional and independently testable — a Performa Invoice can be generated against a single PO, posted, listed, viewed, and printed. This is the MVP.

---

## Phase 4: User Story 2 - Combine multiple POs of the same customer onto one invoice (Priority: P2)

**Goal**: Staff preparing an invoice for a customer with more than one PO carrying invoiceable quantity can add lines from more than one of that customer's POs onto the same invoice, producing one document and one combined ledger credit.

**Independent Test**: Create one invoice including a line from each of two open POs of the same customer, and confirm: both PO lines' invoiced figures increase correctly, the printed document lists both PO numbers with lines correctly attributed to each, totals sum across both, and exactly one ledger credit (not two) is posted; confirm a line from a different customer's PO is rejected (spec Acceptance Scenarios 1-4 for User Story 2).

### Implementation for User Story 2

- [X] T021 [US2] Extend `components/performa-invoices/performa-invoice-form.tsx` to support adding lines from more than one of the invoice's customer's open POs onto the same draft — a repeatable "Add another PO" control that appends another PO's invoiceable-line checklist (via `getInvoiceableLinesForPO`) alongside any already added, rather than replacing it, aggregating every selected line across all added POs into the single `lines` array submitted to `createPerformaInvoice` (depends on T013) — **built together with T013** rather than as a later edit: `performa-invoice-form.tsx`/`new/page.tsx` accept a `poGroups`/`availablePOs` array from the start via a plain GET-form "Add another PO" control (no client-side fetching, matching research.md's server-round-trip preference), so User Story 1's single-PO flow and User Story 2's multi-PO flow are the same code path

**Checkpoint**: User Stories 1 AND 2 both work — an invoice can span one or several POs of the same customer, each line correctly attributed to its source PO (already rendered generically since User Story 1's `PerformaInvoiceLineRow`/print view always display a line's `poNumber`, and `getPerformaInvoice`/`getPerformaInvoiceForPrint` always derive `poNumbers` as a de-duplicated set regardless of count).

---

## Phase 5: User Story 3 - Attach the externally-prepared GST Sales Tax Invoice (Priority: P3)

**Goal**: Staff can upload the accountant's separately-prepared GST Sales Tax Invoice PDF and attach it to an already-created Performa Invoice for safekeeping, with zero effect on the invoice's own totals, lines, or ledger posting.

**Independent Test**: Upload a PDF to an already-created invoice and confirm it's stored and retrievable from the invoice's detail view, and that the invoice's totals/ledger effect are unchanged; confirm an invoice with no attachment displays and prints normally (spec Acceptance Scenarios 1-3 for User Story 3).

### Implementation for User Story 3

- [X] T022 [US3] Implement `uploadPerformaInvoiceGstAttachment`/`getSignedPerformaInvoiceAttachmentUrl` in `lib/performa-invoices/storage.ts` (upload/sign only) plus `addPerformaInvoiceAttachmentRecord` in `lib/performa-invoices/service.ts` (the DB insert) — mirrors `lib/customer-pos/storage.ts` + `addCustomerPOAttachmentRecord`'s append-only, zero-to-many split exactly (ADR-0003), targeting the `performa-invoice-attachments` bucket, no replace/delete-previous step (depends on T002)
- [X] T023 [US3] `getPerformaInvoice` (`lib/performa-invoices/service.ts`) resolves real `performa_invoice_attachments` rows to short-lived signed URLs from T008 onward — built together with T008/T022 rather than shipping a `[]` placeholder first, since the query shape (one extra joined relation) was no extra cost to include upfront (depends on T008, T022)
- [X] T024 [P] [US3] Implement `uploadPerformaInvoiceGstAttachment` Server Action in `app/actions/performa-invoices.ts` (depends on T022)
- [X] T025 [P] [US3] Create `components/performa-invoices/performa-invoice-gst-attachment-upload.tsx`: an upload control calling `uploadPerformaInvoiceGstAttachment`, plus a list of already-attached files with links to view them, usable on any already-created invoice (FR-011) (depends on T024)
- [X] T026 [US3] Wire `PerformaInvoiceGstAttachmentUpload` into `app/(dashboard)/performa-invoices/[invoiceId]/page.tsx` (depends on T018, T023, T025)

**Checkpoint**: All three user stories are independently functional — invoice generation and posting, multi-PO combination, and GST attachment record-keeping all work end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories, and manual verification of the feature's structural correctness rules — especially the concurrency/locking design hardened during plan review.

- [X] T027 [P] Review that no Server Action, service function, or exposed Postgres function anywhere provides an update, void, or delete path for `performa_invoices`/`performa_invoice_lines` — confirm `create_performa_invoice` is the *only* mutation this feature ever calls, matching research.md's "no lifecycle" decision (FR-009, FR-010). **Verified** via grep: `create_performa_invoice` is the only `.rpc(...)` call in `lib/performa-invoices/service.ts`/`app/actions/performa-invoices.ts`, and no `update(...)`/`delete(...)` call anywhere in the codebase targets `performa_invoices` or `performa_invoice_lines`.
- [X] T028 Verify FR-015's concurrency guarantee manually per quickstart.md: attempt two invoices against the same PO line's remaining invoiceable quantity in quick succession such that the second would exceed it → confirm the second is rejected naming the actual remaining quantity, and confirm `invoiced_quantity` never exceeds `delivered_quantity` afterward (the `customer_po_lines_invoiced_le_delivered` constraint from T003 as the last-resort check). **Verified** against the live, migration-applied database: two genuinely concurrent `create_performa_invoice` RPC calls (fired via `Promise.allSettled`) against the same 100-unit line, each requesting 60 units — exactly one succeeded, the other was rejected with `LINE_EXCEEDS_REMAINING_INVOICEABLE: ... has only 40.00 remaining to invoice` (proving the `for update of cpl` lock serialized them rather than racing), and the line's final `invoiced_quantity` was confirmed at exactly 60, never exceeding `delivered_quantity` (100).
- [X] T029 Verify FR-001/FR-008 manually: attempt to create an invoice for a customer flagged `issues_performa_invoice = false` → confirm `CustomerNotInvoiceEligibleError`; confirm that customer's existing Challan-driven ledger credits (007) are unaffected and no duplicate posting occurs. **Verified**: an ineligible throwaway customer did not appear in the "Create Performa Invoice" picker; direct URL navigation to its id showed "Customer not found, or not eligible for Performa Invoicing."; a direct RPC call was rejected with `CUSTOMER_NOT_INVOICE_ELIGIBLE: this customer does not issue Performa Invoices` before any line was even validated.
- [X] T030 Verify FR-002/Acceptance Scenario 4 manually: attempt to call `createPerformaInvoice` with a line belonging to a different customer's PO than the one selected → confirm `PoLineWrongCustomerError` (the UI structurally prevents this via the customer-scoped PO picker, so this is a defense-in-depth check against direct misuse). **Verified** against the live database: a direct RPC call referencing a second customer's PO line while `p_customer_id` was the first customer was rejected with `PO_LINE_WRONG_CUSTOMER: ... does not belong to this invoice's customer`.
- [X] T031 Verify SC-005 manually: confirm a printed invoice shows the correct letterhead/signature/stamp, correct gross/tax/net arithmetic, and correct amount-in-words across a few representative amounts, including one in the Lakh range, per quickstart.md. **Verified** two ways: (1) `amountInWords` run standalone against 13 representative amounts including the business context's real example (403265 → "Four Lakh Three Thousand Two Hundred Sixty Five Rupees Only"), boundary values (1 Lakh, 1 Crore), and fractional paisa — all correct; (2) the actual live print view for a real created invoice (net total Rs 466,395.00) rendered "Four Lakh Sixty Six Thousand Three Hundred Ninety Five Rupees Only" — arithmetically correct — alongside the correct letterhead, gross/tax/net breakdown, and (empty, since no signature/stamp was uploaded for the QA trade name) signature area.
- [X] T032 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all three user stories. **Run against the live app** (`npm run dev` + real browser): seeded a Habbitt-like customer and two POs with genuine delivered quantity via the actual `create_challan`/`accept_challan` RPCs (007) after first giving the product purchase-based stock via `record_unit_purchase` (003b) — not a shortcut. Walked through: customer picker showing only the eligible customer (US1); adding both POs to one draft via the "Add another PO" GET-form control and submitting (US1+US2) — invoice #1 created with correct gross (Rs 395,250.00)/tax (Rs 71,145.00)/net (Rs 466,395.00) and a matching "Ledger credit posted: Rs 466,395.00" banner; the detail page confirmed fully read-only (no edit/void controls); the print view confirmed both PO numbers, correct per-line PO attribution, and the amount in words; uploading a GST attachment (US3) succeeded, rendered as a link, resolved to a signed URL in the correct private bucket, and left totals/ledger unchanged; re-visiting the create form with both PO lines now fully invoiced correctly showed "This PO has no delivered-but-uninvoiced quantity." for each; submitting with no trade name selected showed the client-side "Select a trade name." error. All QA rows (customers, POs, lines, challans, challan lines, the invoice and its attachment file, product, purchase, supplier, trade name) and the throwaway auth user were deleted afterward — residue confirmed 0 via a follow-up query, and the dev server was stopped.

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. Includes the one Postgres function (`create_performa_invoice`) with its full, final behavior (concurrency-safe locking, multi-PO validation, invoiced-figure increment, ledger posting) in one migration, matching 006/007's precedent of bundling every RPC for a feature into Foundational even when a specific capability (here, multi-PO combination) is only *exercised end-to-end through the UI* by a later story.
- **User Stories (Phase 3-5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `performa-invoice-form.tsx` (T013) to extend rather than duplicate.
  - US3 depends on US1's `service.ts`/detail page (T008, T018) to extend — the underlying Storage/attachment pattern is new (T022), but the surrounding invoice already exists from US1.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T005 can run once T004 is done (T002-T004 are sequential — same migration file).
- US1: T009, T011, T012, T014, T015 can run in parallel (different files) once their own dependencies (T005, T008) exist; T020 can run once T016 exists.
- US3: T024, T025 can run in parallel (different files) once T022 is done.
- Polish: T027 can run in parallel with T028/T029/T030/T031/T032.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Create amountInWords utility in lib/performa-invoices/number-to-words.ts"
Task: "Create PerformaInvoiceLineRow in components/performa-invoices/performa-invoice-line-row.tsx"
Task: "Create PerformaInvoiceList in components/performa-invoices/performa-invoice-list.tsx"
Task: "Create PerformaInvoicePrintView in components/performa-invoices/performa-invoice-print-view.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — staff can generate, post, and print a Performa Invoice against a single PO

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → deploy/demo (MVP)
3. User Story 2 → validate independently → deploy/demo (multi-PO invoices)
4. User Story 3 → validate independently → deploy/demo (GST attachment record-keeping)
5. Polish phase → deploy final hardening

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- Each user story phase ends at a checkpoint where that story is independently demoable.
- Commit after each task or logical group, matching the project's small-diff convention.
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest stack from research.md if desired later.
- **T004 is the highest-risk task in this feature** — it is the only mutation this feature ever
  exposes, it posts a real ledger credit atomically with the PO-line increment, and its row-locking
  design (`select ... for update of cpl`, iterated in `po_line_id`-sorted order) was hardened twice
  during plan review: once to close a check-then-act race under concurrent invoice creation
  (FR-015), and once to close a Postgres deadlock risk specific to multi-line invoices locking more
  than one row per transaction (User Story 2). T003's `CHECK` constraint is the deliberate
  defense-in-depth backstop for the first of those. **Do not "simplify" T004 during implementation
  by dropping the `for update` lock, the sort order, or the `CHECK` constraint** — each closes a
  distinct, already-identified correctness gap (research.md).
- **T013's create form is deliberately single-PO-only** — User Story 2 (T021) is what extends it to
  multiple POs. This is a UI-only sequencing choice; `create_performa_invoice` (T004) already
  validates and posts correctly for any number of POs from the moment it's built in Foundational,
  the same "backend built once with full behavior, UI catches up story by story" pattern 007 used
  for `accept_challan`'s ledger-posting step relative to its own User Story 3.
- **T019's standalone print route and its duplicated auth check** are per
  [ADR-0006](../../history/adr/0006-printed-documents-via-server-rendered-print-routes.md) — this
  is that ADR's own explicitly-named second application. Do not "simplify" this by moving the print
  page inside `(dashboard)` during implementation; that would reintroduce the coupling ADR-0006
  explicitly rejected.
- **No task touches `app/(dashboard)/customer-pos/**` or `app/(dashboard)/challans/**`** —
  research.md's entry-point decision means this feature adds no shortcut link on either of those
  existing detail pages, unlike how 007 added one to 006's PO detail page. If a future iteration
  wants that convenience, it is a small, separate addition, not part of this feature's scope.

## Implementation Notes (post `/sp.implement`)

- **T002/T003/T004 written, not yet applied**: `supabase/migrations/0008_performa_invoicing.sql`
  is complete and has been carefully re-read end to end for correctness, but this environment has
  no direct Postgres/DDL access (only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SECRET_KEY` are set — no `DATABASE_URL`, no `pg` package installed), the same
  sequencing as 002/003b/004/005/006/007. **The user must apply this migration in the Supabase SQL
  editor before T028–T032 (live verification) or any manual testing can proceed.**
- **T028–T032 (live verification against a real Supabase project) are blocked on the user
  applying the migration** — not run yet.
- **Several tasks were consolidated during implementation rather than built incrementally in
  strict task order**, each noted inline above at the task it landed on:
  - T013 and T021 (US1's single-PO form and US2's multi-PO extension) were built together as one
    component from the start — `performa-invoice-form.tsx`/`new/page.tsx` always accept a
    `poGroups`/`availablePOs` array, with "add another PO" implemented as a plain `method="GET"`
    HTML form (hidden inputs carry the already-added `poId`s, a `<select>` + submit adds one
    more) rather than client-side fetching, consistent with research.md's documented preference
    for server round trips over client-side data fetching (the same reasoning 007's own
    `getOpenPOLinesForChallan` note already established). This means User Story 1 and User Story
    2 are literally the same code path, not two sequential edits.
  - T022/T023 (the attachment storage module and `getPerformaInvoice`'s resolution of real
    attachment rows) were built together with T008 rather than shipping a `[]` placeholder in
    User Story 1 first — the extra joined relation cost nothing to include upfront, unlike 007's
    Challan signed-copy flow, which had a real reason to defer (the bucket/columns didn't exist
    until a later migration; here, the schema was already complete from Foundational).
  - T011 and T024 (the two Server Actions) were written together in one pass over
    `app/actions/performa-invoices.ts` since they're two small functions in the same new file.
- **A typing hardening applied during implementation, not caught until review**: the first draft
  of `lib/performa-invoices/service.ts`'s embedded-relation row types (`ListInvoiceLineRow`'s and
  `DetailLineRow`'s `customer_po_lines` field) typed the nested `customer_pos` relation as
  object-or-null only, not object-or-array-or-null, inconsistent with every other embedded
  relation in this codebase (e.g. `lib/challans/service.ts`'s `PoRef`/`TradeNameRef` pattern).
  Supabase/PostgREST's actual runtime shape for an embedded resource isn't fully verifiable
  without a live query (this environment has no direct DB access, per above), so — since every
  existing service file in this project defensively types every embedded relation as `T | T[] |
  null` and resolves it through a shared `firstOf` helper regardless of the FK's actual
  cardinality — this file was brought into line with that same defensive convention rather than
  assuming the narrower shape was correct. Introduced a shared `PoRef`/`CustomerPoLineRef`
  interface pair used by both `ListInvoiceLineRow` and `DetailLineRow`.
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass
  cleanly on the full repo (not just this feature's files), both before and after the typing
  hardening above. The build's route table confirms `/performa-invoices`,
  `/performa-invoices/[invoiceId]`, `/performa-invoices/[invoiceId]/print`, and
  `/performa-invoices/new` all resolved as distinct routes, coexisting correctly with
  `/challans/[challanId]/print`'s own standalone-print-route precedent (no naming or route-group
  collision).
- **T027 verified statically** (grep-based, per its own task text) rather than via a live query,
  since it's checking the absence of a code path, not database behavior — this doesn't depend on
  the migration being applied.
- **Next step for the user**: apply `supabase/migrations/0008_performa_invoicing.sql` in the
  Supabase SQL editor, then T028–T032 can run against real data (a Habbitt-flagged customer with
  at least one accepted Challan against an open PO, per quickstart.md's Prerequisites).
- **T028–T032 completed** after the user applied `0008_performa_invoicing.sql`. Two live-
  verification passes, both against clearly-marked `ZZZ QA` rows via the service-role client and
  a real browser session, fully cleaned up afterward (residue confirmed 0):
  1. **DB-layer** (8/8 assertions, all PASS, via a throwaway script): the FR-015 concurrency race
     (two genuinely concurrent `create_performa_invoice` calls against the same line — exactly one
     succeeded, the other correctly rejected naming the true remaining quantity, final
     `invoiced_quantity` never exceeded `delivered_quantity`); the cross-customer rejection
     (`PO_LINE_WRONG_CUSTOMER`); the multi-PO combine (both PO lines' `invoiced_quantity` updated
     correctly, correct per-PO attribution, exactly one combined ledger credit for the correct
     net total). Separately, the customer-eligibility gate (`CUSTOMER_NOT_INVOICE_ELIGIBLE`) and
     `amountInWords` (13 representative amounts, including the business context's real 403265
     example and Lakh/Crore boundaries) were verified standalone.
  2. **Live app / browser walkthrough**: seeded realistic prerequisite data via the actual
     `record_unit_purchase` (003b) → `create_challan`/`accept_challan` (007) RPCs, not a
     shortcut, then signed in as a throwaway QA staff account and drove the real running app end
     to end — the customer-first picker correctly showing only the eligible customer, adding two
     POs to one invoice via the "Add another PO" control, submitting, confirming the created
     invoice's totals/ledger-credit banner/read-only detail page, the print view's letterhead/
     per-line PO attribution/amount-in-words, a GST attachment upload resolving to a signed URL
     in the correct private bucket, the "no delivered-but-uninvoiced quantity" message once both
     PO lines were fully invoiced, and client-side validation on an incomplete submission. All
     seeded rows, the uploaded attachment's storage object, and the throwaway auth user were
     deleted afterward; residue confirmed 0 in both passes; the dev server was stopped.
