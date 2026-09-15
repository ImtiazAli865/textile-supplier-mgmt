# Implementation Plan: Raw Material Purchases

**Branch**: `002-raw-material-purchases` | **Date**: 2026-09-10 | **Revised**: 2026-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-raw-material-purchases/spec.md`

> **2026-09-16 revision**: Backend swapped from Firestore/Firebase Auth to Supabase (Postgres + Supabase Auth) per [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md), same as 001. Business rules and user-facing behavior are unchanged; this plan now describes the Postgres/Supabase implementation. The original Firestore-based plan is preserved in git history at the commit implementing this feature (`893b1bc`).

## Summary

Internal staff need to record raw material purchases (weight in kg, rate per kg) against existing suppliers, browse/filter them with running totals, and correct mistakes before a lot is used in production. Built as a direct extension of the Next.js app from 001-supplier-directory: a `raw_material_purchases` Postgres table with a real foreign key to `suppliers`, Server Components read purchase data via `lib/purchases/service.ts` using the shared Supabase admin client, Server Actions handle create/update/delete with server-side re-validation of the active-supplier rule and the derived consumption lock, and the existing Supabase Auth session gate covers the new routes automatically. See [data-model.md](./data-model.md) for the schema.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already installed for 001, no new dependencies needed for this feature
**Storage**: Supabase Postgres — `raw_material_purchases` table, with a foreign key to the existing `suppliers` table (see [data-model.md](./data-model.md))
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`, same as 001
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — extends 001, no new service or deployable
**Performance Goals**: Purchase list search/filter + running totals render in <2s at 1,000 records (SC-004) — a single indexed SQL query with `SUM()` replaces the Firestore-era "fetch filtered set, sum in application code" pattern
**Constraints**: No client-side Postgres access — all reads/writes go through the server using the Supabase service-role key, matching 001; only active suppliers selectable when creating a purchase (FR-001); edit/delete blocked server-side once a lot is partially/fully consumed (FR-010), regardless of client state
**Scale/Scope**: Single internal business, up to ~1,000 purchase records for now, no multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist yet to gate against. Proceeding under the project's default guardrails (smallest viable diff, no speculative abstraction, testable increments per user story), reusing 001's Supabase auth/data-access patterns rather than introducing a second convention.

The backend swap is recorded once for both features in [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md) — this plan does not introduce any further architecturally significant decision beyond what that ADR already covers. The `remaining_weight_kg` consumption model (flagged for a possible ADR back when this feature was first planned on Firestore) is still open, and is now explicitly called out in data-model.md as a good candidate to formalize (as a transactional `UPDATE ... WHERE remaining_weight_kg >= $1` guard) once 003-production-batches is designed — a concrete benefit of having moved to a database with real transactions.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no new violations introduced. The design adds one table and one foreign key to the existing single Next.js app — no additional services, no new indirection layers.*

## Project Structure

### Documentation (this feature)

```text
specs/002-raw-material-purchases/
├── plan.md              # This file
├── research.md          # Phase 0 output (Firestore-era; superseded by ADR-0001 for storage choice)
├── data-model.md         # Phase 1 output — now Postgres schema
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md               # Phase 2 output (/sp.tasks)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                 # EXISTING — unchanged
│   ├── suppliers/                 # EXISTING — unchanged
│   └── purchases/
│       ├── page.tsx               # List + filters + running totals (Server Component)
│       ├── loading.tsx
│       ├── new/
│       │   └── page.tsx           # Create form
│       └── [purchaseId]/
│           ├── page.tsx           # Detail view (shows lock state)
│           ├── loading.tsx
│           └── edit/
│               └── page.tsx       # Edit form (blocked server-side if locked)
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    └── purchases.ts                 # Server Actions: createPurchase, updatePurchase, deletePurchase

lib/
├── supabase/                       # EXISTING (from 001) — server.ts (auth), admin.ts (data access) — reused, not reimplemented
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — service.ts's listSuppliers({status:"active"}) reused for the supplier dropdown
└── purchases/
    ├── schema.ts                   # Zod schemas: PurchaseInput, Purchase, PurchaseListItem (unchanged shape from Firestore era)
    └── service.ts                  # Postgres access: createPurchaseRecord, updatePurchaseRecord,
                                     # deletePurchaseRecord, getPurchase, listPurchases (JOIN + SUM instead of live-join-in-app-code)

components/
├── suppliers/                      # EXISTING — unchanged
└── purchases/
    ├── purchase-form.tsx           # Shared create/edit form — unchanged
    ├── purchase-list.tsx           # Client component: table + totals footer — unchanged
    ├── purchase-filters.tsx        # Supplier filter + date-range filter controls — unchanged
    └── delete-purchase-control.tsx # Delete button w/ confirm; hidden/disabled when locked — unchanged

supabase/migrations/0001_init.sql   # EXISTING (shared with 001) — includes raw_material_purchases DDL
```

`components/` and `lib/purchases/schema.ts` needed no structural changes for this migration, for the same reason as 001: the API-level TypeScript shapes are unchanged, only the storage/query layer changed.

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged from the Firestore-era plan).

**Structure Decision**: Single Next.js application (same shape as 001) — unchanged.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a deviation against. No additional projects, services, or indirection layers beyond the single Next.js app were introduced; the one new piece of derived state (consumption lock) is still computed, not stored.
