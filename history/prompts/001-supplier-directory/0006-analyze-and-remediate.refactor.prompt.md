---
id: 0006
title: Analyze spec plan tasks and remediate
stage: refactor
date: 2026-09-06
surface: agent
model: claude-sonnet-5
feature: 001-supplier-directory
branch: 001-supplier-directory
user: imtiazkind143@gmail.com
command: /sp.analyze
labels: [analyze, remediation, supplier-directory]
links:
  spec: specs/001-supplier-directory/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-supplier-directory/plan.md
 - specs/001-supplier-directory/research.md
 - specs/001-supplier-directory/contracts/server-actions.md
 - specs/001-supplier-directory/tasks.md
tests:
---

## Prompt

apply concrete remediation edits for I1, G1, G2, and I2 now, then commit and run /sp.implement

## Response snapshot

Ran `/sp.analyze` (read-only) first, producing a report with 6 findings across spec.md/plan.md/tasks.md: I1 (HIGH — `middleware.ts` placed inside `app/` instead of repo root, which Next.js silently ignores, breaking the FR-014 auth gate), G1 (MEDIUM — spec's duplicate-supplier-name flagging Edge Case had no task), G2 (MEDIUM — SC-001/SC-002/SC-004 quantitative success criteria had no verification task), I2 (MEDIUM — plan.md's Source Code tree declared a `tests/` directory that tasks.md never builds), G3 (LOW — FR-008 no-delete constraint unverified) and U1 (LOW — FR-015 timestamp display not explicit). 0 CRITICAL, 0 duplications, 0 ambiguities, 85% requirement coverage.

Per this follow-up instruction, applied remediation for I1, G1, G2, and I2 only (G3/U1 left as documented backlog, per the user's explicit list):
- **I1**: Moved `middleware.ts` to repository root in plan.md's tree and tasks.md T009, with an explicit comment on why.
- **G1**: Added research.md decision (exact-match on `companyNameLower`, non-blocking warning), a new `checkDuplicateSupplierName` contract in contracts/server-actions.md, and two new tasks in US1 (T016, T019).
- **G2**: Added a new Polish-phase task (T037) to seed ~500 suppliers and verify SC-001/SC-002/SC-004 timings.
- **I2**: Replaced plan.md's dangling `tests/` tree with a "Testing note" explaining it's deferred until tests are actually added, pointing at research.md's chosen stack.

tasks.md was fully renumbered (37 → 40 tasks, T001-T040) to keep the new tasks in their logical phase position rather than appended at the end; all cross-task dependency references and the Dependencies/Parallel-Opportunities sections were updated to match.

## Outcome

- ✅ Impact: The plan/tasks are now internally consistent and the one real implementation-breaking defect (I1) is fixed before any code is written.
- 🧪 Tests: None (documentation/planning stage)
- 📁 Files: plan.md, research.md, contracts/server-actions.md, tasks.md (all edited)
- 🔁 Next prompts: `/sp.implement` to execute tasks.md.
- 🧠 Reflection: Chose a full renumber over appending new tasks at the end so each user story's tasks stay contiguous and readable — worth the extra care in updating cross-references since tasks.md is what /sp.implement will execute against directly.

## Evaluation notes (flywheel)

- Failure modes observed: The original plan.md placed Next.js middleware inside `app/`, which is a real, silent-failure-prone Next.js App Router mistake (middleware outside the root is simply never invoked, no error thrown) — worth remembering as a recurring check for any future Next.js plan.
- Graders run and results (PASS/FAIL): /sp.analyze coverage check — improved from 85% with 1 HIGH + 3 MEDIUM + 2 LOW findings to 1 HIGH-fixed + 2 MEDIUM-fixed + 2 LOW-remaining (documented, not blocking).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Consider fixing G3/U1 during /sp.implement itself (they're one-line task-description tweaks) rather than leaving them purely as backlog notes.
