---

description: "Task list for Customer Purchase Orders implementation"
---

# Tasks: Customer Purchase Orders

**Input**: Design documents from `/specs/006-customer-purchase-orders/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001-005). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3)

## Path Conventions

Single Next.js project at repository root. This feature adds one new module and extends one
existing one by a single function:

- `supabase/migrations/0006_customer_purchase_orders.sql` — new migration file
- `lib/customer-pos/{schema.ts, service.ts, item-code-resolution.ts, storage.ts}` — new module
- `app/actions/customer-pos.ts` — new Server Actions file
- `components/customer-pos/{customer-po-form.tsx, customer-po-line-row.tsx, customer-po-list.tsx, customer-po-status-control.tsx, attachment-list.tsx}` — new components
- `app/(dashboard)/customer-pos/**` — new route group (list, new, detail, edit)
- `app/(dashboard)/layout.tsx` — extended (one new nav link)
- `lib/customers/service.ts` — extended (`listActiveCustomersForSelect`, deferred here from 005)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001-005 (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0006_customer_purchase_orders.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, types, and DB objects every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write the full migration in `supabase/migrations/0006_customer_purchase_orders.sql` per [data-model.md](./data-model.md): create `customer_pos` (`po_number varchar(30)`, `unique (customer_id, po_number)`, `status check in ('open','cancelled')` default `'open'`, `trade_name_id` FK to `trade_names(id)` no cascade, `customer_id` FK to `customers(id)` no cascade, `idx_customer_pos_status_customer` index), `customer_po_lines` (`product_id` FK to `products(id)`, `quantity_ordered numeric(10,2) check > 0`, `unit_price numeric(12,2) check > 0`, `line_total` generated always as `round(quantity_ordered * unit_price, 2)` stored, `delivered_quantity`/`invoiced_quantity numeric(10,2)` default `0` check `>= 0` with comments noting they're reserved for 007/008 and never written above zero by this feature, `on delete cascade` from `customer_pos`), and `customer_po_attachments` (`on delete cascade` from `customer_pos`); RLS enabled with no policies on all three tables; an `updated_at` trigger reusing `set_updated_at()` from `0001_init.sql` on `customer_pos` and `customer_po_lines`; the `customer-po-documents` private Storage bucket insert; and the three Postgres functions `create_customer_po`, `update_customer_po` (per-line upsert with lock check, not delete-then-reinsert — research.md), and `set_customer_po_status` (unconditional on reactivate, lock-checked on cancel) per data-model.md's signatures
- [X] T003 [P] Create `lib/customer-pos/schema.ts`: `poLineInputSchema` (Zod — `customerItemCode?`, `productId` uuid required, `description?`, `quantityOrdered` positive number, `uom` non-empty string, `unitPrice` positive number), `customerPOInputSchema` (`customerId` uuid, `poNumber` 1-30 chars no format restriction, `orderDate`, `purchaserName?`, `requestedDeliveryDate?`, `destinationText?`, `tradeNameId?` uuid, `lines` array of `poLineInputSchema`, min 1), `poLineUpdateSchema` (`poLineInputSchema` plus optional `id`), `customerPOUpdateInputSchema` (same header shape, `lines` array of `poLineUpdateSchema`), `customerPOStatusSchema` (`'open' | 'cancelled'`), and TypeScript types `CustomerPOInput`, `PoLineInput`, `CustomerPOUpdateInput`, `CustomerPOListItem`, `CustomerPODetail` (incl. `createdAt`/`updatedAt`, per FR-019), `PoLineDetail` (incl. `deliveredQuantity`/`invoicedQuantity`), `Attachment` (depends on T002)
- [X] T004 [P] Extend `lib/customers/service.ts` with `listActiveCustomersForSelect(): Promise<{ id: string; displayName: string }[]>` — thin wrapper over the existing `listCustomers({ status: "active" })`, the addition 005's own [contracts/server-actions.md](../005-customers/contracts/server-actions.md#listactivecustomersforselect-promise-id-string-displayname-string-) already deferred to this feature

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Record and view a customer PO (Priority: P1) 🎯 MVP

**Goal**: Staff can record a PO (customer, PO number, order date, one or more line items with quantity/UOM/price, item-code-to-product auto-resolution with manual fallback) and see it in a list and a detail view with its computed total.

**Independent Test**: Record one PO with at least two line items against a customer with one mapped item code and one unmapped code; confirm the mapped line auto-resolves while the unmapped line accepts a manual product pick, the PO saves and appears in the list, and its detail view shows every field plus the correct total (spec Acceptance Scenarios 1–6 for User Story 1).

### Implementation for User Story 1

- [X] T005 [US1] Implement `resolveCustomerItemCode(customerId: string, itemCode: string)` in `lib/customer-pos/item-code-resolution.ts` — the read-only lookup against 005's `customer_product_mappings` per [data-model.md](./data-model.md); returns `null` when no mapping matches, never re-run at save time (research.md) (depends on T002)
- [X] T006 [US1] Implement `createCustomerPORecord`, `listCustomerPOs`, and `getCustomerPO` in `lib/customer-pos/service.ts` per [contracts/server-actions.md](./contracts/server-actions.md): `createCustomerPORecord` resolves a blank `destinationText` to the selected customer's current billing address (a plain read against `customers`, per research.md — never the Postgres function's job) before calling the `create_customer_po` RPC with header fields and a `lines` jsonb array; `listCustomerPOs(filters: { status?: 'open' | 'cancelled'; customerId?: string })` defaults `status` to `'open'`, applies an `eq('customer_id', ...)` filter only when `customerId` is provided (FR-012 — filterable by customer, independent of status), joins `customers(display_name)`, fetches each PO's lines to sum `line_total` in TypeScript (research.md — no database aggregate), ordered by `order_date desc`; `getCustomerPO` joins customer/trade name/lines (each joined to `products(name, stock_uom)`) and computes the total, includes `createdAt`/`updatedAt` (FR-019), and returns an empty `attachments` array for now (wired to real data in User Story 2) (depends on T002, T003)
- [X] T007 [P] [US1] Implement `createCustomerPO(input: CustomerPOInput): Promise<ActionResult<{ id: string }>>` Server Action in `app/actions/customer-pos.ts` — `requireCurrentUser()`, `customerPOInputSchema.parse(input)`, call `createCustomerPORecord`, surface the DB's `unique (customer_id, po_number)` violation as a friendly `DuplicatePONumberError` rather than a raw Postgres error, `revalidatePath("/customer-pos")`, matching the shape of `app/actions/customers.ts`'s `createCustomer` (depends on T006)
- [X] T008 [P] [US1] Implement a `resolveCustomerItemCode(customerId, itemCode)` Server Action wrapper in `app/actions/customer-pos.ts` — `requireCurrentUser()` (FR-018, matching every other action in this file — contracts/server-actions.md's blanket auth rule applies to this read-exposed-as-an-action too), then calls `lib/customer-pos/item-code-resolution.ts`, so the line-item form can invoke it from a Client Component (depends on T005)
- [X] T009 [P] [US1] Create `components/customer-pos/customer-po-line-row.tsx`: one line's fields — item code input that calls the `resolveCustomerItemCode` action on blur/debounce to auto-fill product/UOM/price, a manual product picker fallback (via `listActiveProductsForSelect`, already added by 005) shown whenever resolution returns `null`, description, quantity, UOM, unit price, and a computed line-total display (depends on T003, T008)
- [X] T010 [US1] Create `components/customer-pos/customer-po-form.tsx`: `react-hook-form` + `zodResolver(customerPOInputSchema)`, header fields (customer picker via `listActiveCustomersForSelect`, PO number, order date, purchaser name, requested delivery date, destination text, trade-name picker via `listActiveTradeNamesForSelect` already added by 005), and a dynamic line-items array (`useFieldArray`) rendering `CustomerPoLineRow` with add/remove controls (depends on T004, T009)
- [X] T011 [P] [US1] Create `components/customer-pos/customer-po-list.tsx`: renders `CustomerPOListItem` rows (customer, PO number, order date, status, total), matching `components/customers/customer-list.tsx`'s shape, plus a customer-filter dropdown (populated via `listActiveCustomersForSelect`) that navigates to `?customerId=...` — a `Link`/`useRouter`-driven control, same searchParams-filter pattern `app/(dashboard)/customers/page.tsx`'s `CustomerStatusFilter` already uses (FR-012) (depends on T003, T004)
- [X] T012 [US1] Create `app/(dashboard)/customer-pos/page.tsx` and `loading.tsx`: Server Component reading `searchParams: Promise<{ customerId?: string }>` and calling `listCustomerPOs({ customerId })` (FR-012), rendering `CustomerPoList` (depends on T006, T011)
- [X] T013 [US1] Create `app/(dashboard)/customer-pos/new/page.tsx`: renders `CustomerPoForm` (create mode) wired to the `createCustomerPO` Server Action (depends on T007, T008, T010)
- [X] T014 [US1] Create `app/(dashboard)/customer-pos/[poId]/page.tsx` and `loading.tsx`: Server Component calling `getCustomerPO(id)` and rendering every header field, its created/last-updated timestamps (FR-019), each line item (incl. resolved product, computed line total, and the delivered/invoiced placeholders always shown as `0`), and the PO's total value; returns a not-found state if `null` (depends on T006)
- [X] T015 [P] [US1] Add a "Customer POs" link to the dashboard nav in `app/(dashboard)/layout.tsx`, alongside the existing Suppliers/Products/Purchases/Trade Names/Customers links (depends on T012)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Accommodate how each customer actually submits a PO (Priority: P2)

**Goal**: Staff can attach a PO document (Habbitt's PDF) when one exists, and save a PO with no attachment at all (Chaseup's portal-based intake) — an attachment is never required.

**Independent Test**: Record one PO with a PDF attached and confirm it's stored and retrievable via a signed URL from the detail view; record a second PO with no attachment and confirm it still saves successfully (spec Acceptance Scenarios 1–3 for User Story 2).

### Implementation for User Story 2

- [X] T016 [US2] Implement `uploadCustomerPOAttachment`/`getSignedAttachmentUrl` in `lib/customer-pos/storage.ts` — mirrors `lib/trade-names/storage.ts` exactly (ADR-0003), targeting the new `customer-po-documents` bucket (depends on T002)
- [X] T017 [US2] Implement `addCustomerPOAttachmentRecord` in `lib/customer-pos/service.ts` (inserts a `customer_po_attachments` row) and extend `getCustomerPO` to fetch real attachments (each resolved to a signed URL via `storage.ts`), replacing User Story 1's empty-array placeholder (depends on T006, T016)
- [X] T018 [P] [US2] Implement `uploadCustomerPOAttachment(poId: string, formData: FormData): Promise<ActionResult<{ id: string; fileName: string }>>` Server Action in `app/actions/customer-pos.ts` — `requireCurrentUser()`, extracts the `File` from `formData`, calls `lib/customer-pos/storage.ts` then `addCustomerPOAttachmentRecord`, `revalidatePath` for the PO's detail page (depends on T017)
- [X] T019 [P] [US2] Create `components/customer-pos/attachment-list.tsx`: displays a PO's attached files (name, upload date) with a view/download link resolving to a signed URL, plus a file-input control wired to the `uploadCustomerPOAttachment` action (depends on T003)
- [X] T020 [US2] Wire an optional attachment upload into `components/customer-pos/customer-po-form.tsx`'s create mode (uploaded only after the PO itself has been created — research.md's follow-up-step ordering, never bundled into `createCustomerPO` itself) and wire `AttachmentList` into `app/(dashboard)/customer-pos/[poId]/page.tsx` (depends on T010, T014, T018, T019)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Correct or cancel a recorded PO (Priority: P3)

**Goal**: Staff can edit an existing PO's header or line fields, and cancel/reactivate it, without losing its record — except that a line with delivery/invoicing activity (inert today, structural for when 007/008 ship) is locked, and a PO with any such line can't be cancelled through this feature.

**Independent Test**: Edit an existing PO's line quantity and price and confirm the change persists and the total recalculates; cancel an open PO and confirm it's excluded from the default list but remains viewable and intact; reactivate it and confirm it reappears (spec Acceptance Scenarios 1–3 for User Story 3).

### Implementation for User Story 3

- [X] T021 [US3] Implement `updateCustomerPORecord(id, input: CustomerPOUpdateInput)` in `lib/customer-pos/service.ts` — resolves a blank `destinationText` to the customer's current billing address, same helper T006 uses (research.md), before calling the `update_customer_po` RPC with header fields and a `lines` array (each carrying its existing `id` when present); surfaces the function's locked-line exception as a friendly `LockedLineError` (FR-014) (depends on T006)
- [X] T022 [US3] Implement `setCustomerPOStatusRecord(id, status: 'open' | 'cancelled')` in `lib/customer-pos/service.ts` — calls the `set_customer_po_status` RPC, surfaces the cancel-direction lock exception as a friendly `LockedPOError` (FR-015) (depends on T006)
- [X] T023 [P] [US3] Implement `updateCustomerPO(id, input: CustomerPOUpdateInput): Promise<ActionResult>` Server Action in `app/actions/customer-pos.ts`, same shape as `createCustomerPO` (depends on T021)
- [X] T024 [P] [US3] Implement `cancelCustomerPO(id: string): Promise<ActionResult>` and `reactivateCustomerPO(id: string): Promise<ActionResult>` Server Actions in `app/actions/customer-pos.ts`, calling `setCustomerPOStatusRecord` with `'cancelled'`/`'open'` respectively (depends on T022)
- [X] T025 [P] [US3] Extend `components/customer-pos/customer-po-line-row.tsx` to render a line's quantity/UOM/price/product fields as read-only whenever it's passed a locked line (`deliveredQuantity > 0 or invoicedQuantity > 0`) — inert today since no writer sets those above zero yet, but the structural rendering rule must exist per FR-014 (depends on T009)
- [X] T026 [P] [US3] Create `components/customer-pos/customer-po-status-control.tsx`: cancel/reactivate control, matching `components/customers/deactivate-reactivate-control.tsx`'s shape, calling `cancelCustomerPO`/`reactivateCustomerPO` and surfacing a `LockedPOError` as a clear inline message (depends on T003)
- [X] T027 [US3] Create `app/(dashboard)/customer-pos/[poId]/edit/page.tsx`: calls `getCustomerPO(id)`, renders `CustomerPoForm` pre-filled in edit mode (each line carrying its `id` and lock state), wired to the `updateCustomerPO` Server Action (depends on T014, T023, T025)
- [X] T028 [US3] Wire `CustomerPoStatusControl` into `app/(dashboard)/customer-pos/[poId]/page.tsx`, and add a status filter (open/cancelled) to `app/(dashboard)/customer-pos/page.tsx` and `components/customer-pos/customer-po-list.tsx` — extending T012's `searchParams` to also read `status` (defaulting to `'open'`) alongside the existing `customerId` param, so both filters compose (`listCustomerPOs({ status, customerId })`), matching the active/inactive toggle pattern from Suppliers/Trade Names/Customers (depends on T012, T014, T026)

**Checkpoint**: All three user stories are independently functional.

---

## Phase 6: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories, and manual verification of the feature's structural correctness rules.

- [X] T029 [P] Review that `status`, `deliveredQuantity`, and `invoicedQuantity` are never accepted as writable fields anywhere on `CustomerPOInput`/`CustomerPOUpdateInput` at the type level, and that no Server Action, service function, or Postgres function anywhere in this feature ever sets `delivered_quantity`/`invoiced_quantity` above their `0` default (contracts' blanket rule, FR-014/FR-015/FR-017)
- [X] T030 Verify FR-004 manually: attempt to save two POs for the same customer with the same PO number and confirm the database's `unique (customer_id, po_number)` constraint — not just a service-layer check — rejects it; confirm the identical PO number succeeds for a *different* customer (quickstart.md)
- [X] T031 Verify FR-003 manually: save a PO using Chaseup's 18-character all-numeric portal-style PO number and another using Habbitt's 6-character PO number, and confirm both are stored and displayed exactly as entered, with no truncation or rejection (quickstart.md)
- [X] T032 Verify FR-006/FR-007 manually: enter a mapped item code and confirm the product/UOM/price auto-fill, override the price and confirm the *overridden* price is what's saved and displayed; enter an item code with no mapping and confirm the manual product-picker fallback still allows the PO to save (quickstart.md)
- [X] T033 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all three user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–5)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3.
  - US2 depends on US1's `service.ts`/form/detail page (T006, T010, T014) to extend rather than duplicate.
  - US3 depends on US1's `service.ts`/line-row/detail page (T006, T009, T014) to extend rather than duplicate.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 6)**: Depends on all three user stories being complete.

### Parallel Opportunities

- Foundational: T003 and T004 can run in parallel (different files) once T002 is done.
- US1: T007, T008, T009, T011 can run in parallel (different files) once T005/T006/T003/T004 are done; T015 can run alongside once T012 exists.
- US2: T018, T019 can run in parallel (different files) once T017 is done.
- US3: T023, T024, T025, T026 can run in parallel (different files) once T021/T022/T009/T003 are done.
- Polish: T029 can run in parallel with T030/T031/T032/T033.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement resolveCustomerItemCode Server Action in app/actions/customer-pos.ts"
Task: "Implement createCustomerPO Server Action in app/actions/customer-pos.ts"
Task: "Create CustomerPoLineRow in components/customer-pos/customer-po-line-row.tsx"
Task: "Create CustomerPoList in components/customer-pos/customer-po-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — staff can record and look up a customer PO with correct item-code resolution

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
- T002's per-line upsert (not delete-then-reinsert) inside `update_customer_po`, and the
  destination field being free text rather than a live FK to `customer_ship_to_addresses`, are
  both design corrections made during `/sp.plan` review — see research.md's corresponding
  Decision entries for why 001/005's usual child-row patterns don't fit here.
- T006/T008/T011/T012/T028 were amended after `/sp.analyze` caught two real gaps: FR-012's
  customer filter was described in plan.md's Project Structure but never implemented in any task
  (fixed by extending T006/T011/T012 to thread a `customerId` filter through, with T028 folding
  the status filter into the same `searchParams` read rather than a separate one); T008
  (`resolveCustomerItemCode`) was the one action task missing an explicit `requireCurrentUser()`
  call despite contracts/server-actions.md's blanket per-action auth rule (FR-018) — fixed by
  naming it explicitly, matching every other action task.
- T003/T006/T014/T021 were further amended after the same `/sp.analyze` pass to close two
  MEDIUM/LOW findings: the destination-defaults-to-billing-address behavior promised in
  data-model.md/spec Assumptions had no implementing task (fixed by adding it to T006/T021 as a
  service-layer default — resolved server-side, not via a client-side UI copy, since 005's
  `getCustomer` isn't callable from a Client Component; see research.md's new corresponding
  Decision entry); FR-019's "display" half (created/updated timestamps) was implicit at best
  (fixed by naming it explicitly in T003's `CustomerPODetail` type and T014's detail-page
  rendering).
- T029/T030/T031/T032 exist specifically to verify the structural correctness rules this feature
  is built around (the per-line lock, the per-customer PO-number uniqueness, the field-capacity
  requirement, and price/resolution authority) rather than trusting the UI alone to enforce them.

## Implementation Notes (post `/sp.implement`)

- **T002 / migration applied**: `supabase/migrations/0006_customer_purchase_orders.sql` was
  reviewed and applied by the user in the Supabase SQL editor after `/sp.implement` completed
  (this environment has no DB write access for DDL, same sequencing as 002/003b/004/005). Before
  applying it, the user caught a real gap in `update_customer_po`'s locked-line handling — see the
  dedicated note below — which was fixed in the migration before it was applied.
- **T030/T031/T032/T033 (live verification against the real Supabase project)**: run via a
  throwaway Node script using the service-role client directly (same trust boundary as
  `lib/supabase/admin.ts`), seeding clearly-marked rows (`ZZZ QA Habbitt`/`ZZZ QA Chaseup`/`ZZZ QA
  Product Mapped`/`ZZZ QA Product Unmapped`/`ZZZ QA Trade Name`) and deleting them all (plus their
  cascaded lines/attachments and the uploaded Storage object) immediately after — **27 checks, all
  PASS**: FR-004 (duplicate PO number rejected for the same customer with Postgres code `23505`,
  identical number accepted for a different customer), FR-003 (Chaseup's 18-character portal-style
  number and its embedded-Challan-reference description both stored/read back byte-for-byte),
  FR-007 (an unmapped item code resolves to `null` and the manual-pick fallback still saves),
  FR-006 (an overridden price of 3200 persisted over the mapping's 2600 default), FR-010 (zero
  quantity and negative price both rejected with Postgres code `23514`), FR-015 happy path
  (cancel → reactivate on an unlocked PO, plus the already-cancelled no-op), and the full
  locked-line partial-field matrix (editing only `customer_item_code`/`description` on a locked
  line succeeds and persists; changing `product_id`, `quantity_ordered`, `uom`, or `unit_price`
  individually on that same locked line is rejected with `LOCKED_LINE`; removing a locked line
  entirely is rejected; cancelling a PO with a locked line is rejected with `LOCKED_PO`).
  Then ran the equivalent flows end-to-end through the actual running app (`npm run dev` + browser
  automation, not just data-layer calls) against the same seeded data: the list page's customer
  and status filters (both compose via the same `searchParams`, confirmed via the URL updating
  correctly and the list filtering to only the selected customer's POs); creating a Habbitt PO
  with a mapped line (auto-resolved product/UOM/price, then an overridden price that persisted)
  and an unmapped line (manual product pick); creating a Chaseup PO with the 18-digit portal
  number, no attachment, and an embedded-Challan-reference description, with trade name and
  destination both left blank — destination correctly defaulted to Chaseup's billing address
  ("2 Test Ave, Lahore, Pakistan"); editing an unlocked PO's quantity/price and confirming the
  total recalculated and persisted; uploading a real file via the detail page's attachment control
  and confirming it resolved to a genuine Supabase Storage signed URL; and the locked line's
  quantity/UOM/price/product fields rendering disabled while item code/description remained
  editable, exactly matching the corrected `update_customer_po` behavior.
- **T029 (writable-field audit) verified by inspection**, no DB needed: `CustomerPOInput`/
  `CustomerPOUpdateInput` (schema.ts) have no `status`, `deliveredQuantity`, or `invoicedQuantity`
  fields at the type level; `linePayload`/`lineUpdatePayload` (service.ts) never construct those
  keys; `create_customer_po`/`update_customer_po` (the migration) never write to
  `delivered_quantity`/`invoiced_quantity`, and `update_customer_po` never touches `status`.
- **Consolidated writes across task boundaries**: `lib/customer-pos/service.ts` (T006 + T017 +
  T021 + T022), `app/actions/customer-pos.ts` (T007 + T008 + T018 + T023 + T024), and
  `components/customer-pos/customer-po-form.tsx` (T010 + T020's create-mode attachment upload)
  were each written once with their full final shape rather than literally split into sequential
  partial edits per task — `lib/customer-pos/storage.ts` (T016) was written before `service.ts` so
  `getCustomerPO` could resolve real attachment signed URLs directly rather than shipping a
  literal empty-array placeholder needing a follow-up edit. This mirrors 005's own precedent for
  the same kind of task-boundary consolidation.
- **`update_customer_po`'s per-line upsert** was implemented as designed in research.md: a
  `for v_line, v_ord in select l, ord from jsonb_array_elements(p_lines) with ordinality ...`
  loop, checking `delivered_quantity > 0 or invoiced_quantity > 0` on any existing line before
  either deleting it (line omitted from the submitted set) or updating it (line's id present in
  the submitted set) — raising a `LOCKED_LINE: ...` exception either way if that check fails,
  which `toFriendlyPOError` (service.ts) translates into the exact message
  contracts/server-actions.md documents. `set_customer_po_status` does the equivalent
  `LOCKED_PO: ...` check only on the cancel direction.
- **Destination default** is implemented exactly as research.md's corrected decision:
  `resolveDestinationText` in `lib/customer-pos/service.ts` is a plain read against `customers`'
  `billing_address_*` columns, called from both `createCustomerPORecord` and
  `updateCustomerPORecord` whenever the submitted `destinationText` is blank — never inside the
  Postgres functions themselves, never a client-side fetch.
- **Item-code resolution UI**: `CustomerPoLineRow` calls the `resolveCustomerItemCode` Server
  Action on the item-code input's `onBlur`, auto-filling `productId`/`uom`/`unitPrice` via
  `setValue` when a mapping resolves, and showing an inline "no mapping found" note (FR-007)
  otherwise — the product `<select>` remains directly editable either way, so a staff member can
  always override the resolution or pick manually.
- **Attachment upload in create mode**: since a PO doesn't have an id until `createCustomerPO`
  returns one, the create form holds a picked file in local component state and uploads it via
  `uploadCustomerPOAttachment` immediately after a successful create, before redirecting — matching
  research.md's "uploaded as a follow-up step, never bundled into create_customer_po" decision.
  The edit form has no attachment UI at all; attachments are managed entirely from the PO detail
  page's `AttachmentList` (T020), which can add more at any time, matching the "no
  attachment-removal action in this feature" scope cut from research.md.
- **Customer field is read-only in edit mode** (a static label, not a `<select>`): not an explicit
  spec requirement either way, but changing a PO's customer after the fact doesn't fit its own
  item-code-resolution/mapping model and isn't exercised by any acceptance scenario — a low-risk,
  silent scope call in the same spirit as 005's "customer/product are immutable once a mapping
  exists."
- **Real bug found and fixed during code review, before the migration was applied**: the user
  asked whether `update_customer_po` rejecting the entire submitted line whenever
  `delivered_quantity`/`invoiced_quantity` was nonzero was an intentional "fully frozen line"
  simplification, since FR-014's literal text locks only `quantity_ordered`/`uom`/`unit_price`/
  `product_id` — not `customer_item_code`/`description`. It was an unflagged simplification, not a
  deliberate decision, and the same mistake had propagated into `data-model.md`, `research.md`,
  `contracts/server-actions.md`, `lib/customer-pos/service.ts`'s friendly-error text, and
  `components/customer-pos/customer-po-line-row.tsx`'s `disabled` props (which disabled *all six*
  line fields on a locked line, not just the four FR-014 actually locks). All were corrected: the
  migration's per-line-upsert loop now fetches the current row and compares only the four locked
  fields before deciding whether to raise `LOCKED_LINE`; the line-row component now leaves
  `customerItemCode`/`description` enabled and editable regardless of lock state. This is inert in
  production today (no writer sets those quantities above zero until 007/008 ship) but was
  verified directly: the live-verification script found T030–T033 above includes the full matrix
  proving a locked line accepts item-code/description edits and persists them, while rejecting any
  change to the four locked fields individually, via the real applied migration.
- **Real bug found during the browser walkthrough, unrelated to the one above**: `tradeNameId:
  z.string().uuid().optional()` in `lib/customer-pos/schema.ts` rejected the empty string the
  trade-name `<select>`'s "— none selected —" option submits — `.optional()` only permits
  `undefined`, not `""`, and `""` is not a valid uuid. Since `CustomerPoForm`'s `handleSubmit` had
  no `onInvalid` callback wired, react-hook-form's default behavior on a validation failure (just
  refocus the first invalid field, no visible error) made this look like the submit button was
  silently doing nothing whenever a PO's trade name was left blank — a real, user-facing bug that
  would have blocked creating or editing *any* PO without a trade name selected, confirmed
  reproducible in the actual running app (the dev server's request log showed `resolveCustomerItemCode`
  POSTs firing normally but no `createCustomerPO`/`updateCustomerPO` POST ever being sent).
  Fixed with the same `.optional().or(z.literal(""))` pattern already used for the optional
  contact-email field in `lib/customers/schema.ts`/`lib/suppliers/schema.ts`, and added an
  `onInvalid` handler to `CustomerPoForm` as a defensive backstop so any future validation gap
  surfaces a visible message instead of failing silently. Reproduced the original failure and
  confirmed the fix in the live app both ways: leaving trade name blank on a fresh Habbitt PO and
  on the Chaseup PO used for the FR-003 verification above, both of which now save successfully.
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass
  cleanly on the full repo (not just this feature's files), both before and after the two fixes
  above.

