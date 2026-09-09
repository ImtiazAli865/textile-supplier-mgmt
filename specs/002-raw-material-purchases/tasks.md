---

description: "Task list for Raw Material Purchases implementation"
---

# Tasks: Raw Material Purchases

**Input**: Design documents from `/specs/002-raw-material-purchases/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001). The testing stack (Vitest + Testing Library + Firestore Emulator) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root — this feature extends 001's app, no new project initialization:

- `app/(dashboard)/purchases/` — routes (list, detail, new, edit)
- `app/actions/purchases.ts` — Server Actions
- `lib/purchases/` — Zod schemas, Firestore service functions
- `components/purchases/` — UI components
- `app/(dashboard)/layout.tsx`, `lib/suppliers/service.ts` — existing files from 001, extended/reused here

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new feature module. No new dependencies — reuses everything already installed for 001 (per plan.md's Technical Context).

- [X] T001 Create empty `app/(dashboard)/purchases/`, `lib/purchases/`, and `components/purchases/` directories per plan.md's Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: Shared schema, base data-access module, and shared-layout wiring that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Define `PurchaseInput`, `Purchase`, and `PurchaseListItem` Zod schemas in `lib/purchases/schema.ts` per [data-model.md](./data-model.md) (`supplierId` required, `purchaseDate` ≤ today, `weightKg` > 0, `ratePerKg` > 0; `totalCost`/`remainingWeightKg` excluded from the input schema — always server-computed). Also defines `PurchaseDetail` (fixes analysis finding I1) for `getPurchase`'s joined+derived-lock shape.
- [X] T003 Create base Firestore service module (collection reference, `toPurchase` converter, 2-decimal rounding helper) in `lib/purchases/service.ts` (depends on T002)
- [X] T004 [P] Implement `listActiveSuppliersForSelect` in `lib/purchases/service.ts`, wrapping the existing `listSuppliers({ status: "active" })` from `lib/suppliers/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md) (no reimplementation of supplier logic)
- [X] T005 Add a "Raw Material Purchases" nav link to the existing `app/(dashboard)/layout.tsx`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Record and view a raw material purchase (Priority: P1) 🎯 MVP

**Goal**: Staff can record a purchase against an existing active supplier with an auto-calculated total cost, and immediately see it in the list and its detail view.

**Independent Test**: Record one purchase with a weight and rate against an existing supplier; confirm the total cost is calculated correctly and the purchase appears at the top of the list and in its detail view (spec Acceptance Scenarios 1–3 for User Story 1).

### Implementation for User Story 1

