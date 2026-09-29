---
id: 0033
title: Labour commission ledger plan
stage: plan
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.plan
labels: ["plan","011","data-model","locking","settlement"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/plan.md
 - specs/011-labour-commission-ledger/research.md
 - specs/011-labour-commission-ledger/data-model.md
 - specs/011-labour-commission-ledger/contracts/server-actions.md
 - specs/011-labour-commission-ledger/quickstart.md
tests:
 - none (planning); quickstart defines manual + concurrency checks
---

## Prompt

/sp.plan (no additional input)

## Response snapshot

Ran setup-plan.ps1 and update-agent-context.ps1 (no net CLAUDE.md change). Wrote plan.md, research.md (13 decisions), data-model.md (4 tables, helper contractor_settled_until, 6 functions + redefined complete_production_batch with same signature, 4 triggers, explicit locking rules incl. "read after lock" and "settled date read after lock"), contracts/server-actions.md (6 actions, error codes, reads), quickstart.md (US1-US6, concurrency script, psql deterministic variant, trigger backstop, reconciliation SQL). Constitution is unfilled template → PASS by default guardrails. No new ADR. Risks: immutability triggers complicate QA cleanup on the only DB; faithful copy of complete_production_batch; trigger logic tests.

## Outcome

- Impact: plan complete; ready for /sp.tasks
- Tests: none yet
- Files: 5 plan artifacts
- Next prompts: /sp.tasks
- Reflection: p_today parameter is a new pattern forced by reversal needing today inside the locked txn

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): constitution gate PASS (template)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
