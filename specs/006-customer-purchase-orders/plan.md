# Implementation Plan: Customer Purchase Orders

**Branch**: `006-customer-purchase-orders` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/006-customer-purchase-orders/spec.md`

## Summary

Internal staff need to record an incoming customer PO — header (customer, PO number, order date,
and a handful of optional fields) plus one or more line items — the way it actually arrives:
Habbitt's PDF with a short PO number, or Chaseup's Oracle iSupplier portal with a long numeric PO
number and no PDF at all. Each line resolves its customer-specific item code to a product via
005's `customer_product_mappings` when a mapping exists (pre-filling UOM/price), falling back to
manual product selection otherwise — but the line's own entered price is always what's stored
(FR-006). A PO header + its lines is a genuinely atomic multi-table write, so it follows
ADR-0002's Postgres-function pattern, extended with a per-line lock check (not delete-then-
reinsert) because FR-014's edit lock is per-line, not per-PO. This feature introduces
`delivered_quantity`/`invoiced_quantity` columns on the PO line ahead of their real writers
(007-Challans, 008-Performa-Invoicing), the same "shared column, first-declaring feature" logic
ADR-0004 already names for whole tables — this feature only ever reads/displays them at zero.
Attachments (PO PDFs) reuse 004's private-bucket + signed-URL Storage pattern (ADR-0003) as a
second, independent bucket. See [data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001-005)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed, no new dependencies needed for this feature
**Storage**: Supabase Postgres — new `customer_pos`, `customer_po_lines`,
`customer_po_attachments` tables; three new Postgres functions (`create_customer_po`,
`update_customer_po`, `set_customer_po_status`); a second private Supabase Storage bucket
(`customer-po-documents`), reusing 004's signed-URL pattern — see [data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`,
same as 001-005
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — adds one new module (`lib/customer-pos/*`,
`app/actions/customer-pos.ts`, `components/customer-pos/*`,
`app/(dashboard)/customer-pos/**`) and one small extension to the existing customers module
(`listActiveCustomersForSelect`, already flagged as deferred-to-006 in
[005's contracts](../005-customers/contracts/server-actions.md#listactivecustomersforselect-promise-id-string-displayname-string-)),
no new service or deployable
**Performance Goals**: Trivial at this feature's scale (a few hundred POs/year per
`specs/PRODUCT-OVERVIEW.md`'s Cross-Cutting Technical Requirements); a PO's total value is summed
in TypeScript over its (handful of) already-fetched lines, not a database aggregate — see
research.md
**Constraints**: No client-side Postgres access (service-role key only, server-side, unchanged); a
PO header + its lines MUST be written/edited atomically (ADR-0002); a PO number MUST be unique
per customer via a DB-level constraint, not just application validation (FR-004); a PO line's
`customer_item_code`/`description` are free text with no parsing or interpretation performed on
them (FR-008); the PO number column MUST have storage capacity of at least 30 characters with no
minimum-length or format check (FR-003); once a PO line carries nonzero `delivered_quantity` or
`invoiced_quantity` (written only by 007/008, never by this feature), that line MUST be
structurally rejected by `update_customer_po`, and a PO with any such line MUST be structurally
rejected by `set_customer_po_status` when cancelling (FR-014, FR-015); an attachment MUST NOT be
required to save a PO (FR-009)
**Scale/Scope**: Single internal business, a handful of customers (per 005), a few hundred POs/
year, typically 1-10 line items per PO, no multi-tenancy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001-005. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user
story).

**Decision reused, not newly made**: `create_customer_po`/`update_customer_po` follow ADR-0002's
atomic-multi-table-write pattern exactly as 001's `create_supplier` and 005's `create_customer`
already do — a PO header plus its line items must never be observed partially written. This is
ADR-0002's boundary applied to a fifth case, not a new architectural decision.

**Design choice surfaced by this feature, not a new ADR-worthy decision**: `update_customer_po`
cannot use 001/005's delete-then-reinsert shape for its child rows, because FR-014's edit lock
(FR-014/FR-015) is scoped **per line**, not per PO — some lines on an otherwise-editable PO may
already be locked by 007/008 once those exist. It instead does a per-line upsert with an explicit
lock check (research.md). This is an extension of ADR-0002's existing principle (push
correctness into the atomic function body, not the application layer) to a shape ADR-0002's
worked examples (001, 003b, 005) didn't need, not a competing pattern — no new ADR suggested.

**Forward-declared columns, matching ADR-0004's existing precedent**: `customer_po_lines` gets
`delivered_quantity`/`invoiced_quantity` columns now, for 007-Challans and 008-Performa-Invoicing
to write to when they ship, mirroring exactly how 005 forward-declared `ledger_entries` for those
same two future features (see [ADR-0004](../../history/adr/0004-shared-tables-created-at-first-writer.md)).
This is the second and third applications of that already-ratified pattern (whole shared tables in
005; individual forward-declared columns on a feature-owned table here) — no new ADR suggested,
since ADR-0004's stated principle already covers "a shared aggregate introduced ahead of its real
writer."

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `customer_po_attachments` is populated by a plain `supabase-js` insert per
uploaded file (single table, no derived state elsewhere depends on it), so — like
`customer_product_mappings` in 005 — it needs no Postgres function. `resolveCustomerItemCode` is a
read-only helper with no write path, so it introduces no atomicity concern.*

