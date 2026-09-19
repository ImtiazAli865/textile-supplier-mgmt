# Implementation Plan: Traded-Goods Purchasing

**Branch**: `003b-traded-goods-purchasing` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003b-traded-goods-purchasing/spec.md`

## Summary

Internal staff need to record per-unit purchases of traded catalog items (Ball Fiber, Channel
SMC, Screws, etc.) in the same purchase log already used for per-kg raw-material lots (002),
so that traded products stop showing "not yet established" for their purchase cost and gain a
real quantity on hand. Built as an extension of the existing `raw_material_purchases` table
(adding a `purchase_mode` discriminator and unit-mode columns, mirroring 003's type-conditional
column pattern) plus a new `quantity_on_hand` column on `products`. Because a unit-mode purchase
must atomically both persist the purchase row and recompute the affected product's
weighted-average cost and quantity on hand, all writes for unit-mode purchases go through
Postgres functions (the same pattern 001 already uses for its multi-table supplier writes) —
never two sequential client calls that could leave the two tables inconsistent if one failed.
See [data-model.md](./data-model.md) for the schema.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001/002/003)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed, no new dependencies needed for this feature
**Storage**: Supabase Postgres — extends `raw_material_purchases` (new `purchase_mode`,
`product_id`, `quantity_units`, `rate_per_unit`, `remaining_units` columns; `weight_kg`/
`rate_per_kg`/`remaining_weight_kg` become nullable; `total_cost`'s generated expression becomes
mode-conditional) and `products` (new `quantity_on_hand` column) — see
[data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`,
same as 001/002/003
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — extends 002 and 003, no new service or deployable
**Performance Goals**: Unified purchase list search/filter + totals render in <2s at 1,000
records (SC-004), same budget 002 already meets — extending the query, not replacing it
**Constraints**: No client-side Postgres access — all reads/writes go through the server using
the Supabase service-role key, matching 001/002/003; a unit-mode purchase's write (create,
edit, or delete) and its effect on the referenced product's cost/quantity MUST be atomic — both
succeed or both fail, never partially applied; only active, traded-type products selectable for
a new unit-mode purchase (FR-002, FR-014); edit/delete blocked server-side once a unit-mode
purchase's remaining quantity is below its purchased quantity (FR-013), exactly mirroring 002's
existing weight-mode lock
**Scale/Scope**: Single internal business, up to ~1,000 combined purchase records for now, no
multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001/002/003. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user
story).

**Architecturally significant decision surfaced by this feature**: unit-mode purchases require
an atomic multi-table write (the purchase row itself, plus the referenced product's
weighted-average cost and quantity-on-hand recalculation). This plan resolves it by using a
Postgres function per write path (`record_unit_purchase`, `update_unit_purchase`,
`delete_unit_purchase`), the same pattern 001 already established for its own multi-table
writes (`create_supplier`/`update_supplier`), rather than two sequential `supabase-js` calls
from the Server Action. This sets the pattern every later multi-table write in the roadmap
(Challans posting to both inventory and the ledger; Production Batches decrementing a lot while
inserting a batch row) is expected to follow.

📋 **Architectural decision detected**: atomic multi-table writes via Postgres functions,
established as the project-wide pattern for every future feature that must update more than one
table in one user action — Document reasoning and tradeoffs? Run
`/sp.adr atomic-multi-table-writes-via-postgres-functions`. Not created automatically; waiting
for user consent per project policy.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. The three new Postgres functions are the only new "moving parts" beyond
ordinary column additions — no new services, no new indirection layers in the application code
itself (Server Actions still call one `service.ts` function each, which now happens to be an
RPC call for unit-mode writes instead of a direct table write).*

## Project Structure

### Documentation (this feature)

```text
specs/003b-traded-goods-purchasing/
├── plan.md              # This file
├── research.md          # Phase 0 output (/sp.plan command)
├── data-model.md         # Phase 1 output (/sp.plan command)
├── quickstart.md         # Phase 1 output (/sp.plan command)
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md               # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                  # EXISTING — unchanged
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING (003) — unchanged
│   └── purchases/
│       ├── page.tsx                # EXTENDED — list now shows both modes + product filter
│       ├── loading.tsx             # EXISTING — unchanged
│       ├── new/
│       │   └── page.tsx            # EXTENDED — passes active traded products to the form too
│       └── [purchaseId]/
│           ├── page.tsx            # EXTENDED — renders unit-mode fields when applicable
│           ├── loading.tsx         # EXISTING — unchanged
│           └── edit/
│               └── page.tsx        # EXTENDED — same mode-aware rendering
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXISTING (003) — unchanged
    └── purchases.ts                 # EXTENDED — createPurchase/updatePurchase/deletePurchase
                                      # now accept either mode; input schema is a discriminated
                                      # union

lib/
├── supabase/                       # EXISTING — server.ts (auth), admin.ts (data access) — reused
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING (003) — service.ts gains
│   │                                # listActiveTradedProductsForSelect, reused (not
│   │                                # reimplemented) for the purchase form's product dropdown
│   └── service.ts                  # EXTENDED (one new exported function only)
└── purchases/
    ├── schema.ts                    # EXTENDED: purchaseInputSchema becomes a discriminated
    │                                 # union (weight | unit) on a new `mode` field; new
    │                                 # PurchaseListItem/PurchaseDetail fields for unit-mode rows
    └── service.ts                   # EXTENDED: createPurchaseRecord/updatePurchaseRecord/
                                      # deletePurchaseRecord branch on mode — weight-mode keeps
                                      # its existing direct-table code path unchanged; unit-mode
                                      # calls the new Postgres RPC functions. listPurchases
                                      # gains a product filter and mode-aware list-item shape.

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING (003) — unchanged
└── purchases/
    ├── purchase-form.tsx           # EXTENDED — mode selector; conditionally renders
    │                                # supplier+weight+rate/kg (weight mode) or
    │                                # supplier+product+quantity+rate/unit (unit mode)
    ├── purchase-list.tsx           # EXTENDED — mode-aware row rendering + mode-split totals
    ├── purchase-filters.tsx        # EXTENDED — adds a product filter (unit-mode rows only)
    └── delete-purchase-control.tsx # EXISTING — unchanged (works the same for either mode)

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING (003) — unchanged
└── 0003_traded_purchases.sql       # NEW — purchases table alterations, products.quantity_on_hand,
                                     # and the three Postgres functions (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either
(unchanged from 001/002/003's approach).

**Structure Decision**: Single Next.js application (same shape as 001/002/003) — unchanged.
This feature extends three existing modules (`lib/purchases/*`, `app/actions/purchases.ts`,
`components/purchases/*`) and adds one small export to a fourth (`lib/products/service.ts`) —
no new route groups, no new top-level modules, no new services.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. The one piece of added complexity — three Postgres functions instead of
plain table access — is not a violation of anything; it is the direct consequence of this
feature being the first one in the roadmap that must keep two tables consistent in one write,
and is called out above as an ADR candidate precisely because it is a real, reusable pattern
decision, not an accident of implementation.
