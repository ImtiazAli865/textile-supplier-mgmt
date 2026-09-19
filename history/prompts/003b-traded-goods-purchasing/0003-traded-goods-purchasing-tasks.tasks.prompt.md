---
id: 0003
title: Traded-goods purchasing task breakdown
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003b-traded-goods-purchasing
branch: 003b-traded-goods-purchasing
user: ImtiazAli865
command: /sp.tasks
labels: ["tasks", "traded-goods-purchasing", "extends-002", "extends-003"]
links:
  spec: specs/003b-traded-goods-purchasing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003b-traded-goods-purchasing/tasks.md
tests:
---

## Prompt

now continue next

## Response snapshot

Ran `/sp.tasks` for `003b-traded-goods-purchasing`. Resolved FEATURE_DIR via
`check-prerequisites.ps1 -Json`, then read spec.md, plan.md, research.md, data-model.md,
contracts/server-actions.md, and quickstart.md, plus the currently shipped
`lib/purchases/{schema,service}.ts`, `app/actions/purchases.ts`, `components/purchases/*`,
`app/(dashboard)/purchases/**`, and `lib/products/{schema,service}.ts` /
`app/(dashboard)/products/[productId]/page.tsx` to ground every task in the actual code being
extended rather than the plan's abstractions alone.

Generated `specs/003b-traded-goods-purchasing/tasks.md`: 23 tasks (T001–T023) across 6 phases —
Setup (T001, migration file scaffold), Foundational (T002–T006: the full migration SQL including
the three Postgres functions, `Product.quantityOnHand`, the `purchaseInputSchema` discriminated
union, `listActiveTradedProductsForSelect`, `ProductNotPurchasableError`), User Story 1/P1 (T007–
T013, 7 tasks: unit-mode create path, mode-aware row mapping, `PurchaseForm` mode selector, the
new-purchase page wiring, unit-mode purchase-detail rendering, the product detail page's new
quantity-on-hand section, and per-unit field validation — this is the MVP), User Story 2/P2
(T014–T017, 4 tasks: mode-split `listPurchases`/totals, product filter, mode-aware list rendering
and totals panel, page wiring), User Story 3/P3 (T018–T020, 3 tasks: unit-mode update/delete with
the lock check, edit-page wiring), and Polish (T021–T023: writable-field audit, SC-006 regression
check against 002's existing weight-mode flow, full quickstart.md walkthrough).

Called out explicitly in task text (not left implicit) that the weight-mode code paths in
`lib/purchases/service.ts` are extended with an `if (mode === "unit")` branch each, never
rewritten, and that T012 needs no change to the existing `currentPurchaseCost` display — only a
new quantity-on-hand section — since 003's product detail page already renders that field
correctly once real data exists.

## Outcome

- ✅ Impact: `003b-traded-goods-purchasing` now has a complete, immediately executable task
  breakdown organized by user story; ready for `/sp.implement`.
- 🧪 Tests: none (task-generation stage; no code written yet).
- 📁 Files: `specs/003b-traded-goods-purchasing/tasks.md` (new, uncommitted).
- 🔁 Next prompts: `/sp.implement 003b-traded-goods-purchasing` to execute the task list; the ADR
  suggestion from plan.md (`/sp.adr atomic-multi-table-writes-via-postgres-functions`) is still
  awaiting user consent and can be run before or after implementation.
- 🧠 Reflection: Read the actual shipped 002/003 source files before writing tasks, not just the
  planning docs — this surfaced two tasks (T003 product schema's missing `quantityOnHand` field,
  T012 the product detail page's missing display for it) that data-model.md and
  contracts/server-actions.md described at the DB/contract level but didn't spell out as
  UI-facing work, since those docs are intentionally silent on the presentation layer.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): task format validation — PASS (every task has checkbox,
  ID, optional [P]/[Story] labels, and an explicit file path).
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
