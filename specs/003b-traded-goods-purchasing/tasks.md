---

description: "Task list for Traded-Goods Purchasing implementation"
---

# Tasks: Traded-Goods Purchasing

**Input**: Design documents from `/specs/003b-traded-goods-purchasing/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001/002/003). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root — this feature extends 002/003's existing modules, no new project initialization or route groups:

- `supabase/migrations/0003_traded_purchases.sql` — new migration file
- `lib/purchases/{schema.ts, service.ts}` — extended (discriminated union, mode-aware service functions)
- `lib/products/{schema.ts, service.ts}` — extended (`quantityOnHand` field, `listActiveTradedProductsForSelect`)
- `components/purchases/{purchase-form.tsx, purchase-list.tsx, purchase-filters.tsx}` — extended
- `app/(dashboard)/purchases/**` — extended (existing route files, no new routes)
- `app/(dashboard)/products/[productId]/page.tsx` — extended (quantity-on-hand display)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new directories or dependencies — reuses everything already installed for 001/002/003 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0003_traded_purchases.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema changes, shared types, and base helpers every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write the full migration in `supabase/migrations/0003_traded_purchases.sql` per [data-model.md](./data-model.md): alter `raw_material_purchases` (`weight_kg`/`rate_per_kg`/`remaining_weight_kg` become nullable; add `purchase_mode` text default `'weight'`, `product_id` uuid → `products(id)`, `quantity_units`, `rate_per_unit`, `remaining_units`; drop and re-add `total_cost` as the mode-conditional generated column; add the `purchases_mode_fields_check` constraint), add `products.quantity_on_hand numeric(10,2) not null default 0 check (>= 0)`, add the partial index `idx_purchases_product_date`, and create the three `SECURITY INVOKER` Postgres functions `record_unit_purchase`, `update_unit_purchase`, `delete_unit_purchase` with full-recompute logic (never incremental)
- [X] T003 [P] Add `quantityOnHand: number` to the `Product`/`ProductDetail` interface in `lib/products/schema.ts`, and map `quantity_on_hand` in `lib/products/service.ts`'s row-to-`Product` mapper (depends on T002)
- [X] T004 [P] Convert `purchaseInputSchema` in `lib/purchases/schema.ts` into a discriminated union on `mode` (`'weight' | 'unit'`) per [data-model.md](./data-model.md) and [contracts/server-actions.md](./contracts/server-actions.md) — the `weight` branch keeps today's fields unchanged; the new `unit` branch requires `productId`, `quantityUnits` (> 0), and `ratePerUnit` (> 0); extend `Purchase`/`PurchaseListItem`/`PurchaseDetail` with mode-aware optional fields (`mode`, `productId`, `productName`, `quantityUnits`, `ratePerUnit`, `remainingUnits`)
- [X] T005 [P] Add `listActiveTradedProductsForSelect()` to `lib/products/service.ts` — a thin wrapper over the existing `listProducts({ type: "traded", status: "active" })`, per [research.md](./research.md)
- [X] T006 Add a `ProductNotPurchasableError` class alongside the existing `SupplierNotActiveError`/`PurchaseNotFoundError`/`PurchaseLockedError` in `lib/purchases/service.ts` (depends on T002)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Record a per-unit purchase of a traded product (Priority: P1) 🎯 MVP

**Goal**: Staff can record a per-unit purchase of a traded product, and the system automatically calculates its total cost and updates the product's weighted-average cost and quantity on hand.

**Independent Test**: Record one unit-based purchase against an existing active traded product and supplier; confirm the total cost is calculated correctly, the product's current purchase cost and quantity on hand update to match, and the purchase appears in the purchase list (spec Acceptance Scenarios 1–5 for User Story 1).

### Implementation for User Story 1

- [X] T007 [US1] Implement the unit-mode branch of `createPurchaseRecord` in `lib/purchases/service.ts`: validate the supplier is active (existing helper) and the product resolves to an active, traded-type product (throw `ProductNotPurchasableError` otherwise), then call the `record_unit_purchase` RPC via `getSupabaseAdmin().rpc(...)`; leave the weight-mode branch byte-for-byte unchanged (FR-002, FR-014) (depends on T002, T004, T006)
- [X] T008 [US1] Update the row-mapping helpers (`toPurchase`, `getPurchase`, `listPurchases`'s item mapper) in `lib/purchases/service.ts` to branch on `purchase_mode`: unit-mode rows also join `products(name)` for `productName`, and `isLocked` uses `remaining_units < quantity_units` for unit mode vs. the existing `remaining_weight_kg < weight_kg` for weight mode (depends on T004, T007)
- [X] T009 [P] [US1] Add a mode selector to `PurchaseForm` in `components/purchases/purchase-form.tsx`: per-unit mode conditionally renders a traded-product select (new `activeTradedProducts` prop) plus quantity/rate-per-unit fields in place of weight/rate-per-kg, with its own live total-cost preview; mode cannot be changed once a purchase exists (edit mode pre-selects and disables it) (depends on T004)
- [X] T010 [US1] Wire `listActiveTradedProductsForSelect()` into `app/(dashboard)/purchases/new/page.tsx`, passing the result to `PurchaseForm` alongside `activeSuppliers` (depends on T005, T009)
- [X] T011 [US1] Add unit-mode field rendering (product name, quantity, rate per unit, remaining units) to `app/(dashboard)/purchases/[purchaseId]/page.tsx`, shown instead of the weight-mode section when `purchase.mode === "unit"` (depends on T008)
- [X] T012 [US1] Add a "Quantity on hand" section to the traded-product branch of `app/(dashboard)/products/[productId]/page.tsx`, displaying `product.quantityOnHand` (the existing `currentPurchaseCost` display needs no code change — only its underlying data changes) (FR-004, FR-005, SC-002) (depends on T003)
- [X] T013 [US1] Add field-level validation error display to `PurchaseForm` for per-unit mode's required fields (missing supplier/product, invalid date, quantity/rate ≤ 0), matching the existing weight-mode error handling (spec Acceptance Scenario US1.4) (depends on T009)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Browse the unified purchase log across both purchase modes (Priority: P2)

**Goal**: Staff can view per-kg and per-unit purchases together in one list, clearly distinguished, and filter by supplier, date range, and (for per-unit rows) product.

**Independent Test**: Seed a mix of per-kg and per-unit purchases; verify each row shows its mode and correct quantity/unit, that supplier/date filters narrow both kinds of rows, that the product filter only affects per-unit rows, and that mode-split totals display correctly (spec Acceptance Scenarios 1–4 for User Story 2).

### Implementation for User Story 2

- [X] T014 [US2] Extend `listPurchases` in `lib/purchases/service.ts` to accept an optional `productId` filter (matches unit-mode rows only) and return mode-split `PurchaseTotals` (`weight`/`unit` each `null` when no rows of that mode are in the filtered set, plus `grandTotalCost`) per [contracts/server-actions.md](./contracts/server-actions.md) (FR-008, FR-009) (depends on T008)
- [X] T015 [P] [US2] Add a product filter dropdown to `PurchaseFilters` in `components/purchases/purchase-filters.tsx` (options from `listActiveTradedProductsForSelect`), wired through the same URL-search-param pattern as the existing supplier/date filters (depends on T005)
- [X] T016 [US2] Update `PurchaseList` in `components/purchases/purchase-list.tsx` to render each row mode-aware (weight rows show "X kg @ Rs Y/kg"; unit rows show "X <uom> @ Rs Y/unit" with product name) and display the new mode-split totals panel, omitting a mode's line entirely when its total is `null` (FR-007, FR-009, spec Edge Cases) (depends on T014)
- [X] T017 [US2] Wire the product filter and updated totals through `app/(dashboard)/purchases/page.tsx` (depends on T014, T015, T016)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Edit and delete a per-unit purchase (Priority: P3)

**Goal**: Staff can correct or remove an unconsumed per-unit purchase, with edit/delete blocked once any of it has been consumed.

**Independent Test**: Edit an unconsumed per-unit purchase's fields and confirm the product's cost/quantity recalculate to match; delete one and confirm the product's cost/quantity revert as if it never existed; simulate consumption (`remaining_units < quantity_units`) and confirm edit/delete are blocked (spec Acceptance Scenarios 1–3 for User Story 3).

### Implementation for User Story 3

- [X] T018 [US3] Implement the unit-mode branch of `updatePurchaseRecord` in `lib/purchases/service.ts`: check the existing row is unconsumed (`remaining_units === quantity_units`, else throw `PurchaseLockedError`), re-validate the supplier/product only when actually changed, then call `update_unit_purchase` (FR-011, FR-013) (depends on T007)
- [X] T019 [US3] Implement the unit-mode branch of `deletePurchaseRecord` in `lib/purchases/service.ts`: same lock check, then call `delete_unit_purchase` (FR-012, FR-013) (depends on T007)
- [X] T020 [US3] Update `app/(dashboard)/purchases/[purchaseId]/edit/page.tsx` to pass `activeTradedProducts` and pre-fill unit-mode default values into `PurchaseForm` (depends on T009, T010)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories.

- [X] T021 [P] Review that `totalCost`, `remainingWeightKg`/`remainingUnits`, and any product `currentPurchaseCost`/`quantityOnHand` fields are never accepted as writable input in any Server Action or Zod input schema (contracts/server-actions.md's blanket rule)
- [ ] T022 Verify SC-006 (zero regression): run 002's existing per-kg purchase create/edit/delete/lock flow end-to-end and confirm behavior identical to before this feature shipped
- [ ] T023 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end against all three user stories, including the manual `remaining_units` lock simulation (FR-013) and SC-001–SC-005

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's mode-aware `listPurchases`/mapping helpers (T008) to extend rather than duplicate.
  - US3 depends on US1's unit-mode create path and lock/error scaffolding (T007) to extend rather than duplicate.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T003, T004, T005 can run in parallel (different files); T006 can run alongside them.
- US1: T009 can be built in parallel with T007/T008 (different files), then wired together in T010.
- US2: T015 can be built in parallel with T014 (different files), then wired together in T016/T017.
- Polish: T021 can run in parallel with T022/T023.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement the unit-mode branch of createPurchaseRecord in lib/purchases/service.ts"
Task: "Add a mode selector to PurchaseForm in components/purchases/purchase-form.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — every traded product now has a real, defensible purchase cost

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
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest stack from research.md if desired later.
- The weight-mode code paths in `lib/purchases/service.ts` (`createPurchaseRecord`, `updatePurchaseRecord`, `deletePurchaseRecord`) are extended with an `if (mode === "unit")` branch each, never rewritten — T022's regression check exists specifically to confirm this.

## Implementation Notes (post `/sp.implement`)

- **T002 / migration authored, not yet applied**: `supabase/migrations/0003_traded_purchases.sql` is written per data-model.md but has not been run against the live Supabase project yet (mirrors 003's own sequencing — the migration was authored during `/sp.implement`, then applied and verified live in a separate, explicit follow-up step). T022 and T023 require it to be applied first, so they remain unchecked below.
- **Shared `recompute_product_purchase_stats(p_product_id)` helper added** (not itemized in data-model.md, which specified three standalone functions): all three functions call this one internal helper instead of duplicating the same aggregation query three times. This is the direct implementation of data-model.md's "full recompute, never incremental" rule — a DRY refactor of *how* that recompute is expressed, not a change to *what* it computes or to any public interface (the three RPC names/signatures called from `lib/purchases/service.ts` are exactly as specified in data-model.md).
- **`PurchaseForm` deviates from a `zodResolver`-driven form** (which 002's original form used) because `purchaseInputSchema` is now a discriminated union on `mode`, and `react-hook-form` needs one concrete, flat field-set to register against regardless of which mode is selected. The form keeps a flat `PurchaseFormValues` shape (superset of both branches) for `register`/`useWatch`, builds the correct discriminated `PurchaseInput` shape at submit time based on the selected mode, and runs `purchaseInputSchema.safeParse` on it before calling the Server Action — giving the same instant client-side field errors as before, just validated at submit rather than on every keystroke. The server still re-validates unconditionally either way (contracts/server-actions.md).
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly with the extended `purchases`/`products` modules; `next build` lists all existing purchase/product routes compiling as expected (no new routes — this feature extends existing ones only, per plan.md).
- **T021 (writable-field audit)**: confirmed by inspection — `totalCost`, `remainingWeightKg`, `remainingUnits` appear only in `Purchase`/`PurchaseListItem`/`PurchaseTotals` (output types) in `lib/purchases/schema.ts`, never in `purchaseInputSchema`'s two branches; `currentPurchaseCost` and `quantityOnHand` appear only in the `Product` output interface in `lib/products/schema.ts`, never in `productInputSchema` or `productUpdateInputSchema`.
