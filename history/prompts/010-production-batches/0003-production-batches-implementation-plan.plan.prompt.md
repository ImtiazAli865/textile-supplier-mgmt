---
id: 0003
title: Production batches implementation plan
stage: plan
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: /sp.plan
labels: ["plan","production-batches","postgres-functions","concurrency","opening-stock"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - specs/010-production-batches/spec.md
 - specs/010-production-batches/plan.md
 - specs/010-production-batches/research.md
 - specs/010-production-batches/data-model.md
 - specs/010-production-batches/contracts/server-actions.md
 - specs/010-production-batches/quickstart.md
tests:
 - none (planning only; manual quickstart defined)
---

## Prompt

Yes, please apply fixes 1-4. Fix 5 is fine as-is, no action needed.

Once applied, proceed to /sp.plan.

## Response snapshot

Applied spec fixes 1–4 (weight rounding wording, SC-004 simplified, stock-history + product entity
mention corrections, exceeded-weight flag in entity and detail view). Ran /sp.plan: migration 0010
with contractors, production_batches (all-or-nothing completion check, PB-NNNN sequence), and
manufactured_opening_stock (PK per product, one-shot correction columns); six plpgsql functions
locking lot rows FOR UPDATE (id-ordered on lot change); completion figures computed and stored once;
server-enforced confirm flag for returned weight > issued. Found and planned a fix for a latent
002 race (weight-lot edit resets remaining_weight_kg after a TS-side check) via conditional
update/delete. Surfaced one open item: lot deletion after void is blocked by the voided batch's FK
(narrows US4-5) — needs user confirmation. Added read-only product stock history section. No new ADR
(ADR-0002/0005/0008 cover it).

## Outcome

- ✅ Impact: Plan + Phase 0/1 artifacts ready; one user decision pending before /sp.tasks.
- 🧪 Tests: none (quickstart.md defines manual verification incl. worked example and parallel-issue guard)
- 📁 Files: plan.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md; spec.md fixes
- 🔁 Next prompts: confirm lot-deletion rule → /sp.tasks
- 🧠 Reflection: Reading 002's service code exposed a race the new writer would have triggered.

## Evaluation notes (flywheel)

- Failure modes observed: initial research claim about date validation overstated; corrected after grep.
- Graders run and results (PASS/FAIL): constitution check N/A (template unfilled); worked-example arithmetic PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
