# Implementation Plan: Product Catalog

**Branch**: `003-product-catalog` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/003-product-catalog/spec.md`

## Summary

Internal staff need a foundation catalog of products — traded (bought and resold as-is) or
manufactured (produced in-house from raw material) — that every later feature (customers, POs,
challans, invoicing, production batches, inventory, reports) will reference. Built as a direct
extension of the existing Next.js app from 001/002: a new `products` Postgres table with no
foreign-key dependency on any other table (it is upstream of everything), Server Components
read catalog data via `lib/products/service.ts` using the shared Supabase admin client, Server
Actions handle create/update/status-change with server-side re-validation of type-specific
required fields and the type-immutability rule, and the existing Supabase Auth session gate
covers the new routes automatically. See [data-model.md](./data-model.md) for the schema.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001/002)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed, no new dependencies needed for this feature
**Storage**: Supabase Postgres — new `products` table, with no foreign keys to existing tables
(this feature is upstream of suppliers/purchases in the dependency graph, not downstream — see
[data-model.md](./data-model.md))
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`,
same as 001/002
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — extends 001/002, no new service or deployable
**Performance Goals**: Catalog search/filter renders in <2s at 500 products (SC-003) — a single
indexed SQL query with `ILIKE`/`WHERE` filters, same pattern as suppliers/purchases
**Constraints**: No client-side Postgres access — all reads/writes go through the server using
the Supabase service-role key, matching 001/002; type-specific required fields (yield ratio +
labour rate for manufactured; nothing extra for traded) and the type-immutable-after-creation
rule (FR-002, FR-004) are enforced server-side regardless of client state; weighted-average
purchase cost for traded products is read-only in this feature — no write path is exposed at
all, since only a future purchasing feature computes it
**Scale/Scope**: Single internal business, up to ~500 product records for now, no
multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001 and 002. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user
story) and reusing 001/002's Supabase auth/data-access conventions rather than introducing a
second pattern.

No architecturally significant decision is introduced by this feature itself. The one scope
decision made during spec drafting — deferring customer-specific item codes and per-customer
selling UOM out of this feature's data model, since they require the not-yet-built Customer
entity (feature 005) — is a scope boundary, not a structural/cross-cutting decision, so it does
not meet the three-part ADR test (impact/alternatives/cross-cutting) and is not proposed as an
ADR; it is fully described in spec.md's Assumptions and Edge Cases instead.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no new
violations introduced. The design adds one table to the existing single Next.js app — no
additional services, no new indirection layers, no foreign keys into or out of existing
tables.*

## Project Structure

### Documentation (this feature)

```text
specs/003-product-catalog/
├── plan.md              # This file
├── research.md          # Phase 0 output (/sp.plan command)
├── data-model.md        # Phase 1 output (/sp.plan command)
├── quickstart.md        # Phase 1 output (/sp.plan command)
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md              # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (auth)/
│   └── login/                      # EXISTING — unchanged
├── (dashboard)/
│   ├── layout.tsx                  # EXISTING — unchanged
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   └── products/
│       ├── page.tsx                # List + search/type/status filters (Server Component)
│       ├── loading.tsx
│       ├── new/
│       │   └── page.tsx            # Create form
│       └── [productId]/
│           ├── page.tsx            # Detail view (type-conditional fields)
│           ├── loading.tsx
│           └── edit/
│               └── page.tsx        # Edit form (type field disabled/locked)
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── purchases.ts                 # EXISTING — unchanged
    └── products.ts                  # Server Actions: createProduct, updateProduct,
                                      # deactivateProduct, reactivateProduct

lib/
├── supabase/                       # EXISTING — server.ts (auth), admin.ts (data access) — reused, not reimplemented
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
└── products/
    ├── schema.ts                   # Zod schemas: ProductInput, Product, ProductListItem,
    │                                # ProductType ("traded"|"manufactured"), ProductStatus
    └── service.ts                  # Postgres access: createProductRecord, updateProductRecord,
                                      # setProductStatus, getProduct, listProducts (search/filter)

components/
├── suppliers/                      # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
└── products/
    ├── product-form.tsx            # Shared create/edit form — renders manufactured-only or
    │                                # traded-only fields based on selected/locked type
    ├── product-list.tsx            # Client component: table + status badges
    ├── product-filters.tsx         # Search box + type filter + status filter controls
    └── product-status-control.tsx  # Deactivate/reactivate button

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
└── 0002_products.sql               # NEW — products table + RLS (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either
(unchanged from 001/002's approach).

**Structure Decision**: Single Next.js application (same shape as 001/002) — unchanged. This
feature adds one new route group (`products/`), one new Server Actions file, one new
`lib/products/` module, one new `components/products/` directory, and one new migration file —
no new projects, services, or architectural layers.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. No additional projects, services, or indirection layers beyond the single
Next.js app were introduced; the `products` table has zero foreign keys in either direction for
this feature, making it the simplest schema addition so far.
