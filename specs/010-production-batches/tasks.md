---

description: "Task list for Production Batches implementation"
---

# Tasks: Production Batches

**Input**: Design documents from `/specs/010-production-batches/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: The spec doesn't ask for tests, so there are no test-writing tasks (the same call as
001–009). Verification is the manual [quickstart.md](./quickstart.md) walkthrough in the Polish
phase.

**Organization**: Tasks are grouped by user story. **The order differs from spec priority in one
place**: US6 (Contractors, P2) comes before US1, because issuing a batch needs a contractor to exist
(spec US6, "must exist before the first batch is issued"). The rest follow spec order: US1 → US2 →
US3 (all P1), then US4 → US5 (P2).

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story the task belongs to (US1–US6)

## Path Conventions

This is a single Next.js project at the repository root (plan.md, Project Structure):

- `supabase/migrations/0010_production_batches.sql`: new migration (0001–0009 are never edited)
- `lib/contractors/{schema,service}.ts`, `lib/production-batches/{schema,service}.ts`: new modules
- `app/actions/{contractors,production-batches}.ts`: new Server Actions
- `components/contractors/*`, `components/production-batches/*`: new components
- `app/(dashboard)/contractors/**`, `app/(dashboard)/production-batches/**`: new routes
- Extended: `lib/purchases/service.ts`,
  `lib/products/service.ts`, `app/(dashboard)/products/[productId]/page.tsx`,
  `app/(dashboard)/layout.tsx`

**Conventions to mirror**:
- **Code patterns**: follow the existing 007 files exactly (`lib/challans/service.ts` error mapping
  `toFriendlyChallanError`, `app/actions/challans.ts` `ActionResult` + `revalidatePath`, and the
  page and component structure under `app/(dashboard)/challans/**`).
- **Next.js APIs**: for any API not already used in this codebase (for example `searchParams`
  typing on pages), check `node_modules/next/dist/docs/` first (CLAUDE.md).

---

## Phase 1: Setup

**Purpose**: Scaffold the migration. There are no new dependencies (plan.md, Technical Context).

- [X] T001 Create an empty `supabase/migrations/0010_production_batches.sql` with a header comment in the style of `0009_customer_ledger.sql`. It should summarise the feature and point to `specs/010-production-batches/data-model.md` and ADR-0008.

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, all six Postgres functions, the shared Zod schemas and types, and error mapping that every story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 In `supabase/migrations/0010_production_batches.sql`, create the following exactly as in [data-model.md](./data-model.md):
  - the `contractors` table, the `idx_contractors_name_unique` index on `lower(btrim(name))`, `idx_contractors_status_name`, and the `trg_contractors_updated_at` trigger reusing `set_updated_at()`;
  - `create sequence production_batch_number_seq`;
  - the `production_batches` table with the `production_batches_completion_fields_check`, `production_batches_void_fields_check` and `production_batches_completion_after_issue` constraints, its four indexes, and the `trg_production_batches_updated_at` trigger;
  - the `manufactured_opening_stock` table with `manufactured_opening_stock_correction_check`;
  - `enable row level security` with no policies on all three tables;
  - table and column comments, including a `comment on column raw_material_purchases.remaining_weight_kg`, updated to name `production_batches` (010) as its consumer.
- [X] T003 In the same migration, create `issue_production_batch`, `update_production_batch`, `void_production_batch` and `complete_production_batch` exactly per the "Functions" section of [data-model.md](./data-model.md). The following details must hold:
  - every function locks the batch row and then the lot rows `FOR UPDATE`;
  - `update_production_batch` locks the old and new lots in **ascending id order**, restores the old weight, and only then checks and deducts the new weight;
  - `nextval('production_batch_number_seq')` is called only after every validation, and formatted `'PB-' || lpad(n::text, 4, '0')`;
  - `complete_production_batch` raises `RETURNED_WEIGHT_UNCONFIRMED` when returned > issued and `p_confirm_returned_weight_exceeded` is false;
  - completion stores every figure with `round(…, 2)`, `expected_packets = floor(weight × yield)`, and `wastage_kg = 0` when exceeded;
  - completion inserts one `inventory_movements` row (`+packets`, `'Production batch completed'`, `'production_batch'`, batch id, `completion_date`) and then calls `recompute_product_quantity_on_hand`;
  - error codes are exactly: `NOT_FOUND`, `LOT_NOT_FOUND`, `LOT_NOT_WEIGHT_MODE`, `ISSUE_BEFORE_PURCHASE:<date>`, `LOT_INSUFFICIENT_WEIGHT:<remaining>`, `PRODUCT_NOT_ELIGIBLE`, `CONTRACTOR_NOT_ACTIVE`, `BATCH_NOT_EDITABLE:<status>`, `BATCH_NOT_VOIDABLE:<status>`, `BATCH_NOT_ISSUED:<status>`, `COMPLETION_BEFORE_ISSUE`, `RETURNED_WEIGHT_UNCONFIRMED`.

  (depends on T002)
- [X] T004 In the same migration, create `record_manufactured_opening_stock` and `record_manufactured_opening_stock_correction` per [data-model.md](./data-model.md). The following details must hold:
  - the `products` row is locked first;
  - movements use `source_type = 'opening_balance'`, `source_id = product_id`, and reason `'Opening balance'` or `'Opening balance correction'`, followed by `recompute_product_quantity_on_hand`;
  - the "already shipped" check is `exists (… source_type = 'challan_line' and qty_delta < 0)`;
  - error codes are exactly: `NOT_FOUND`, `PRODUCT_NOT_MANUFACTURED`, `OPENING_STOCK_EXISTS`, `OPENING_STOCK_NOT_FOUND`, `CORRECTION_EXISTS`, `STOCK_ALREADY_SHIPPED`, `CORRECTION_BEFORE_ENTRY`, `CORRECTION_BELOW_ZERO`.

  (depends on T002)
- [X] T005 [P] Create `lib/contractors/schema.ts` with the following, per [contracts/server-actions.md](./contracts/server-actions.md):
  - `contractorInputSchema` (Zod): `name` is trimmed, 1–120 chars, required; `phone` is optional, trimmed, and blank becomes `null`;
  - `contractorStatusSchema` (`'active' | 'inactive'`);
  - types `ContractorInput`, `Contractor`, `ContractorListItem`.
- [X] T006 [P] ~~Add the `export` keyword to `endOfTodayUtc()` in `lib/purchases/schema.ts`~~ **Superseded during implementation**: 010 compares against today's Pakistan date (`todayInPakistan()` in `lib/production-batches/schema.ts`) instead, because 002's end-of-UTC-day rule rejects today's PKT date between 00:00 and 05:00 PKT (research.md, correction). No change to `lib/purchases/schema.ts`.
- [X] T007 Create `lib/production-batches/schema.ts`. It holds the following schemas and types, per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T006):
  - `batchIssueInputSchema`: `lotId`, `productId` and `contractorId` are uuids; `weightIssuedKg` and `labourRatePerPacket` must be > 0; `issueDate` must not be in the future, compared against `todayInPakistan()` (research.md).
  - `batchCompleteInputSchema`: `packetsProduced` is an integer ≥ 1; `returnedWeightKg` must be > 0; `completionDate` must not be in the future; `confirmReturnedWeightExceeded` is a boolean defaulting to false.
  - `openingStockInputSchema`: `productId`; `quantity` is an integer ≥ 1; `entryDate` must not be in the future; `costPerPacket` is optional and > 0.
  - `openingStockCorrectionInputSchema`: `productId`; `correctionQty` is a non-zero integer; `reason` is trimmed and required; `correctionDate` must not be in the future.
  - `batchStatusSchema`.
  - Types: `BatchIssueInput`, `BatchCompleteInput`, `OpeningStockInput`, `OpeningStockCorrectionInput`, `LotOption`, `BatchListItem`, `BatchDetail` (all entered, frozen and audit fields, `expectedPacketsSuggestion`, `yieldVariance`, `yieldVariancePct`, `returnedWeightExceeded`), `OpeningStockRow`, `StockMovementRow`.
- [X] T008 Create `lib/production-batches/service.ts` (`import "server-only"`) with the following (depends on T003, T004, T007):
  - `toFriendlyBatchError(error)`, mapping every error code from T003/T004 to the friendly error classes and messages listed in [contracts/server-actions.md](./contracts/server-actions.md), the same way `toFriendlyChallanError` in `lib/challans/service.ts` does;
  - an exported `round2` helper;
  - the error classes: `LotInsufficientWeightError`, `IssueBeforePurchaseError`, `ProductNotEligibleError`, `ContractorNotActiveError`, `BatchNotEditableError`, `BatchNotVoidableError`, `BatchNotIssuedError`, `CompletionBeforeIssueError`, `ReturnedWeightUnconfirmedError`, `OpeningStockExistsError`, `CorrectionExistsError`, `StockAlreadyShippedError`, `CorrectionBelowZeroError`, and the rest.
- [ ] T009 Apply `0010_production_batches.sql` to the Supabase project (SQL editor or the CLI already in use for 0001–0009). Confirm the three tables, the sequence and the six functions exist (depends on T002–T004).

**Checkpoint**: Foundation ready. User story work can begin.

---

## Phase 3: User Story 6 - Maintain the contractor list (Priority: P2, sequenced first as a prerequisite of US1)

**Goal**: Staff can add, edit, activate and deactivate contractors. Contractor names are unique, ignoring case and trimmed.

**Independent Test**: Add "Rashid Contractor". Adding " rashid contractor " is rejected as a duplicate. Deactivate Rashid, and they drop off the active select list (quickstart §1).

- [X] T010 [US6] Create `lib/contractors/service.ts` (`import "server-only"`) with the following (depends on T005, T009):
  - `createContractorRecord(input, userId)`: stores `btrim` name, maps `23505` to `DuplicateContractorNameError` ("A contractor with this name already exists.");
  - `updateContractorRecord(id, input, userId)`: same mapping; throws `NotFoundError` when the row is missing;
  - `setContractorStatusRecord(id, status, userId)`;
  - `listContractors({ status? })`: ordered by `lower(name)`;
  - `getContractor(id)`;
  - `listActiveContractorsForSelect()`: a thin wrapper returning `{ id, name }[]`.
- [X] T011 [US6] Create `app/actions/contractors.ts` (`"use server"`) with `createContractor`, `updateContractor` and `setContractorStatus` (depends on T010):
  - each calls `requireCurrentUser()`, parses with Zod, calls the service, and returns an `ActionResult`, the same as `app/actions/challans.ts`;
  - each revalidates `/contractors` (and `/production-batches` on status change).
- [X] T012 [P] [US6] Create `components/contractors/contractor-form.tsx`, a client component using react-hook-form and `zodResolver(contractorInputSchema)`. It has create and edit modes, shows the `fieldErrors` and `error` from `ActionResult`, and redirects to `/contractors` on success.
- [X] T013 [P] [US6] Create `components/contractors/contractor-list.tsx`: a table of name, phone and status, with an Activate/Deactivate button calling `setContractorStatus`, and an Edit link.
- [X] T014 [US6] Create the pages (depends on T011–T013):
  - `app/(dashboard)/contractors/page.tsx`: list, with a status filter via `searchParams` matching `app/(dashboard)/challans/page.tsx`'s handling, and a "New contractor" link;
  - `app/(dashboard)/contractors/loading.tsx`;
  - `app/(dashboard)/contractors/new/page.tsx`;
  - `app/(dashboard)/contractors/[contractorId]/edit/page.tsx`: calls `notFound()` if the contractor is missing.
- [X] T015 [US6] Add a "Contractors" nav link (`/contractors`) to `app/(dashboard)/layout.tsx`, after "Customer Ledger", with the same markup as the existing links.

**Checkpoint**: Contractors can be managed on their own.

---

## Phase 4: User Story 1 - Issue fabric to a contractor as a new batch (Priority: P1) 🎯 MVP

**Goal**: Staff issue a batch from a weight lot. The lot's remaining weight drops immediately and 002's lock engages. The rate pre-fills from the product, and expected packets are shown as a suggestion.

**Independent Test**: Issue 3,000 kg from Lot A. The batch is PB-0001, Issued; Lot A shows 0 kg and is locked; the product's stock is unchanged. Issuing 1,500 kg from a 1,200 kg lot is rejected (quickstart §2 and §3).

- [X] T016 [P] [US1] In `lib/purchases/service.ts`, close 002's read-then-write race per [research.md](./research.md) and [data-model.md](./data-model.md) ("Change to shipped code"):
  - **Weight branch of `updatePurchaseRecord`**:
    - add `.eq("weight_kg", existing.weightKg!).eq("remaining_weight_kg", existing.weightKg!).select("id")` to the `update`;
    - throw the existing `PurchaseLockedError("This lot has already been used in production and can no longer be edited")` when zero rows come back.
  - **Weight branch of `deletePurchaseRecord`**:
    - apply the same conditional filter, `.select("id")` and zero-rows check;
    - map Postgres error `23503` to `PurchaseLockedError("This lot is referenced by a production batch (voided batches included) and cannot be deleted")` (spec US4-5 and FR-012, confirmed with the user).
  - Don't touch the unit-mode branches.
- [X] T017 [P] [US1] In `lib/products/service.ts`, add `listActiveManufacturedProductsForSelect()`. It's a thin wrapper over `listProducts({ type: "manufactured", status: "active" })` returning `{ id, name, stockUom, defaultLabourRatePerPacket, expectedYieldPerKg }[]`, with the same style as `listActiveTradedProductsForSelect`.
- [X] T018 [US1] In `lib/production-batches/service.ts`, add the following (depends on T008, T009, T016):
  - `issueProductionBatchRecord(input, userId)`: RPC `issue_production_batch` with `round2` weight and rate; returns `{ id }`; errors go through `toFriendlyBatchError`.
  - `listAvailableLotsForBatch(opts?)`:
    - selects weight-mode lots with `remaining_weight_kg > 0`, joined to the supplier name, ordered by `purchase_date` ascending;
    - maps them to `LotOption`, labelled `"{supplier} · {date} · {remaining}/{total} kg · Rs {rate}/kg"`.
    - Leave the `includeBatchId` parameter unimplemented until T033.
  - `getProductionBatch(id)`:
    - joins the lot and its supplier, the product and the contractor;
    - maps every column into `BatchDetail`;
    - while Issued, computes `expectedPacketsSuggestion = floor(weightIssuedKg × product.expectedYieldPerKg)`;
    - once Completed, computes `yieldVariance` and `yieldVariancePct` from the stored `expected_packets`;
    - returns `null` if the batch is not found.
- [X] T019 [US1] Create `app/actions/production-batches.ts` (`"use server"`) with `issueProductionBatch(input)`. It revalidates `/production-batches` and `/purchases`, and returns `{ id }` (depends on T018).
- [X] T020 [US1] Create `components/production-batches/batch-issue-form.tsx`, a client component using react-hook-form and `zodResolver(batchIssueInputSchema)` (depends on T007, T019). Its props are lots, products and contractors, plus an optional `defaultValues` and `mode` for T034. It shows:
  - a lot `<select>` using the `LotOption` label;
  - a product select that sets `labourRatePerPacket` to the product's `defaultLabourRatePerPacket` when the selection changes; staff can still edit it;
  - a contractor select;
  - weight and issue date inputs (defaulting to today);
  - a live "Expected ≈ N packets (suggestion only)" line, where N = `floor(weight × expectedYieldPerKg)`.
  - On success, create mode redirects to `/production-batches/{id}`.
- [X] T021 [US1] Create the pages (depends on T017–T020):
  - `app/(dashboard)/production-batches/new/page.tsx`: loads `listAvailableLotsForBatch()`, `listActiveManufacturedProductsForSelect()` and `listActiveContractorsForSelect()`, and renders `BatchIssueForm`.
  - `app/(dashboard)/production-batches/[batchId]/page.tsx`: basic detail showing batch number, status, lot label, product, contractor, weight issued, labour rate, issue date, expected-packets suggestion and audit fields; calls `notFound()` if the batch is missing.
  - `app/(dashboard)/production-batches/[batchId]/loading.tsx`.
- [X] T022 [US1] Create a minimal `app/(dashboard)/production-batches/page.tsx` (extended in T037–T039): a simple table of batch number (linking to the detail page), status, contractor, product, kg and issue date, plus a "New batch" link. Create `app/(dashboard)/production-batches/loading.tsx`. Add a "Production" nav link (`/production-batches`) to `app/(dashboard)/layout.tsx`, before "Contractors" (depends on T018).

**Checkpoint**: US1 is fully functional. Fabric out with contractors is now recorded, and the MVP can be demonstrated.

---

## Phase 5: User Story 2 - Complete a batch when the packets come back (Priority: P1)

**Goal**: Completion adds the packets to stock and freezes cost, wastage and variance. The returned-weight-over-issued case warns and needs confirmation, but never blocks.

**Independent Test**: Complete PB-0001 with 2,500 packets, 2,900 kg returned. It shows Rs 200,010.00 / 25,000.00 / 225,010.00 / 90.00, wastage 100 kg / Rs 6,667.00 / 3.33%, and variance −200 (−7.41%). Stock rises by 2,500 (quickstart §5 and §6).

- [X] T023 [US2] In `lib/production-batches/service.ts`, add `completeProductionBatchRecord(id, input, userId)`. It calls RPC `complete_production_batch` with `p_confirm_returned_weight_exceeded` taken from the input and a `round2` returned weight. `ReturnedWeightUnconfirmedError` must be distinguishable (for example an `instanceof` check, or a stable message the form can detect) (depends on T018).
- [X] T024 [US2] In `app/actions/production-batches.ts`, add `completeProductionBatch(id, input)`. It revalidates `/production-batches`, `/production-batches/{id}` and `/products/{productId}`; the product id comes from the batch (depends on T023).
- [X] T025 [P] [US2] Create `components/production-batches/batch-complete-form.tsx`, a client component with props `batchId`, `weightIssuedKg`, `lotRatePerKg`, `labourRatePerPacket` and `expectedPackets`:
  - Inputs: packets (integer), returned weight, and completion date (default today).
  - A live preview of raw material, labour, total and average cost, wastage (kg / Rs / %) and variance, using the same formulas and rounding as data-model.md. This is for display only; the server values are authoritative.
  - When returned > issued, submit first asks `window.confirm("Returned weight exceeds weight issued (packaging weight?). Wastage will be recorded as 0. Continue?")`, the same confirmation pattern as `components/challans/challan-status-controls.tsx`. Only on OK does it send `confirmReturnedWeightExceeded: true`.
  - If the server still returns the unconfirmed error (a stale form), show it inline and ask again on the next submit.
- [X] T026 [P] [US2] Create `components/production-batches/batch-cost-summary.tsx`, a presentational breakdown of the frozen figures:
  - raw material cost, labour cost, total cost and average cost per packet;
  - wastage in kg, Rs and %, plus the note "Returned weight exceeded weight issued" when `returnedWeightExceeded` is true;
  - expected packets and variance (count and %), labelled "for information only".

  Money is formatted as PKR to 2 decimal places, matching existing currency formatting in `components/challans/*`.
- [X] T027 [US2] Extend `app/(dashboard)/production-batches/[batchId]/page.tsx` (depends on T024–T026):
  - while status is `issued`, render `BatchCompleteForm`;
  - when `completed`, render `BatchCostSummary` plus the packets produced, returned weight and completion date, with no action buttons (FR-013).
- [X] T028 [P] [US2] In `lib/products/service.ts`, add `listProductStockMovements(productId)`: `inventory_movements` for the product, ordered by `movement_date desc, created_at desc`, mapped to `StockMovementRow`. In `app/(dashboard)/products/[productId]/page.tsx`, add a read-only "Stock history" table showing date, reason, signed quantity, and a "View batch" link when `sourceType === 'production_batch'`.

**Checkpoint**: US1 and US2 give a complete issue → complete flow with correct stock and costing. 007's manufactured Challans can now be accepted once batches complete.

---

## Phase 6: User Story 3 - Record opening stock for manufactured products already on the shelf (Priority: P1)

**Goal**: A one-time opening quantity per manufactured product, with an optional cost per packet, and one correction allowed before the first Challan outflow.

**Independent Test**: Record 400 "Hand Towel" at Rs 70.00. Stock is 400 and history shows "Opening balance". Correct by −60 with a reason, and stock is 340. A second correction is refused. For a product with an accepted Challan outflow, a correction is refused (quickstart §7).

- [X] T029 [US3] In `lib/production-batches/service.ts`, add the following (depends on T008, T009):
  - `recordOpeningStockRecord(input, userId)`: RPC `record_manufactured_opening_stock`, with `round2` cost or `null`;
  - `recordOpeningStockCorrectionRecord(input, userId)`: RPC `record_manufactured_opening_stock_correction`;
  - `listManufacturedOpeningStockStatus()`:
    - selects all `type = 'manufactured'` products (active and inactive), left-joined to `manufactured_opening_stock`;
    - fetches, in one query, the set of product ids having `inventory_movements` with `source_type = 'challan_line'` and `qty_delta < 0`;
    - sets `canCorrect = opening exists && correction is null && !hasChallanOutflow`;
    - maps to `OpeningStockRow` ordered by product name.
- [X] T030 [US3] In `app/actions/production-batches.ts`, add `recordManufacturedOpeningStock` and `recordManufacturedOpeningStockCorrection`. Both revalidate `/production-batches/opening-stock` and `/products/{productId}` (depends on T029).
- [X] T031 [US3] Create `components/production-batches/opening-stock-table.tsx` (depends on T030), a client component. Each row shows product, on-hand, and the opening entry (qty, date, cost or "—"), plus any correction (qty, reason, date). The action column is:
  - with no opening entry: an inline form for quantity, date and optional cost per packet;
  - when `canCorrect` is true: an inline form for correction qty (±), reason and date;
  - otherwise: no action, with a short reason ("Corrected" / "Stock already shipped on a Challan").

  Server errors are shown inline.
- [X] T032 [US3] Create `app/(dashboard)/production-batches/opening-stock/page.tsx`, which loads `listManufacturedOpeningStockStatus()` and renders `OpeningStockTable` with a one-line explanation that this is a one-time go-live entry. Add an "Opening stock" link to the header of `app/(dashboard)/production-batches/page.tsx` (depends on T030, T031).

**Checkpoint**: All P1 stories are done. Existing shelf stock can be entered, and 007's limitation is fully resolved (SC-006).

---

## Phase 7: User Story 4 - Edit or void a batch before it is completed (Priority: P2)

**Goal**: Issued batches can be corrected, with the lot's remaining weight adjusted, including moving to another lot. They can also be voided, which restores the full weight. Completed and voided batches are read-only.

**Independent Test**: Editing 800 kg to 600 kg gives the lot back 200 kg. Editing beyond availability is rejected with nothing changed. A void restores the lot, which becomes editable again, but a delete is refused (quickstart §4).

- [X] T033 [US4] In `lib/production-batches/service.ts`, add the following (depends on T018):
  - `updateProductionBatchRecord(id, input, userId)`: RPC `update_production_batch`;
  - `voidProductionBatchRecord(id, userId)`: RPC `void_production_batch`;
  - implement `listAvailableLotsForBatch({ includeBatchId })`: load the batch, always include its current lot even at 0 remaining, and add the batch's own `weight_issued_kg` to that lot's displayed `remainingWeightKg`.
- [X] T034 [P] [US4] Extend `components/production-batches/batch-issue-form.tsx` with an `edit` mode (depends on T020, T036):
  - pre-fill from `defaultValues`;
  - keep the batch's current product and contractor selectable even if now inactive, by passing them in as extra options (spec edge cases, FR-002);
  - don't overwrite a stored labour rate on first render; only re-pre-fill when the product is actually changed;
  - on success, call `updateProductionBatch` and redirect to the detail page.
- [X] T035 [P] [US4] Create `components/production-batches/batch-status-controls.tsx` (depends on T036), a client component rendered only for Issued batches. It shows an "Edit" link to `/production-batches/{id}/edit`, and a "Void" button that asks for confirmation with `window.confirm(...)`, exactly as `components/challans/challan-status-controls.tsx` does, then calls `voidProductionBatch` and refreshes. Errors are shown inline.
- [X] T036 [US4] In `app/actions/production-batches.ts`, add `updateProductionBatch(id, input)` and `voidProductionBatch(id)`. Both revalidate `/production-batches`, `/production-batches/{id}` and `/purchases` (depends on T033).
- [X] T037 [US4] Create the edit page and wire the controls (depends on T034–T036):
  - `app/(dashboard)/production-batches/[batchId]/edit/page.tsx`:
    - call `notFound()` if the batch is missing, and redirect to the detail page unless it is `issued`;
    - load `listAvailableLotsForBatch({ includeBatchId })`, the active manufactured products and the active contractors, each plus the batch's current value;
    - render `BatchIssueForm` in edit mode.
  - Render `BatchStatusControls` on the detail page for Issued batches.
  - Show a "Voided" badge and no actions for voided batches.

**Checkpoint**: The full lifecycle (issue, edit, void, complete) works.

---

## Phase 8: User Story 5 - See what fabric is out with contractors, and review batches (Priority: P2)

**Goal**: A filterable batch list whose Issued view is the work-in-progress picture, with kg and Rs totals and days outstanding, plus a complete detail view.

**Independent Test**: With 2 Issued batches and 1 Completed, filtering to Issued shows only the 2, with correct days outstanding and correct kg and Rs totals. Filtering by contractor, product, date or batch number works (quickstart §8).

- [X] T038 [US5] In `lib/production-batches/service.ts`, add `listProductionBatches(filters)` (depends on T018):
  - Filters: `status`, `contractorId`, `productId`, `issueDateFrom`/`issueDateTo` on `issue_date`, and `batchNumber` as a case-insensitive substring match (`ilike`).
  - Joins `contractors(name)`, `products(name)` and `raw_material_purchases(rate_per_kg)`.
  - Orders by `issue_date desc, batch_number desc`.
  - Maps each row to `BatchListItem`, with `fabricValue = round2(weight × rate)` and `daysOutstanding` (whole days from `issue_date` to today, Issued only).
  - Returns `issuedTotals` (kg and Rs) summed in TypeScript over the Issued items in the result.
- [X] T039 [P] [US5] Create `components/production-batches/batch-list.tsx`: a table with columns for batch number (link), status badge, contractor, product, kg, fabric value, issue date, days outstanding (Issued), and packets and average cost (Completed). When Issued rows are present, add a totals footer row with kg and Rs.
- [X] T040 [US5] Replace the minimal table in `app/(dashboard)/production-batches/page.tsx` with a filter bar and `BatchList` (depends on T038, T039):
  - the filter bar has status tabs or select (All / Issued / Completed / Voided), a contractor select (all contractors, including inactive), a product select (all manufactured products), from and to dates, and a batch number search;
  - it uses GET `searchParams`, matching how `app/(dashboard)/challans/page.tsx` reads its filters.

  Keep the "New batch" and "Opening stock" links.
- [X] T041 [US5] Check `app/(dashboard)/production-batches/[batchId]/page.tsx` against spec US5-3 and FR-023, and fill any gaps:
  - lot supplier, purchase date and rate;
  - weight issued, returned weight, packets, expected and variance, labour rate;
  - all costs, and wastage with the exceeded note;
  - created, updated, completed and voided by/at.

**Checkpoint**: All six user stories are complete.

---

## Phase 9: Polish & Cross-Cutting Concerns

- [X] T042 Run `npm run lint` and `npm run build`, and fix every error and warning introduced by this feature. Don't touch unrelated files.
- [ ] T043 Run the full [quickstart.md](./quickstart.md) walkthrough (§1–§8) against the dev server and tick each item. Any failure is fixed in the relevant task's files before this task is marked done.
- [X] T044 [P] Update `specs/PRODUCT-OVERVIEW.md`:
  - set the Module Roadmap row for 010 to "Implemented";
  - mark the carried-forward labour-rate precedence point as resolved (the product default only; contractor×product rates deferred to 011, per ADR-0008);
  - add a one-line note that manufactured opening stock and its single correction are handled in 010.

---

## Dependencies & Execution Order

### Phase dependencies

- **Setup (T001)** → **Foundational (T002–T009)** → all stories.
- **US6 (T010–T015)** must finish before **US1**, because issuing needs an active contractor.
- **US1 (T016–T022)** → **US2 (T023–T028)**, because completing needs an Issued batch.
- **US3 (T029–T032)** depends only on Foundational and can run in parallel with US6, US1 and US2. Its quickstart check of Challan acceptance is clearer after US2.
- **US4 (T033–T037)** depends on US1 (the issue form and service).
- **US5 (T038–T041)** depends on US1 (the list page scaffold). It's best done after US2 and US4 so every status can be shown.
- **Polish (T042–T044)** comes after all stories.

### Within-phase ordering notes

- T003 and T004 both edit the same migration file, so run them one after the other (no [P]), after T002.
- T008 is the shared service file. Later stories each append functions to it (T018, T023, T029, T033, T038), so those tasks run one at a time relative to each other.
- `app/actions/production-batches.ts` is appended to by T019, T024, T030 and T036, which also run one at a time.
- `app/(dashboard)/layout.tsx` is touched by T015 and T022 (different stories, one after the other).

### Parallel opportunities

- Foundational: T005 and T006 in parallel. T007 follows T006.
- US6: T012 and T013 in parallel after T011.
- US1: T016 and T017 in parallel (different files), then T018 → T019 → T020 → T021 → T022.
- US2: T025, T026 and T028 in parallel after T024.
- US4: T033 → T036, then T034 and T035 in parallel, then T037.
- US3 as a whole can run alongside US6, US1 and US2 by a second developer (different files, apart from the shared service and actions files noted above).

## Parallel Example: User Story 1

```text
# After Foundational + US6 are done, launch together:
Task: "T016 [US1] Close 002's read-then-write race in lib/purchases/service.ts"
Task: "T017 [US1] Add listActiveManufacturedProductsForSelect in lib/products/service.ts"
# Then in order: T018 → T019 → T020 (issue form) → T021 → T022
```

## Implementation Strategy

### MVP first

1. Phases 1–2 (Setup, Foundational), then Phase 3 (US6, contractors).
2. Phase 4 (US1). **Stop and validate** with quickstart §1–§3. Fabric with contractors is now recorded and locked against double issue.
3. Phase 5 (US2). Validate with quickstart §5–§6. This is the core value: stock and true cost per packet.
4. Phase 6 (US3). Validate with quickstart §7. This unblocks day-one sales of shelf stock.

### Incremental delivery

5. Phase 7 (US4), for corrections. Then Phase 8 (US5), for the WIP picture and filters.
6. Phase 9, Polish. Then commit and PR via `/sp.git.commit_pr`.

## Notes

- **Every stock, lot or batch change goes through the Postgres functions.** Nothing in TypeScript writes `production_batches`, `manufactured_opening_stock`, `inventory_movements`, `remaining_weight_kg` or `quantity_on_hand` directly. The only exception is 002's own existing lot edit and delete, made conditional in T016.
- Confirmations use `window.confirm`, matching every existing status control in `components/*`.
- Commit after each phase checkpoint.
