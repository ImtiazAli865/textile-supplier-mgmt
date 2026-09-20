---

description: "Task list for Customers implementation"
---

# Tasks: Customers

**Input**: Design documents from `/specs/005-customers/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001/002/003/003b/004). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root. This feature adds one new module and extends two
existing ones by a single function each, plus one existing page:

- `supabase/migrations/0005_customers.sql` — new migration file
- `lib/customers/{schema.ts, service.ts, ledger.ts, product-mappings.ts}` — new module
- `app/actions/customers.ts` — new Server Actions file
- `components/customers/{customer-form.tsx, customer-list.tsx, deactivate-reactivate-control.tsx, product-mapping-form.tsx}` — new components
- `app/(dashboard)/customers/**` — new route group (list, new, detail, edit)
- `app/(dashboard)/layout.tsx` — extended (one new nav link)
- `lib/trade-names/service.ts` — extended (`listActiveTradeNamesForSelect`)
- `lib/products/service.ts` — extended (`listActiveProductsForSelect`)
- `app/(dashboard)/products/[productId]/page.tsx` — extended (shows customer-product mappings for this product)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001/002/003/003b/004 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0005_customers.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, types, and DB objects every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write the full migration in `supabase/migrations/0005_customers.sql` per [data-model.md](./data-model.md): create `customers` (incl. `payment_terms_min_days`/`payment_terms_max_days` both `integer >= 0` with `max >= min`), `customer_contacts`, `customer_ship_to_addresses`, `customer_trade_names` (composite PK, `position`), `customer_product_mappings` (`customer_item_code`, `selling_uom`, `default_price numeric(12,2) check > 0`, `conversion_factor`, the `customer_product_mappings_has_value_check` covering all three optional fields, `unique (customer_id, product_id)`, and the partial unique index on `(customer_id, customer_item_code) where customer_item_code is not null`), and `ledger_entries` (insert-only, no `updated_at`/no update trigger); RLS enabled with no policies on all six tables; an `updated_at` trigger reusing `set_updated_at()` from `0001_init.sql` on every table that has one; and the two Postgres functions `create_customer`/`update_customer` per data-model.md's signatures
- [X] T003 [P] Create `lib/customers/schema.ts`: `customerInputSchema` (Zod — `displayName`/`legalName` non-empty strings; `billingAddressSchema` with line1/city/country required, line2/state/postalCode optional; `contactSchema` reusing 001's phone-or-email refinement, min 1 contact; `shipToAddressSchema`, zero or more; `paymentTermsMinDays`/`paymentTermsMaxDays` non-negative integers with a refinement `max >= min`; `issuesPerformaInvoice` boolean default `false`; `tradeNameHintIds` array of uuid, zero or more, ordered; `openingBalanceSchema` optional `{ amount: positive number, type: 'debit' | 'credit', asOfDate: string }`), `customerStatusSchema` (`'active' | 'inactive'`), `productMappingInputSchema` (`customerId`, `productId`, `customerItemCode?`, `sellingUom?`, `defaultPrice?` positive number, `conversionFactor?` positive number default `1`, with a refinement requiring at least one of `customerItemCode`/`sellingUom`/`defaultPrice`), and TypeScript types `CustomerInput`, `CustomerUpdateInput` (`CustomerInput` minus `openingBalance`), `Customer`, `CustomerListItem`, `CustomerDetail` (extends `Customer` with `ledgerBalance: number` and `productMappings: CustomerProductMapping[]`), `CustomerProductMapping`, `ProductMappingInput` (depends on T002)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Create and view customer records (Priority: P1) 🎯 MVP

**Goal**: Staff can create a customer record (display name, legal name, billing address, contacts, payment-terms range, optional NTN/STRN/trade-name hints/opening balance) and see it in a list and a detail view with its computed ledger balance.

**Independent Test**: Create one customer record with a nonzero opening balance; confirm it appears in the customer list, its detail view shows every entered field with display/legal name as two distinct fields, and its running ledger balance reflects the opening balance (spec Acceptance Scenarios 1–5 for User Story 1).

### Implementation for User Story 1

- [X] T004 [US1] Implement `getCustomerLedgerBalance(customerId: string): Promise<number>` in `lib/customers/ledger.ts` — the read-only `SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END)` query over `ledger_entries` per [data-model.md](./data-model.md), never cached (depends on T002)
- [X] T005 [US1] Implement `createCustomerRecord`, `listCustomers`, and `getCustomer` in `lib/customers/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md): `createCustomerRecord` calls the `create_customer` RPC with all child-row arrays plus the conditional opening-balance params; `listCustomers` defaults its `status` filter to `'active'`, ordered by `display_name`; `getCustomer` joins contacts/ship-to addresses/trade-name hints (resolved to each hint's `printedName`), calls `getCustomerLedgerBalance`, and returns an empty `productMappings` array for now (wired to real data in User Story 2) (depends on T002, T003, T004)
- [X] T006 [P] [US1] Extend `lib/trade-names/service.ts` with `listActiveTradeNamesForSelect(): Promise<{ id: string; printedName: string }[]>` — thin wrapper over the existing `listTradeNames({ status: "active" })`, per [contracts/server-actions.md](./contracts/server-actions.md)
- [X] T007 [P] [US1] Implement `createCustomer(input: CustomerInput): Promise<ActionResult<{ id: string }>>` in `app/actions/customers.ts` — `requireCurrentUser()`, `customerInputSchema.parse(input)`, call `createCustomerRecord`, `revalidatePath("/customers")`, matching the shape of `app/actions/suppliers.ts`'s `createSupplier` (depends on T005)
- [X] T008 [P] [US1] Create `components/customers/customer-form.tsx`: `react-hook-form` + `zodResolver(customerInputSchema)` form with display name, legal name, billing address, ship-to addresses (dynamic list), contacts (dynamic list, min 1), NTN/STRN, payment-terms min/max day fields, "Issues Performa Invoice" checkbox, a trade-name-hint multi-select (fetched via `listActiveTradeNamesForSelect`), and opening-balance fields (amount, debit/credit, as-of date) rendered only in create mode (depends on T003, T006)
- [X] T009 [P] [US1] Create `components/customers/customer-list.tsx`: renders `CustomerListItem` rows (display name, status), matching `components/suppliers/supplier-list.tsx`'s shape (depends on T003)
- [X] T010 [US1] Create `app/(dashboard)/customers/page.tsx` and `loading.tsx`: Server Component calling `listCustomers()` and rendering `CustomerList` (depends on T005, T009)
- [X] T011 [US1] Create `app/(dashboard)/customers/new/page.tsx`: renders `CustomerForm` (create mode) wired to the `createCustomer` Server Action (depends on T007, T008)
- [X] T012 [US1] Create `app/(dashboard)/customers/[customerId]/page.tsx` and `loading.tsx`: Server Component calling `getCustomer(id)` and rendering every field (display name and legal name shown as two distinct labeled fields), the computed `ledgerBalance`, and a placeholder empty-state for the product-mappings section (filled in by User Story 2); returns a 404-style not-found state if `null` (depends on T005)
- [X] T013 [P] [US1] Add a "Customers" link to the dashboard nav in `app/(dashboard)/layout.tsx`, alongside the existing Suppliers/Products/Purchases/Trade Names links (depends on T010)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Map a customer's own item codes, selling units, and default prices to products (Priority: P2)

**Goal**: Staff can record, per customer-product pair, a customer-specific item code and/or selling unit and/or a default/agreed price, visible from both the customer's and the product's detail pages.

**Independent Test**: Take an existing customer and an existing product, record a mapping with an item code, a selling unit, and a default price; confirm it's saved and shown on both the customer's and the product's detail pages; confirm two different customers can map the same product to different item codes independently; confirm a duplicate item code for a different product under the same customer is rejected; confirm a mapping with only a default price (no code, no UOM) is accepted (spec Acceptance Scenarios 1–5 for User Story 2).

### Implementation for User Story 2

- [X] T014 [US2] Implement `addProductMapping`, `updateProductMapping`, `removeProductMapping`, `listCustomerProductMappings`, and `listProductCustomerMappings` in `lib/customers/product-mappings.ts` — plain `supabase-js` `.insert()`/`.update()`/`.delete()`/`.select()` calls against `customer_product_mappings` per [contracts/server-actions.md](./contracts/server-actions.md) and [research.md](./research.md) (no RPC — a mapping row has no child tables); surfaces the `customer_product_mappings_has_value_check` violation and the partial-unique-index violation on `(customer_id, customer_item_code)` as friendly `ValidationError`s rather than raw Postgres errors (depends on T002, T003)
- [X] T015 [P] [US2] Extend `lib/products/service.ts` with `listActiveProductsForSelect(): Promise<{ id: string; name: string; stockUom: string }[]>` — thin wrapper over the existing `listProducts({ status: "active" })`, no `type` filter (a mapping may target either a traded or manufactured product), per [contracts/server-actions.md](./contracts/server-actions.md)
- [X] T016 [US2] Extend `getCustomer` in `lib/customers/service.ts` to populate its `productMappings` field via `listCustomerProductMappings`, replacing the empty-array placeholder from User Story 1 (depends on T005, T014)
- [X] T017 [P] [US2] Implement `addProductMapping(input)`, `updateProductMapping(id, input)`, and `removeProductMapping(id)` Server Actions in `app/actions/customers.ts` — `requireCurrentUser()`, `productMappingInputSchema.parse(input)`, call the corresponding `lib/customers/product-mappings.ts` function, `revalidatePath` for both the customer's and the product's detail pages (depends on T014)
- [X] T018 [P] [US2] Create `components/customers/product-mapping-form.tsx`: a product picker (via `listActiveProductsForSelect`), customer item-code field, selling-unit field, default-price field (labeled as a pre-fill suggestion, not a binding price), and a submit handler wired to add or edit a single mapping (depends on T003, T015)
- [X] T019 [US2] Wire a mappings list and `ProductMappingForm` into `app/(dashboard)/customers/[customerId]/page.tsx`, replacing User Story 1's placeholder empty-state (depends on T012, T016, T017, T018)
- [X] T020 [US2] Extend `app/(dashboard)/products/[productId]/page.tsx` to show a "Mapped to customers" section listing each customer's item code/selling unit/default price for this product, via `listProductCustomerMappings(productId)` (depends on T014)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Edit and deactivate customer records (Priority: P3)

**Goal**: Staff can edit an existing customer's fields (never its opening balance or status) and deactivate/reactivate a customer without losing its record, ledger history, or product mappings.

**Independent Test**: Edit an existing customer's address or payment-terms range and confirm it persists, with no opening-balance field present anywhere on the edit form; deactivate an active customer and confirm it's excluded from the default list but its record, ledger balance, and product mappings remain intact and viewable via the inactive filter; reactivate it and confirm it reappears (spec Acceptance Scenarios 1–3 for User Story 3, and FR-013's immutability check).

### Implementation for User Story 3

- [X] T021 [US3] Implement `updateCustomerRecord(id, input: CustomerUpdateInput)` and `setCustomerStatusRecord(id, status)` in `lib/customers/service.ts` — `updateCustomerRecord` calls the `update_customer` RPC (never touches `status` or any `ledger_entries` row); `setCustomerStatusRecord` is an unconditional `.update({ status })`, a safe no-op when already in the target status, mirroring `setSupplierStatusRecord`/`setTradeNameStatusRecord` (depends on T005)
- [X] T022 [P] [US3] Implement `updateCustomer(id, input: CustomerUpdateInput): Promise<ActionResult>` and `setCustomerStatus(id, status): Promise<ActionResult>` Server Actions in `app/actions/customers.ts`, same shape as `createCustomer`/`app/actions/suppliers.ts`'s `setSupplierStatus` (depends on T021)
- [X] T023 [P] [US3] Extend `components/customers/customer-form.tsx` to accept a `defaultValues` prop and an edit mode that omits the opening-balance section entirely — not just hides it, no such fields render or submit in edit mode (FR-013) (depends on T008)
- [X] T024 [US3] Create `app/(dashboard)/customers/[customerId]/edit/page.tsx`: calls `getCustomer(id)`, renders `CustomerForm` pre-filled in edit mode, wired to the `updateCustomer` Server Action (depends on T012, T022, T023)
- [X] T025 [P] [US3] Create `components/customers/deactivate-reactivate-control.tsx`, matching `components/suppliers/deactivate-reactivate-control.tsx`'s shape, calling `setCustomerStatus` (depends on T003)
- [X] T026 [US3] Wire `DeactivateReactivateControl` into `app/(dashboard)/customers/[customerId]/page.tsx`, and add a status filter (active/inactive) to `app/(dashboard)/customers/page.tsx` and `components/customers/customer-list.tsx`, matching Suppliers'/Trade Names' active/inactive toggle (depends on T010, T012, T025)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories, and manual verification of the two corrected assumptions (payment-terms range, default-price-on-mapping) and their downstream constraint fix.

- [X] T027 [P] Review that `status` and `openingBalance` are never accepted as writable fields from `updateCustomer`'s input type (`CustomerUpdateInput` has no such fields at the type level), and that no Server Action, service function, or Postgres function anywhere in this feature ever updates or deletes a `ledger_entries` row (contracts' blanket rule, FR-013)
- [X] T028 Verify FR-016 manually: attempt to map a second product to an existing customer using an item code already used by that customer for a different product, and confirm the database's partial unique index — not just the service-layer check — rejects it (quickstart.md)
- [X] T029 Verify the corrected `customer_product_mappings_has_value_check` manually: create a mapping with only a `defaultPrice` set (no item code, no selling unit) and confirm it's accepted, and that a mapping with all three fields empty is rejected (quickstart.md; the constraint bug caught and fixed during `/sp.plan`)
- [X] T030 Verify FR-010 manually: confirm the customer form accepts and saves a payment-terms range (e.g. 30-45 days) rather than a single number, and that nothing in this feature's own code reads that range to block, reject, or auto-flag anything (009-customer-ledger is the only intended future reader)
- [X] T031 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all three user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `service.ts`/detail page (T005, T012) to extend rather than duplicate.
  - US3 depends on US1's `service.ts`/form/detail page (T005, T008, T012) to extend rather than duplicate.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T003 has no sibling to parallelize with in this feature (only one foundational file beyond the migration).
- US1: T006, T007, T008, T009 can run in parallel (different files) once T005/T003/T002 are done; T013 can run alongside them once T010 exists.
- US2: T015, T017, T018 can run in parallel (different files) once T014 is done.
- US3: T022, T023, T025 can run in parallel (different files) once T021/T008/T003 are done.
- Polish: T027 can run in parallel with T028/T029/T030/T031.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Extend listActiveTradeNamesForSelect in lib/trade-names/service.ts"
Task: "Implement createCustomer Server Action in app/actions/customers.ts"
Task: "Create CustomerForm in components/customers/customer-form.tsx"
Task: "Create CustomerList in components/customers/customer-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — Habbitt, Chaseup, ChaseValue, and Kifayat become real, editable records with correct opening balances

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
- T002's `customer_product_mappings_has_value_check` and `default_price` column, and `customers.payment_terms_min_days`/`payment_terms_max_days`, reflect two corrections made to spec.md/data-model.md/contracts/server-actions.md during `/sp.plan` review, after the original design had a single `payment_terms_days` integer and excluded pricing from the mapping entirely — see research.md's two corresponding Decision entries.
- T029 exists specifically because the first version of the corrected constraint (`customer_product_mappings_code_or_uom_check`, unchanged) would have silently continued rejecting a price-only mapping despite spec.md's Assumptions already saying "at least one of the three" — caught during review before implementation began.

## Implementation Notes (post `/sp.implement`)

- **T002 / migration applied**: `supabase/migrations/0005_customers.sql` was reviewed and applied by the user in the Supabase SQL editor after `/sp.implement` completed (same sequencing as 002/003b/004 — this environment has no DB write access for DDL). T028, T029, and T031 were then completed against the live project.
- **T028/T029 (DB-level constraint verification)**: run via a throwaway Node script using the service-role client directly (same trust boundary as `lib/supabase/admin.ts`), inserting clearly-marked rows (`ZZZ_TEST_VERIFICATION_DELETE_ME`) and deleting them all immediately after. FR-016: a second mapping reusing an already-used item code for a different product under the same customer was rejected with Postgres code `23505` (`idx_customer_product_mappings_code`) — **PASS**. The corrected has-value check: a mapping with only `default_price` set (no item code, no selling unit) was accepted — **PASS**; a mapping with all three fields empty was rejected with Postgres code `23514` (`customer_product_mappings_has_value_check`) — **PASS**.
- **T031 (full quickstart.md walkthrough)**: run end-to-end through the actual running app (`npm run dev` + browser automation), not just data-layer calls. Neither an active product nor an active trade name existed yet in the live project (004/003 haven't been used to seed real data yet), so one throwaway product (`ZZZ QA Test Product`) was created to exercise the mapping flow; the trade-name-hint picker legitimately rendered nothing to pick from (confirmed correct empty-state behavior, not a bug) and that part of quickstart's step 2 couldn't be exercised without seeding a trade name first. Created two throwaway customers (`ZZZ QA Customer One` with a Rs 50,000 credit opening balance and a 30–45 day payment-terms range; `ZZZ QA Customer Two` with no opening balance) and verified: both appear in the list; the detail view shows display/legal name as two distinct fields; the opening balance posted as a ledger entry (`Rs 50000.00` running balance) while the no-opening-balance customer showed `Rs 0.00`; submitting with blank display/legal name/address produced clear per-field validation errors; a mapping with item code + selling unit + default price saved and appeared on both the customer's and the product's detail pages, correctly labeled "(pre-fill only)"; a price-only mapping was accepted through the real UI/Server-Action/DB stack; editing the payment-terms range persisted without disturbing the ledger balance or mappings; the edit form had no opening-balance field anywhere; deactivating excluded the customer from the active list (ledger balance and mapping preserved) and it appeared under the inactive filter; reactivating restored it to the active list. All throwaway rows (customers, their ledger entries, the mapping, the product) were deleted afterward via the same throwaway-script approach, verified empty via the UI, and the temp scripts themselves were deleted from the repo. **All quickstart scenarios PASS.**
- **Automation note**: two "Deactivate"/"Reactivate" clicks were performed by the user directly rather than by browser automation, since those buttons trigger a native `window.confirm()` dialog that would block/freeze an automated session if clicked programmatically.
- **Consolidated writes across task boundaries**: `lib/customers/service.ts` (T005 + T016 + T021), `app/actions/customers.ts` (T007 + T017 + T022), and `components/customers/customer-form.tsx` (T008 + T023) were each written once with their full final shape rather than literally edited once per phase — splitting a small file into three sequential partial edits would have added churn with no behavioral difference. `lib/customers/product-mappings.ts` (T014) was written before `lib/customers/service.ts` so `getCustomer` could call `listCustomerProductMappings` directly rather than shipping a literal empty-array placeholder that would need a follow-up edit. Each task above is checked off at the point its described behavior became true in the code, per 003b/004's precedent for this kind of consolidation.
- **Opening balance kept outside react-hook-form/zod entirely**: registering `openingBalance.amount` etc. as RHF fields validated by `customerInputSchema` hit the classic "optional nested object with a required-when-present subfield" gotcha — an untouched, blank amount would still validate as `NaN`/empty and fail `openingBalanceSchema`'s `positive()` check, blocking submission for customers with no real opening balance. Resolved by managing the three opening-balance inputs as plain local component state in `customer-form.tsx`, folded into the payload only when a nonzero amount is actually entered, and validated authoritatively server-side by `createCustomer`'s `customerInputSchema.parse(input)` regardless.
- **`ProductMappingForm` is only wired from the customer detail page**, not the product detail page, despite plan.md's Project Structure describing it as "used on both" — every concrete acceptance scenario and quickstart step only exercises *adding* a mapping from the customer side; the product detail page (T020) shows mappings read-only via `listProductCustomerMappings`. The substance (a mapping visible from both pages) is unchanged; only which page owns the add/edit form differs from that one descriptive sentence.
- **`getCustomerLedgerBalance` sums in application code, not raw SQL `SUM`**: data-model.md describes "a plain query," but `supabase-js`/PostgREST has no `CASE`-based conditional-sum aggregation without an RPC — which research.md's "no RPC for ledger" call already ruled out. Fetching all of a customer's `ledger_entries` rows (`type`, `amount`) and reducing client-side is the practical equivalent at this feature's stated scale ("a few thousand ledger rows per customer over years — trivial for an indexed `SUM`" per research.md itself).
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly; `next build` lists all four new routes (`/customers`, `/customers/new`, `/customers/[customerId]`, `/customers/[customerId]/edit`) compiling as dynamic routes alongside the existing suppliers/products/purchases/trade-names routes.
- **T027 (writable-field audit)**: confirmed by inspection — `baseCustomerFields` (shared by `customerInputSchema` and `customerUpdateInputSchema`) has no `status` key; `openingBalance` exists only on `customerInputSchema`, never on `customerUpdateInputSchema`/`CustomerUpdateInput`; `update_customer` (0005_customers.sql) has no opening-balance parameters and never assigns `status`; only `setCustomerStatusRecord` writes `status`; no Server Action, service function, or Postgres function anywhere in this feature updates or deletes a `ledger_entries` row (the only write is the conditional insert inside `create_customer`).
- **T030 (payment-terms range never used to block anything)**: confirmed by inspection — a repo-wide search for `paymentTerms`/`payment_terms` shows the range is only ever captured, range-validated (`max >= min`), and displayed; no code path in this feature (or anywhere else) reads it to reject, block, or auto-flag a payment. It's stored for 009-customer-ledger, which doesn't exist yet.
- **Unrelated pre-existing warning, not touched**: `next build`'s `middleware` → `proxy` deprecation notice, and `middleware.ts`'s matcher not covering `/products`, `/trade-names`, or `/customers` (only `/suppliers` and `/purchases`) — pre-existing since before 003/004, out of scope for a customers change, left as-is per the project's smallest-viable-diff convention. The real authorization boundary remains `app/(dashboard)/layout.tsx`'s server-side `getCurrentUser()` check, which does cover every dashboard route including `/customers`.