- [X] T006 [US1] Implement `createPurchaseRecord` and `getPurchase` in `lib/purchases/service.ts` per [data-model.md](./data-model.md): server computes `totalCost = weightKg * ratePerKg` and sets `remainingWeightKg = weightKg` (depends on T003)
- [X] T007 [US1] Implement `createPurchase` Server Action in `app/actions/purchases.ts` per [contracts/server-actions.md](./contracts/server-actions.md), validating `supplierId` references an existing **active** supplier (FR-001) (depends on T006)
- [X] T008 [P] [US1] Build `PurchaseForm` component (create mode) with `react-hook-form` + Zod resolver — supplier dropdown (via `listActiveSuppliersForSelect`), date/weight/rate fields, live client-side total-cost preview — in `components/purchases/purchase-form.tsx` (depends on T002, T004)
- [X] T009 [US1] Build "Add Purchase" page in `app/(dashboard)/purchases/new/page.tsx`, wiring `PurchaseForm` to `createPurchase` (depends on T007, T008)
- [X] T010 [US1] Implement unfiltered `listPurchases` (joins each result to its supplier's current `companyName`, sorts most-recent-first, computes totals) in `lib/purchases/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T006)
- [X] T011 [US1] Build purchase list page (Server Component) in `app/(dashboard)/purchases/page.tsx` rendering `listPurchases()` results (FR-004) (depends on T010)
- [X] T012 [US1] Build purchase detail page in `app/(dashboard)/purchases/[purchaseId]/page.tsx` showing supplier, date, weight, rate, total cost, and remaining weight via `getPurchase()` (FR-007) (depends on T006). Also displays created/last-updated timestamps (fixes analysis finding C1 / FR-013).
- [X] T013 [US1] Add field-level validation error display to `PurchaseForm` for a missing supplier/date or a zero/negative weight or rate (FR-003, spec Acceptance Scenario 3) (depends on T008)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Search, filter, and total raw material purchases (Priority: P2)

**Goal**: Staff can narrow the purchase list by supplier and/or date range and see running totals (kg, cost) for whatever is currently displayed.

**Independent Test**: Seed several purchases across suppliers and dates; verify filtering by supplier, by date range, and by both together narrows the list correctly and that displayed totals match the filtered records, including an explicit empty state when nothing matches (spec Acceptance Scenarios 1–4 for User Story 2).

### Implementation for User Story 2

- [X] T014 [US2] Extend `listPurchases` in `lib/purchases/service.ts` to accept `supplierId` and `dateFrom`/`dateTo` Firestore query filters, recomputing totals over the filtered set, per [contracts/server-actions.md](./contracts/server-actions.md) (FR-005, FR-006) (depends on T010)
- [X] T015 [P] [US2] Build `PurchaseFilters` component (supplier select + date-range inputs) in `components/purchases/purchase-filters.tsx`
- [X] T016 [US2] Wire `PurchaseFilters` into the purchase list page via URL search params in `app/(dashboard)/purchases/page.tsx` (depends on T011, T014, T015)
- [X] T017 [US2] Build `PurchaseList` client component with a running-totals footer and an explicit "no results" empty state (zeroed totals) in `components/purchases/purchase-list.tsx` (depends on T016)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Edit and delete purchase records (Priority: P3)

**Goal**: Staff can correct or remove a purchase record, but only while none of its purchased weight has been consumed.

**Independent Test**: Edit an unconsumed purchase's fields and confirm persistence plus recalculated total cost/remaining weight; delete an unconsumed purchase and confirm removal; confirm edit/delete are blocked with a clear message once a purchase's `remainingWeightKg` is below its `weightKg` (spec Acceptance Scenarios 1–3 for User Story 3).

### Implementation for User Story 3

- [X] T018 [US3] Implement `updatePurchaseRecord` in `lib/purchases/service.ts`: reject if `remainingWeightKg !== weightKg` (locked), otherwise recompute `totalCost` and reset `remainingWeightKg` to the new `weightKg` (FR-008, FR-010) (depends on T006). Resolves analysis finding U1: the active-supplier check only re-applies when `supplierId` is actually changed, since an unchanged supplier may have since been deactivated and the purchase must remain editable.
- [X] T019 [US3] Implement `deletePurchaseRecord` in `lib/purchases/service.ts`: reject if `remainingWeightKg !== weightKg` (locked), otherwise hard-delete the document (FR-009, FR-010) (depends on T006)
- [X] T020 [US3] Implement `updatePurchase` Server Action in `app/actions/purchases.ts` per [contracts/server-actions.md](./contracts/server-actions.md), surfacing a clear "lot is already in use" message on the locked case (depends on T018)
- [X] T021 [US3] Implement `deletePurchase` Server Action in `app/actions/purchases.ts`, surfacing the same locked-case message (depends on T019)
- [X] T022 [US3] Build edit page in `app/(dashboard)/purchases/[purchaseId]/edit/page.tsx`, reusing `PurchaseForm` in edit mode pre-filled via `getPurchase()` (depends on T008, T012, T020)
- [X] T023 [P] [US3] Add a `DeletePurchaseControl` component with confirmation to the purchase detail page `app/(dashboard)/purchases/[purchaseId]/page.tsx` (depends on T012, T021)
- [X] T024 [US3] Surface the derived lock state (`remainingWeightKg < weightKg`) on the detail and edit pages: hide/disable edit and delete controls and show the explanatory message when locked (FR-010, spec Edge Cases) (depends on T012, T022, T023)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories.

- [X] T025 [P] Add the composite index (`supplierId` ASC + `purchaseDate` DESC) for `rawMaterialPurchases` to `firestore.indexes.json` per [data-model.md](./data-model.md) and deploy via `firebase deploy --only firestore:indexes`
- [X] T026 [P] Add loading and error states across the purchase list, detail, and form pages (`loading.tsx` per route, matching 001's convention)
- [X] T027 Verify success criteria SC-001/SC-002/SC-003/SC-004 (SC-003 folded in here per analysis finding C2): seed ~1,000 purchase records, time recording a new purchase (target <1min, SC-001) and finding a supplier's purchases within a date range with totals (target <10s, SC-002), and confirm list/filter+totals render in under 2s at that scale, with no perceptible delay when totals recompute (SC-003, SC-004)
- [ ] T028 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end against all three user stories (may reuse T027 seed data), including the manual `remainingWeightKg`-reduction check for the consumption lock
- [X] T029 [P] Review that `totalCost` and `remainingWeightKg` are never accepted as direct client input in the `createPurchase`/`updatePurchase` Server Actions (FR-002, FR-011, SC-005)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `listPurchases`/list page existing (T010, T011) to extend rather than duplicate.
  - US3 depends on US1's `createPurchaseRecord`/form/detail page existing (T006, T008, T012) to extend rather than duplicate.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T002 and T004 can run in parallel (different files); T003 depends on T002.
- US1: T008 can be built in parallel with T006/T007 (different files), then wired together in T009.
- US2: T015 can be built in parallel with T014 (different files), then wired together in T016.
- US3: T023 can run in parallel with T022 (different files).
- Polish: T025, T026, T029 can all run in parallel.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement createPurchaseRecord and getPurchase in lib/purchases/service.ts"
Task: "Build PurchaseForm component (create mode) in components/purchases/purchase-form.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — this alone replaces manual purchase notes with a real record

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → deploy/demo (MVP)
3. User Story 2 → validate independently → deploy/demo
4. User Story 3 → validate independently → deploy/demo
5. Polish phase → deploy final hardening

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- Each user story phase ends at a checkpoint where that story is independently demoable.
- Commit after each task or logical group, matching the project's small-diff convention.
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest/Firestore Emulator stack from research.md if desired later.
- This feature deliberately does not implement any consumption of `remainingWeightKg` — it is only ever set equal to `weightKg` here. The upcoming Production Batches feature (003) is responsible for decrementing it; T018/T019's lock check (`remainingWeightKg !== weightKg`) is what makes that future write visible to this feature without any further changes here.

## Implementation Notes (post `/sp.implement`)

- **Analysis findings resolved during implementation**: C1 (T012 now displays created/updated timestamps), C2 (T027 folds in SC-003), U1 (T018's active-supplier re-check only applies when `supplierId` actually changes — an untouched supplier that was later deactivated no longer blocks unrelated edits), I1 (`PurchaseDetail` type added to T002/schema.ts), I2 (`ActionResult`/`fail` extracted to `lib/actions/result.ts` and reused by both `app/actions/suppliers.ts` and `app/actions/purchases.ts`, so the two action files now share one error-shape convention instead of risking divergence).
- **T025 scope**: `firestore.indexes.json` was updated with the composite index, but `firebase deploy --only firestore:indexes` was not run — no live Firebase project is linked in this environment (same situation as 001). Deploy this once a real project is wired up.
- **T027 scope**: No live Firebase project or Firestore Emulator (requires Java, unavailable here) was available, so SC-001/SC-002 (real-world timing of creating a purchase and searching by supplier+date range through the actual UI) could not be measured directly — same limitation 001 documented. What *was* verified: `scripts/verify-purchase-list-performance.mjs` exercises the in-memory supplier-join + totals-summation logic from `listPurchases` against 1,000 synthetic records (0.96ms) — well within the SC-003/SC-004 budget. The Firestore-side query itself stays fast at this scale because of the composite index (T025); that half is architectural, not empirically measured here. `npx tsc --noEmit`, `npm run build`, and `npm run lint` all pass cleanly with the new `purchases` module.
- **T028 not completed**: same as 001's equivalent (unchecked) task — running the full quickstart.md flow requires a real Firebase project (Auth + Firestore) with credentials in `.env.local`, which hasn't been provided. Do this once a Firebase project is wired up; the existing supplier data will need at least one active supplier seeded first.
- **Purchase filter dropdown scope**: `PurchaseFilters`' supplier dropdown is populated from active suppliers only (same list as the create form), not from every supplier that has ever appeared in a purchase. A purchase against a supplier later deactivated remains fully visible and editable (edge case handled), but can't be *isolated* via the supplier filter dropdown once that supplier drops out of the active list — no spec requirement covers filtering by an inactive supplier, so this was left as the simpler default rather than building a "distinct suppliers with purchases" query.
