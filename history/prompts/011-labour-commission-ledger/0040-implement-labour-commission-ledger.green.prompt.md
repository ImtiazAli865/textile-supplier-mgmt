---
id: 0040
title: Implement labour commission ledger
stage: green
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.implement
labels: ["implementation","supabase","migration","contractor-khata","settlement","qa"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - supabase/migrations/0011_labour_commission_ledger.sql
 - lib/contractor-ledger/schema.ts
 - lib/contractor-ledger/service.ts
 - app/actions/contractor-ledger.ts
 - components/contractor-ledger/khata-table.tsx
 - components/contractor-ledger/batch-payment-status-table.tsx
 - components/contractor-ledger/payment-form.tsx
 - components/contractor-ledger/payment-list.tsx
 - components/contractor-ledger/opening-balance-form.tsx
 - components/contractor-ledger/adjustment-form.tsx
 - components/contractor-ledger/settle-form.tsx
 - components/contractor-ledger/settlement-list.tsx
 - components/contractor-ledger/settlement-print-view.tsx
 - app/(dashboard)/contractors/[contractorId]/page.tsx
 - app/(dashboard)/contractors/[contractorId]/loading.tsx
 - app/(dashboard)/contractors/[contractorId]/payments/new/page.tsx
 - app/(dashboard)/contractors/[contractorId]/opening-balance/page.tsx
 - app/(dashboard)/contractors/[contractorId]/adjustments/new/page.tsx
 - app/(dashboard)/contractors/[contractorId]/settlements/new/page.tsx
 - app/contractors/[contractorId]/settlements/[settlementId]/print/page.tsx
 - app/(dashboard)/contractors/page.tsx
 - components/contractors/contractor-list.tsx
 - app/(dashboard)/production-batches/[batchId]/page.tsx
 - lib/production-batches/service.ts
 - app/actions/production-batches.ts
 - specs/011-labour-commission-ledger/qa/seed-and-race-qa-011.mts
 - specs/011-labour-commission-ledger/qa/cleanup-qa-011.sql
 - specs/011-labour-commission-ledger/tasks.md
tests:
 - PGlite: migrations 0001-0011 apply cleanly
 - PGlite scenario script: 73/73 (quickstart §1-§6, §8, trigger backstops, settlement figures, reopen, backfill idempotency)
 - PGlite cleanup test: 12/12 (dry run restores, commit removes only QA rows, real data + stock intact, triggers re-enabled, over-allocation guard never disabled, mixed scope refused)
 - T005 diff vs 0010: only the listed differences
 - npx tsc --noEmit clean; npm run lint (0 errors; 1 pre-existing warning in 009's customer-payment-form); npm run build passes with all 9 contractor routes
---

## Prompt

proceed with /sp.implement in this session

## Response snapshot

Implemented T001-T005 and T007-T041 (40/44). Migration 0011: 4 tables, 5 triggers (4
delete-blocking + over-allocation guard), contractor_settled_until, 6 write functions, redefined
complete_production_batch (diff vs 0010 = exactly the listed changes) and backfill. TS: schemas,
service (paged reads past PostgREST's 1,000-row cap; allocation reads via payments, not id lists;
staff emails via auth admin), six actions, 9 components, 6 routes incl. ADR-0006 print route;
contractors list balance column + deactivate warning; batch page labour-payment section; 010
error mappings + revalidation. T035 needed no change. QA seed/race script and prefix-scoped,
self-counting cleanup SQL written and the cleanup tested in PGlite. Paused at T006: user must apply
0011 on live; T042-T044 follow.

## Outcome

- Impact: feature code complete and locally verified; live verification pending the migration
- Tests: see tests list (PGlite 73/73 + 12/12; tsc, lint, build)
- Files: see files list
- Next prompts: user applies 0011 → T006 live select check → T042 (race script + UI walkthrough) → T043 cleanup → T044
- Reflection: testing the cleanup script against real-plus-QA data in PGlite caught a missing "run rollback after an error" instruction

## Evaluation notes (flywheel)

- Failure modes observed: shell heredoc quoting broke one scratch script (rewritten with the file tool); test seeding bug (inactive contractor) fixed in the test
- Graders run and results (PASS/FAIL): PGlite scenarios PASS; cleanup test PASS; build PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
