---
id: 0035
title: Labour commission ledger tasks
stage: tasks
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.tasks
labels: ["tasks","011","qa","cleanup"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/tasks.md
 - specs/011-labour-commission-ledger/research.md
 - specs/011-labour-commission-ledger/quickstart.md
 - specs/011-labour-commission-ledger/plan.md
tests:
 - none (task generation)
---

## Prompt

Decisions:
1. Cleanup mechanism: disable the four named triggers inside one transaction (your 
   recommendation), with a dry-run-ending-in-rollback first.
2. Race-testing database: live Supabase, as with 006-010 — no Docker available. Please write 
   this into research.md and quickstart §9, and include the cleanup script as a task in 
   /sp.tasks.

Please proceed to /sp.tasks.

## Response snapshot

Recorded both decisions in research.md (new decision section), quickstart §9 (dry run → commit, zero-residue, trigger-restored checks) and plan.md Risks. Generated tasks.md: 44 tasks — Setup 1, Foundational 9 (all SQL in one migration incl. triggers, functions, redefined complete_production_batch with body diff check, user applies migration), US1 6, US2 5, US3 3, US4 4, US5 7, US6 3, Polish 6 (lint/build, QA seed+race script, cleanup-qa-011.sql ending in rollback, live quickstart, dry-run then commit cleanup, PRODUCT-OVERVIEW). MVP = US1.

## Outcome

- Impact: ready for /sp.implement
- Tests: none
- Files: tasks.md (+ decision updates)
- Next prompts: /sp.analyze (optional) or /sp.implement
- Reflection: all SQL kept in Foundational so the user applies the migration once

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): task format check PASS (checkbox, ID, story labels, file paths)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
