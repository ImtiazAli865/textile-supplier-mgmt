---
id: 0028
title: Allocation trigger active-payment filter
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["011","adr-0010","trigger","integrity"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
tests:
 - none
---

## Prompt

Agreed — please make this change (trigger on contractor_payment_allocations, replacing the 
"Backstop" bullet in ADR-0010 §4).

One clarification on the trigger's sum logic: when it computes "the active amounts already 
linked to that batch," does it join to contractor_payments and filter to status = 'active' 
(excluding reversed payments' allocations from the sum)? This matters — if a reversed 
payment's old allocation rows still count toward the total, a batch could get permanently 
stuck showing as "fully allocated" even after its payment was reversed, blocking any new 
payment from being linked to it. Please confirm this filter is in place.

Once confirmed, please proceed with paste the full spec.md content here in the chat before 
we move to /sp.plan.

## Response snapshot

Replaced ADR-0010 §4 Backstop with a BEFORE INSERT OR UPDATE trigger on contractor_payment_allocations: locks the batch FOR UPDATE, sums allocations joined to contractor_payments filtered to status='active' (excluding the row being updated), adds the new amount, raises if > labour_cost (full rollback); also refuses non-completed / other-contractor batches. Reversal is one-way so no check needed on payments. Updated Negative consequence (trigger logic needs tests). Confirmed the active filter; pasted full spec.md in chat.

## Outcome

- Impact: ADR-0010 updated; spec unchanged
- Tests: none
- Files: ADR-0010
- Next prompts: /sp.plan
- Reflection: the payment's own row is inserted active before its allocations, so it counts in the sum

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
