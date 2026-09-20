---

description: "Task list for Trade Names & Document Settings implementation"
---

# Tasks: Trade Names & Document Settings

**Input**: Design documents from `/specs/004-trade-names-and-document-settings/`
**Prerequisites**: [plan.md](./plan.md), [spec.md](./spec.md), [research.md](./research.md), [data-model.md](./data-model.md), [contracts/server-actions.md](./contracts/server-actions.md), [quickstart.md](./quickstart.md)

**Tests**: Not explicitly requested in spec.md, so no dedicated test-writing tasks are included (same call as 001/002/003/003b). The testing stack (Vitest + Testing Library) is documented in research.md for whenever tests are added.

**Organization**: Tasks are grouped by user story (from spec.md: US1 = P1, US2 = P2, US3 = P2, US4 = P3) to enable independent implementation and testing of each.

## Format: `[ID] [P?] [Story] Description`

- **[P]**: Can run in parallel (different files, no unmet dependencies)
- **[Story]**: Which user story this task belongs to (US1, US2, US3, US4)

## Path Conventions

Single Next.js project at repository root. This feature adds one new module — no existing
files from 001/002/003/003b are modified except `app/(dashboard)/layout.tsx` (one new nav link):

- `supabase/migrations/0004_trade_names.sql` — new migration file
- `lib/trade-names/{schema.ts, service.ts, storage.ts}` — new module
- `app/actions/trade-names.ts` — new Server Actions file
- `components/trade-names/{trade-name-form.tsx, trade-name-list.tsx, trade-name-asset-upload.tsx, deactivate-reactivate-control.tsx}` — new components
- `app/(dashboard)/trade-names/**` — new route group (list, new, detail, edit)
- `app/(dashboard)/layout.tsx` — extended (one new nav link)

---

## Phase 1: Setup

