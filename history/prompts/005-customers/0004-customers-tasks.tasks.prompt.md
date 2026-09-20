---
id: 0004
title: Customers tasks breakdown
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 005-customers
branch: 005-customers
user: imtiazkind143@gmail.com
command: /sp.tasks
labels: ["tasks", "customers", "ledger", "product-mappings"]
links:
  spec: specs/005-customers/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/005-customers/tasks.md
 - history/prompts/005-customers/0004-customers-tasks.tasks.prompt.md
tests:
 - none (task-breakdown turn; no code changed)
---

## Prompt

Confirmed, go ahead with /sp.tasks

## Response snapshot

Ran `check-prerequisites.ps1 -Json`, confirming FEATURE_DIR and all optional design docs
(research.md, data-model.md, contracts/, quickstart.md) exist and are current post-correction.
Read 004's tasks.md as the concrete style reference (no test tasks, `[ID] [P?] [Story]` format,
honest cross-story "depends on Txxx" notes). Generated `specs/005-customers/tasks.md` with 31
tasks across 6 phases: Setup (T001, empty migration file) → Foundational (T002 full migration
covering all six tables incl. the corrected `customer_product_mappings_has_value_check` and
`payment_terms_min_days`/`payment_terms_max_days`, plus both Postgres functions; T003 schema.ts) →
US1/P1 create-and-view-with-opening-balance (T004-T013, the MVP — includes extending
`lib/trade-names/service.ts` with `listActiveTradeNamesForSelect` since the create form's
trade-name-hint picker needs it immediately) → US2/P2 item-code/selling-unit/default-price mapping
(T014-T020, introduces `lib/customers/product-mappings.ts` and extends both the customer and
product detail pages) → US3/P3 edit-and-deactivate (T021-T026) → Polish (T027-T031, writable-field
audit, FR-016's DB-level uniqueness check, and two tasks — T029, T030 — specifically verifying the
two corrected assumptions and the has-value-check bug fix behave as intended, plus a full
quickstart run). Noted in the Dependencies section that US2 and US3 both extend US1's
`service.ts`/detail page rather than duplicating them, while remaining independently testable once
their phase completes — same honest-dependency framing 004's tasks.md used for its US3/US4
overlap. Added two Notes entries explaining why T002's constraint and payment-terms columns look
the way they do (pointing back to the corrections captured in
`0003-customers-payment-terms-and-pricing-corrections.misc.prompt.md`) so a future reader of
tasks.md alone isn't confused by the schema not matching a naive reading of the original spec
scope decisions.

## Outcome

- ✅ Impact: `specs/005-customers/tasks.md` ready for `/sp.implement`; MVP scope (User Story 1,
  T001-T013) clearly delineated, including the opening-balance ledger write.
- 🧪 Tests: none — task-breakdown turn only.
- 📁 Files: tasks.md (new); this PHR.
- 🔁 Next prompts: `/sp.implement` for 005-customers (not yet requested).
- 🧠 Reflection: folding the two correction-verification tasks (T029, T030) directly into the
  Polish phase, rather than leaving them implicit in quickstart.md alone, makes it much less
  likely the has-value-check bug (caught once already during `/sp.plan`) regresses silently during
  implementation — a targeted manual check earns its place in tasks.md when a design bug was
  actually caught and fixed earlier in the same feature's lifecycle.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a — no automated graders configured for task-breakdown
  turns.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
