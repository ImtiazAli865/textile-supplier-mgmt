# Implementation Plan: Raw Material Purchases

**Branch**: `002-raw-material-purchases` | **Date**: 2026-09-10 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/002-raw-material-purchases/spec.md`

## Summary

Internal staff need to record raw material purchases (weight in kg, rate per kg) against existing suppliers, browse/filter them with running totals, and correct mistakes before a lot is used in production. Build it as a direct extension of the existing Next.js app from 001-supplier-directory: a new `rawMaterialPurchases` Firestore collection referencing `suppliers` by ID (live-joined for display, never denormalized), Server Components read purchase data via a new `lib/purchases/service.ts`, Server Actions handle create/update/delete with server-side recomputation of `totalCost` and a derived consumption lock, and the existing session-cookie auth gate covers the new routes automatically. See [research.md](./research.md) for the full rationale behind each purchase-specific decision (everything else reuses 001's infrastructure decisions as-is).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `firebase-admin`, `firebase` (Auth client only), `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already installed; no new dependencies needed
**Storage**: Firestore — new `rawMaterialPurchases` collection, referencing the existing `suppliers` collection by `supplierId` (see [data-model.md](./data-model.md))
**Testing**: Vitest + Testing Library (unit/integration), Firestore Emulator — same intended stack as 001 (not yet wired into `package.json`; no test tasks scaffolded here either, consistent with how 001 was implemented)
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — extends 001, no new service or deployable
**Performance Goals**: Purchase list search/filter + running totals render in <2s at 1,000 records (SC-004)
**Constraints**: No client-side Firestore access — all reads/writes go through the server (Admin SDK), matching 001; only active suppliers selectable when creating a purchase (FR-001); edit/delete blocked server-side once a lot is partially/fully consumed (FR-010), regardless of client state
**Scale/Scope**: Single internal business, up to ~1,000 purchase records for now, no multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist yet to gate against (unchanged since 001). Proceeding under the project's default guardrails (smallest viable diff, no speculative abstraction, testable increments per user story), all of which this plan follows: three independently-shippable user stories, no new infrastructure beyond one collection, reusing 001's auth/data-access patterns rather than introducing a second convention.

📋 **Note**: The consumption-lock model (a `remainingWeightKg` field the next feature, Production Batches, will decrement, with edit/delete locking derived from it) was already flagged for a possible ADR after `/sp.specify` (`raw-material-lot-consumption-model`) — still not created, per the project's "never auto-create, always require consent" policy. This plan does not introduce any further decision of that weight; everything else here is a direct application of 001's already-established patterns.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md, quickstart.md): no new violations introduced. The design adds one collection and one live join to the existing single Next.js app — no additional services, no new indirection layers.*

## Project Structure

### Documentation (this feature)

```text
specs/002-raw-material-purchases/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md               # Phase 2 output (/sp.tasks — not created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                 # EXISTING — add "Raw Material Purchases" nav link
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
    ├── suppliers.ts                # EXISTING — unchanged
    └── purchases.ts                 # Server Actions: createPurchase, updatePurchase, deletePurchase

lib/
├── firebase/                       # EXISTING — unchanged (admin.ts, client.ts)
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — service.ts's listSuppliers({status:"active"}) reused for the supplier dropdown
└── purchases/
    ├── schema.ts                   # Zod schemas: PurchaseInput, Purchase, PurchaseListItem
    └── service.ts                  # Firestore access: createPurchaseRecord, updatePurchaseRecord,
                                     # deletePurchaseRecord, getPurchase, listPurchases (with supplier join + totals)

components/
├── suppliers/                      # EXISTING — unchanged
└── purchases/
    ├── purchase-form.tsx           # Shared create/edit form (react-hook-form + Zod; supplier select,
                                     # date, weight, rate; live client-side total preview)
    ├── purchase-list.tsx           # Client component: table + totals footer
    ├── purchase-filters.tsx        # Supplier filter + date-range filter controls
    └── delete-purchase-control.tsx # Delete button w/ confirm; hidden/disabled when locked

firestore.indexes.json              # EXISTING — add composite index: rawMaterialPurchases
                                     # (supplierId ASC, purchaseDate DESC), per data-model.md
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (spec.md did not request TDD, per Task Generation Rules — same call made for 001). When automated tests are added later, they belong at `tests/unit/purchases/{schema,service}.test.ts` and `tests/integration/actions/purchases.test.ts`, using the Vitest + Firestore Emulator stack already chosen in research.md.

**Structure Decision**: Single Next.js application (same shape as 001) — `purchases` is added as a sibling feature module under `app/(dashboard)/`, `lib/`, and `components/`, following the exact same three-layer pattern (`lib/<feature>/schema.ts` + `service.ts`, `app/actions/<feature>.ts`, `components/<feature>/*`) 001 already established, rather than inventing a new convention.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a deviation against. No additional projects, services, or indirection layers beyond the single Next.js app were introduced; the one new piece of derived state (consumption lock) is computed, not stored, to avoid adding a redundant field (see research.md).
