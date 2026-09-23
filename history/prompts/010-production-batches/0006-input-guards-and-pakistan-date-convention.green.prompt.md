---
id: 0006
title: Input guards and Pakistan date convention
stage: green
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: (follow-up to /sp.implement)
labels: ["division-by-zero","input-guards","timezone","adr","002-bugfix"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0009-business-today-is-the-pakistan-calendar-date.md
  pr: null
files:
 - supabase/migrations/0010_production_batches.sql
 - lib/production-batches/service.ts
 - lib/production-batches/schema.ts
 - lib/dates.ts
 - lib/purchases/schema.ts
 - components/purchases/purchase-form.tsx
 - history/adr/0009-business-today-is-the-pakistan-calendar-date.md
 - specs/010-production-batches/research.md
 - specs/010-production-batches/data-model.md
tests:
 - PGlite: 50/50 scenario suite still PASS; invalid-input probe — all 10 cases now raise explicit guard codes before any write
 - tsx mocked clock (2026-09-24T20:30Z = 01:30 PKT): old rule rejected 2026-09-25, new rule accepts it and rejects 2026-09-26
 - tsc, lint (0 errors; 1 pre-existing 009 warning), build PASS
---

## Prompt

Two things before I apply the migration:

1. I still don't see the division-by-zero guard addressed — does complete_production_batch 
   now have an explicit check (packets_produced > 0, or similar) before computing 
   avg_cost_per_packet, or does the friendly-error layer already catch a raw Postgres 
   "division by zero" gracefully? Please confirm one way or the other.

2. Yes, please fix 002's Pakistan-date bug (comparing against UTC day instead of Pakistan's 
   actual today) — it's a real, pre-existing bug and the fix is small. Please also record the 
   Pakistan-date convention as an ADR, since 011/012/013 will likely need the same "today" 
   comparison pattern.

Once both are addressed, show me the final content of 0010_production_batches.sql (only if 
it changed) and I'll apply it.

## Response snapshot

(1) Confirmed neither: there was no explicit guard; division by zero was only avoided by
statement order (inventory_movements qty_delta<>0 check fired first) and the friendly layer
passed raw constraint messages through. Added explicit guards at the top of all six functions
(INVALID_PACKETS etc.) before any lock/write, mapped to friendly messages; probe confirms all
invalid inputs rejected with no state change. (2) Added lib/dates.ts (todayInPakistan,
isNotAfterTodayInPakistan); fixed 002 schema + purchase-form default/max; reproduced and verified
with a mocked clock. Wrote ADR-0009 listing 10 remaining non-conforming sites (5 form defaults,
ageing.ts, 4 SQL current_date) without changing them. Showed the full updated 0010 SQL.

## Outcome

- ✅ Impact: 0010 hardened; 002 date bug fixed; cross-feature date convention recorded.
- 🧪 Tests: see tests list above
- 📁 Files: see files list above
- 🔁 Next prompts: user applies 0010 → quickstart → decide on ADR-0009's listed sites → /sp.git.commit_pr
- 🧠 Reflection: The zero case "worked" only by accident of ordering — worth probing actual behaviour rather than reasoning from constraints.

## Evaluation notes (flywheel)

- Failure modes observed: guard previously implicit (not caught in initial implementation)
- Graders run and results (PASS/FAIL): all PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
