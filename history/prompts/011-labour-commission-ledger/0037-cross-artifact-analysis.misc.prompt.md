---
id: 0037
title: Cross-artifact analysis of 011
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.analyze
labels: ["analysis","consistency","qa-cleanup","triggers"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - history/prompts/011-labour-commission-ledger/0037-cross-artifact-analysis.misc.prompt.md
tests:
 - none (read-only analysis; cross-checked data-model against supabase/migrations/0010_production_batches.sql)
---

## Prompt

/sp.analyze (no additional user input)

## Response snapshot

Read-only analysis of spec.md, plan.md, tasks.md, plus data-model.md, contracts, quickstart,
research and 0010's migration. 0 CRITICAL, 1 HIGH, 3 MEDIUM, 6 LOW findings. FR coverage 35/35;
success criteria 5/8 (SC-002, SC-006 timing and SC-008 Excel retirement have no task).
HIGH I1: quickstart §1-§6 seeds real-named contractors (Rashid, Kamal, Naveed, Imran) on live
Supabase, but the §9 / T041 cleanup only removes `QA-011`-scoped rows with counts taken from the
T040 script, so the UI walkthrough would leave immutable ledger rows in production data.
MEDIUM: I2 cleanup expected counts miss UI-created rows (the dry run would abort); I3 trigger count
drift (plan says 1+3, data-model defines 5, T003 says "the four" after listing five); U1 T005's
"only three differences" acceptance check can't pass as written (new declarations and a pre-lock
lookup are also needed). Confirmed against 0010: completed batches can't be edited or voided;
`completed_by` exists for the backfill. Constitution is still the unfilled template, so there
are no principles to check against. Recommended fixing I1-I3 before /sp.implement.

## Outcome

- Impact: found a live-data residue risk in the QA plan before implementation
- Tests: none
- Files: this PHR only
- Next prompts: approve remediation edits for I1, I2, I3, U1; then /sp.implement
- Reflection: checking data-model claims against the shipped 0010 SQL ruled out two suspected issues

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
