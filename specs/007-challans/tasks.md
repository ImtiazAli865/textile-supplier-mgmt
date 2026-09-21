---

description: "Task list for Challans implementation"
---

# Tasks: Challans

**Input**: Design documents from `/specs/007-challans/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001-006). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P1 tied, US3 = P2) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root. This feature adds one new module, one small extension
to 006's PO detail page, and redefines four of 003b's own Postgres functions:

- `supabase/migrations/0007_challans.sql` — new migration file
- `lib/challans/{schema.ts, service.ts, storage.ts}` — new module
- `app/actions/challans.ts` — new Server Actions file
- `components/challans/{challan-form.tsx, challan-line-row.tsx, challan-list.tsx, challan-status-controls.tsx, challan-signed-copy-upload.tsx, challan-print-view.tsx}` — new components
- `app/(dashboard)/challans/**` — new route group (list, new, detail)
- `app/challans/[challanId]/print/page.tsx` — new standalone route, outside `(dashboard)`
- `app/(dashboard)/layout.tsx` — extended (one new nav link)
- `app/(dashboard)/customer-pos/[poId]/page.tsx` — extended ("Create Challan" link + this PO's Challan list)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001-006 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0007_challans.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, redefined 003b functions, new Postgres functions, types, and Storage bucket every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 In `supabase/migrations/0007_challans.sql` per [data-model.md](./data-model.md): create the `inventory_movements` table (`product_id` FK to `products(id)`, `qty_delta numeric(10,2) check <> 0`, `reason text`, `source_type text`, `source_id uuid` no FK, `movement_date date`, `created_at`/`created_by`, no update/delete path, `idx_inventory_movements_product_date` index); run the one-time backfill inserting one opening movement per existing `type = 'traded'` product with `quantity_on_hand <> 0` (`reason = 'Opening balance at 007 cutover'`, `source_type = 'opening_balance'`, `source_id = null`, `movement_date = current_date`); create `recompute_product_quantity_on_hand(p_product_id uuid)` (`quantity_on_hand = coalesce(sum(qty_delta), 0)`); `CREATE OR REPLACE` 003b's `recompute_product_purchase_stats` (drop its `quantity_on_hand` assignment, keep `current_purchase_cost` unchanged) and its three callers `record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase` so each writes its own `inventory_movements` row (create: `+quantity_units`; update: a net-delta, or a full reversal+addition if `product_id` changed; delete: a reversal) and calls `recompute_product_quantity_on_hand` for every product touched — **do not edit `0003_traded_purchases.sql` itself**
- [X] T003 In the same migration file per [data-model.md](./data-model.md): create `challans` (`po_id` FK to `customer_pos(id)` no cascade, `trade_name_id` FK to `trade_names(id)`, `challan_number varchar(30)`, `challan_date date`, `status check in ('issued','accepted','voided')` default `'issued'`, `accepted_at`/`accepted_by` nullable, `signed_copy_storage_path`/`signed_copy_file_name`/`signed_copy_content_type`/`signed_copy_uploaded_at`/`signed_copy_uploaded_by` all nullable, `unique (trade_name_id, challan_number)`, `idx_challans_po_status` index) and `challan_lines` (`challan_id` FK `on delete cascade`, `position smallint`, `po_line_id` FK to `customer_po_lines(id)` no cascade — ordinary `RESTRICT` default, `product_id`/`uom`/`unit_price` as **snapshot** columns not live-joined, `delivered_quantity numeric(10,2) check > 0`, `accepted_quantity numeric(10,2) check >= 0 and accepted_quantity <= delivered_quantity`, `shortfall_disposition check in ('return_to_inventory','write_off')` nullable); RLS enabled with no policies on both; an `updated_at` trigger reusing `set_updated_at()` from `0001_init.sql` on `challans` and `challan_lines`; the `challan-attachments` private Storage bucket insert
- [X] T004 In the same migration file per [data-model.md](./data-model.md): create `create_challan(p_po_id, p_trade_name_id, p_challan_number, p_challan_date, p_lines jsonb, p_user_id) returns uuid` (validates PO is open, validates each line's remaining quantity, resolves/formats the `CH #NNN/Mon` number and advances `trade_names.next_challan_number` when auto-generating, inserts the header + lines with `accepted_quantity = delivered_quantity` and snapshotted `product_id`/`uom`/`unit_price`); `update_challan(p_id, p_trade_name_id, p_challan_number, p_challan_date, p_lines jsonb, p_user_id) returns void` (raises `CHALLAN_NOT_EDITABLE` unless `status = 'issued'`; updates header; deletes and reinserts all `challan_lines` from `p_lines`, re-validating and re-snapshotting, `p_lines` here also carrying `accepted_quantity`/`shortfall_disposition` per line); `void_challan(p_id, p_user_id) returns void` (raises `CHALLAN_NOT_VOIDABLE` unless `status = 'issued'`, else sets `status = 'voided'`); and `accept_challan(p_id, p_user_id) returns void` (raises `CHALLAN_NOT_ISSUED`/`PO_CANCELLED`/`NO_ACCEPTED_QUANTITY`/`MISSING_SHORTFALL_DISPOSITION:<line ids>` as applicable; inserts an accepted-quantity-leaving movement per line dated `challans.challan_date`, plus a return-to-inventory movement dated `current_date` for any disposed shortfall; calls `recompute_product_quantity_on_hand` per distinct product; increments each `customer_po_lines.delivered_quantity`; determines the PO's customer's `issues_performa_invoice` flag and, only if `false`, inserts one `ledger_entries` credit row for `sum(accepted_quantity * unit_price)` across lines; sets `status = 'accepted'`, `accepted_at`, `accepted_by`) — all four `SECURITY INVOKER` (depends on T002, T003)
- [X] T005 [P] Create `lib/challans/schema.ts`: `challanLineInputSchema` (Zod — `poLineId` uuid, `deliveredQuantity` positive number), `challanInputSchema` (`poId` uuid, `tradeNameId` uuid, `challanNumber?`, `challanDate`, `lines` array of `challanLineInputSchema`, min 1), `challanLineUpdateSchema` (`poLineId` uuid, `deliveredQuantity` positive number, `acceptedQuantity` number `>= 0`, `shortfallDisposition?` `'return_to_inventory' | 'write_off'`), `challanUpdateInputSchema` (same header shape, `lines` array of `challanLineUpdateSchema`), `challanStatusSchema` (`'issued' | 'accepted' | 'voided'`), and TypeScript types `ChallanInput`, `ChallanLineInput`, `ChallanUpdateInput`, `ChallanListItem`, `ChallanDetail` (incl. `createdAt`/`updatedAt`/`acceptedAt`/`acceptedBy`, `signedCopyUrl`, `total`), `ChallanLineDetail` (incl. `article`, `productName`, `uom`, `unitPrice`, `deliveredQuantity`, `acceptedQuantity`, `shortfallDisposition`), `ChallanPrintView` (per [contracts/server-actions.md](./contracts/server-actions.md)) (depends on T004)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Issue a Challan against a customer PO (Priority: P1) 🎯 MVP

**Goal**: Staff can pick an open PO, select undelivered lines with a delivered quantity each, choose a trade name, save a Challan (auto- or self-numbered), and produce its printed/exportable view — all before any acceptance step.

**Independent Test**: Create a Challan against an open PO's undelivered line, confirm it saves as "Issued" with a correctly-formatted, trade-name-scoped number, appears in the Challan list, and its printed view shows the correct letterhead, line table, and totals (spec Acceptance Scenarios 1–6 for User Story 1).

### Implementation for User Story 1

- [X] T006 [US1] Implement `getOpenPOLinesForChallan(poId: string)` in `lib/challans/service.ts` — reuses `getCustomerPO` (006, `lib/customer-pos/service.ts`, already exported) and derives `remaining = quantityOrdered - deliveredQuantity` per line in TypeScript, filtering out lines where `remaining <= 0`, per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T005)
- [X] T007 [US1] Implement `createChallanRecord`, `updateChallanRecord`, `voidChallanRecord`, `listChallans`, `getChallan` in `lib/challans/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md): `createChallanRecord`/`updateChallanRecord`/`voidChallanRecord` call `create_challan`/`update_challan`/`void_challan` respectively, translating Postgres exceptions (`CHALLAN_NOT_EDITABLE`, `CHALLAN_NOT_VOIDABLE`, the `unique (trade_name_id, challan_number)` violation, line-validation errors) into friendly `Error`s matching `toFriendlyPOError`'s pattern in `lib/customer-pos/service.ts`; `listChallans(filters: { poId?, customerId?, status? })` joins `customer_pos(po_number, customer_id, customers(display_name))` and `trade_names(printed_name)`, ordered by `challan_date desc`; `getChallan(id)` joins po/customer/trade name/lines (each line's "Article" resolved live via `po_line_id → customer_po_lines.customer_item_code`, "Item Name" via the line's own snapshot `product_id → products.name`) and computes `total` in TypeScript over the fetched lines (matching 006's PO-total pattern); `signedCopyUrl` returns `null` for now (wired to real Storage data in User Story 2) (depends on T004, T005)
- [X] T008 [US1] Implement `getChallanForPrint(id: string)` in `lib/challans/service.ts` — same underlying fetch as `getChallan`, additionally resolving the trade name's `signature_image_path`/`stamp_image_path` to short-lived signed URLs via `lib/trade-names/storage.ts`'s existing `getSignedAssetUrl`, shaping the result per [contracts/server-actions.md](./contracts/server-actions.md)'s `ChallanPrintView` (depends on T007)
- [X] T009 [P] [US1] Implement `createChallan`, `updateChallan`, `voidChallan` Server Actions in `app/actions/challans.ts` — `requireCurrentUser()` (FR-017), Zod validation with `challanInputSchema`/`challanUpdateInputSchema`, call the matching `service.ts` function, `revalidatePath("/challans")` and the Challan's own detail path, matching the shape of `app/actions/customer-pos.ts` (depends on T007)
- [X] T010 [P] [US1] Create `components/challans/challan-line-row.tsx`: one line's delivered-quantity input (create mode) and remaining-quantity display; read-only rendering once the Challan is accepted (accepted-quantity/disposition inputs added in User Story 2) (depends on T005)
- [X] T011 [US1] Create `components/challans/challan-form.tsx`: `react-hook-form` + `zodResolver`, a PO picker (via `listCustomerPOs({ status: 'open' })`, 006, already exported — or pre-selected via a `poId` prop when arriving from a PO's own detail page) and trade-name picker (via `listActiveTradeNamesForSelect`, 005), a Challan number field (blank = auto-generate) and date field, and a dynamic undelivered-line checklist populated via `getOpenPOLinesForChallan` once a PO is selected, rendering `ChallanLineRow` per selectable line (depends on T006, T009, T010)
- [X] T012 [P] [US1] Create `components/challans/challan-list.tsx`: renders `ChallanListItem` rows (Challan number, date, status, PO number, customer, trade name), matching `components/customer-pos/customer-po-list.tsx`'s shape, plus PO/customer/status filter controls (depends on T005)
- [X] T013 [P] [US1] Create `components/challans/challan-print-view.tsx`: the printable layout — trade name letterhead (printed name/address), Challan number/date, customer legal name, PO number, a line table (S.NO/Article/Item Name/UOM/QTY — QTY = delivered quantity), a totals row, the trade name's signature/stamp images, two signature lines, styled with `@media print` rules (research.md, ADR-0006) (depends on T005)
- [X] T014 [US1] Create `app/(dashboard)/challans/page.tsx` and `loading.tsx`: Server Component reading `searchParams: Promise<{ poId?, customerId?, status? }>` and calling `listChallans(...)` (FR-016), rendering `ChallanList` (depends on T007, T012)
- [X] T015 [US1] Create `app/(dashboard)/challans/new/page.tsx`: reads an optional `?poId=` searchParam, renders `ChallanForm` (create mode) wired to the `createChallan` Server Action (depends on T009, T011)
- [X] T016 [US1] Create `app/(dashboard)/challans/[challanId]/page.tsx` and `loading.tsx`: Server Component calling `getChallan(id)`, rendering every header field, its created/last-updated timestamps (FR-018), each line (accepted-quantity/disposition editing and signed-copy upload added in User Story 2), the Challan's total, a "Print" link to `/challans/[id]/print`, and a void control (accept control added in User Story 2); returns a not-found state if `null` (depends on T007)
- [X] T017 [US1] Create `app/challans/[challanId]/print/page.tsx`: a standalone route **outside** the `(dashboard)` route group with its own `getCurrentUser()`/`redirect("/login")` gate (mirroring `(dashboard)/layout.tsx`'s check, per research.md/ADR-0006), calling `getChallanForPrint(id)` and rendering `ChallanPrintView` (depends on T008, T013)
- [X] T018 [P] [US1] Create `components/challans/challan-status-controls.tsx`: a void action (accept action added in User Story 2), calling the `voidChallan` action, surfacing a "This Challan has already been accepted and is read-only." message on `ChallanNotVoidableError` (depends on T009)
- [X] T019 [US1] Wire `ChallanStatusControls` into `app/(dashboard)/challans/[challanId]/page.tsx` (depends on T016, T018)
- [X] T020 [P] [US1] Extend `app/(dashboard)/customer-pos/[poId]/page.tsx` (006): add a "Create Challan" link (→ `/challans/new?poId=<id>`) and a list of this PO's own Challans (Challan number, status, date, link to its detail/print view), calling `listChallans({ poId })` (depends on T007)
- [X] T021 [P] [US1] Add a "Challans" link to the dashboard nav in `app/(dashboard)/layout.tsx`, alongside the existing Suppliers/Products/Purchases/Trade Names/Customers/Customer POs links (depends on T014)

**Checkpoint**: User Story 1 is fully functional and independently testable — Challans can be created, printed, listed, viewed, and voided. This is the MVP (no acceptance effects yet).

---

## Phase 4: User Story 2 - Record acceptance, including a short receipt (Priority: P1)

**Goal**: Staff can record each line's actual accepted quantity against the signed copy, choose a mandatory disposition for any shortfall, upload the scanned signed copy at any point, and finalize acceptance — which posts the PO-line rollup and correct inventory movements.

**Independent Test**: Accept an Issued Challan with accepted quantity equal to delivered and confirm the PO line's Delivered figure and the product's quantity-on-hand both update correctly and the Challan becomes read-only; reduce another Challan's accepted quantity below delivered and confirm acceptance is blocked until a disposition is chosen, for both "return to inventory" and "write off" (spec Acceptance Scenarios 1–7 for User Story 2).

### Implementation for User Story 2

- [X] T022 [US2] Implement `acceptChallanRecord(id: string, userId: string)` in `lib/challans/service.ts` — calls `accept_challan`, translating `CHALLAN_NOT_ISSUED`/`PO_CANCELLED`/`NO_ACCEPTED_QUANTITY`/`MISSING_SHORTFALL_DISPOSITION:<ids>` into friendly errors per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T007)
- [X] T023 [US2] Implement `uploadChallanSignedCopy`/`getSignedChallanCopyUrl` in `lib/challans/storage.ts` — mirrors `lib/trade-names/storage.ts` exactly (ADR-0003), targeting the `challan-attachments` bucket, following 004's three-step re-upload ordering (upload new → point `challans`' `signed_copy_*` columns at it → best-effort delete the old object) (depends on T003)
- [X] T024 [US2] Extend `getChallan`/`getChallanForPrint` (`lib/challans/service.ts`) to resolve the real `signed_copy_*` columns via `storage.ts`, replacing User Story 1's `null` placeholder (depends on T007, T008, T023)
- [X] T025 [P] [US2] Implement `acceptChallan`, `uploadChallanSignedCopy` Server Actions in `app/actions/challans.ts` (depends on T022, T023)
- [X] T026 [US2] Extend `components/challans/challan-line-row.tsx` to render, in edit mode, an accepted-quantity input (defaulting equal to delivered, never above it) and a shortfall-disposition select (`return_to_inventory` / `write_off`, shown and required only when accepted < delivered) (depends on T010)
- [X] T027 [US2] Extend `components/challans/challan-form.tsx`'s edit mode to submit each line's `acceptedQuantity`/`shortfallDisposition` via `updateChallan`, only reachable while the Challan's status is "Issued" (depends on T011, T026)
- [X] T028 [P] [US2] Create `components/challans/challan-signed-copy-upload.tsx`: an upload control calling `uploadChallanSignedCopy`, usable regardless of the Challan's status (FR-006) (depends on T025)
- [X] T029 [US2] Extend `components/challans/challan-status-controls.tsx` with an Accept action, surfacing `MissingShortfallDispositionError` as an inline message naming the affected line(s), `NoAcceptedQuantityError`, and `PoCancelledError` ("The referenced PO is cancelled — reactivate it before accepting this Challan.") (depends on T018, T025)
- [X] T030 [US2] Wire an edit link (to a Challan edit form reusing `ChallanForm`) and `ChallanSignedCopyUpload` into `app/(dashboard)/challans/[challanId]/page.tsx` (depends on T016, T027, T028, T029)

**Checkpoint**: User Stories 1 AND 2 both work — Challans can be issued, printed, edited (including accepted quantity/disposition), have a signed copy attached at any point, and be accepted with correct PO-line and inventory effects. (Ledger posting is already correct per T004's `accept_challan` — User Story 3 below makes its outcome visible.)

---

## Phase 5: User Story 3 - Post the accepted Challan's value to the right place (Priority: P2)

**Goal**: Staff can see, on the Challan itself, that accepting it posted the correct ledger outcome for that specific customer — a credit for customers without a separate Performa Invoice, nothing for the one who has one.

**Independent Test**: Accept a Challan for a customer flagged "Issues Performa Invoice" = No and confirm exactly one ledger credit entry appears for that customer, visible from the Challan's own detail view; accept one for a customer flagged "Issues Performa Invoice" = Yes and confirm no ledger entry is created, also reflected on the Challan's detail view (spec Acceptance Scenarios 1–3 for User Story 3).

### Implementation for User Story 3

- [X] T031 [US3] Extend `getChallan` (`lib/challans/service.ts`) to look up whether accepting this Challan posted a `ledger_entries` row (`source_type = 'challan'`, `source_id = challans.id`) and, if so, its amount — exposed on `ChallanDetail` as `ledgerCreditAmount: number | null` (depends on T007)
- [X] T032 [US3] Display the ledger-posting outcome on `app/(dashboard)/challans/[challanId]/page.tsx` once a Challan is accepted — "Ledger credit posted: Rs {amount}" when `ledgerCreditAmount` is set, "No ledger entry — this customer is billed via Performa Invoice" when it's `null` (depends on T016, T031)

**Checkpoint**: All three user stories are independently functional — the full Challan lifecycle, including correct customer-specific ledger posting, is visible end-to-end.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories, and manual verification of the feature's structural correctness rules — especially the two corrections made during spec/plan review.

- [X] T033 [P] Review that `status`, `acceptedAt`, `acceptedBy`, and each line's `productId`/`uom`/`unitPrice` are never accepted as writable fields anywhere on `ChallanInput`/`ChallanUpdateInput` at the type level, and that no Server Action or service function ever sets them directly — `status` changes only through `voidChallan`/`acceptChallan`, and the line snapshot fields are set only inside `create_challan`/`update_challan` themselves (research.md's snapshot decision)
- [X] T034 Verify FR-002 manually: create a Challan against a PO line, accept it partially, then try creating a second Challan exceeding that line's new remaining quantity → confirm rejection naming the remaining amount; confirm a fully-delivered line is excluded from selection entirely (quickstart.md)
- [X] T035 Verify FR-011/SC-007 manually (the `quantity_on_hand` reconciliation, ADR-0005): note a traded product's quantity-on-hand before and after an accepted Challan touching it, then edit an unrelated field on one of that product's existing purchases (003b) → confirm quantity-on-hand still reflects the Challan's effect afterward, not reset to a purchase-only figure (quickstart.md)
- [X] T036 Verify FR-007/FR-010 manually: create a shortfall on one line and try to accept without a disposition → rejected, naming the line; set "return to inventory" → accept → confirm quantity-on-hand reflects only the accepted amount leaving; repeat with "write off" on another Challan → confirm the full delivered amount leaves inventory with no return (quickstart.md)
- [X] T037 Verify FR-012 manually: accept a Challan for a customer with `issues_performa_invoice = false` → confirm exactly one ledger credit for `sum(accepted_quantity × unit_price)`; accept one for a customer with `issues_performa_invoice = true` → confirm no ledger entry is created (quickstart.md)
- [X] T038 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all three user stories, including the documented manufactured-product interim-limitation check (research.md)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories. Includes all four Postgres functions (`create_challan`/`update_challan`/`void_challan`/`accept_challan`, the last already including its ledger-posting step) in one migration, matching 006's precedent of bundling every RPC for a feature into Foundational even when a specific function (here, `accept_challan`'s ledger step) is only *exercised* by a later story.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `service.ts`/`challan-line-row.tsx`/`challan-form.tsx`/`challan-status-controls.tsx`/detail page (T007, T010, T011, T016, T018) to extend rather than duplicate.
  - US3 depends on US1's `service.ts`/detail page (T007, T016) to extend — its underlying database behavior already exists from T004; US3 only adds visibility into it.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T005 can run once T004 is done (T002–T004 are sequential — same migration file).
- US1: T009, T010, T012, T013 can run in parallel (different files) once T006/T007/T005 are done; T018, T020, T021 can run alongside once their own dependencies (T009, T007, T014) exist.
- US2: T025, T028 can run in parallel (different files) once T022/T023 are done.
- Polish: T033 can run in parallel with T034/T035/T036/T037/T038.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement createChallan/updateChallan/voidChallan Server Actions in app/actions/challans.ts"
Task: "Create ChallanLineRow in components/challans/challan-line-row.tsx"
Task: "Create ChallanList in components/challans/challan-list.tsx"
Task: "Create ChallanPrintView in components/challans/challan-print-view.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — staff can issue and print a Challan against an open PO

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → deploy/demo (MVP)
3. User Story 2 → validate independently → deploy/demo (acceptance, shortfalls, inventory effects)
4. User Story 3 → validate independently → deploy/demo (ledger-posting visibility)
5. Polish phase → deploy final hardening

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- Each user story phase ends at a checkpoint where that story is independently demoable.
- Commit after each task or logical group, matching the project's small-diff convention.
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest stack from research.md if desired later.
- **T004's `accept_challan` is built with its full, final behavior (including the ledger-posting
  step) in Foundational, not incrementally across US2/US3** — matching 006's own precedent of
  bundling every Postgres function for a feature into one Foundational phase, even
  `set_customer_po_status`, which only User Story 3 there actually exercised. US3 here therefore
  adds no new database behavior, only visibility into behavior T004 already implements correctly —
  its own Independent Test still holds (ledger posting is verifiably correct per customer type),
  it's just verified via T037/quickstart.md rather than via new US3-only backend code.
- **T002's redefinition of 003b's functions is the highest-risk task in this feature** — it changes
  the behavior of already-shipped, already-relied-upon Postgres functions
  (`record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase`/
  `recompute_product_purchase_stats`) via `CREATE OR REPLACE` in a new migration, per
  [ADR-0005](../../history/adr/0005-inventory-movements-created-at-007-not-003b.md). T035 exists
  specifically to verify this redefinition holds under the exact collision scenario the user
  identified during spec review (an unrelated purchase edit must never reset a product's
  Challan-affected quantity-on-hand).
- **The manufactured-product interim limitation (research.md) is deliberately not a polish task to
  "fix"** — it's an accepted, documented tradeoff from the master roadmap's own build order, not a
  gap in this feature's own scope. T038 exercises it as a documented, expected failure mode, not a
  bug to resolve.
- **T017's standalone print route and its duplicated auth check** are per
  [ADR-0006](../../history/adr/0006-printed-documents-via-server-rendered-print-routes.md) — do
  not "simplify" this by moving the print page inside `(dashboard)` during implementation; that
  would reintroduce the coupling ADR-0006 explicitly rejected.

## Implementation Notes (post `/sp.implement`)

- **T002/T003/T004 written, not yet applied**: `supabase/migrations/0007_challans.sql` is
  complete and has been carefully re-read end to end for correctness, but this environment has no
  direct Postgres/DDL access (only `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/
  `SUPABASE_SECRET_KEY` are set — no `DATABASE_URL`, no `pg` package installed), the same
  sequencing as 002/003b/004/005/006. **The user must apply this migration in the Supabase SQL
  editor before T034–T038 (live verification) or any manual testing can proceed.**
- **`delete_unit_purchase`'s signature was extended** from `(p_id uuid)` to `(p_id uuid, p_user_id
  uuid)` to attribute the reversing `inventory_movements` row this migration adds to it — its one
  caller, `deletePurchaseRecord` (`lib/purchases/service.ts`), and that function's own caller,
  `deletePurchase` (`app/actions/purchases.ts`), were both updated to thread the already-available
  `user.id` through. Verified by grep that no other caller exists.
- **`inventory_movements.created_by` is nullable** — the one deliberate deviation from
  `ledger_entries.created_by`'s `not null` precedent (005), since the one-time opening-balance
  backfill (T002) is a migration-time system insert with no attributable staff action. Every
  application-inserted row (purchases, Challans) still always sets it.
- **A design gap found and fixed during implementation, not caught at plan time**: the master
  spec's printed Challan columns (S.NO/Article/Item Name/UOM/QTY) have **no price column at all**
  — a delivery note, unlike an invoice. `plan.md`/`contracts/server-actions.md` had described
  `ChallanPrintView`'s "total" generically, which could have been misread as a monetary total.
  Implemented `ChallanPrintView.totalQuantity` as a pure quantity sum (matching the real printed
  format exactly) and kept `ChallanDetail.total` (the ledger-credit basis, FR-012) as the separate
  monetary figure shown only on the staff-facing detail page, never printed.
- **A schema gap found and fixed during implementation**: `challanUpdateInputSchema` initially
  inherited a `poId` field from a shared `baseChallanFields` object (mirroring `challanInputSchema`)
  — but `update_challan` takes no `p_po_id` parameter at all (a Challan's PO is immutable once
  created). Removed `poId` from the update schema/type entirely rather than carrying a field the
  RPC would silently ignore.
- **`ChallanForm` does not reuse react-hook-form/`useFieldArray`** the way `customer-po-form.tsx`
  (006) does. A Challan's lines are always a subset of one PO's own undelivered lines (FR-001,
  FR-002) — a fixed candidate set toggled by checkbox, not a freely add/remove row list — so plain
  component state per candidate line fit better than a pattern built for arbitrary array mutation.
  Deeper correctness (remaining-quantity limits, the shortfall-disposition requirement) is still
  enforced server-side by `create_challan`/`update_challan`/`accept_challan` and surfaced via
  `handleFailure`-style error translation in `lib/challans/service.ts`.
- **`/challans/new` with no `?poId=` shows a PO picker that navigates to `?poId=<id>`**, a full
  Server Component reload, rather than fetching candidate lines client-side — consistent with this
  project's general preference for server-rendered data over client-side fetching where the extra
  round trip is cheap (research.md's reasoning for `getOpenPOLinesForChallan` itself).
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass
  cleanly on the full repo (not just this feature's files) — confirmed the standalone
  `app/challans/[challanId]/print/page.tsx` route coexists correctly with
  `app/(dashboard)/challans/[challanId]/page.tsx` and `.../edit/page.tsx` (same `challanId` dynamic
  segment name in two different parts of the route tree, no collision) by inspecting the build's
  route table: `/challans`, `/challans/[challanId]`, `/challans/[challanId]/edit`,
  `/challans/[challanId]/print`, `/challans/new` all resolved as distinct routes.
- **T034–T038 (live verification against a real Supabase project) are blocked on the user applying
  the migration** — not run yet. Once applied, these should follow 006's own precedent: a
  throwaway Node script using the service-role client directly, seeding clearly-marked rows and
  deleting them immediately after, plus a walkthrough of the actual running app
  (`npm run dev` + browser).
- **Real bug found by the user during migration review, before it was applied**: `create_challan`/
  `update_challan`'s per-line loop re-reads `customer_po_lines` fresh on every iteration and
  neither function ever writes to that table itself (only `accept_challan` does, on acceptance).
  That meant two `p_lines` entries pointing at the same `po_line_id` — unreachable through
  `ChallanForm` today, since its line list is a fixed 1:1 rendering of a PO's candidate lines, but
  fully reachable via a direct Server Action call or any future UI change — could each
  individually pass the remaining-quantity check against the *same* stale figure and together
  overcommit the PO line. Fixed in both functions (not a new migration — caught before this one
  was ever applied) with an explicit `DUPLICATE_PO_LINE` guard rejecting any `p_lines` array
  referencing the same PO line more than once, since there is no legitimate case for one Challan
  to reference a PO line twice — a second partial delivery of the same line belongs on a separate
  Challan. Added a matching friendly-error translation in `lib/challans/service.ts` and an earlier,
  client-side `superRefine` guard (`noDuplicatePoLines`) on both line-array schemas in
  `lib/challans/schema.ts` — the DB guard is the authoritative fix; the schema-level one is just a
  friendlier message for any caller that bypasses the form. `tsc`/`lint`/`build` re-verified clean
  after the fix.
- **T034–T038 completed** after the user applied `0007_challans.sql` in the Supabase SQL editor.
  Two live-verification passes, both against clearly-marked `ZZZ QA` rows via the service-role
  client, fully cleaned up afterward (residue confirmed 0 in both cases):
  1. **DB-layer** (28 assertions, all PASS): the remaining-quantity edge case (reject exceeding
     remaining, reject a fully-delivered line, accept exactly the remaining amount); `quantity_on_
     hand === SUM(inventory_movements)` after every purchase, purchase edit, and Challan
     acceptance; both shortfall dispositions (`write_off` — accepted leaves, shortfall vanishes
     with no return movement; `return_to_inventory` — accepted leaves, shortfall comes back as a
     second movement) with `MISSING_SHORTFALL_DISPOSITION` correctly blocking acceptance first;
     per-customer ledger routing (4 accepted Challans for a `issuesPerformaInvoice = false`
     customer → 4 credits, amounts verified; 1 accepted Challan for a `= true` customer → 0
     credits); the `DUPLICATE_PO_LINE` guard from the prior review round. Two early failures
     traced to the verification script's own incomplete assertions (an unfiltered movement count,
     an undercounted ledger-credit expectation), not the system — documented and corrected before
     the clean 28/28 run.
  2. **Live app / browser walkthrough**: signed in as a throwaway QA staff account, drove the
     actual running app end to end — 006's PO detail page's new "Create Challan" link, the create
     form (PO/trade-name/date/number, checkbox-selected undelivered line, delivered-quantity
     input), the standalone print route (confirmed no dashboard nav chrome, correct letterhead/
     line table/quantity-only total per FR-005), the edit form (accepted-quantity input,
     shortfall-disposition selector appearing only once accepted < delivered), Accept (confirmed
     the "Ledger credit posted: Rs 875.00" banner, and that Edit/Accept/Void controls disappear
     once accepted — FR-013), the Challans list (both statuses visible), and Void (confirmed the
     same terminal-state control disappearance). One implementation-detail note for future
     `/sp.implement` runs: `form_input` on a checkbox can desync from React's own controlled state
     in this app — a real `computer` click (by coordinate or element `ref`) is the reliable way to
     toggle a checkbox here. All seeded rows and the throwaway auth user were deleted afterward;
     residue confirmed 0.
