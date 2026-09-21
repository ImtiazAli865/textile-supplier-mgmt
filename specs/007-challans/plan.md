# Implementation Plan: Challans

**Branch**: `007-challans` | **Date**: 2026-09-21 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/007-challans/spec.md`

## Summary

Internal staff issue a delivery Challan against one open customer PO (006) — referencing one or
more of its still-undelivered lines, entering a delivered quantity per line, and printing it under
a chosen trade name (004). The Challan starts "Issued" and is fully editable; once the signed copy
comes back, staff record each line's actual accepted quantity (down from delivered if short) with
a mandatory disposition for any shortfall ("return to inventory" or "write off"), then "accept" it
— a single atomic action that rolls accepted quantities into the PO line's Delivered figure (006),
records the stock effect, and, only for customers who don't separately receive a Performa Invoice,
posts a ledger credit (005). Two architectural corrections, already agreed with the user before
this plan (see spec.md Assumptions), drive most of this plan's complexity: this feature is the
actual first writer of the `inventory_movements` table the master roadmap wrongly assumed 003b
already built, and it makes that table the sole source of truth for `products.quantity_on_hand`
going forward — which requires redefining (not editing) four of 003b's own Postgres functions so
purchases write movements too, instead of overwriting the column directly. See
[data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001-006)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed; no new dependencies (the printed Challan uses a server-rendered `@media print` route,
not a PDF library — research.md)
**Storage**: Supabase Postgres — new `challans`, `challan_lines`, `inventory_movements` tables;
new functions `create_challan`/`update_challan`/`void_challan`/`accept_challan`/
`recompute_product_quantity_on_hand`; a `CREATE OR REPLACE` (via a new migration, not an edit to
003b's file) of `record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase`/
`recompute_product_purchase_stats`; a one-time opening-movement backfill for existing traded
products; a third private Storage bucket (`challan-attachments`) — see
[data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`, same
as 001-006
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — adds one new module (`lib/challans/*`,
`app/actions/challans.ts`, `components/challans/*`, `app/(dashboard)/challans/**`, plus a
standalone `app/challans/[challanId]/print/page.tsx` outside the dashboard route group), no new
service or deployable
**Performance Goals**: Trivial at this feature's scale (a few hundred Challans/year); a Challan's
total is summed in TypeScript over its (handful of) already-fetched lines, matching 006's PO-total
precedent — no database aggregate or cached column
**Constraints**: No client-side Postgres access (service-role key only, server-side, unchanged); a
Challan header + its lines MUST be written/edited atomically (ADR-0002); `accept_challan` MUST post
its PO-line rollup, inventory movements, and conditional ledger credit atomically or not at all
(FR-009–FR-012); `challan_number` MUST be unique per trade name via a DB-level constraint (FR-004);
`challan_lines` MUST snapshot `product_id`/`uom`/`unit_price` at creation and never re-read them
live (research.md); `products.quantity_on_hand` MUST be written only by
`recompute_product_quantity_on_hand`, from `inventory_movements`, never directly, from this
migration forward (FR-011); an accepted Challan MUST become and remain fully read-only (FR-013)
**Scale/Scope**: Single internal business, a handful of customers/trade names, a few hundred
Challans/year, typically 1-10 lines per Challan, no multi-tenancy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001-006. Proceeding under the project's default guardrails
(smallest viable diff, no speculative abstraction, testable increments per user story).

**Decisions already surfaced to and resolved by the user before this plan, restated here for
Constitution Check completeness (full rationale in spec.md Assumptions and research.md)**:

