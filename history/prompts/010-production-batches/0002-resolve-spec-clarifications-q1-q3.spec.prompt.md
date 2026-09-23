---
id: 0002
title: Resolve spec clarifications Q1-Q3
stage: spec
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: (answers to /sp.specify clarification questions)
labels: ["spec","clarification","opening-stock","wastage"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - specs/010-production-batches/spec.md
 - specs/010-production-batches/checklists/requirements.md
 - history/adr/0008-production-batch-lifecycle-and-stock-split.md
tests:
 - none (specification only)
---

## Prompt

Q1: A, Q2: A, Q3: A

## Response snapshot

Applied all three recommended answers: (Q1) returned packet weight > issued is a confirmable soft
warning, wastage stored as 0 with a flag (US2-6, FR-019); (Q2) one correcting opening-stock entry
with reason, only before any accepted Challan takes stock out and never below 0, originals
immutable (US3-4/5, FR-025); (Q3) optional cost per packet on opening stock (US3-6, FR-024). Added
a Clarifications section, a new Opening Stock Entry key entity, updated SC-004, synced ADR-0008
decisions 4–5, and marked the checklist 16/16.

## Outcome

- ✅ Impact: Spec complete, no clarification markers; ready for /sp.plan.
- 🧪 Tests: none
- 📁 Files: spec.md, checklists/requirements.md, ADR-0008
- 🔁 Next prompts: /sp.plan
- 🧠 Reflection: Kept ADR in sync so 012/013 see the opening-stock cost field.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): quality checklist 16/16 PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
