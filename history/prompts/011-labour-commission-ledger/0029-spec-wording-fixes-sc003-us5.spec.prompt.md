---
id: 0029
title: Spec wording fixes SC-003 US5
stage: spec
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["spec","011","wording"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/spec.md
tests:
 - none
---

## Prompt

Yes, please fix both:
1. Reword SC-003 to match FR-005's rule (balance = sum of all khata entries), not a formula 
   that treats opening balance as always-owed.
2. Reword User Story 5, Scenario 10's "Given" clause to "Given two staff act on the same 
   contractor at once".

## Response snapshot

SC-003 now states balance = sum of all khata entries (increases plus, decreases minus, either opening direction). US5 scenario 10 Given reworded as requested; When clause tightened to "one settles while the other records an entry for that contractor". Then clause unchanged.

## Outcome

- Impact: two wording fixes; no requirement changes
- Tests: none
- Files: spec.md
- Next prompts: /sp.plan
- Reflection: none

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