**Purpose**: Scaffold the new migration file. No new dependencies — reuses everything already installed for 001/002/003/003b (per plan.md's Technical Context).

- [X] T001 Create empty `supabase/migrations/0004_trade_names.sql` file

---

## Phase 2: Foundational (Blocking Prerequisites)

**Purpose**: The schema, types, and DB/Storage objects every user story depends on.

**⚠️ CRITICAL**: No user story work can begin until this phase is complete.

- [X] T002 Write the full migration in `supabase/migrations/0004_trade_names.sql` per [data-model.md](./data-model.md): create `trade_names` (all columns/constraints/defaults, RLS enabled with no policies, an `updated_at` trigger mirroring `trg_suppliers_updated_at` from `0001_init.sql`), and provision the private `trade-name-assets` Storage bucket (`insert into storage.buckets (id, name, public) values ('trade-name-assets', 'trade-name-assets', false)`)
- [X] T003 [P] Create `lib/trade-names/schema.ts`: `tradeNameInputSchema` (Zod — `printedName` and `printedAddress` non-empty strings; `ntnNumber`/`salesTaxRegistrationNumber` optional strings; `nextChallanNumber`/`nextInvoiceNumber` positive integers, both defaulting to `1`), `tradeNameStatusSchema` (`'active' | 'inactive'`), and TypeScript types `TradeNameInput`, `TradeName` (full record incl. `id`, `status`, `signatureImagePath`, `stampImagePath`, timestamps), `TradeNameListItem` (`id`, `printedName`, `status`), `TradeNameDetail` (extends `TradeName` with nullable `signatureImageUrl`/`stampImageUrl`) (depends on T002)

**Checkpoint**: Foundation ready — user story implementation can now begin.

---

## Phase 3: User Story 1 - Create and view trade name records (Priority: P1) 🎯 MVP

**Goal**: Staff can create a trade name record (printed name/address, optional NTN/Sales Tax Registration number) and see it in a list and a detail view.

**Independent Test**: Create one trade name record with printed name and address; confirm it appears in the trade name list and its detail view shows every entered field; confirm submitting without a printed name or address is rejected with a clear error (spec Acceptance Scenarios 1–3 for User Story 1).

### Implementation for User Story 1

- [X] T004 [US1] Implement `createTradeNameRecord`, `listTradeNames`, and `getTradeName` in `lib/trade-names/service.ts` — plain `supabase-js` `.insert()`/`.select()` calls per [contracts/server-actions.md](./contracts/server-actions.md) and [research.md](./research.md) (no Postgres RPC — this table has no child tables to keep in sync, unlike ADR-0002's cases); `createTradeNameRecord` defaults `status` to `'active'`; `listTradeNames` defaults its `status` filter to `'active'`, ordered by `printed_name`; `getTradeName` returns `signatureImageUrl`/`stampImageUrl` as `null` for now (wired to real signed URLs in User Story 2) (depends on T002, T003)
- [X] T005 [P] [US1] Implement `createTradeName(input: TradeNameInput): Promise<ActionResult<{ id: string }>>` in `app/actions/trade-names.ts` — `requireCurrentUser()`, `tradeNameInputSchema.parse(input)`, call `createTradeNameRecord`, `revalidatePath("/trade-names")`, matching the shape of `app/actions/suppliers.ts`'s `createSupplier` (depends on T004)
- [X] T006 [P] [US1] Create `components/trade-names/trade-name-form.tsx`: `react-hook-form` + `zodResolver(tradeNameInputSchema)` form with printed name, printed address, NTN number, Sales Tax Registration number fields (next-Challan/next-Invoice-number fields are added in User Story 3), field-level validation error display (depends on T003)
- [X] T007 [P] [US1] Create `components/trade-names/trade-name-list.tsx`: renders a list of `TradeNameListItem` showing printed name and status, matching `components/suppliers/supplier-list.tsx`'s shape (depends on T003)
- [X] T008 [US1] Create `app/(dashboard)/trade-names/page.tsx` and `loading.tsx`: Server Component calling `listTradeNames()` and rendering `TradeNameList` (depends on T004, T007)
- [X] T009 [US1] Create `app/(dashboard)/trade-names/new/page.tsx`: renders `TradeNameForm` wired to the `createTradeName` Server Action (depends on T005, T006)
- [X] T010 [US1] Create `app/(dashboard)/trade-names/[tradeNameId]/page.tsx` and `loading.tsx`: Server Component calling `getTradeName(id)` and rendering all fields (NTN/STRN shown only if present); returns a 404-style not-found state if `null` (depends on T004)
- [X] T011 [P] [US1] Add a "Trade Names" link to the dashboard nav in `app/(dashboard)/layout.tsx`, alongside the existing Suppliers/Products/Purchases links (depends on T008)

**Checkpoint**: User Story 1 is fully functional and independently testable — this is the MVP.

---

## Phase 4: User Story 2 - Upload signature and stamp images (Priority: P2)

**Goal**: Staff can upload a signature image and a company stamp image for a trade name, and replace either later.

**Independent Test**: Open an existing trade name with no signature, upload an image, confirm it displays on the detail view; replace the stamp image and confirm the new one takes effect; attempt to upload a non-image file and confirm a clear rejection with the existing image (if any) unchanged (spec Acceptance Scenarios 1–3 for User Story 2).

### Implementation for User Story 2

- [X] T012 [US2] Create `lib/trade-names/storage.ts`: `uploadTradeNameAsset(tradeNameId, kind: 'signature' | 'stamp', file: File): Promise<{ path: string }>` (validates `image/png`/`image/jpeg` content type and a 5 MB max size per FR-009, uploading to `trade-name-assets/{tradeNameId}/{kind}-{timestamp}.{ext}`), `deleteTradeNameAsset(path: string): Promise<void>` (best-effort — logs and swallows errors, per research.md), and `getSignedAssetUrl(path: string, expirySeconds?: number): Promise<string>` (default a few minutes) — all wrapping `getSupabaseAdmin().storage.from("trade-name-assets")` (depends on T002)
- [X] T013 [US2] Implement `replaceTradeNameAssetRecord(id: string, kind: 'signature' | 'stamp', file: File): Promise<{ path: string }>` in `lib/trade-names/service.ts`: reads the trade name's current `signature_image_path`/`stamp_image_path`, calls `uploadTradeNameAsset`, updates the corresponding column to the new path, then calls `deleteTradeNameAsset` on the old path if one existed (research.md's three-step ordering); also extend `getTradeName` to populate `signatureImageUrl`/`stampImageUrl` via `getSignedAssetUrl` whenever the corresponding path column is non-null (depends on T004, T012)
- [X] T014 [P] [US2] Implement `uploadTradeNameSignature(id: string, formData: FormData): Promise<ActionResult<{ path: string }>>` and `uploadTradeNameStamp(id: string, formData: FormData): Promise<ActionResult<{ path: string }>>` in `app/actions/trade-names.ts` — `requireCurrentUser()`, extract the `File` from `formData`, call `replaceTradeNameAssetRecord`, `revalidatePath(`/trade-names/${id}`)` (depends on T013)
- [X] T015 [P] [US2] Create `components/trade-names/trade-name-asset-upload.tsx`: client component with a file input, image preview of the current asset (if any), and a submit handler that builds `FormData` and calls the relevant upload Server Action, surfacing `ValidationError` messages (wrong type / too large) inline (depends on T003)
- [X] T016 [US2] Wire two `TradeNameAssetUpload` instances (signature, stamp) into `app/(dashboard)/trade-names/[tradeNameId]/page.tsx`, rendering the current signed-URL image when `signatureImageUrl`/`stampImageUrl` is present (depends on T010, T014, T015)

**Checkpoint**: User Stories 1 AND 2 both work independently.

---

## Phase 5: User Story 3 - Configure per-trade-name document number sequences (Priority: P2)

**Goal**: Staff can view and manually override a trade name's next Challan number and next Invoice number.

**Independent Test**: Open a newly created trade name and confirm both numbers default to `1`; override one to a specific value and confirm it persists; confirm changing one trade name's values never affects another's (spec Acceptance Scenarios 1–3 for User Story 3).

### Implementation for User Story 3

- [X] T017 [US3] Implement `updateTradeNameRecord(id, input: TradeNameInput): Promise<void>` in `lib/trade-names/service.ts` — plain `.update()` covering `printedName`, `printedAddress`, `ntnNumber`, `salesTaxRegistrationNumber`, `nextChallanNumber`, `nextInvoiceNumber`; never touches `status`, `signatureImagePath`, or `stampImagePath` (those are owned by `setTradeNameStatusRecord`/`replaceTradeNameAssetRecord`) (depends on T004)
- [X] T018 [P] [US3] Implement `updateTradeName(id: string, input: TradeNameInput): Promise<ActionResult>` in `app/actions/trade-names.ts` — same shape as `createTradeName`, calling `updateTradeNameRecord` and revalidating both `/trade-names` and `/trade-names/${id}` (depends on T017)
- [X] T019 [P] [US3] Extend `components/trade-names/trade-name-form.tsx` to also accept and edit `nextChallanNumber`/`nextInvoiceNumber` (positive-integer validation, pre-filled with current values in edit mode), and to accept a `defaultValues` prop so it can be reused for both create and edit (depends on T006)
- [X] T020 [US3] Create `app/(dashboard)/trade-names/[tradeNameId]/edit/page.tsx`: calls `getTradeName(id)`, renders `TradeNameForm` pre-filled with its current values, wired to the `updateTradeName` Server Action (depends on T010, T018, T019)
- [X] T021 [US3] Add a "Document Numbers" section to `app/(dashboard)/trade-names/[tradeNameId]/page.tsx` displaying `nextChallanNumber`/`nextInvoiceNumber` with a link to the edit page (depends on T010, T020)

**Checkpoint**: User Stories 1, 2, AND 3 all work independently. (T020's edit page also delivers the "edit any field" half of User Story 4's acceptance scenario 1 — see Dependencies below.)

---

## Phase 6: User Story 4 - Edit and deactivate trade name records (Priority: P3)

**Goal**: Staff can deactivate an active trade name and reactivate a previously deactivated one, without losing its record.

**Independent Test**: Deactivate an active trade name and confirm it's excluded from the default list but its record (including images and sequence settings) is preserved and viewable via the inactive filter; reactivate it and confirm it reappears in the default list (spec Acceptance Scenarios 1–3 for User Story 4 — Acceptance Scenario 1, "edit any field," is already covered by User Story 3's edit page).

