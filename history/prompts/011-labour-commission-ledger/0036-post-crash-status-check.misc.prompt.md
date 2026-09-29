---
id: 0036
title: Post-crash status check
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["status","git","recovery","planning-artifacts"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - history/prompts/011-labour-commission-ledger/0036-post-crash-status-check.misc.prompt.md
tests:
 - none (read-only inspection: git status, file line counts, tails, placeholder grep, task count)
---

## Prompt

My laptop shut down unexpectedly during our last session. Please check:
1. What branch am I on right now?
2. Is there any uncommitted work (git status)?
3. What files exist in specs/011-labour-commission-ledger/ right now — specifically, do 
   plan.md, research.md, data-model.md, contracts/server-actions.md, and quickstart.md all 
   exist and look complete?
4. Does tasks.md exist yet, or was that step interrupted?

Give me a full status report before we continue.

## Response snapshot

On branch 011-labour-commission-ledger. Nothing committed for 011; one modified tracked file
(specs/PRODUCT-OVERVIEW.md, +20/-6) plus untracked ADR-0010, PHRs 0021-0035 and the whole
specs/011 folder. All planning artifacts exist and end cleanly with no template placeholders:
spec.md 447, plan.md 189, research.md 265, data-model.md 412, contracts/server-actions.md 107,
quickstart.md 149, checklists/requirements.md 42 lines. tasks.md exists (274 lines, T001-T044,
0 checked) and its PHR 0035 was completed, so the tasks step finished. No migration 0011 and no
code yet. Next: commit the planning work, then optionally run /sp.analyze, then /sp.implement.

## Outcome

- Impact: confirmed no work lost; the next step is clear
- Tests: none
- Files: this PHR only
- Next prompts: commit planning artifacts; /sp.analyze (optional); /sp.implement
- Reflection: uncommitted planning work is exposed to data loss; recommend committing

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
