---
id: 0032
title: Settlement contractor row lock
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["011","concurrency","settlement","adr-0010"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

Once data-model.md is ready — please confirm the settlement function also takes a row-level 
lock (for update) on the contractor row before computing/freezing its figures, the same lock 
that payments already take. This matters for FR-015's concurrency guarantee: if a payment and 
a settlement race against the same contractor without both locking that row, the settlement 
could freeze figures that don't include a payment that was still mid-flight, or a payment 
could land after the settlement thought it had already closed the period.

## Response snapshot

data-model.md does not exist yet (/sp.plan not run). Confirmed ADR-0010 §4 already requires settlement (and every contractor-ledger writer, incl. reopen) to lock the contractor row FOR UPDATE first. Walked both race orders; noted two implementation conditions to carry into the plan: figures summed in statements issued after the lock (READ COMMITTED per-statement snapshot), and writers read the latest settlement end date only after taking the lock. Will be stated explicitly in data-model.md and tested in quickstart.

## Outcome

- Impact: confirmation; no files changed
- Tests: none
- Files: none
- Next prompts: approve /sp.plan
- Reflection: none

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
