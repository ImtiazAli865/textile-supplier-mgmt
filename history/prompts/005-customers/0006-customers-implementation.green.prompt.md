---
id: 0006
title: Customers feature implementation
stage: green
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 005-customers
branch: 005-customers
user: imtiazkind143@gmail.com
command: /sp.implement
labels: ["implement", "customers", "ledger", "product-mappings", "postgres-functions"]
links:
  spec: specs/005-customers/spec.md
  ticket: null
  adr: history/adr/0004-shared-tables-created-at-first-writer.md
  pr: null
files:
 - supabase/migrations/0005_customers.sql
 - lib/customers/schema.ts
 - lib/customers/ledger.ts
 - lib/customers/service.ts
 - lib/customers/product-mappings.ts
 - app/actions/customers.ts
 - components/customers/customer-form.tsx
 - components/customers/customer-list.tsx
 - components/customers/customer-status-filter.tsx
 - components/customers/deactivate-reactivate-control.tsx
 - components/customers/product-mapping-form.tsx
 - components/customers/customer-product-mappings-section.tsx
 - app/(dashboard)/customers/page.tsx
 - app/(dashboard)/customers/loading.tsx
 - app/(dashboard)/customers/new/page.tsx
 - app/(dashboard)/customers/[customerId]/page.tsx
 - app/(dashboard)/customers/[customerId]/loading.tsx
 - app/(dashboard)/customers/[customerId]/edit/page.tsx
 - app/(dashboard)/layout.tsx
 - app/(dashboard)/products/[productId]/page.tsx
 - lib/products/service.ts
 - lib/trade-names/service.ts
 - specs/005-customers/tasks.md
tests:
 - npx tsc --noEmit (pass)
 - npm run lint (pass)
 - npm run build (pass — all 4 new /customers routes compile as dynamic routes)
---

## Prompt

Run /sp.implement for 005-customers

## Response snapshot

Ran `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`; confirmed `checklists/requirements.md`
had 0 incomplete items (16/16) so proceeded without the yes/no gate. Read tasks.md, plan.md,
data-model.md, contracts/server-actions.md, research.md, quickstart.md, then read the closest
existing precedents in the codebase before writing anything: `lib/suppliers/{schema,service}.ts`
and `0001_init.sql` for the multi-table-RPC pattern (contacts jsonb + `with ordinality`,
delete-then-reinsert on update), `lib/trade-names/{schema,service}.ts` and `0004_trade_names.sql`
for the plain-CRUD/no-RPC pattern, `lib/products/{schema,service}.ts` and its `[productId]/page.tsx`
for the page/detail conventions, and `lib/actions/result.ts`/`lib/auth/session.ts` for the
Server Action error/auth wrapper shape.

