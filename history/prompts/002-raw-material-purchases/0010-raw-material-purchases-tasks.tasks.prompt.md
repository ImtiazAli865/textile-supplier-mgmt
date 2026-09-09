---
id: 0010
title: Raw material purchases tasks
stage: tasks
date: 2026-09-10
surface: agent
model: claude-sonnet-5
feature: 002-raw-material-purchases
branch: 002-raw-material-purchases
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: [tasks, raw-material-purchases, textile-supplier-management]
links:
  spec: specs/002-raw-material-purchases/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/002-raw-material-purchases/tasks.md
tests:
---

## Prompt

(no additional input — /sp.tasks run with no arguments against the existing plan.md/spec.md/research.md/data-model.md/contracts on branch 002-raw-material-purchases)

## Response snapshot

Ran `check-prerequisites.ps1` to confirm FEATURE_DIR and available design docs (research.md, data-model.md, contracts/, quickstart.md all present). Generated tasks.md with 29 tasks across 6 phases, following 001's exact structure: Phase 1 Setup (T001, minimal since no new dependencies — reuses 001's installed stack), Phase 2 Foundational (T002-T005: Zod schemas, base Firestore service module, a thin `listActiveSuppliersForSelect` wrapper reusing 001's `listSuppliers` rather than reimplementing it, and a nav-link addition to the existing dashboard layout), Phase 3 US1/P1 MVP (T006-T013: create+get, createPurchase action, PurchaseForm, list page, detail page, validation), Phase 4 US2/P2 (T014-T017: supplier+date-range filtering extended onto listPurchases, PurchaseFilters component, totals footer with empty state), Phase 5 US3/P3 (T018-T024: updatePurchaseRecord/deletePurchaseRecord both guarded by the remainingWeightKg!==weightKg lock check from research.md, corresponding Server Actions, edit page, delete control, and surfacing the derived lock state in the UI), Phase 6 Polish (T025-T029: composite Firestore index, loading/error states, SC-001/002/004 verification with ~1,000 seeded records, quickstart.md end-to-end run including a manual lock-check since Production Batches doesn't exist yet to trigger it for real, and a review that totalCost/remainingWeightKg are never client-writable). Documented phase/parallel dependencies, a parallel example, MVP-first and incremental-delivery strategy, and a closing note tying T018/T019's lock check directly to how the future 003-production-batches feature will plug in without any changes to this feature's code.

## Outcome

- ✅ Impact: Feature 002 has a complete, dependency-ordered, immediately-executable task breakdown ready for `/sp.implement`.
- 🧪 Tests: None (tasks stage — no code yet; no test tasks generated since spec.md didn't request TDD, matching 001's precedent)
- 📁 Files: specs/002-raw-material-purchases/tasks.md (new)
- 🔁 Next prompts: `/sp.analyze` (optional cross-artifact consistency check, as was done for 001) or `/sp.implement` to execute the tasks.
- 🧠 Reflection: Reused 001's task-generation conventions almost verbatim (file-path-first descriptions, `*Record` service naming, Setup/Foundational/Story/Polish phase boundaries) so the two features' tasks.md files stay easy to compare side by side as the codebase grows toward 008.

## Evaluation notes (flywheel)

- Failure modes observed: None.
- Graders run and results (PASS/FAIL): N/A (no formal grader at tasks stage; manual check that every task follows the `- [ ] [ID] [P?] [Story?] Description with file path` format — PASS).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Consider running `/sp.analyze` before `/sp.implement` for 002, the way 001 did, since 001's analyze pass caught real issues (I1, G1, G2, I2) worth checking for here too.
