---
id: 0004
title: Traded-goods purchasing implementation
stage: green
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003b-traded-goods-purchasing
branch: 003b-traded-goods-purchasing
user: ImtiazAli865
command: /sp.implement
labels: ["implement", "traded-goods-purchasing", "extends-002", "extends-003"]
links:
  spec: specs/003b-traded-goods-purchasing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - supabase/migrations/0003_traded_purchases.sql
 - lib/products/schema.ts
 - lib/products/service.ts
 - lib/purchases/schema.ts
 - lib/purchases/service.ts
 - components/purchases/purchase-form.tsx
 - components/purchases/purchase-list.tsx
 - components/purchases/purchase-filters.tsx
 - app/(dashboard)/purchases/page.tsx
 - app/(dashboard)/purchases/new/page.tsx
 - app/(dashboard)/purchases/[purchaseId]/page.tsx
 - app/(dashboard)/purchases/[purchaseId]/edit/page.tsx
 - app/(dashboard)/products/[productId]/page.tsx
 - specs/003b-traded-goods-purchasing/tasks.md
tests:
 - npx tsc --noEmit
 - npm run lint
 - npm run build
---

## Prompt

Run /sp.implement for 003b-traded-goods-purchasing

## Response snapshot

Ran `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`; the spec's own quality
checklist (`checklists/requirements.md`) was already 100% passed from the `/sp.specify` stage,
so proceeded straight to implementation with no gate stop. `.gitignore` already covers the
Node/Next.js toolchain from 001, so no ignore-file changes were needed.

Executed all 21 code-producing tasks (T001–T021) from tasks.md, reading the actual shipped
002/003 code first for each file touched:

- **T001–T002**: Created and wrote `supabase/migrations/0003_traded_purchases.sql` per
  data-model.md — nullable weight-mode columns, new `purchase_mode`/`product_id`/
  `quantity_units`/`rate_per_unit`/`remaining_units` columns, dropped-and-recreated
  mode-conditional `total_cost`, `purchases_mode_fields_check`, `products.quantity_on_hand`,
  the `idx_purchases_product_date` partial index, and the three Postgres functions. Factored
  the "full recompute" logic all three functions share into one internal
  `recompute_product_purchase_stats(p_product_id)` helper rather than tripling the aggregation
  query — a DRY implementation detail, not a change to the specified behavior or RPC surface.
- **T003–T006**: Added `Product.quantityOnHand` (schema + row mapper), converted
  `purchaseInputSchema` into a `mode`-discriminated union with mode-aware `Purchase`/
  `PurchaseListItem`/`PurchaseDetail`/new `PurchaseTotals` types, added
  `listActiveTradedProductsForSelect` (thin wrapper over `listProducts`), and added
  `ProductNotPurchasableError`.
- **T007–T008, T014, T018–T019** (all in `lib/purchases/service.ts`): added the unit-mode
  branch to `createPurchaseRecord` (active-supplier + active-traded-product validation, then
  `record_unit_purchase` RPC), made `toPurchase`/`getPurchase`/`listPurchases`'s mapping
  mode-aware (joining `products(name)`, mode-appropriate lock check), extended `listPurchases`
  with the `productId` filter and mode-split `PurchaseTotals`, and added the unit-mode branches
  of `updatePurchaseRecord`/`deletePurchaseRecord` (lock check, then `update_unit_purchase`/
  `delete_unit_purchase`). Every weight-mode branch is untouched — extended with an
  `if (mode === ...)` split, never rewritten.
- **T009, T013** (`PurchaseForm`): added a mode selector (disabled once a purchase exists) and
  conditional per-unit fields (product select, quantity, rate per unit) with their own total-cost
  preview. Deviated from a `zodResolver`-driven form: since the schema is now a discriminated
  union, the form holds one flat `PurchaseFormValues` superset for `register`/`useWatch`, builds
  the correct discriminated shape at submit time, and runs `purchaseInputSchema.safeParse`
  before calling the Server Action — same instant field-level errors as before, validated at
  submit instead of per-keystroke.
