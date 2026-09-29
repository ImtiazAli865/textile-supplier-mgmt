---
id: 0041
title: Live verify 0011 and race QA
stage: green
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["supabase","live-qa","concurrency","settlement","opening-balance"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/tasks.md
 - history/prompts/011-labour-commission-ledger/0041-live-verify-and-race-qa.green.prompt.md
tests:
 - live GET select=*&limit=0 on the 4 new tables → 200 (control table → 404); 8 functions present in PostgREST schema
 - seed-and-race-qa-011.mts on live: 82/82 (race1 10 runs, race2 10 runs, race3 5 runs, OB boundary first+second settlement, §8 reconciliation)
---

## Prompt

Migration 0011_labour_commission_ledger.sql applied successfully. Please now:
1. Confirm the new tables exist on the live database (contractor_ledger_entries, 
   contractor_payments, contractor_payment_allocations, contractor_settlements) — T006.
2. Run T042: the seed-and-race script against the live database, including the two-staff 
   concurrent-payment test, the payment-vs-settlement race, and the "QA-011 OB Boundary" 
   opening-balance settlement test.
3. Once T042 passes, we'll walk through the quickstart in a signed-in browser together.

Show me the results of steps 1 and 2.

## Response snapshot

T006 passed (4 tables 200, control 404, all functions present; live had 0 contractors/batches/
entries before QA). Race script 82/82. Race 1: 10/10 exactly one payment won, loser saw Rs 0.00
unpaid. Race 2: both orders happened (payment first 5, settlement first 5), frozen figures matched
the khata every run. Race 3: completion first in 2 runs, settlement first in 3; all matched. OB
boundary first (5000/0/1000/0/4000) and second (4000/3000/0/0/7000) settlements matched SQL, TS
preview and statement. §8 reconciliation 0 mismatches. QA consumed 18 batch numbers. T042's
browser walkthrough and T043 cleanup still to do.

## Outcome

- Impact: concurrency guarantees (FR-015, SC-004, US5-10) verified on live
- Tests: see tests list
- Files: tasks.md (T006 checked)
- Next prompts: signed-in browser walkthrough (quickstart §1-§6 with QA-011 names), then T043 cleanup, T044
- Reflection: reading back per-run outcomes proved both race orderings were exercised, not just that assertions passed

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): live race script PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
