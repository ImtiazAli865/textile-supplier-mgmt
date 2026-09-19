---
id: 0017
title: Product catalog task breakdown
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003-product-catalog
branch: 003-product-catalog
user: ImtiazAli865
command: /sp.tasks
labels: ["tasks", "product-catalog"]
links:
  spec: specs/003-product-catalog/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-product-catalog/tasks.md
tests:
---

## Prompt

Run /sp.tasks for 003-product-catalog

## Response snapshot

Ran `.specify/scripts/powershell/check-prerequisites.ps1 -Json` (FEATURE_DIR resolved,
AVAILABLE_DOCS: research.md, data-model.md, contracts/, quickstart.md), then read
002-raw-material-purchases' `tasks.md` and the shared `tasks-template.md` to keep the format
and phase structure consistent.

Generated `specs/003-product-catalog/tasks.md` with 27 tasks across 6 phases:
- **Phase 1 (Setup)**: T001 — scaffold empty directories.
- **Phase 2 (Foundational, blocking)**: T002 (products table + type-conditional CHECK
  constraint + indexes + RLS in `0002_products.sql`), T003 (Zod schemas — `ProductInput` as a
  discriminated union on `type`, `ProductUpdateInput` excluding `type` entirely,
  `currentPurchaseCost` excluded from every input schema), T004 (base service module), T005
  (nav link).
- **Phase 3 (US1, P1, MVP)**: T006–T013 — create/view a product, type-conditional server-side
  validation, form with conditionally-rendered manufactured-only fields and a read-only "not
  yet established" purchase-cost display for traded products.
- **Phase 4 (US2, P2)**: T014–T017 — search (trigram-indexed substring on name/internal_code)
  and type/status filters, defaulting to active-only.
- **Phase 5 (US3, P3)**: T018–T023 — edit (type immutable, validated against the *existing*
  row's type server-side) and deactivate/reactivate via a single `setProductStatus`.
- **Phase 6 (Polish)**: T024–T027 — loading states, an explicit review task confirming `type`
  and `currentPurchaseCost` are never writable outside their intended paths, success-criteria
  verification (SC-001–SC-003), and the quickstart.md manual run-through.

Every task follows the required checklist format (`- [ ] T0NN [P?] [USn?] Description with
exact file path`), Setup/Foundational/Polish tasks carry no story label, and all 20 US-phase
tasks are correctly labeled. Dependencies & Execution Order, Parallel Opportunities, a Parallel
Example block, and an Implementation Strategy (MVP-first + incremental delivery) sections were
included, mirroring 002's structure. No test-writing tasks were generated, since spec.md never
requested TDD (same call as 001/002) — noted explicitly in the Tests line and the closing Notes.

## Outcome

- ✅ Impact: `003-product-catalog` has a complete, dependency-ordered, immediately-executable
  task list. Each user story phase ends at an independently-testable checkpoint; US1 alone is
  flagged as the MVP scope.
- 🧪 Tests: none generated (not requested); testing stack documented in research.md for later.
- 📁 Files: `specs/003-product-catalog/tasks.md` (new, 27 tasks).
- 🔁 Next prompts: `/sp.analyze` (optional cross-artifact consistency check) or `/sp.implement`
  to execute the task list, starting with Phase 1/2 (Setup + Foundational) and the MVP (US1).
- 🧠 Reflection: Kept the migration-writing task (T002) in Foundational rather than Setup or a
  later polish step, since every user story's service functions depend on the table existing —
  matches how 002 treated its schema as a blocking prerequisite, not an afterthought.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): checklist-format validation — PASS (all 27 tasks
  checked against the required `- [ ] T0NN [P?] [Story?] Description + file path` shape).
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
