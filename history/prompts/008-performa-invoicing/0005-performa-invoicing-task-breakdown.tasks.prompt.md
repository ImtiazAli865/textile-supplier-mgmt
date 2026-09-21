---
id: 0005
title: Performa Invoicing task breakdown
stage: tasks
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "performa-invoicing", "customer-purchase-orders", "challans", "ledger", "postgres-functions"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/008-performa-invoicing/tasks.md
 - history/prompts/008-performa-invoicing/0005-performa-invoicing-task-breakdown.tasks.prompt.md
tests:
 - none (task-breakdown turn; no code changed)
---

## Prompt

`/sp.tasks 008-performa-invoicing`

## Response snapshot

Ran `.specify/scripts/powershell/check-prerequisites.ps1 -Json`, confirming all four optional
design docs (`research.md`, `data-model.md`, `contracts/`, `quickstart.md`) exist alongside the
required `plan.md`/`spec.md`. Read `.specify/templates/tasks-template.md` and
`specs/007-challans/tasks.md` (the most recent, most structurally similar precedent) for format
and granularity calibration before writing.

Generated `tasks.md` with 32 tasks across 6 phases:
- **Phase 1 (Setup)**: T001, scaffold the empty migration file.
- **Phase 2 (Foundational)**: T002-T005 — the three new tables (`performa_invoices` with no
  `updated_at`/update trigger at all, `performa_invoice_lines`, `performa_invoice_attachments`),
  the new `customer_po_lines_invoiced_le_delivered` `CHECK` constraint added via `ALTER TABLE`
  against 006's table, the single `create_performa_invoice` function built with its full, final,
  already-hardened behavior (sorted-by-`po_line_id` locking loop, `for update of cpl`, multi-PO
  validation, invoiced-figure increment, ledger posting — the design finalized across the two prior
  review rounds), and the shared `lib/performa-invoices/schema.ts` types.
- **Phase 3 (US1, P1, MVP)**: T006-T020 — the customer-eligibility picker export on 005's service,
  `getInvoiceableLinesForPO`, the create/list/get service functions with full error translation,
  the local `amountInWords` utility, the print-view fetch, the Server Action, every component
  (form, line row, list, print view), and every route (list/new/detail/print) — the create form
  deliberately scoped to a single selected PO in this phase.
- **Phase 4 (US2, P2)**: T021 — a single, focused task extending the create form to add lines from
  more than one of the customer's POs onto one draft. Kept intentionally small because
  `create_performa_invoice` (T004) and every read-side function/component (T008, T012, T015)
  already handle an arbitrary number of POs generically from Foundational/US1 — the same
  "backend built once, UI catches up per story" pattern 007 used for `accept_challan`'s ledger step
  relative to its own User Story 3.
- **Phase 5 (US3, P3)**: T022-T026 — the append-only attachment storage module, wiring it into
  `getPerformaInvoice`, the upload Server Action, the upload/list component, and wiring it into the
  detail page.
- **Phase 6 (Polish)**: T027-T032 — a structural review confirming no update/void/delete path
  exists anywhere (FR-009/FR-010), manual verification of the FR-015 concurrency guarantee, the
  eligibility gate, the cross-customer rejection (defense-in-depth against direct Server Action
  misuse, since the UI structurally prevents it), amount-in-words correctness including a
  Lakh-range figure, and the full quickstart.md run.

Wrote Dependencies & Execution Order, Parallel Opportunities, a Parallel Example block, and an
Implementation Strategy section (MVP-first, incremental delivery) mirroring 007's tasks.md
structure. The Notes section explicitly flags T004 as the highest-risk task and calls out, by name,
the exact hardening from the two prior review rounds (the `for update` lock, the `po_line_id` sort
order, the `CHECK` constraint) with an instruction not to "simplify" any of them away during
implementation — carrying the correctness work from the plan-review conversation forward into the
task list itself, not just into `data-model.md`/`research.md` prose that an implementation pass
might not re-read closely enough.

## Outcome

- ✅ Impact: `008-performa-invoicing` now has a complete, dependency-ordered, independently-testable
  task breakdown ready for `/sp.implement`, with the two concurrency-hardening decisions from plan
  review explicitly preserved as implementation guardrails rather than left to be rediscovered.
- 🧪 Tests: none (task-breakdown turn).
- 📁 Files: `specs/008-performa-invoicing/tasks.md`, this PHR.
- 🔁 Next prompts: `/sp.implement 008-performa-invoicing`.
- 🧠 Reflection: Explicitly naming the two hardening decisions (locking, sort order) in the tasks.md
  Notes section — not just in research.md/data-model.md — is worth doing whenever a plan-review
  conversation fixes a subtle correctness gap; a task list is what an implementation pass actually
  reads task-by-task, and prose buried in an earlier planning doc is easy to lose track of by the
  time T004 is actually being written.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (no automated grader for task-breakdown turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
