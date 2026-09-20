---
id: 0005
title: Customer purchase orders task breakdown
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "purchase-orders"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/tasks.md
 - history/prompts/006-customer-purchase-orders/0005-customer-purchase-orders-tasks.tasks.prompt.md
tests:
 - none (task-planning turn; no code changed)
---

## Prompt

yes im ready for /sp.tasks

## Response snapshot

Ran `.specify/scripts/powershell/check-prerequisites.ps1 -Json`, which confirmed
`research.md`/`data-model.md`/`contracts/`/`quickstart.md` are all present for
`006-customer-purchase-orders`. Read 005's `tasks.md` to match this project's exact task-file
conventions (checklist format, path-conventions block, phase structure, dependency/parallel
sections, implementation-strategy framing).

Wrote `specs/006-customer-purchase-orders/tasks.md`: 33 tasks across 6 phases — Setup (T001,
migration scaffold), Foundational (T002 the full migration incl. the per-line-upsert
`update_customer_po` and the `set_customer_po_status` lock check; T003 schema/types; T004 the
`listActiveCustomersForSelect` addition 005 deferred here), User Story 1/P1/MVP (T005-T015:
item-code resolution, PO CRUD service functions, Server Actions, line-row/form/list components,
list/new/detail pages, nav link), User Story 2/P2 (T016-T020: attachment storage, upload Server
Action, attachment-list component, wiring into the create form and detail page — a genuinely
separate, independently-testable increment per the spec's own story split, even though it could
technically ship alongside US1), User Story 3/P3 (T021-T028: update/cancel/reactivate service
functions and Server Actions, the locked-line read-only rendering rule, status control, edit page,
status filter), and Polish (T029-T033: a writable-field audit plus four manual verifications of
this feature's structural correctness rules — per-customer PO-number uniqueness, PO-number field
capacity, and price/resolution authority). Each task cites its exact file path and, where
non-obvious, which plan.md/research.md/data-model.md decision it implements. Dependency graph and
parallel-execution notes mirror 005's format.

## Outcome

- ✅ Impact: `specs/006-customer-purchase-orders/tasks.md` is ready for `/sp.implement` (or
  `/sp.analyze` first, if the user wants a cross-artifact consistency pass before coding starts).
- 🧪 Tests: none — task-planning turn only.
- 📁 Files: tasks.md (new); this PHR.
- 🔁 Next prompts: user reviews tasks.md, then either `/sp.analyze` or `/sp.implement` when ready.
- 🧠 Reflection: keeping User Story 2 scoped to attachments only (rather than folding it into US1,
  which technically could have shipped attachments too) followed the spec's own story split
  rather than my own judgment about what's "simplest to build together" — worth continuing to
  defer to the spec's story boundaries over a task-generation-time urge to merge stories that seem
  small individually.

## Evaluation notes (flywheel)

- Failure modes observed: none this turn.
- Graders run and results (PASS/FAIL): n/a (no formal grader for task-planning turns).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