1. **`inventory_movements` is created now, by this feature, as its real first writer** —
   correcting the master roadmap's (and ADR-0004's) claim that 003b already built it. ADR-0004
   itself (written during 005's plan) states *"first applied by 003b-traded-goods-purchasing's
   `inventory_movements`"* — that sentence is now known to be factually wrong; 003b's actual
   migration never created this table. This plan does not silently leave that contradiction on the
   record.
2. **`products.quantity_on_hand` becomes purely derived from `inventory_movements`**, requiring
   this feature to redefine (via a new migration, never editing `0003_traded_purchases.sql` in
   place) four of 003b's own functions so purchases write movements too, rather than continuing to
   overwrite the column directly. Without this, 003b's `recompute_product_purchase_stats` would
   silently reset a product's stock to a purchase-only figure the next time an unrelated purchase
   for that product was edited — a real corruption risk the user caught in spec review.

📋 **Architectural decision detected**: correcting ADR-0004's factual claim about
`inventory_movements`'s origin, and formally recording *this* feature's redefinition of 003b's
purchase-stats functions as the resolution to the `quantity_on_hand` conflict — Document reasoning
and tradeoffs? Run `/sp.adr inventory-movements-created-at-007-not-003b`. Not created
automatically; waiting for user consent per project policy. (This would supersede/amend ADR-0004's
factual claim, not contradict its underlying *principle* — "a shared table is created at its first
real writer" — which this feature's own table creation still follows exactly.)

**Architecturally significant decision surfaced by this feature, not yet resolved**: this is the
first feature in the roadmap that must *generate* a formatted printed business document (004 only
stores images; 006 only stores *uploaded* files) — a real, reusable pattern decision every later
document-generating feature (next: 008-Performa-Invoicing) will follow. This plan resolves it with
a server-rendered `@media print` route and no new PDF-generation dependency (research.md).

📋 **Architectural decision detected**: generating printed business documents via a dedicated
Server Component route + `@media print` CSS, no PDF-generation library — Document reasoning and
tradeoffs? Run `/sp.adr printed-documents-via-server-rendered-print-routes`. Not created
automatically; waiting for user consent per project policy.

**Design choices surfaced by this feature, not new-ADR-worthy decisions**: `create_challan`/
`accept_challan` follow ADR-0002's atomic-multi-table-write pattern exactly as every prior
feature's Postgres functions do — not a new architectural decision, just its sixth and seventh
applications. `update_challan`'s full delete-then-reinsert of its lines (rather than 006's per-line
upsert) is a deliberate, smaller-diff choice because a Challan has no per-line partial lock the way
a PO line does (research.md) — an extension of "match the pattern's purpose, not its shape,"
already established in this project's plans, not a competing pattern.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `challan_lines`' snapshot columns (`product_id`/`uom`/`unit_price`) are a
data-integrity necessity given 006's own delivered-quantity-gated lock, not a new architectural
pattern. The `challan-attachments` bucket and its 0-or-1-per-Challan shape (two nullable columns on
`challans`, not a child table) reuse ADR-0003 exactly, differing from 006's attachment table only
in cardinality (research.md) — not a new Storage pattern.*

## Project Structure

### Documentation (this feature)

```text
specs/007-challans/
├── plan.md               # This file
├── research.md           # Phase 0 output (/sp.plan command)
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
│   ├── layout.tsx                  # EXTENDED — add "Challans" nav link
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   ├── trade-names/                # EXISTING — unchanged
│   ├── customers/                  # EXISTING — unchanged
│   ├── customer-pos/
│   │   └── [poId]/
│   │       └── page.tsx            # EXTENDED — add a "Create Challan" link
│   │                                # (→ /challans/new?poId=<id>), and a list
│   │                                # of this PO's own Challans (status, link
│   │                                # to detail/print) — the only touch to 006
│   └── challans/
│       ├── page.tsx                # NEW — list view (PO/customer/status
│       │                            # filters, FR-016)
│       ├── loading.tsx             # NEW
│       ├── new/
│       │   └── page.tsx            # NEW — create form: PO picker (or
│       │                            # pre-selected via ?poId=), trade name
│       │                            # picker, dynamic undelivered-line
│       │                            # checklist with delivered-quantity
│       │                            # inputs
│       └── [challanId]/
│           ├── page.tsx            # NEW — detail view (header, lines incl.
│           │                        # accepted-qty/disposition editing while
│           │                        # Issued, signed-copy upload, void/accept
│           │                        # controls, link to print view)
│           └── loading.tsx         # NEW
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXISTING — unchanged
    ├── purchases.ts                 # EXISTING — unchanged
    ├── trade-names.ts                # EXISTING — unchanged
    ├── customers.ts                  # EXISTING — unchanged
    ├── customer-pos.ts               # EXISTING — unchanged
    └── challans.ts                   # NEW — createChallan/updateChallan/
                                       # voidChallan/acceptChallan/
                                       # uploadChallanSignedCopy

app/challans/
└── [challanId]/
    └── print/
        └── page.tsx                 # NEW — standalone printable view,
                                      # OUTSIDE the (dashboard) route group
                                      # (no nav chrome), own
                                      # getCurrentUser()/redirect("/login")
                                      # gate mirroring (dashboard)/layout.tsx,
                                      # @media print CSS (research.md)

lib/
├── supabase/                       # EXISTING — unchanged
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged (listActiveTradeNamesForSelect,
│                                    # getSignedAssetUrl reused as-is)
├── customers/                      # EXISTING — unchanged
├── customer-pos/
│   └── service.ts                  # EXISTING — unchanged (listCustomerPOs,
│                                    # getCustomerPO reused as-is by 007;
│                                    # customer_po_lines' RESTRICT-default FK
│                                    # from challan_lines needs no code change
│                                    # here)
└── challans/
    ├── schema.ts                    # NEW — challanInputSchema, challanLineSchema,
    │                                 # challanLineUpdateSchema, and all TS types
    ├── service.ts                    # NEW — createChallanRecord/updateChallanRecord
    │                                 # (RPC), voidChallanRecord/acceptChallanRecord
    │                                 # (RPC), listChallans, getChallan, getChallanForPrint,
    │                                 # getOpenPOLinesForChallan (derives `remaining` in
    │                                 # TypeScript over getCustomerPO's already-fetched lines)
    └── storage.ts                    # NEW — uploadChallanSignedCopy/getSignedChallanCopyUrl,
                                       # mirrors lib/trade-names/storage.ts exactly (ADR-0003),
                                       # third bucket (challan-attachments)

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged
├── customers/                      # EXISTING — unchanged
├── customer-pos/                   # EXISTING — unchanged
└── challans/
    ├── challan-form.tsx             # NEW — PO/trade-name pickers + dynamic
    │                                 # undelivered-line checklist with
    │                                 # delivered-quantity inputs (create); also
    │                                 # renders accepted-quantity/disposition
    │                                 # inputs when editing an Issued Challan
    ├── challan-line-row.tsx         # NEW — one line's fields; read-only
    │                                 # rendering once the Challan is accepted
    ├── challan-list.tsx             # NEW
    ├── challan-status-controls.tsx  # NEW — void/accept actions, surfacing
    │                                 # MissingShortfallDispositionError etc.
    │                                 # as inline per-line messages
    ├── challan-signed-copy-upload.tsx # NEW — upload control, works regardless
    │                                   # of Challan status
    └── challan-print-view.tsx        # NEW — the actual printable layout
                                       # (letterhead, line table, totals,
                                       # signature lines), rendered by
                                       # app/challans/[challanId]/print/page.tsx

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged (its file; its
│                                    # functions are CREATE OR REPLACEd by 0007)
├── 0004_trade_names.sql            # EXISTING — unchanged
├── 0005_customers.sql              # EXISTING — unchanged
├── 0006_customer_purchase_orders.sql # EXISTING — unchanged
└── 0007_challans.sql               # NEW — inventory_movements table + its
                                       # backfill; recompute_product_quantity_on_hand;
                                       # CREATE OR REPLACE of 003b's four purchase
                                       # functions; challans/challan_lines tables;
                                       # create_challan/update_challan/void_challan/
                                       # accept_challan; the challan-attachments
                                       # bucket; the unique-per-trade-name Challan-
                                       # number constraint (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001-006's approach).

**Structure Decision**: Single Next.js application (same shape as 001-006) — unchanged. This
feature adds one new module (`lib/challans/*`, `app/actions/challans.ts`,
`components/challans/*`, `app/(dashboard)/challans/**`), one standalone non-dashboard route
(`app/challans/[challanId]/print/**`, research.md), and one small extension to 006's PO detail
page (a "Create Challan" link and a list of that PO's own Challans) — no new route groups beyond
one sibling and one standalone print route, no new services.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. The two pieces of genuinely new complexity are both required directly by this
feature's own correctness requirements, not incidental implementation choices:

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| Redefining (via `CREATE OR REPLACE` in a new migration) four of 003b's already-shipped Postgres functions | FR-011 requires `quantity_on_hand` to always equal the sum of `inventory_movements`, but 003b's `recompute_product_purchase_stats` currently overwrites that column directly from purchase history on every purchase create/edit/delete — leaving it as-is would silently discard any Challan-driven stock change the next time an unrelated purchase was edited (the exact collision the user caught in spec review) | Leaving `quantity_on_hand` purchase-only and treating `inventory_movements` as audit-only (spec.md's rejected Option B) doesn't fix the bug — 003b's function still clobbers the column regardless of what movements record |
| A standalone route (`app/challans/[challanId]/print/`) outside the `(dashboard)` route group, duplicating a 3-line auth check | The printed Challan must render with no dashboard nav chrome for a clean print/PDF output; fighting the dashboard layout's chrome via `@media print` CSS overrides would be more fragile than a route that simply never renders it | Placing the print view inside `(dashboard)/challans/[challanId]/print/` and hiding the header via CSS — rejected as coupling a business document's print quality to the dashboard layout's markup staying print-hideable indefinitely, for a 3-line auth-check saving |
