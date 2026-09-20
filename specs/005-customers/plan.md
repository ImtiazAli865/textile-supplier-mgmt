# Implementation Plan: Customers

**Branch**: `005-customers` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/005-customers/spec.md`

## Summary

Internal staff need real customer records — at minimum Habbitt, Chaseup, ChaseValue, and Kifayat
— to replace what is currently only implied by the master spec, so every later feature (POs,
Challans, Performa Invoicing, the Customer Ledger) has something real to reference. A customer
create/update is a genuinely multi-table atomic write (the customer row, its contacts, its
ship-to addresses, its trade-name hints, and — only on create, only if nonzero — an opening
ledger balance), so it follows the same Postgres-function pattern ADR-0002 already established
(mirroring 001's `create_supplier`/`update_supplier` even more closely than 003b did). This
feature also introduces the shared `ledger_entries` table as its first writer, per
`specs/PRODUCT-OVERVIEW.md`'s already-agreed "Shared-table decisions" — not a new decision this
plan is making, but the first feature to actually implement it. The customer-product mapping
(customer-specific item codes/selling units, deferred from 003) is its own standalone,
single-table CRUD with no RPC needed, since a mapping row has no other table to stay in sync
with. See [data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001-004)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed, no new dependencies needed for this feature
**Storage**: Supabase Postgres — new `customers`, `customer_contacts`,
`customer_ship_to_addresses`, `customer_trade_names`, `customer_product_mappings` tables, plus the
shared `ledger_entries` table (this feature's first writer); two new Postgres functions
(`create_customer`, `update_customer`) — see [data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`,
same as 001-004
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — adds one new module (`lib/customers/*`,
`app/actions/customers.ts`, `components/customers/*`, `app/(dashboard)/customers/**`) and one
small extension each to the existing products and trade-names modules (a generic
active-products picker; an active-trade-names picker), no new service or deployable
**Performance Goals**: Trivial at this feature's scale (4-10 customers today); a customer's
computed ledger balance is a live `SUM` over its `ledger_entries` rows, not cached — per
`specs/PRODUCT-OVERVIEW.md`'s Cross-Cutting Technical Requirements, this project designs for
clarity/correctness over scale, and "a few thousand ledger rows per customer over years" is
trivial for an indexed `SUM`
**Constraints**: No client-side Postgres access (service-role key only, server-side, unchanged);
a customer create/update and its child rows (contacts, ship-to addresses, trade-name hints) MUST
be atomic; an opening balance, once posted as a `ledger_entries` row, is never updated or deleted
by this feature (FR-013) — `ledger_entries` has no update/delete path anywhere in this feature's
code, by design; a customer's own item code MUST resolve to exactly one product (FR-016),
enforced as a DB-level partial unique constraint, not just application validation; a customer's
"usable trade names" MUST NOT gate or restrict trade-name selection anywhere (FR-008) — this
feature only stores the hint list, no later feature may add a foreign-key-style restriction on
top of it
**Scale/Scope**: Single internal business, 4-10 customers today (no hard cap), a few thousand
ledger rows per customer over years, no multi-tenancy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001-004. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user
story).

**Decision reused, not newly made**: `create_customer`/`update_customer` follow ADR-0002's
atomic-multi-table-write-via-Postgres-function pattern exactly as 001's
`create_supplier`/`update_supplier` already do — a customer row plus its contacts, ship-to
addresses, and trade-name hints (and, on create only, a conditional opening-balance ledger entry)
must never be observed partially written. This is not a new architectural decision; it is
ADR-0002's boundary applied to a fourth case. No new ADR suggestion for this.

