---

description: "Task list for Product Catalog implementation"
---

# Tasks: Product Catalog

**Input**: Design documents from `/specs/003-product-catalog/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001/002). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root — this feature extends 001/002's app, no new project initialization:

- `app/(dashboard)/products/` — routes (list, detail, new, edit)
- `app/actions/products.ts` — Server Actions
- `lib/products/` — Zod schemas, Supabase service functions
- `components/products/` — UI components
- `app/(dashboard)/layout.tsx` — existing file from 001, extended here
- `supabase/migrations/0002_products.sql` — new migration file

---

## Phase 1: Setup (Shared Infrastructure)

**Purpose**: Scaffold the new feature module. No new dependencies — reuses everything already installed for 001/002 (per plan.md's Technical Context).

- [X] T001 Create empty `app/(dashboard)/products/`, `lib/products/`, and `components/products/` directories per plan.md's Project Structure

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The `products` table, shared schema, and base data-access module that every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 [P] Add the `products` table to `supabase/migrations/0002_products.sql` per [data-model.md](./data-model.md): all columns, the `products_type_fields_check` constraint, `idx_products_status_type_name`, `idx_products_name_trgm`, `idx_products_code_trgm`, `trg_products_updated_at` (reusing `set_updated_at()` from `0001_init.sql`), and `alter table products enable row level security` with no policies
- [X] T003 [P] Define `ProductInput` (a discriminated union on `type`: `manufactured` requires `expectedYieldPerKg` > 0 and `defaultLabourRatePerPacket` > 0; `traded` forbids both), `ProductUpdateInput` (same shape minus `type` entirely), `Product`, `ProductListItem`, and `ProductDetail` Zod schemas in `lib/products/schema.ts` per [data-model.md](./data-model.md) and [contracts/server-actions.md](./contracts/server-actions.md) — `currentPurchaseCost` is excluded from every input schema, since it is never client-writable
- [X] T004 Create base Supabase service module (table access helpers, 2-decimal rounding helper) in `lib/products/service.ts` (depends on T002, T003)
- [X] T005 Add a "Products" nav link to the existing `app/(dashboard)/layout.tsx`

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Create and view a product record (Priority: P1) 🎯 MVP

**Goal**: Staff can create a traded or manufactured product with its type-specific required fields, and immediately see it in the catalog list and its detail view.

**Independent Test**: Create one traded product and one manufactured product, each with all required fields for its type; confirm both appear in the catalog list and their detail views show only the fields relevant to their type (spec Acceptance Scenarios 1–4 for User Story 1).

### Implementation for User Story 1

- [X] T006 [US1] Implement `createProductRecord` and `getProduct` in `lib/products/service.ts` per [data-model.md](./data-model.md): server enforces the type-conditional field rules (FR-002) and leaves `current_purchase_cost` untouched (`NULL`) for every new row (FR-003) (depends on T004)
- [X] T007 [US1] Implement `createProduct` Server Action in `app/actions/products.ts` per [contracts/server-actions.md](./contracts/server-actions.md), re-validating the type-conditional required fields server-side (FR-001, FR-002) (depends on T006)
- [X] T008 [P] [US1] Build `ProductForm` component (create mode) with `react-hook-form` + Zod resolver — type selector, conditionally rendered manufactured-only fields (expected yield ratio, default labour rate per packet), and, for a traded product, a read-only "not yet established" purchase-cost display with no input control — in `components/products/product-form.tsx` (depends on T003)
- [X] T009 [US1] Build "Add Product" page in `app/(dashboard)/products/new/page.tsx`, wiring `ProductForm` to `createProduct` (depends on T007, T008)
- [X] T010 [US1] Implement default (active, unfiltered) `listProducts` in `lib/products/service.ts`, sorted by name ascending, per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T004)
- [X] T011 [US1] Build product list page (Server Component) in `app/(dashboard)/products/page.tsx` rendering `listProducts()` results — name, type, stock UOM, default selling price, status (FR-005) (depends on T010)
- [X] T012 [US1] Build product detail page in `app/(dashboard)/products/[productId]/page.tsx` showing only the fields relevant to the product's type via `getProduct()` (FR-006), including the "not yet established" purchase-cost state for a traded product (depends on T006)
- [X] T013 [US1] Add field-level validation error display to `ProductForm` for a missing name, stock UOM, or default selling price, or — for a manufactured product — a missing/invalid yield ratio or labour rate (FR-002, spec Acceptance Scenario 4) (depends on T008)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Search and filter the product catalog (Priority: P2)

**Goal**: Staff can locate a product by partial name/code match and narrow the catalog by type and status.

**Independent Test**: Seed several products of varying names, types, and statuses; verify searching by partial name, filtering by type, and filtering by status (with active as the default) each narrow the list correctly, including an explicit empty state when nothing matches (spec Acceptance Scenarios 1–4 for User Story 2).

### Implementation for User Story 2

- [X] T014 [US2] Extend `listProducts` in `lib/products/service.ts` to accept `search` (case-insensitive substring match on `name` and `internal_code`, using the trigram indexes), `type`, and `status` filters (defaulting to `status = 'active'` when omitted), per [contracts/server-actions.md](./contracts/server-actions.md) (FR-010, FR-011, FR-012) (depends on T010)
- [X] T015 [P] [US2] Build `ProductFilters` component (search box + type select + status select) in `components/products/product-filters.tsx`
- [X] T016 [US2] Wire `ProductFilters` into the product list page via URL search params in `app/(dashboard)/products/page.tsx` (depends on T011, T014, T015)
- [X] T017 [US2] Build `ProductList` client component with status badges and an explicit "no results" empty state in `components/products/product-list.tsx` (depends on T016) — built together with T011 in one pass rather than as a separate follow-up edit

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Edit and deactivate a product record (Priority: P3)

**Goal**: Staff can edit any field except type, and toggle a product between active and inactive without losing its record.

**Independent Test**: Edit an existing product's fields and confirm persistence; confirm there is no way to change its type; deactivate an active product and confirm it is excluded from the default list but still visible/reactivatable via the inactive filter (spec Acceptance Scenarios 1–4 for User Story 3).

### Implementation for User Story 3

- [X] T018 [US3] Implement `updateProductRecord` in `lib/products/service.ts`: accepts `ProductUpdateInput` (no `type` field at all), loads the existing row's `type` server-side and validates the incoming manufactured-only fields against it (FR-004, FR-007) (depends on T006)
- [X] T019 [US3] Implement `setProductStatusRecord` in `lib/products/service.ts`: updates only the `status` column, succeeding as a no-op when the target status matches the current one (FR-008, spec Edge Cases) (depends on T004)
- [X] T020 [US3] Implement `updateProduct` Server Action in `app/actions/products.ts` per [contracts/server-actions.md](./contracts/server-actions.md) (depends on T018)
- [X] T021 [US3] Implement `setProductStatus` Server Action in `app/actions/products.ts` (depends on T019) — implemented as a single status-setting action taking the target status, matching the established `setSupplierStatus` pattern from 001, rather than two separate `deactivateProduct`/`reactivateProduct` wrappers as originally worded; see Implementation Notes
- [X] T022 [US3] Build edit page in `app/(dashboard)/products/[productId]/edit/page.tsx`, reusing `ProductForm` in edit mode pre-filled via `getProduct()`, with the type field shown as disabled/locked rather than editable (depends on T008, T012, T020)
- [X] T023 [P] [US3] Add a `ProductStatusControl` component (deactivate/reactivate button) to the product detail page `app/(dashboard)/products/[productId]/page.tsx` (depends on T012, T021)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories.

- [X] T024 [P] Add loading and error states across the product list, detail, and form pages (`loading.tsx` per route, matching 001/002's convention)
- [X] T025 [P] Review that `type` is never accepted as writable input anywhere in `updateProduct`'s Zod schema or Server Action (FR-004), and that `currentPurchaseCost` is never accepted as writable input in any Server Action (FR-003)
- [X] T026 Verify success criteria SC-001/SC-002/SC-003: seed ~500 product records, time creating a new product (target <1min, SC-001) and finding a specific known product via search/filter (target <10s, SC-002), and confirm the catalog list/filter renders in under 2 seconds at that scale (SC-003)
- [X] T027 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end against all three user stories (may reuse T026 seed data)

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `listProducts`/list page existing (T010, T011) to extend rather than duplicate.
  - US3 depends on US1's `createProductRecord`/form/detail page existing (T006, T008, T012) to extend rather than duplicate.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T002 and T003 can run in parallel (different files); T004 depends on T003.
- US1: T008 can be built in parallel with T006/T007 (different files), then wired together in T009.
- US2: T015 can be built in parallel with T014 (different files), then wired together in T016.
- US3: T023 can run in parallel with T022 (different files).
- Polish: T024 and T025 can run in parallel.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement createProductRecord and getProduct in lib/products/service.ts"
Task: "Build ProductForm component (create mode) in components/products/product-form.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — this alone gives every later feature something to reference

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
- This feature deliberately leaves `current_purchase_cost` unwritten in every code path — the upcoming traded-goods-purchasing feature (which extends 002) is responsible for populating it. T006/T018's exclusion of that column from every input schema is what makes that future write visible to this feature without any further changes here.

## Implementation Notes (post `/sp.implement`)

- **T021 deviation**: implemented as a single `setProductStatus(id, status)` Server Action (and matching `ProductStatusControl` component) rather than separate `deactivateProduct`/`reactivateProduct` wrappers as tasks.md originally worded it. This exactly matches the already-shipped `setSupplierStatus`/`DeactivateReactivateControl` pattern from 001, so product status-toggling reads identically to supplier status-toggling instead of introducing a second convention for the same shape of action.
- **Search-escaping fix found during implementation**: `listProducts`' search filter spans two columns (`name` OR `internal_code`) via PostgREST's `.or()`, which treats commas and parentheses as its own filter-grouping syntax. Real product names from the master spec contain parentheses (e.g. "Bonded Polyester Fibre (Falta)"), so the raw ILIKE-escaped search term is additionally wrapped via a `quoteOrFilterValue` helper in `lib/products/service.ts` before being placed in the `.or()` string, per PostgREST's documented quoting rule. This wasn't called out in data-model.md/contracts, since the two-column search itself was already anticipated there — this is an implementation-level correctness fix, not a spec change.
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly with the new `products` module and route group; `next build` lists all four new routes (`/products`, `/products/[productId]`, `/products/[productId]/edit`, `/products/new`) compiling as expected.
- **T002 / migration applied**: `supabase/migrations/0002_products.sql` was applied to the live Supabase project via the SQL editor (browser-automated, with the Monaco editor's content set directly through its own API to avoid a keystroke-simulation freeze — see `history/prompts/general` for that session). Verified structurally: `products` table exists, 14 columns, the `products_type_fields_check` constraint, 4 indexes, the `trg_products_updated_at` trigger, and RLS all present.
- **T026/T027 completed against the live database and a real production build** (`npm run build && next start`, not `next dev` — dev mode's per-request Turbopack/SSR overhead made early timings look artificially slow, ~5-6s, purely a dev-tooling artifact unrelated to the query itself). Method: created a disposable QA-only Supabase Auth user (deleted afterward), seeded exactly 500 product rows (including one named `Bonded Polyester Fibre (Falta)` to specifically re-test the parenthesis-escaping fix from the implementation notes above), then measured:
  - **SC-003** (catalog renders <2s at 500 products): direct Postgres query timing via the service-role client, replicating `listProducts`' exact query shape — 215–434ms across unfiltered/type-filtered/status-filtered/search cases. Full page load through a real production server — 580–900ms (`domContentLoaded`). Both comfortably within the 2-second budget.
  - **SC-002** (find a known product via search in <10s): the live `.or()` search for `Bonded Polyester Fibre (Falta)` returned exactly 1 correct match in 227ms via direct query, and near-instantly through the actual browser UI — this also confirms the parenthesis-escaping fix (`quoteOrFilterValue`) works correctly end-to-end against the live database, not just in isolated review.
  - **SC-001** (create a product in <1 min): this budget is inherently about human workflow time, not something a script measures directly (same limitation 002 documented for its own SC-001/SC-002). What was verified instead is the system's own contribution: creating a traded product and a manufactured product through the real form each completed (submit → validated → saved → redirect to detail page) in a few seconds against the production build, well within the 1-minute human budget with no system-introduced friction.
  - **Full quickstart.md walkthrough**: all three user stories' acceptance scenarios were exercised end-to-end through the real running app — US1 create (traded + manufactured, type-conditional fields, "not yet established" purchase-cost display, all 5 required-field validation messages on a blank submit), US2 search/filter (partial-name search including the parens case, type filter, status filter defaulting to active, explicit empty state), US3 edit (price change persisted, type field rendered as locked/disabled text, not editable) and deactivate/reactivate (excluded from default list, visible under the inactive filter, restored on reactivate).
  - **Dialog-avoidance note**: `ProductStatusControl`'s `window.confirm(...)` blocked the automated browser session once (a real risk with this pattern under automation). Recovered by navigating away (which force-dismissed the stuck dialog) and, for the remaining deactivate/reactivate clicks, pre-overriding `window.confirm` to auto-accept via an injected script before clicking — standard QA practice for a same-origin page under one's own control, not a change to the shipped code.
  - **Cleanup**: all 502 QA-created product rows and the disposable test user were deleted after verification; the live `products` table was confirmed back at 0 rows. No QA artifacts were left in the production database.
