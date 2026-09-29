---
id: 0038
title: Remediate analysis findings I1 I2 I3 U1
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.analyze (remediation + re-run)
labels: ["analysis","remediation","qa-cleanup","triggers","live-data-safety"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/quickstart.md
 - specs/011-labour-commission-ledger/tasks.md
 - specs/011-labour-commission-ledger/research.md
 - specs/011-labour-commission-ledger/plan.md
 - specs/011-labour-commission-ledger/data-model.md
 - history/prompts/011-labour-commission-ledger/0038-remediate-analysis-findings.misc.prompt.md
tests:
 - grep re-check: no pasted-count wording left; trigger count consistent (5 defined, 4 disabled, named identically in research/T003/T041); T005 check lists declarations + pre-lock lookup; every QA contractor/supplier/product carries the QA-011 prefix
---

## Prompt

Yes, please write and apply concrete edits for I1, I2, I3, and U1 before /sp.implement:

I1 (HIGH — most important): Rename every quickstart seed row to carry the "QA-011 " prefix 
(contractors, lot, product — everything created live), and make T042 explicit that ANY row 
created through the UI walkthrough must also use the prefix. This is critical — without it, 
test data becomes permanently stuck in the production khata due to the immutability triggers.

I2: Have the cleanup script count QA-011 rows itself at runtime (not rely on pasted counts 
from an earlier step), so the dry run doesn't break when T042's UI pass adds more rows than 
T040's seed script created.

I3: Fix the trigger-count inconsistency — it's 5 triggers total, of which 4 (the 
immutability/guard ones, not the over-allocation guard) get disabled during cleanup. Name all 
4 explicitly in both T003 and T041 so there's no chance of disabling the wrong one.

U1: Fix T005's "done" check to include the two new variable declarations 
(v_contractor_id, v_settled_until) and the pre-lock lookup, not just the three changes 
currently listed — otherwise the check can never pass as written.

The low-severity items (C1, C2, I4, F1, F2, D1) can be skipped or left as-is.

Once applied, re-run /sp.analyze to confirm these are resolved, then we'll proceed to 
/sp.implement.

## Response snapshot

I1: quickstart seeds QA-011 Rashid/Kamal/Naveed/Imran/Advance/Empty, QA-011 Supplier,
QA-011 Washcloth; found that raw_material_purchases has no name column, so a QA lot is scoped by
its QA-011 supplier; T042 now mandates the prefix and an untagged-row check before cleanup.
I2: research/T041/quickstart §9 now have the cleanup count QA-scoped rows at run time into a temp
table, print them, and compare each delete to those counts; T040's counts are informational.
I3: plan/data-model/research/T003/T041 say five triggers, four disabled (named), and the
over-allocation guard is never disabled. U1: T005 and data-model list the two declarations and
the pre-lock lookup that takes over NOT_FOUND. Re-run: all four resolved, no new issues; low items
left as agreed.

## Outcome

- Impact: QA plan can no longer strand test rows in the live khata; ready for /sp.implement
- Tests: grep-based re-analysis (see tests above)
- Files: quickstart, tasks, research, plan, data-model
- Next prompts: /sp.implement
- Reflection: verifying column names against migrations caught that lots can't carry a name prefix

## Evaluation notes (flywheel)

- Failure modes observed: the requested "lot" prefix was impossible as specified; resolved by supplier scoping
- Graders run and results (PASS/FAIL): re-analysis PASS for I1, I2, I3, U1
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
