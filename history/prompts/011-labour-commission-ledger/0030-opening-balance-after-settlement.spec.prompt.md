---
id: 0030
title: Opening balance after settlement
stage: spec
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["spec","011","opening-balance","settlement-lock"]
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

One gap found: FR-020's two conditions can become mutually unsatisfiable. If a contractor's 
opening balance was never recorded, and their earliest khata entry is now inside an already-
settled period, there's no valid date left to record it — it must be on/before the earliest 
entry (which is settled) but also not on/before any settlement's end date. This creates an 
unreachable state where a missed opening balance can never be added after the first 
settlement happens.

How should this be handled? A few options:
A) Simplest: explicitly forbid recording an opening balance once any settlement exists for 
   that contractor — staff must instead post an adjustment to correct the balance (accepting 
   it won't be labeled "Opening balance" but will have the same financial effect).
B) Allow an opening balance to be recorded even if its date falls inside an already-settled 
   period, purely as a special one-time exception to the settlement lock (FR-027) — since it's 
   a one-time, unrepeatable action, not an ordinary entry.

I'd lean toward A, since it keeps FR-027's lock airtight (no exceptions) and an adjustment 
already achieves the same financial correction. Your call — please resolve this in the spec 
before /sp.plan.

## Response snapshot

Chose A with one precision: "any current (not reopened) settlement", so reopening every settlement remains a path back to a labelled opening balance. Rewrote FR-020 (refused once a current settlement exists, message points to adjustment, no lock exception), added US3 scenario 5, added edge case explaining adjustment effect lands in next period and the reopen-all route. B rejected: an exception would change a signed statement's figures.

## Outcome

- Impact: FR-020 unsatisfiable state removed
- Tests: none
- Files: spec.md
- Next prompts: /sp.plan
- Reflection: date-lock rules need checking pairwise for contradictions

## Evaluation notes (flywheel)

- Failure modes observed: two FR conditions contradicted after first settlement
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
