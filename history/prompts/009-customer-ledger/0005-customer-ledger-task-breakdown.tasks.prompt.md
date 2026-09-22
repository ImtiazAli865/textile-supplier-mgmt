---
id: 0005
title: Customer Ledger task breakdown
stage: tasks
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "customer-ledger", "customer-payments", "fifo-ageing", "csv-export"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: history/adr/0007-csv-export-via-route-handler.md
  pr: null
files:
 - specs/009-customer-ledger/tasks.md
 - specs/009-customer-ledger/contracts/server-actions.md
tests:
 - none (task-breakdown turn; no code changed)
---

## Prompt

009-customer-ledger

(Issued via `/sp.tasks` immediately following the prior turn's "Then proceed to /sp.tasks"
instruction, after locking confirmation, FIFO ageing pseudocode, and ADR-0007 were resolved.)

## Response snapshot

Ran `check-prerequisites.ps1 -Json`, confirmed all four optional design docs present
(research.md, data-model.md, contracts/, quickstart.md). Before writing tasks, extended
`contracts/server-actions.md`'s `getCustomerLedger` output type with an optional
`paymentStatus?: 'received' | 'cleared' | 'bounced'` field on rows (present only where
`sourceType === 'payment'`) — needed so User Story 3's inline Mark Cleared/Bounced actions have
something to key off of; this was a real gap the contract hadn't specified yet, caught while
mapping tasks to it.

Generated `tasks.md` with 44 tasks across 8 phases, organized by the spec's 5 user stories exactly
as prioritized (US1 view ledger → US2 record payment → US3 bounce reversal → US4 ageing → US5
summary+export), mirroring 008's own task-breakdown depth and citation style. Key sequencing
decisions: both Postgres functions (`record_customer_payment`, `update_customer_payment_status`)
are built complete in Foundational (Phase 2) even though the bounce-transition UI only lands in
US3 — same "backend built once with full behavior, UI catches up story by story" precedent 008
used for `create_performa_invoice`'s multi-PO validation landing in Foundational ahead of US2's UI.
`getCustomerLedger` (T007, US1) is later *extended* in US3 (T019) to add `paymentStatus` resolution
from the same already-batched `customer_payments` join, rather than joining it in US1 where it
isn't needed yet — mirroring 008's own placeholder-then-real-data pattern for GST attachments.
US5 is sequenced last and depends on US4's `getCustomerAgeing` for its summary's overdue column,
matching the spec's own User Story 5 acceptance scenario (which explicitly covers exporting both
individual and summary views together, not per-customer export split out earlier).

Notes section explicitly flags three do-not-simplify risks for implementation: T004's `for update`
lock (concurrency guarantee), T022's FIFO ageing's bounce-dating consequence (already documented
in research.md, restated here so it isn't "fixed" mid-implementation), and T036/T037 not
introducing a spreadsheet library (ADR-0007 already evaluated and rejected that).

## Outcome

- ✅ Impact: `specs/009-customer-ledger/tasks.md` complete — 44 tasks, 8 phases, full dependency
  graph and parallel-execution notes. `contracts/server-actions.md` gained one missing field
  (`paymentStatus`) discovered while mapping US3's tasks to it. Feature is ready for
  `/sp.implement` (or `/sp.analyze` first for a cross-artifact consistency pass).
- 🧪 Tests: none (task-breakdown turn).
- 📁 Files: `specs/009-customer-ledger/tasks.md` (new), `specs/009-customer-ledger/contracts/server-actions.md`
  (one field added).
- 🔁 Next prompts: `/sp.analyze 009-customer-ledger` (optional consistency check) or
  `/sp.implement 009-customer-ledger`.
- 🧠 Reflection: Mapping tasks to contracts.md surfaced a real, small gap (no field for a payment's
  current status on a ledger row) that neither the spec nor the plan-stage artifacts had needed to
  surface yet — task generation is a useful last checkpoint for exactly this kind of
  "the UI needs a specific field that the read contract never named" gap, worth treating as a
  standard part of `/sp.tasks`, not just enumeration.

## Evaluation notes (flywheel)

- Failure modes observed: one contract gap caught and fixed inline (missing `paymentStatus`
  field) rather than left implicit for the implementer to improvise.
- Graders run and results (PASS/FAIL): n/a (no automated grader for task-breakdown turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
