---
id: 0010
title: Customer purchase orders implementation
stage: green
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.implement
labels: ["implementation", "purchase-orders", "postgres-functions", "storage"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - supabase/migrations/0006_customer_purchase_orders.sql
 - lib/customer-pos/schema.ts
 - lib/customer-pos/service.ts
 - lib/customer-pos/item-code-resolution.ts
 - lib/customer-pos/storage.ts
 - lib/customers/service.ts
 - app/actions/customer-pos.ts
 - app/(dashboard)/customer-pos/page.tsx
 - app/(dashboard)/customer-pos/loading.tsx
 - app/(dashboard)/customer-pos/new/page.tsx
 - app/(dashboard)/customer-pos/[poId]/page.tsx
 - app/(dashboard)/customer-pos/[poId]/loading.tsx
 - app/(dashboard)/customer-pos/[poId]/edit/page.tsx
 - app/(dashboard)/layout.tsx
 - components/customer-pos/customer-po-form.tsx
 - components/customer-pos/customer-po-line-row.tsx
 - components/customer-pos/customer-po-list.tsx
 - components/customer-pos/customer-po-status-control.tsx
 - components/customer-pos/attachment-list.tsx
 - specs/006-customer-purchase-orders/tasks.md
 - history/prompts/006-customer-purchase-orders/0010-customer-purchase-orders-implementation.green.prompt.md
tests:
 - npx tsc --noEmit (pass)
 - npm run lint (pass)
 - npm run build (pass — all 4 new routes compile)
---

## Prompt

run /sp.implement

## Response snapshot

Ran `check-prerequisites.ps1 -RequireTasks -IncludeTasks`; the feature's one checklist
(`checklists/requirements.md`, 16/16 complete) passed. Read every design doc already produced
(spec.md, plan.md, research.md, data-model.md, contracts/server-actions.md, tasks.md) plus 005's
actual implementation (`0005_customers.sql`, `lib/customers/{schema,service,product-mappings}.ts`,
`app/actions/customers.ts`, `components/customers/*`, `lib/trade-names/storage.ts`,
`app/(dashboard)/customers/**`) to match this project's exact conventions before writing anything
new.

Implemented all 29 code tasks (T001–T029) across Setup, Foundational, and all three user-story
phases:
- `0006_customer_purchase_orders.sql`: `customer_pos`, `customer_po_lines` (generated `line_total`,
  forward-declared `delivered_quantity`/`invoiced_quantity`), `customer_po_attachments`, the
  `customer-po-documents` Storage bucket, and three functions — `create_customer_po` (ADR-0002
  shape), `update_customer_po` (a `for ... with ordinality` per-line upsert with a `LOCKED_LINE`
  exception, not delete-then-reinsert, per research.md), `set_customer_po_status` (unconditional
  reactivate, `LOCKED_PO`-checked cancel).
- `lib/customer-pos/{schema,service,item-code-resolution,storage}.ts`: full CRUD service layer,
  including `resolveDestinationText` (the blank-destination-defaults-to-billing-address fix from
  the `/sp.analyze` round), `toFriendlyPOError` (translates the DB unique-constraint violation and
  both `LOCKED_*` exceptions into the exact messages contracts/server-actions.md documents), and
  signed-URL attachment storage mirroring `lib/trade-names/storage.ts`.
- `app/actions/customer-pos.ts`: all 6 actions incl. `resolveCustomerItemCode` with its explicit
  `requireCurrentUser()` (the U1 fix).
- Full UI: list page with the composed customer+status `searchParams` filter (the C1 fix), create/
  edit forms sharing one `CustomerPOUpdateInput`-shaped `react-hook-form`, a line-row component
  with on-blur item-code auto-resolution and per-line lock rendering (inert today), a status
  control surfacing `LockedPOError`, and an attachment list/uploader.
- Extended `lib/customers/service.ts` with `listActiveCustomersForSelect` (the addition 005's own
  contracts deferred here) and `app/(dashboard)/layout.tsx` with the nav link.

Ran `npx tsc --noEmit`, `npm run lint`, and `npm run build` after formatting everything with
Prettier — all clean on the first real pass; `next build` lists all four new routes compiling as
dynamic routes. T029 (writable-field audit) verified by inspection, no DB needed. T030–T033 need
the migration applied to the live Supabase project first — this environment has no DB write access
for DDL, the same situation 001–005 were in — so those four remain unchecked, flagged for the user
to run after applying `0006_customer_purchase_orders.sql` via the Supabase SQL editor. Cleaned up
a stray `supabase/.temp/` directory left behind by an earlier `npx supabase --version` check
before finishing (not part of the feature).

## Outcome

- ✅ Impact: 006-customer-purchase-orders is fully implemented and passes `tsc`/`lint`/`build`.
  25 tasks (T001–T029) checked off in tasks.md; T030–T033 pending the user applying the migration.
- 🧪 Tests: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all pass. No live-DB
  verification possible in this environment.
- 📁 Files: 1 new migration, 4 new `lib/customer-pos/*` files, 1 new `app/actions/customer-pos.ts`,
  6 new `app/(dashboard)/customer-pos/**` route files, 5 new `components/customer-pos/*` files;
  `lib/customers/service.ts` and `app/(dashboard)/layout.tsx` extended; tasks.md updated with
  Implementation Notes.
- 🔁 Next prompts: user applies `supabase/migrations/0006_customer_purchase_orders.sql` in the
  Supabase SQL editor, then runs (or asks for help running) T030–T033's live verification —
  quickstart.md's full manual flow plus the duplicate-PO-number and PO-number-length DB checks.
- 🧠 Reflection: reviewing 005's *actual* implementation files (not just its spec/plan docs) before
  writing 006's was what surfaced the exact RHF/Zod/Server-Action idioms to reuse verbatim
  (`ActionResult`/`fail()`, the `toFriendlyXError` pattern, the searchParams-filter component
  shape) — this kept 006's code stylistically indistinguishable from 001–005 rather than
  introducing a parallel convention.

## Evaluation notes (flywheel)

- Failure modes observed: none in the implementation itself. One process note: `npx supabase
  --version` (run only to check CLI availability) left a `supabase/.temp/` cache directory in the
  repo — caught and removed before finishing, not committed.
- Graders run and results (PASS/FAIL): `tsc --noEmit` PASS, `eslint` PASS, `next build` PASS (all
  routes compile).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
