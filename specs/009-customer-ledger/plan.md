# Implementation Plan: Customer Ledger

**Branch**: `009-customer-ledger` | **Date**: 2026-09-23 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/009-customer-ledger/spec.md`

## Summary

Presents each customer's `ledger_entries` (opening balance from 005, Challan-acceptance credits
from 007, Performa Invoice credits from 008) as a running-balance view matching the manual Excel
ledger's own Date / Invoice #/Description / PO Number / Debit / Credit / Balance layout, and adds
the one missing piece none of those features write: actual customer payments. A new
`customer_payments` table records cheque date/amount/number/bank, posting a ledger debit
atomically (`record_customer_payment`); a bounced cheque's status change posts a new, separately
visible reversing credit dated to today, never editing the original entry
(`update_customer_payment_status`) — the same shape 007/008 already use for their own atomic
multi-effect writes (ADR-0002). Ageing/overdue classification uses a FIFO (oldest-credit-first)
allocation over each customer's chronological ledger, since this project's ledger is a running-
balance model with no per-invoice payment matching (research.md — a mechanism-level decision the
spec deliberately left at business-language altitude). PDF export reuses ADR-0006's print-route
pattern a third time; Excel export is CSV served by this project's first Route Handler, no new
dependency. Every architecturally significant business decision (new table vs. columns on the
shared ledger, reversal dating, multi-PO row rendering, payment-status mutability as a deliberate
exception) was already settled with the user before the spec was written (see spec.md Assumptions
and `history/prompts/009-customer-ledger/0001-align-customer-ledger-data-model.misc.prompt.md`).
See [data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001-008)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed; no new dependencies (PDF export reuses ADR-0006's server-rendered `@media print`
route; Excel export is CSV text served by a Route Handler — research.md)
**Storage**: Supabase Postgres — new `customer_payments` table; two new functions
`record_customer_payment` and `update_customer_payment_status`; no new shared/forward-declared
table (`ledger_entries` and `customers` already exist, 005) — see
[data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`, same
as 001-008
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — adds two new modules (`lib/customer-payments/*`,
`lib/customer-ledger/*`), one new dashboard route tree
(`app/(dashboard)/customers/[customerId]/ledger/**`,
`app/(dashboard)/customers/[customerId]/payments/new/**`, `app/(dashboard)/customer-ledger/**`),
two standalone print routes (ADR-0006), and this project's first two Route Handlers (CSV export);
no changes to 005/007/008's existing routes or services beyond reusing their already-exported
read functions
**Performance Goals**: Trivial at this feature's scale (4-10 customers, a few thousand ledger
rows/customer over years); running balance, FIFO ageing, and CSV rendering are all computed in
TypeScript over one customer's already-fetched entries — no database aggregate or cached column,
matching 006/007/008's own total-computation precedent
**Constraints**: No client-side Postgres access (service-role key only, server-side, unchanged); a
payment's recording and its ledger debit MUST be written atomically in one Postgres function
(ADR-0002), likewise a bounce's status change and its reversal credit; `customer_payments` MUST
have no update path beyond its one status-transition function, itself allowed exactly once
(`received → cleared` or `received → bounced`, both terminal); no ledger entry or payment field
may ever be edited or deleted through any code path in this feature (FR-008); this feature MUST
NOT re-post or duplicate a ledger credit that 007 or 008 already posted (FR-015)
**Scale/Scope**: 4-10 customers, a handful of payments/month across all of them, a few thousand
ledger rows/customer over years, no multi-tenancy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001-008. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user
story).

**This feature introduces no new architectural pattern beyond one already-anticipated
extension**, restated here for Constitution Check completeness (full rationale in research.md):

1. **Atomic multi-effect posting** (ADR-0002) — `record_customer_payment` and
   `update_customer_payment_status` each write their table row and (conditionally, for the
   latter) a ledger entry in one Postgres function call, the same boundary
   `create_performa_invoice` and `accept_challan` already establish. Not a new application of the
   pattern in kind, only in feature.