### Implementation for User Story 4

- [X] T022 [US4] Implement `setTradeNameStatusRecord(id: string, status: 'active' | 'inactive'): Promise<void>` in `lib/trade-names/service.ts` — unconditional `.update({ status })`, a safe no-op when already in the target status, mirroring `setSupplierStatusRecord` (depends on T004)
- [X] T023 [P] [US4] Implement `setTradeNameStatus(id: string, status: 'active' | 'inactive'): Promise<ActionResult>` in `app/actions/trade-names.ts` — same shape as `app/actions/suppliers.ts`'s `setSupplierStatus` (depends on T022)
- [X] T024 [P] [US4] Create `components/trade-names/deactivate-reactivate-control.tsx`, matching `components/suppliers/deactivate-reactivate-control.tsx`'s shape, calling `setTradeNameStatus` (depends on T003)
- [X] T025 [US4] Wire `DeactivateReactivateControl` into `app/(dashboard)/trade-names/[tradeNameId]/page.tsx`, and add a status filter (active/inactive) to `app/(dashboard)/trade-names/page.tsx` and `components/trade-names/trade-name-list.tsx`, matching Suppliers' active/inactive toggle (depends on T008, T010, T024)

**Checkpoint**: All four user stories are independently functional.

---

## Phase 7: Polish & Cross-Cutting Concerns

