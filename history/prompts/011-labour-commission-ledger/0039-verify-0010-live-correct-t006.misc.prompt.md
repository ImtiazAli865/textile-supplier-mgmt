---
id: 0039
title: Verify 0010 live and correct T006
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["supabase","migrations","verification","stale-memory"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/011-labour-commission-ledger/tasks.md
 - specs/011-labour-commission-ledger/quickstart.md
 - history/prompts/011-labour-commission-ledger/0039-verify-0010-live-correct-t006.misc.prompt.md
tests:
 - live read-only GET select=...&limit=0 on contractors, production_batches (incl. labour_cost, completed_by), manufactured_opening_stock → 200 each
 - PostgREST schema: all 6 0010 functions present; complete_production_batch params match 0010; 0 matches for 011 objects
 - row counts: contractors 0, production_batches 0
---

## Prompt

Excellent remediation — the lot-via-supplier-prefix solution for I1 is a smart fix for a 
real gap.

Before /sp.implement, one discrepancy to clear up: you said migration 0010 still needs to be 
applied. But your own project status report earlier (which directly read the live database) 
confirmed 0010_production_batches was already applied and verified — we ran 70+ live checks 
against it, including the full browser UI walkthrough, and it's committed as d5f317d.

Please re-verify directly against the live database (read-only check, same as your status 
report) whether 0010's tables/functions actually exist there right now. If they do, please 
correct T006's wording so it doesn't ask me to reapply something already live.

## Response snapshot

Confirmed live: 0010's 3 tables return 200 on real selects and all 6 functions exist with 0010's
signature; 011 objects absent; 0 contractors/batches. The wrong claim came from a stale line in my
own memory note, not from any 011 artifact (T006 referred only to 0011). Corrected the memory,
made T006 and quickstart prerequisite 1 say explicitly to apply only 0011 because 0001-0010 are
live.

## Outcome

- Impact: removed a false prerequisite before implementation
- Tests: live read-only probes listed above
- Files: tasks.md, quickstart.md (+ memory note outside repo)
- Next prompts: /sp.implement
- Reflection: memory claims about live state must be re-probed before being stated

## Evaluation notes (flywheel)

- Failure modes observed: stated live-DB status from a stale memory note without re-checking
- Graders run and results (PASS/FAIL): live probe PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