## Project Structure

### Documentation (this feature)

```text
specs/006-customer-purchase-orders/
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
│   ├── layout.tsx                  # EXTENDED — add "Customer POs" nav link
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   ├── trade-names/                # EXISTING — unchanged
│   ├── customers/                  # EXISTING — unchanged
│   └── customer-pos/
│       ├── page.tsx                # NEW — list view (customer + status filters, FR-012)
│       ├── loading.tsx             # NEW
│       ├── new/
│       │   └── page.tsx            # NEW — create form (header + dynamic line items +
│       │                            # attachment upload)
│       └── [poId]/
│           ├── page.tsx            # NEW — detail view (header, lines incl. resolved
│           │                        # product + delivered/invoiced placeholders,
│           │                        # attachments, cancel/reactivate control)
│           ├── loading.tsx         # NEW
│           └── edit/
│               └── page.tsx        # NEW — edit form (locked lines render read-only —
│                                    # inert today since 007/008 don't exist yet, FR-014)
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXISTING — unchanged
    ├── purchases.ts                 # EXISTING — unchanged
    ├── trade-names.ts                # EXISTING — unchanged
    ├── customers.ts                  # EXISTING — unchanged
    └── customer-pos.ts               # NEW — createCustomerPO/updateCustomerPO/
                                       # cancelCustomerPO/reactivateCustomerPO/
                                       # uploadCustomerPOAttachment

lib/
├── supabase/                       # EXISTING — unchanged
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged (listActiveProductsForSelect
│                                    # already added by 005, reused as-is)
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged (listActiveTradeNamesForSelect
│                                    # already added by 005, reused as-is)
├── customers/
│   └── service.ts                  # EXTENDED — adds listActiveCustomersForSelect()
│                                    # (thin wrapper over listCustomers({status:"active"}),
│                                    # deferred here from 005's own contracts.md)
└── customer-pos/
    ├── schema.ts                    # NEW — customerPOInputSchema, poLineSchema, and all
    │                                 # TS types
    ├── service.ts                    # NEW — createCustomerPORecord/updateCustomerPORecord
    │                                 # (RPC), setCustomerPOStatusRecord (RPC),
    │                                 # listCustomerPOs, getCustomerPO (joins lines +
    │                                 # attachments, sums line totals in TS)
    ├── item-code-resolution.ts       # NEW — resolveCustomerItemCode(customerId, code):
    │                                 # read-only lookup against 005's
    │                                 # customer_product_mappings, no write path
    └── storage.ts                    # NEW — uploadCustomerPOAttachment/
                                       # getSignedAttachmentUrl, mirrors
                                       # lib/trade-names/storage.ts exactly (ADR-0003),
                                       # second bucket (customer-po-documents)

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged
├── customers/                      # EXISTING — unchanged
└── customer-pos/
    ├── customer-po-form.tsx         # NEW — header fields + dynamic line-item rows (each
    │                                 # with item-code lookup → auto-fill product/UOM/price,
    │                                 # manual product picker fallback) + attachment upload
    ├── customer-po-line-row.tsx     # NEW — one line item's fields; renders read-only once
    │                                 # locked (delivered/invoiced > 0 — inert today)
    ├── customer-po-list.tsx         # NEW
    ├── customer-po-status-control.tsx # NEW — cancel/reactivate, same shape as
    │                                   # suppliers'/trade-names'/customers' status controls
    └── attachment-list.tsx           # NEW — displays attached files, resolves each to a
                                       # short-lived signed URL for viewing/downloading

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged
├── 0004_trade_names.sql            # EXISTING — unchanged
├── 0005_customers.sql              # EXISTING — unchanged
└── 0006_customer_purchase_orders.sql # NEW — three new tables, three Postgres functions,
                                       # the second Storage bucket, and the unique-per-
                                       # customer PO-number constraint (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001-005's approach).

**Structure Decision**: Single Next.js application (same shape as 001-005) — unchanged. This
feature adds one new module (`lib/customer-pos/*`, `app/actions/customer-pos.ts`,
`components/customer-pos/*`, `app/(dashboard)/customer-pos/**`) and extends one existing module
(`lib/customers/service.ts`) with one small exported function, exactly the deferred addition 005's
own contracts.md already flagged — no new route groups beyond one sibling, no new services.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. The one piece of genuinely new complexity — `update_customer_po`'s per-line
upsert-with-lock-check instead of 001/005's delete-then-reinsert shape — is not a violation of
anything: it is required directly by FR-014's per-line (not per-PO) lock, and is called out above
as an extension of ADR-0002's existing principle rather than treated as an incidental
implementation detail.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| `update_customer_po` uses per-line upsert instead of delete-then-reinsert | FR-014 locks individual lines, not the whole PO, once 007/008 write nonzero delivered/invoiced quantity to them | Delete-then-reinsert (001/005's shape) would delete every line on every edit, including any already-locked one — structurally incapable of honoring a per-line lock |
