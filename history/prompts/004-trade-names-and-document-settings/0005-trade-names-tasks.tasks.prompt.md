---
id: 0005
title: Trade names tasks breakdown
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 004-trade-names-and-document-settings
branch: 004-trade-names-and-document-settings
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "trade-names"]
links:
  spec: specs/004-trade-names-and-document-settings/spec.md
  ticket: null
  adr: history/adr/0003-storage-access-via-server-only-signed-urls.md
  pr: null
files:
 - specs/004-trade-names-and-document-settings/tasks.md
 - history/prompts/004-trade-names-and-document-settings/0005-trade-names-tasks.tasks.prompt.md
tests:
 - none (task-breakdown turn; no code changed)
---

## Prompt

Create the ADR now, then run /sp.tasks for 004

(This PHR covers the `/sp.tasks` half of the request; the ADR half was recorded separately in
`0004-storage-adr.misc.prompt.md`.)

## Response snapshot

Ran `.specify/scripts/powershell/check-prerequisites.ps1 -Json`, confirming all four optional
design docs (research.md, data-model.md, contracts/, quickstart.md) exist for 004. Read 003b's
tasks.md as the concrete style reference (no test tasks, `[ID] [P?] [Story]` format, honest
"depends on Txxx" notes even across [P] siblings). Generated `specs/004-trade-names-and-document-settings/tasks.md`
with 28 tasks across 7 phases: Setup (T001, empty migration file) → Foundational (T002 full
migration incl. the `trade-name-assets` bucket, T003 schema.ts) → US1/P1 create-and-view (T004-T011,
the MVP) → US2/P2 signature/stamp upload (T012-T016, introduces `lib/trade-names/storage.ts`, the
first module wrapping `supabase.storage`) → US3/P2 document-number-sequence overrides (T017-T021)
→ US4/P3 deactivate/reactivate (T022-T025) → Polish (T026-T028, writable-field audit + FR-010
signed-URL-expiry check + full quickstart run). Called out one honest cross-story dependency
in the Dependencies section: US4's spec acceptance scenario 1 ("edit any field") is already
satisfied by US3's edit page (T020), since both the sequence-number override and general field
edit go through the same `updateTradeName` action/form — US4's own phase only adds the new
status-toggle behavior, mirroring how 003b's tasks.md was upfront about US2/US3 building on US1
rather than claiming false hermetic independence.

## Outcome

- ✅ Impact: `specs/004-trade-names-and-document-settings/tasks.md` ready for `/sp.implement`;
  MVP scope (User Story 1, T001-T011) clearly delineated.
- 🧪 Tests: none — task-breakdown turn only.
- 📁 Files: tasks.md (new); this PHR.
- 🔁 Next prompts: `/sp.analyze` (optional cross-artifact consistency check) or straight to
  `/sp.implement` for 004.
- 🧠 Reflection: naming the US3/US4 overlap explicitly in the Dependencies section (rather than
  quietly duplicating the edit form in a separate "US4 edit" component to preserve the appearance
  of independence) kept the task count honest and avoided a redundant component that would have
  had to be reconciled later.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a — no automated graders configured for task-breakdown
  turns.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