Implemented in dependency order (not literal task order, noted in tasks.md's new Implementation
Notes section): `supabase/migrations/0005_customers.sql` (six tables, the corrected
`customer_product_mappings_has_value_check` including `default_price`, `payment_terms_min_days`/
`payment_terms_max_days` with a range check, `create_customer`/`update_customer` mirroring
`create_supplier`/`update_supplier`) → `lib/customers/schema.ts` (Zod schemas incl. the
payment-terms-range `superRefine` and the mapping's has-value `refine`) → `lib/customers/ledger.ts`
(live-summed balance, no RPC) → `lib/customers/product-mappings.ts` (plain CRUD, friendly
Postgres-error-code translation for the unique-index/check-constraint violations) →
`lib/customers/service.ts` (create/list/get/update/status, `getCustomer` wired directly to real
product mappings rather than a literal placeholder) → the two one-function extensions
(`listActiveTradeNamesForSelect`, `listActiveProductsForSelect`) → `app/actions/customers.ts` →
all `components/customers/*` (the large `customer-form.tsx` keeps opening-balance fields as plain
local state outside RHF/zod, avoiding a nested-optional-validation gotcha; `product-mapping-form.tsx`
+ `customer-product-mappings-section.tsx` handle add/edit/remove) → the full
`app/(dashboard)/customers/**` route tree → the nav link → extending
`app/(dashboard)/products/[productId]/page.tsx` to show its own customer mappings read-only.

Hit and fixed one real TypeScript issue: a generic `withPaymentTermsRangeCheck<T>` helper wrapping
`.superRefine()` degraded RHF's nested `FieldErrors` typing (`errors.billingAddress` came back as
a flat `FieldError` instead of `FieldErrors<Address>`) — replaced with two direct
`.superRefine(checkPaymentTermsRange)` calls (no generic layer), which restored correct nested
error typing. Verified clean with `npx tsc --noEmit`, `npm run lint`, and `npm run build` (all four
new routes compile). Performed the two Polish-phase checks that don't require a live database by
direct code inspection rather than a live click-through: T027 (grepped for `status`/`openingBalance`
across schema.ts and the migration — confirmed `CustomerUpdateInput` has neither, `update_customer`
never touches `status`, and no code path anywhere updates/deletes `ledger_entries`) and T030
(grepped `paymentTerms`/`payment_terms` repo-wide — confirmed it's only ever captured, range-validated,
and displayed, never used to block/flag anything). Marked T001-T027 and T030 `[X]` in tasks.md;
left T028, T029, and T031 unchecked since they need `0005_customers.sql` applied to a live
Supabase project first (this environment has no DB write access, same as every prior migration
in this project) — documented in a new "Implementation Notes (post `/sp.implement`)" section.

## Outcome

- ✅ Impact: 005-customers is fully implemented — Habbitt/Chaseup/ChaseValue/Kifayat can now be
  created as real records with opening balances, customer-specific item codes/selling
  units/default prices, and edit/deactivate — pending the user applying the migration themselves.
- 🧪 Tests: `npx tsc --noEmit`, `npm run lint`, `npm run build` all pass; no automated
  unit/integration tests were requested in spec.md (same call as 001-004).
- 📁 Files: 1 new migration; 4 new `lib/customers/*` files; 1 new Server Actions file; 6 new
  `components/customers/*` files; 6 new `app/(dashboard)/customers/**` route files; 4 small
  extensions to existing files (`layout.tsx` nav link, product detail page, two service-file
  one-function additions); `tasks.md` updated with checkmarks and an Implementation Notes section.
- 🔁 Next prompts: apply `supabase/migrations/0005_customers.sql` in the Supabase SQL editor, then
  complete T028/T029/T031 (the DB-dependent manual checks) and the quickstart.md walkthrough;
  after that, 006-customer-purchase-orders is next per the module roadmap.
- 🧠 Reflection: reading each closest-precedent file (suppliers' RPC pattern, trade-names' plain
  CRUD, products' page conventions) before writing anything, rather than working from the spec
  documents alone, is what kept this feature's code idiomatically consistent with 001-004 without
  needing a separate cleanup pass; the one real bug (the generic zod-refine helper breaking RHF's
  nested error typing) was caught immediately by `tsc --noEmit` rather than surviving into a build
  or runtime failure.

## Evaluation notes (flywheel)

- Failure modes observed: one self-caught, self-fixed TypeScript typing issue (generic
  `superRefine` wrapper degrading nested `FieldErrors` inference) — fixed before it reached lint
  or build, per the Outcome section.
- Graders run and results (PASS/FAIL): `tsc --noEmit` PASS, `eslint` PASS, `next build` PASS
  (all 4 new routes listed as compiled dynamic routes).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a Zod schema needs a shared cross-field refine
  applied to two sibling object schemas, prefer two direct `.superRefine(sharedFn)` calls over a
  generic wrapper function — the wrapper's generic type parameter can silently widen
  react-hook-form's inferred nested error shape even when `tsc` on the schema file alone looks fine.
