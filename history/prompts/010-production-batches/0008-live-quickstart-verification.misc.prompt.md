---
id: 0008
title: Live quickstart verification T043
stage: misc
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: (run T043 quickstart walkthrough)
labels: ["qa","live-supabase","concurrency","cleanup"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - specs/010-production-batches/tasks.md
tests:
 - Live Supabase via app service layer: 70/70 PASS (§1–§8, parallel issue, worked example, div-by-zero guards)
 - Cleanup verified: 0 QA-010 rows remain; new 010 tables empty
---

## Prompt

Migration 0010_production_batches.sql applied successfully. Please now run T043 (the full 
quickstart.md walkthrough §1-§8), specifically covering:
1. §1-§3: Contractor creation, issuing a batch, and the two-tab concurrent-issue test 
   (two people issuing from the same lot at the same moment)
2. §5-§6: Completing a batch, confirming the worked example numbers (3,000 kg / Rs 66.67/kg 
   / 2,500 packets → Rs 200,010 raw material, Rs 225,010 total, Rs 90.00/packet, 100 kg / 
   Rs 6,667 / 3.33% wastage)
3. §4: Edit and void, confirming lot weight restoration and the "can't delete a lot a voided 
   batch points to" rule (Option A)
4. §7: Opening stock — the one-entry limit, the single correction, the "already shipped" 
   block, and the below-zero block
5. §8: The batch list, filters, and the Issued/work-in-progress view
6. Live verification of the new division-by-zero guards (try completing with 0 packets, 
   confirm a clean INVALID_PACKETS error, not a raw Postgres crash)

Show me the results of all of these, and confirm any throwaway test data is cleaned up 
afterward.

## Response snapshot

Confirmed migration live. Seeded QA-010 data, ran the full walkthrough against live Supabase
through the app's own service layer (contractors, production-batches, products, purchases,
challans services): 70/70 passed, including two truly simultaneous issue requests (one won, the
other got "Only 400.00 kg remains"), the exact worked-example figures, Option A delete block, all
opening-stock rules via a real accepted Challan, filters/WIP totals, and INVALID_PACKETS at raw
RPC, service and Zod layers. Deleted all QA data (counts matched) and verified zero remnants.
Browser UI pass not done: the app requires sign-in and entering passwords is prohibited. The
batch number sequence was advanced by 5 test batches; gave the user a setval to reset it.

## Outcome

- ✅ Impact: 010 business logic verified on the production database.
- 🧪 Tests: 70/70 live PASS; cleanup verified
- 📁 Files: tasks.md (T009 checked; T043 annotated)
- 🔁 Next prompts: optional setval reset; sign in for the UI pass; /sp.git.commit_pr
- 🧠 Reflection: Running through the real service layer (not raw SQL) also verified the friendly-error mapping end to end.

## Evaluation notes (flywheel)

- Failure modes observed: none in the feature; the UI pass was blocked by authentication
- Graders run and results (PASS/FAIL): 70/70 PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