**Architecturally significant decision surfaced by this feature**: `ledger_entries` — a shared,
insert-only table written to by this feature now and by Challans (007) and Performa Invoicing
(008) later — is created here, ahead of its own presentation feature (009-customer-ledger),
because a customer's opening balance must be postable at customer-creation time. This exact
approach (pull a shared table forward to its first real writer, rather than to its presentation
feature) was already agreed at the master-spec level on 2026-09-20
(`specs/PRODUCT-OVERVIEW.md` § "Shared-table decisions", covering both `ledger_entries` and
003b's `inventory_movements`) and is now formally recorded as
[ADR-0004](../../history/adr/0004-shared-tables-created-at-first-writer.md) — this is the first
feature to actually implement it.

📋 **Architectural decision detected**: shared, insert-only ledger/movement tables are created at
their first real writer, not their presentation feature — a project-wide pattern now used twice
(`inventory_movements` at 003b, `ledger_entries` at this feature) and expected again for any
future shared aggregate table. Documented as
[ADR-0004](../../history/adr/0004-shared-tables-created-at-first-writer.md) with the user's
explicit consent (`/sp.adr shared-tables-created-at-first-writer`).

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `customer_product_mappings` is a single, standalone table with no other
table's derived state depending on it, so — like `trade_names` in 004 — it uses plain
`supabase-js` CRUD, not a Postgres function. `ledger_entries` gains no update or delete path
anywhere in this feature's Server Actions or service layer, keeping FR-013's immutability
guarantee structural, not just a UI convention.*

## Project Structure

### Documentation (this feature)

```text
specs/005-customers/
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
│   ├── layout.tsx                  # EXTENDED — add "Customers" nav link
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/
│   │   └── [productId]/
│   │       └── page.tsx            # EXTENDED — shows customer-item-code/selling-UOM mappings
│   │                                # for this product (spec US2 Acceptance Scenario 1)
│   ├── purchases/                  # EXISTING — unchanged
│   ├── trade-names/                # EXISTING — unchanged
│   └── customers/
│       ├── page.tsx                # NEW — list view
│       ├── loading.tsx             # NEW
│       ├── new/
│       │   └── page.tsx            # NEW — create form (incl. opening balance)
│       └── [customerId]/
│           ├── page.tsx            # NEW — detail view (fields, computed ledger balance,
│           │                        # product mappings section)
│           ├── loading.tsx         # NEW
│           └── edit/
│               └── page.tsx        # NEW — edit form (no opening-balance field — FR-013)
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXTENDED — one new export (see lib/products/service.ts)
    ├── purchases.ts                 # EXISTING — unchanged
    ├── trade-names.ts                # EXTENDED — one new export (see lib/trade-names/service.ts)
    └── customers.ts                  # NEW — createCustomer/updateCustomer/setCustomerStatus/
                                       # addProductMapping/updateProductMapping/removeProductMapping

lib/
├── supabase/                       # EXISTING — unchanged
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/
│   └── service.ts                  # EXTENDED — adds listActiveProductsForSelect() (thin
│                                    # wrapper over listProducts({status:"active"}), no type
│                                    # filter — mirrors 003b's listActiveTradedProductsForSelect)
├── purchases/                      # EXISTING — unchanged
├── trade-names/
│   └── service.ts                  # EXTENDED — adds listActiveTradeNamesForSelect() (same
│                                    # thin-wrapper pattern)
└── customers/
    ├── schema.ts                    # NEW — customerInputSchema, contactSchema (reused shape),
    │                                 # shipToAddressSchema, openingBalanceSchema,
    │                                 # productMappingInputSchema, and all TS types
    ├── service.ts                    # NEW — createCustomerRecord/updateCustomerRecord (RPC),
    │                                 # setCustomerStatusRecord, listCustomers, getCustomer
    │                                 # (joins contacts/ship-to/trade-name hints, computes ledger
    │                                 # balance via lib/customers/ledger.ts)
    ├── ledger.ts                     # NEW — getCustomerLedgerBalance(customerId): read-only,
    │                                 # sums ledger_entries by type; no write function here —
    │                                 # 005's only write is the opening-balance insert inside
    │                                 # create_customer itself
    └── product-mappings.ts           # NEW — addProductMapping/updateProductMapping/
                                       # removeProductMapping (plain supabase-js, no RPC — see
                                       # research.md), listCustomerProductMappings(customerId),
                                       # listProductCustomerMappings(productId)

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged
└── customers/
    ├── customer-form.tsx            # NEW — display/legal name, billing address, ship-to
    │                                 # addresses (dynamic list), contacts (dynamic list),
    │                                 # NTN/STRN, payment terms (min/max day range), Issues-Performa-Invoice
    │                                 # checkbox, trade-name-hint multi-select; opening-balance
    │                                 # fields rendered only in create mode (FR-013)
    ├── customer-list.tsx            # NEW
    ├── deactivate-reactivate-control.tsx # NEW — same shape as suppliers'/trade-names' controls
    └── product-mapping-form.tsx      # NEW — add/edit a single customer-product mapping
                                       # (product picker + item code + selling UOM + default
                                       # price), used on both
                                       # the customer detail page and the product detail page

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged
├── 0004_trade_names.sql            # EXISTING — unchanged
└── 0005_customers.sql              # NEW — all six new tables, the two Postgres functions, and
                                     # the partial unique index enforcing FR-016 (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001-004's approach).

**Structure Decision**: Single Next.js application (same shape as 001-004) — unchanged. This
feature adds one new module (`lib/customers/*`, `app/actions/customers.ts`,
`components/customers/*`, `app/(dashboard)/customers/**`) and extends two existing modules
(`lib/products/service.ts`, `lib/trade-names/service.ts`) with one small exported function each,
plus one existing page (`app/(dashboard)/products/[productId]/page.tsx`) to surface mappings from
the product side, per the spec's own acceptance scenario — no new route groups beyond one
sibling, no new services.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. The two pieces of added complexity — a fourth Postgres-function pair
(`create_customer`/`update_customer`) and a new shared table (`ledger_entries`) — are not
violations of anything: the first is ADR-0002's existing pattern applied to a fourth case, and
the second is the master spec's own already-agreed shared-table strategy, being implemented for
the first time. Both are called out above (the ADR candidate for the latter) rather than treated
as incidental implementation detail.
