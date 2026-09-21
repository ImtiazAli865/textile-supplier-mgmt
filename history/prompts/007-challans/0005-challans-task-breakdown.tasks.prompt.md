---
id: 0005
title: Challans task breakdown
stage: tasks
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "challans", "inventory", "postgres-functions"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/007-challans/tasks.md
 - history/prompts/007-challans/0005-challans-task-breakdown.tasks.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

(Continuation of the prior message: "Yes, please run /sp.adr for both... Once both are done,
proceed with /sp.tasks.")

## Response snapshot

Ran `check-prerequisites.ps1 -Json` (confirmed all Phase 0/1 docs present), read the tasks
template and 006's actual `tasks.md` as the granularity/format precedent for this project (rich,
fully-specified task descriptions naming exact functions/fields/files, not template placeholders).

Generated 38 tasks across 6 phases. Setup (T001: empty migration file). Foundational (T002–T005):
split the single large migration into three sequential DDL tasks for readability — inventory
ledger + backfill + redefined 003b functions (T002), `challans`/`challan_lines` DDL + bucket
(T003), all four new Postgres functions including `accept_challan`'s full behavior (T004) — then
`lib/challans/schema.ts` (T005). Followed 006's own established precedent of bundling *every*
Postgres function for a feature into Foundational in one migration, even ones a later user story
alone exercises (006 did this with `set_customer_po_status`, used only by its US3) — so `accept_
challan` is built complete, ledger-posting step included, in T004, not incrementally split across
US2/US3.

User Story 1 (Issue + print, T006–T021): service functions (`getOpenPOLinesForChallan` reusing
006's already-exported `getCustomerPO` rather than adding a new 006 export; `createChallanRecord`/
`updateChallanRecord`/`voidChallanRecord`/`listChallans`/`getChallan`/`getChallanForPrint`),
actions, all core components including the print view, both route trees (dashboard list/new/
detail, and the standalone `app/challans/[challanId]/print/page.tsx` per ADR-0006), and the two
small touches to existing files (006's PO detail page, the dashboard nav).

User Story 2 (Accept + shortfall, T022–T030): `acceptChallanRecord`, the signed-copy Storage
module (mirroring `lib/trade-names/storage.ts` per ADR-0003), extending the line-row/form
components with accepted-quantity/disposition inputs, and the accept action on
`challan-status-controls.tsx`.

User Story 3 (Ledger routing, T031–T032): since `accept_challan`'s ledger-posting behavior is
already complete from T004 (matching the Foundational-bundling precedent above), US3 has no new
backend logic to add — its two tasks extend `getChallan` to expose whether/how much was posted and
display that on the Challan detail page, giving US3 genuine, independently-testable value (staff
can *see* the correct outcome) without inventing unrequested scope. Documented this design choice
explicitly in the Notes section so a future reader doesn't mistake the thin US3 phase for an
oversight.

Polish (T033–T038): a writable-field audit task plus four targeted manual-verification tasks
mapped directly to this feature's highest-risk behaviors — FR-002's remaining-quantity edge case,
FR-011/SC-007's `quantity_on_hand` reconciliation (the collision the user caught in spec review),
FR-007/FR-010's shortfall disposition paths, and FR-012's per-customer ledger routing — plus the
full quickstart.md run. Notes section calls out T002 as the highest-risk task (redefining
already-shipped 003b functions) and explicitly warns against "simplifying" T017's standalone print
route during implementation, since that would undo ADR-0006's decision.

## Outcome

- ✅ Impact: `specs/007-challans/tasks.md` (38 tasks, all in strict checklist format, validated by
  grep for both count and label correctness) is ready for `/sp.implement` whenever the user
  chooses to proceed.
- 🧪 Tests: none — planning turn only.
- 📁 Files: tasks.md (new); this PHR.
- 🔁 Next prompts: user reviews tasks.md (in particular the Foundational-bundling rationale for
  `accept_challan` and the resulting thin US3 phase), then either adjusts it or runs
  `/sp.implement`.
- 🧠 Reflection: matching 006's actual `tasks.md` (not just the generic template) as the
  granularity precedent was the right call — this project's tasks consistently name exact
  function signatures, exact field names, and cite research.md/data-model.md/ADR decisions inline,
  which the generic template's placeholder style doesn't convey. A fresh read of 006's tasks.md
  before writing this feature's own was worth the context cost.

## Evaluation notes (flywheel)

- Failure modes observed: none this round.
- Graders run and results (PASS/FAIL): format validation (every task has checkbox + ID + correct
  [P]/[Story] usage + file path) — PASS via grep check (38/38 tasks, Polish-phase tasks correctly
  carry no story label).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