2. **Printed business documents/reports via server-rendered `@media print` routes, no PDF
   library** (ADR-0006) — this feature's per-customer and all-customers PDF exports are the third
   application of this ADR (after Challans and Performa Invoices), exactly as that ADR's own text
   anticipates ("Documents how this project produces a formatted, printable/exportable business
   document... not a decision specific to Challans alone"). No new ADR needed.
3. **Shared tables created at their first real writer** (ADR-0004) — not invoked in the
   forward-declared sense that motivated ADR-0004 originally; `ledger_entries` already exists
   (005) and this feature is only ever an additional writer into it, alongside 007 and 008, never
   a first writer of a forward-declared one. `customer_payments` itself is a wholly new,
   feature-owned table, not a shared one.

4. **Tabular data export as CSV via a Route Handler** (ADR-0007, new) — this feature's CSV export
   is this project's first Route Handler and its first tabular-data export of any kind.
   Introduces no new dependency and follows a standard Next.js primitive, so it did not fail any
   existing gate on its own — but it is a reusable pattern (`specs/PRODUCT-OVERVIEW.md`'s later
   012/013 both mention export) a future feature would likely reuse rather than re-decide, so it
   was written up and accepted as [ADR-0007](../../history/adr/0007-csv-export-via-route-handler.md)
   with the user's consent rather than left as an undocumented one-off choice.

**One genuinely new business-logic mechanism, also surfaced for visibility**: ageing/overdue
classification uses FIFO (oldest-credit-first) allocation over a customer's chronological ledger
(research.md) — a real algorithmic decision made at the plan stage because the spec intentionally
stayed at business-language altitude ("within/beyond expected range") without prescribing the
mechanism. This is feature-scoped business logic, not a cross-cutting architectural pattern (no
other feature reads or depends on this allocation), so it does not meet the ADR bar the way the
CSV-export decision above does — but it is called out here, and in research.md, so the user can
review the mechanism specifically rather than discover it only in the diff.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `customer_payments` having a mutable `status` column (unlike every other
header table in this project) is a data-integrity necessity given FR-007's one-time transition
requirement, not a new schema convention — research.md documents it as a deliberate, narrow
exception rather than a precedent for other tables to follow.*

## Project Structure

### Documentation (this feature)

```text
specs/009-customer-ledger/
├── plan.md               # This file
├── research.md           # Phase 0 output (/sp.plan command)
├── data-model.md          # Phase 1 output (/sp.plan command)
├── quickstart.md          # Phase 1 output (/sp.plan command)
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md               # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                  # EXTENDED — add "Ledger" nav link (all-customers summary)
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   ├── trade-names/                # EXISTING — unchanged
│   ├── customer-pos/               # EXISTING — unchanged
│   ├── challans/                   # EXISTING — unchanged
│   ├── performa-invoices/          # EXISTING — unchanged
│   ├── customer-ledger/
│   │   ├── page.tsx                # NEW — all-customers summary list (balance, overdue) — FR-011
│   │   └── loading.tsx             # NEW
│   └── customers/
│       ├── page.tsx                # EXISTING — unchanged
│       ├── new/                    # EXISTING — unchanged
│       └── [customerId]/
│           ├── page.tsx            # EXTENDED — add a "View full ledger" link and a "Record
│           │                        # Payment" link alongside the existing running-balance
│           │                        # display (005); no change to its own data fetch
│           ├── edit/                # EXISTING — unchanged
│           ├── ledger/
│           │   ├── page.tsx        # NEW — full running-balance ledger view (FR-001-003, 010),
│           │   │                    # ageing breakdown (FR-009), Mark Cleared/Bounced actions
│           │   │                    # inline on payment rows (FR-007), date filter, CSV/PDF
│           │   │                    # export links
│           │   └── loading.tsx     # NEW
│           └── payments/
│               └── new/
│                   └── page.tsx    # NEW — record-payment form, customer pre-selected via route
│                                    # param (FR-004-006)
└── actions/
    ├── ...                          # EXISTING — unchanged (suppliers.ts, products.ts,
    │                                 # purchases.ts, trade-names.ts, customers.ts,
    │                                 # customer-pos.ts, challans.ts, performa-invoices.ts)
    └── customer-payments.ts         # NEW — recordCustomerPayment/updateCustomerPaymentStatus

app/customers/[customerId]/
└── ledger/
    └── print/
        └── page.tsx                 # NEW — standalone printable per-customer ledger, OUTSIDE
                                      # the (dashboard) route group, own
                                      # getCurrentUser()/redirect("/login") gate (ADR-0006, third
                                      # application)

app/customer-ledger/
└── print/
    └── page.tsx                     # NEW — standalone printable all-customers summary
                                      # (ADR-0006)

app/api/customer-ledger/
├── route.ts                         # NEW — GET, all-customers summary CSV (this project's
│                                      # first Route Handler)
└── [customerId]/
    └── route.ts                     # NEW — GET, one customer's ledger CSV (?from=&to=)

lib/
├── supabase/                       # EXISTING — unchanged
├── auth/                           # EXISTING — unchanged
├── customers/
│   ├── service.ts                  # EXISTING — unchanged (getCustomer, listCustomers,
│   │                                 # listActiveCustomersForSelect reused as-is)
│   └── ledger.ts                    # EXISTING — unchanged (getCustomerLedgerBalance reused
│                                     # as-is by the existing customer detail page)
├── customer-pos/                   # EXISTING — unchanged
├── challans/                       # EXISTING — unchanged
├── performa-invoices/               # EXISTING — unchanged
├── customer-payments/
│   ├── schema.ts                    # NEW — customerPaymentInputSchema,
│   │                                 # updateCustomerPaymentStatusInputSchema, TS types
│   └── service.ts                    # NEW — recordCustomerPaymentRecord (RPC),
│                                      # updateCustomerPaymentStatusRecord (RPC)
└── customer-ledger/
    ├── service.ts                    # NEW — getCustomerLedger, listCustomerLedgerSummaries,
    │                                  # getCustomerLedgerForPrint,
    │                                  # getCustomerLedgerSummaryForPrint (contracts/server-actions.md)
    ├── ageing.ts                     # NEW — getCustomerAgeing (FIFO allocation, research.md)
    └── csv.ts                        # NEW — renderLedgerCsv/renderSummaryCsv, consumed by the
                                       # two Route Handlers above

components/
├── ...                              # EXISTING — unchanged (suppliers, products, purchases,
│                                     # trade-names, customers, customer-pos, challans,
│                                     # performa-invoices)
├── customer-payments/
│   ├── customer-payment-form.tsx     # NEW — date/amount/cheque number/bank + optional
│   │                                  # invoice-or-PO reference picker
│   └── payment-status-actions.tsx    # NEW — "Mark Cleared"/"Mark Bounced" buttons, rendered
│                                      # inline on a payment-sourced ledger row when status is
│                                      # still Received
└── customer-ledger/
    ├── ledger-table.tsx               # NEW — Date/Description/PO Number/Debit/Credit/Balance
    │                                   # table, renders payment-status-actions.tsx on payment
    │                                   # rows
    ├── ledger-date-filter.tsx         # NEW — date-range filter controls (FR-010)
    ├── ageing-summary.tsx             # NEW — within/beyond breakdown + overdue total (FR-009)
    ├── ledger-summary-list.tsx        # NEW — all-customers summary table (FR-011)
    ├── ledger-print-view.tsx          # NEW — printable per-customer layout, rendered by
    │                                   # app/customers/[customerId]/ledger/print/page.tsx
    └── ledger-summary-print-view.tsx  # NEW — printable all-customers layout, rendered by
                                        # app/customer-ledger/print/page.tsx

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged
├── 0004_trade_names.sql            # EXISTING — unchanged
├── 0005_customers.sql              # EXISTING — unchanged (ledger_entries already exists)
├── 0006_customer_purchase_orders.sql # EXISTING — unchanged
├── 0007_challans.sql               # EXISTING — unchanged
├── 0008_performa_invoicing.sql     # EXISTING — unchanged
└── 0009_customer_ledger.sql        # NEW — customer_payments table; record_customer_payment
                                       # and update_customer_payment_status functions (see
                                       # data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001-008's approach).

**Structure Decision**: Single Next.js application (same shape as 001-008) — unchanged. This
feature adds two new modules (`lib/customer-payments/*`, `lib/customer-ledger/*`), one new
dashboard route tree (`customer-ledger/`, `customers/[customerId]/ledger/`,
`customers/[customerId]/payments/new/`), two standalone print routes (ADR-0006), and this
project's first two Route Handlers (`app/api/customer-ledger/**`, CSV export, research.md) — no
changes to 005/007/008's existing routes or services beyond reusing their already-exported read
functions, and one small extension to the existing customer detail page (005) to link into the
new full ledger view.

## Complexity Tracking

> **Fill ONLY if Constitution Check has violations that must be justified**

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. This feature introduces no genuinely new architectural complexity beyond what
001-008 already established — it composes ADR-0002 and ADR-0006 exactly as each already
anticipates. The two genuinely new mechanisms (CSV-via-Route-Handler, FIFO ageing) are called out
above for visibility, not because either violates an existing gate.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| — | — | — |