**Purpose**: Improvements spanning all user stories.

- [X] T026 [P] Review that `signatureImagePath`, `stampImagePath`, and `status` are never accepted as writable fields in `tradeNameInputSchema` or in `createTradeName`/`updateTradeName` — only `uploadTradeNameSignature`/`uploadTradeNameStamp` may set the image paths, and only `setTradeNameStatus` may set `status` (contracts/server-actions.md's blanket rule)
- [ ] T027 Verify FR-010 manually: copy a rendered signature/stamp image's signed URL, wait past its expiry, and confirm it no longer resolves in a private/unauthenticated browser window (quickstart.md step 6)
- [ ] T028 Run the [quickstart.md](./quickstart.md) manual verification flow end-to-end across all four user stories

---

## Dependencies & Execution Order

### Phase Dependencies

- **Setup (Phase 1)**: No dependencies — start immediately.
- **Foundational (Phase 2)**: Depends on Setup completion — BLOCKS all user stories.
- **User Stories (Phase 3–6)**: All depend on Foundational completion.
  - US1 has no dependency on US2/US3/US4.
  - US2 depends on US1's `getTradeName`/detail page (T004, T010) to extend rather than duplicate.
  - US3 depends on US1's `service.ts`/form/detail page (T004, T006, T010) to extend rather than duplicate.
  - US4 depends on US1's detail/list pages (T008, T010) to extend, and its "edit any field" acceptance scenario is already satisfied by US3's edit page (T020) — US4 itself only adds the status toggle.
  - Despite these implementation-reuse dependencies, each story remains independently *testable* once its phase completes.
- **Polish (Phase 7)**: Depends on all four user stories being complete.

### Parallel Opportunities

- Foundational: T003 has no sibling to parallelize with in this feature (only one foundational file beyond the migration).
- US1: T005, T006, T007 can run in parallel (different files) once T004/T003 are done; T011 can run alongside them.
- US2: T014 and T015 can run in parallel (different files) once T013 is done.
- US3: T018 and T019 can run in parallel (different files) once T017/T006 are done.
- US4: T023 and T024 can run in parallel (different files) once T022/T003 are done.
- Polish: T026 can run in parallel with T027/T028.

---

## Parallel Example: User Story 1

```bash
# After Foundational phase completes, launch these together:
Task: "Implement createTradeName Server Action in app/actions/trade-names.ts"
Task: "Create TradeNameForm in components/trade-names/trade-name-form.tsx"
Task: "Create TradeNameList in components/trade-names/trade-name-list.tsx"
```

---

## Implementation Strategy

### MVP First (User Story 1 Only)

1. Complete Phase 1: Setup
2. Complete Phase 2: Foundational (CRITICAL — blocks all stories)
3. Complete Phase 3: User Story 1
4. **STOP and VALIDATE**: Run the User Story 1 portion of quickstart.md independently
5. Deploy/demo if ready — the business's five trade names become real, manageable records

### Incremental Delivery

1. Setup + Foundational → foundation ready
2. User Story 1 → validate independently → deploy/demo (MVP)
3. User Story 2 → validate independently → deploy/demo
4. User Story 3 → validate independently → deploy/demo
5. User Story 4 → validate independently → deploy/demo
6. Polish phase → deploy final hardening

---

## Notes

- [P] tasks touch different files with no unmet dependencies.
- Each user story phase ends at a checkpoint where that story is independently demoable.
- Commit after each task or logical group, matching the project's small-diff convention.
- No dedicated test-writing tasks were generated since spec.md did not request TDD; add them ad hoc using the Vitest stack from research.md if desired later.
- `lib/trade-names/storage.ts` (T012) is the first module in this codebase wrapping `supabase.storage` rather than `supabase.from(...)` — see ADR-0003 for the access pattern it must follow (private bucket, server-only, signed URLs for reads).

## Implementation Notes (post `/sp.implement`)

- **T002 / migration authored, not yet applied**: `supabase/migrations/0004_trade_names.sql` is written per data-model.md but has not been run against the live Supabase project. Same sequencing as 002/003b — the user reviews and applies migrations themselves in the Supabase SQL editor (this environment has no DB write access). T027 and T028 require it to be applied first, so they remain unchecked below.
- **Consolidated writes across task boundaries**: `schema.ts`, `service.ts`, and `trade-name-form.tsx` were each written once with their full final shape (including the User Story 3 sequence-number fields and the User Story 4 status function) rather than literally edited once per phase — splitting one small file into three sequential partial edits would have added churn with no behavioral difference. Each task above is checked off at the point its described behavior became true in the code, per 003b's precedent for this kind of consolidation.
- **TypeScript fix not anticipated in data-model.md**: `replaceTradeNameAssetRecord`'s lookup of the trade name's current image path (`.select(column)` where `column` is a union-typed `"signature_image_path" | "stamp_image_path"`) produces a discriminated union Supabase's inferred return type can't be indexed by that same union — required an explicit `Record<string, string | null>` cast. Pure implementation detail; no change to the function's documented behavior.
- **Signature/stamp images render via a plain `<img>`, not `next/image`**: the signed URL (ADR-0003) is short-lived and regenerated on every render, which defeats `next/image`'s optimizer/cache rather than benefiting from it. Suppressed with a one-line `eslint-disable-next-line @next/next/no-img-element` and a comment explaining why, in `trade-name-asset-upload.tsx`.
- **Verification performed**: `npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly; `next build` lists all four new routes (`/trade-names`, `/trade-names/new`, `/trade-names/[tradeNameId]`, `/trade-names/[tradeNameId]/edit`) compiling as dynamic routes alongside the existing suppliers/products/purchases routes.
- **T026 (writable-field audit)**: confirmed by inspection — `tradeNameInputSchema` (schema.ts) has no `status`, `signatureImagePath`, or `stampImagePath` fields; `createTradeName`/`updateTradeName` (app/actions/trade-names.ts) only ever accept `TradeNameInput`; only `uploadTradeNameSignature`/`uploadTradeNameStamp` call `replaceTradeNameAssetRecord`, and only `setTradeNameStatus` calls `setTradeNameStatusRecord`.
- **Unrelated pre-existing warning, not touched**: `next build` emits a deprecation notice that the `middleware.ts` file convention should migrate to `proxy` — pre-existing in this repo since before this feature, out of scope for a trade-names change, left as-is per the project's smallest-viable-diff convention.
