# Quickstart: Raw Material Purchases

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10 | **Revised**: 2026-09-16 (Firebase → Supabase, see [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md))

Extends the app already scaffolded for 001-supplier-directory — no new environment variables. Uses the same Supabase project (Postgres + Auth) and the same local dev setup; the `raw_material_purchases` table is part of the shared [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql).

## Prerequisites

- Everything from [001's quickstart.md](../001-supplier-directory/quickstart.md) (Node.js 20+, Supabase project with the migration applied, a staff user in Supabase Auth) already set up.
- At least one **active** supplier already exists in the Supplier Directory (001) — purchases cannot be created without one.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Record & view** (User Story 1): Go to "Add Purchase", select an existing active supplier, enter a purchase date (today or earlier), weight (kg), and rate per kg → confirm it saves with an auto-calculated total cost and appears at the top of the purchase list. Open its detail view → confirm supplier, date, weight, rate, total cost, and remaining weight all match what was entered. Submit again with no supplier selected, or with weight/rate ≤ 0 → confirm a validation error and nothing is saved.
3. **Search, filter, totals** (User Story 2): With several purchases seeded across suppliers and dates, filter by a single supplier → confirm only its purchases show and totals (kg, cost) match just those. Apply a date range → confirm the list and totals narrow accordingly. Combine both filters. Pick a filter combination matching nothing → confirm an explicit empty state with zeroed totals.
4. **Edit & delete** (User Story 3): Open an unconsumed purchase, edit its weight and rate, save → confirm the total cost and remaining weight update to match. Delete an unconsumed purchase → confirm it's removed from the list and totals. To verify the lock (FR-010) without waiting for the future Production Batches feature, manually reduce a test row's `remaining_weight_kg` below its `weight_kg` in the Supabase SQL editor (`update raw_material_purchases set remaining_weight_kg = weight_kg - 1 where id = '<id>';`), then confirm the app blocks editing and deleting that record with a clear message.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
