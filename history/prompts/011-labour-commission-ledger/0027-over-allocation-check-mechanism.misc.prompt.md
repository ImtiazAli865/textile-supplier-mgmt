---
id: 0027
title: Over-allocation check mechanism
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["011","concurrency","integrity","adr-0010"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - history/prompts/011-labour-commission-ledger/0027-over-allocation-check-mechanism.misc.prompt.md
tests:
 - none
---

## Prompt

One clarification on the "weaker safety net" note: when you say "the functions check it 
again after saving" — does this check happen INSIDE the same transaction/function call, 
before it commits (so a violation triggers a full rollback via raise exception)? If so, this 
is just as safe as a DB-level CHECK, since the row locks already prevent any concurrent 
writer from sneaking in between the insert and the check. Please confirm this is the 
mechanism, not a separate post-commit check.

## Response snapshot

Confirmed: in-function, same transaction, before commit; raise rolls back everything. Equivalent to a CHECK for writes through that function. Difference: a CHECK also covers writers that bypass the function; proposed closing the gap with a constraint trigger on contractor_payment_allocations that locks the batch row FOR UPDATE and asserts the sum, so every writer is covered. Offered to record in ADR-0010 / plan.

## Outcome

- Impact: clarification only; no files changed besides this PHR
- Tests: none
- Files: this PHR
- Next prompts: decide on trigger backstop; /sp.plan
- Reflection: "weaker" referred to coverage of other writers, not transactional safety

## Evaluation notes (flywheel)

- Failure modes observed: earlier wording was ambiguous
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