- **T010, T020**: wired `listActiveTradedProductsForSelect()` into the new/edit purchase pages;
  the edit page also appends the purchase's current product to the options list if it's since
  been deactivated, mirroring the existing supplier-options edge-case handling.
- **T011**: added unit-mode field rendering (product, quantity, rate per unit, remaining units)
  to the purchase detail page, shown instead of the weight-mode section by `purchase.mode`.
- **T012**: added a "Quantity on hand" section to the traded-product branch of the product
  detail page; the existing `currentPurchaseCost` display needed no code change.
- **T015–T017**: added a product filter dropdown to `PurchaseFilters`, made `PurchaseList`
  mode-aware (per-row mode badge, mode-appropriate line, mode-split totals panel omitting a
  mode's line when its total is `null`), and wired both into the purchases list page (title
  changed from "Raw Material Purchases" to "Purchases", reflecting the now-unified log).
- **T021**: audited by inspection — confirmed `totalCost`/`remainingWeightKg`/`remainingUnits`
  and `currentPurchaseCost`/`quantityOnHand` appear only in output types/interfaces, never in
  any input Zod schema.

Ran `npx tsc --noEmit`, `npm run lint`, and `npm run build` — all clean; `next build` shows the
existing purchase/product routes compiling with no new routes (this feature extends existing
ones only). Marked T001–T021 `[X]` in tasks.md and added an "Implementation Notes" section
documenting the two implementation-level deviations above plus why T022/T023 remain unchecked.

**T022/T023 deliberately left unchecked**: they require the migration to actually be applied to
the live Supabase project first (exactly the same sequencing 003 followed — migration authored
during `/sp.implement`, applied and live-verified in a separate explicit follow-up step). No
migration has been applied and no live/database verification has been performed in this pass.

## Outcome

- ✅ Impact: `003b-traded-goods-purchasing` is fully code-complete — 21 of 23 tasks done; the
  remaining two require the migration to be applied live first.
- 🧪 Tests: `npx tsc --noEmit` (pass), `npm run lint` (pass), `npm run build` (pass, all routes
  compile). No live/database verification performed yet.
- 📁 Files: `supabase/migrations/0003_traded_purchases.sql` (new); `lib/products/{schema,
  service}.ts`, `lib/purchases/{schema,service}.ts`, `components/purchases/{purchase-form,
  purchase-list,purchase-filters}.tsx`, `app/(dashboard)/purchases/{page,new/page,
  [purchaseId]/page,[purchaseId]/edit/page}.tsx`, `app/(dashboard)/products/[productId]/page.tsx`
  (all extended); `specs/003b-traded-goods-purchasing/tasks.md` (checkboxes + Implementation
  Notes).
- 🔁 Next prompts: apply `0003_traded_purchases.sql` to the live Supabase project (same
  browser-automated SQL-editor path used for 0002), then complete T022 (SC-006 regression against
  002's existing flow) and T023 (full quickstart.md walkthrough) against the live database. The
  ADR suggestion from plan.md (`/sp.adr atomic-multi-table-writes-via-postgres-functions`) is
  still awaiting consent.
- 🧠 Reflection: Reading the actual shipped `PurchaseForm`/`service.ts` before touching them
  (rather than working from contracts/server-actions.md alone) is what surfaced the
  `zodResolver` incompatibility with a discriminated-union schema early enough to design around
  it cleanly, instead of discovering it mid-edit.

## Evaluation notes (flywheel)

- Failure modes observed: none — tsc/lint/build all passed on the first attempt after
  implementation.
- Graders run and results (PASS/FAIL): `tsc --noEmit` — PASS; `npm run lint` — PASS;
  `npm run build` — PASS (11 routes, no new ones, as expected for an extension-only feature).
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
