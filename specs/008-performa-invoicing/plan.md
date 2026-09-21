# Implementation Plan: Performa Invoicing

**Branch**: `008-performa-invoicing` | **Date**: 2026-09-22 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/008-performa-invoicing/spec.md`

## Summary

A staff member picks a customer flagged "Issues Performa Invoice" (today, only Habbitt), selects
one or more of that customer's open POs, and on each, one or more lines that have delivered
quantity not yet invoiced. Entering an amount per line (defaulting to the full remaining
invoiceable amount), a tax rate (defaulting to 18%), and a trade name, staff generate a Performa
Invoice: a single atomic action that auto-numbers the invoice from the trade name's plain
sequential counter, snapshots each line's product/UOM/price from its PO line, increases each PO
line's cumulative Invoiced figure, computes gross/tax/net totals, posts exactly one ledger credit
for the net total, and produces a printed document with amount in words — all in one Postgres
function call, with no separate confirmation step and no edit/void path afterward. This feature
never acts for customers not flagged "Issues Performa Invoice" = Yes, since their ledger credit
already posted at Challan acceptance (007). Every architectural question this plan would otherwise
need to resolve fresh was already settled with the user before the spec was written (see spec.md
Assumptions and `history/prompts/008-performa-invoicing/0001-align-performa-invoicing-data-model.misc.prompt.md`):
invoice lines reference PO lines (not Challan lines), an invoice's PO list is derived rather than
stored, and the printed-document approach reuses ADR-0006 exactly as that ADR itself anticipated.
See [data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001-007)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed; no new dependencies (the printed invoice reuses ADR-0006's server-rendered `@media
print` route; amount-in-words is a small local utility, not a package — research.md)
**Storage**: Supabase Postgres — new `performa_invoices`, `performa_invoice_lines`,
`performa_invoice_attachments` tables; one new function `create_performa_invoice` (no
update/void/accept counterparts — research.md); one new `ALTER TABLE` on 006's
`customer_po_lines` adding a `check (invoiced_quantity <= delivered_quantity)` constraint
(FR-015's database-level backstop); a fourth private Storage bucket
(`performa-invoice-attachments`) — see [data-model.md](./data-model.md)
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`, same
as 001-007
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — adds one new module (`lib/performa-invoices/*`,
`app/actions/performa-invoices.ts`, `components/performa-invoices/*`,
`app/(dashboard)/performa-invoices/**`, plus a standalone
`app/performa-invoices/[invoiceId]/print/page.tsx` outside the dashboard route group) and one
small additive export in `lib/customers/service.ts`; no changes to 006's or 007's existing routes
**Performance Goals**: Trivial at this feature's scale (Habbitt-only today, a few dozen
invoices/year at most); an invoice's totals are summed in TypeScript over its (handful of)
already-fetched lines, matching 006/007's own total-computation precedent — no database aggregate
or cached column
**Constraints**: No client-side Postgres access (service-role key only, server-side, unchanged); an
invoice's header, lines, PO-line Invoiced-figure increments, and ledger credit MUST be written
atomically in one Postgres function (ADR-0002); each referenced PO line MUST be locked
(`select ... for update`) before its remaining-invoiceable-quantity is validated, so FR-015 holds
under genuinely concurrent invoice creation, not just sequential "close succession" (research.md),
backstopped by a DB-level `check (invoiced_quantity <= delivered_quantity)` constraint;
`invoice_number` MUST be unique per trade name via a DB-level constraint (FR-004);
`performa_invoice_lines` MUST snapshot `product_id`/`uom`/`unit_price` at creation and never
re-read them live (research.md); a created Performa Invoice MUST be fully read-only and
undeletable with no edit/void/accept path existing anywhere in this feature (FR-009, FR-010); this
feature MUST NOT create an invoice or post a ledger entry for any customer not flagged
`issues_performa_invoice = true` (FR-001, FR-008)
**Scale/Scope**: Single customer today (Habbitt), a few dozen invoices/year, typically 1-10 lines
per invoice possibly spanning 1-3 POs, no multi-tenancy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist yet
to gate against, same situation as 001-007. Proceeding under the project's default guardrails
(smallest viable diff, no speculative abstraction, testable increments per user story).

**This feature introduces no new architectural pattern** — every design choice is a direct,
unmodified application of an already-recorded ADR or an already-resolved prior-feature precedent,
restated here for Constitution Check completeness (full rationale in research.md):

1. **Atomic multi-effect posting** (ADR-0002) — `create_performa_invoice` writes the invoice
   header, its lines, every referenced PO line's Invoiced-figure increment, and the ledger credit
   in one Postgres function call, the same boundary `create_customer_po`, `create_challan`, and
   `accept_challan` already establish. Not a new application of the pattern in kind, only in
   feature.
2. **Printed business documents via server-rendered `@media print` routes, no PDF library**
   (ADR-0006) — this feature is exactly the "second application" ADR-0006 itself names when it was
   written during 007's plan (`history/adr/0006-printed-documents-via-server-rendered-print-routes.md`
   explicitly lists "008-performa-invoicing is expected to be the second"). No new ADR needed; this
   plan simply follows it.
3. **Storage access via server-only signed URLs, no public buckets** (ADR-0003) — the fourth
   private bucket (`performa-invoice-attachments`) follows the identical trust boundary as the
   three before it.
4. **Shared tables created at their first real writer** (ADR-0004) — not invoked here in the
   forward-declared sense that motivated ADR-0004 originally; `ledger_entries` and
   `customer_po_lines` already exist (created by 005 and 006 respectively) and this feature is only
   ever an additional writer into already-established tables, never a first writer of a
   forward-declared one.

**No architecturally significant decision requiring a new ADR is surfaced by this feature.** The
one genuine deviation from 007's own shape — no edit/void/accept lifecycle, just a single
`create_performa_invoice` function — is a feature-specific business-process decision already
resolved with the user and documented in spec.md's Assumptions, not a new cross-cutting pattern
future features would need to follow; it does not meet ADR-0002/0003/0004/0006's bar of "a
reusable, project-wide pattern decision."

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `performa_invoice_attachments` as a child table (rather than
`challans`' nullable-columns shape) is a direct application of 007's own attachment-cardinality
reasoning, not a new Storage pattern (research.md). The absence of `updated_at`/an update trigger
on `performa_invoices`/`performa_invoice_lines` is a data-integrity necessity given FR-009's
from-creation immutability, not a new schema convention — it follows `ledger_entries`' own
precedent (005) exactly.*

## Project Structure

### Documentation (this feature)

```text
specs/008-performa-invoicing/
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
│   ├── layout.tsx                  # EXTENDED — add "Performa Invoices" nav link
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   ├── trade-names/                # EXISTING — unchanged
│   ├── customers/                  # EXISTING — unchanged
│   ├── customer-pos/                # EXISTING — unchanged (no shortcut link added here;
│   │                                 # research.md — invoicing starts from a customer picker,
│   │                                 # not a single PO's detail page)
│   ├── challans/                    # EXISTING — unchanged
│   └── performa-invoices/
│       ├── page.tsx                # NEW — list view (customer/trade-name filters, FR-012)
│       ├── loading.tsx             # NEW
│       ├── new/
│       │   └── page.tsx            # NEW — create form: customer picker (eligible only), then
│       │                            # per-selected-PO invoiceable-line checklist with
│       │                            # invoiced-quantity inputs, tax rate, trade name picker
│       └── [invoiceId]/
│           ├── page.tsx            # NEW — detail view (header, lines incl. source PO,
│           │                        # gross/tax/net totals, ledger credit amount, GST
│           │                        # attachment upload/list, link to print) — fully read-only,
│           │                        # no edit/void controls exist
│           └── loading.tsx         # NEW
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXISTING — unchanged
    ├── purchases.ts                 # EXISTING — unchanged
    ├── trade-names.ts                # EXISTING — unchanged
    ├── customers.ts                  # EXISTING — unchanged
    ├── customer-pos.ts               # EXISTING — unchanged
    ├── challans.ts                   # EXISTING — unchanged
    └── performa-invoices.ts          # NEW — createPerformaInvoice/
                                       # uploadPerformaInvoiceGstAttachment

app/performa-invoices/
└── [invoiceId]/
    └── print/
        └── page.tsx                 # NEW — standalone printable view, OUTSIDE the
                                      # (dashboard) route group (no nav chrome), own
                                      # getCurrentUser()/redirect("/login") gate mirroring
                                      # (dashboard)/layout.tsx, @media print CSS — the second
                                      # application of ADR-0006, per that ADR's own text

lib/
├── supabase/                       # EXISTING — unchanged
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged (nextInvoiceNumber already exposed
│                                    # by 004's schema/service, unused until now;
│                                    # listActiveTradeNamesForSelect, getSignedAssetUrl,
│                                    # getTradeName reused as-is)
├── customers/
│   └── service.ts                  # EXTENDED — add listPerformaInvoiceCustomersForSelect()
│                                    # (contracts/server-actions.md); everything else unchanged
├── customer-pos/                   # EXISTING — unchanged (listCustomerPOs, getCustomerPO
│                                    # reused as-is; customer_po_lines' RESTRICT-default FK
│                                    # from performa_invoice_lines needs no code change here)
├── challans/                       # EXISTING — unchanged
└── performa-invoices/
    ├── schema.ts                    # NEW — performaInvoiceInputSchema,
    │                                 # performaInvoiceLineSchema, and all TS types
    ├── service.ts                    # NEW — createPerformaInvoiceRecord (RPC), listPerformaInvoices,
    │                                 # getPerformaInvoice, getPerformaInvoiceForPrint,
    │                                 # getInvoiceableLinesForPO (derives `remaining` in
    │                                 # TypeScript over getCustomerPO's already-fetched lines)
    ├── storage.ts                    # NEW — uploadPerformaInvoiceGstAttachment/
    │                                 # getSignedPerformaInvoiceAttachmentUrl, mirrors
    │                                 # lib/customer-pos/storage.ts's append-only shape (ADR-0003),
    │                                 # fourth bucket (performa-invoice-attachments)
    └── number-to-words.ts            # NEW — amountInWords(amount): South Asian
                                       # (Lakh/Crore) numbering convention, no dependency
                                       # (research.md)

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
├── trade-names/                    # EXISTING — unchanged
├── customers/                      # EXISTING — unchanged
├── customer-pos/                   # EXISTING — unchanged
├── challans/                       # EXISTING — unchanged
└── performa-invoices/
    ├── performa-invoice-form.tsx     # NEW — customer picker → dynamic multi-PO + per-PO
    │                                  # invoiceable-line checklist with invoiced-quantity
    │                                  # inputs, tax rate input, trade name picker (create only
    │                                  # — no edit mode exists)
    ├── performa-invoice-line-row.tsx # NEW — one line's fields (read-only display, since a
    │                                  # created invoice is never edited)
    ├── performa-invoice-list.tsx     # NEW
    ├── performa-invoice-gst-attachment-upload.tsx # NEW — upload control (append-only, FR-011)
    └── performa-invoice-print-view.tsx # NEW — the actual printable layout (letterhead, line
                                          # table with per-line PO, gross/tax/net totals, amount
                                          # in words, signature lines), rendered by
                                          # app/performa-invoices/[invoiceId]/print/page.tsx

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged
├── 0004_trade_names.sql            # EXISTING — unchanged (next_invoice_number already exists)
├── 0005_customers.sql              # EXISTING — unchanged
├── 0006_customer_purchase_orders.sql # EXISTING — unchanged (invoiced_quantity already exists)
├── 0007_challans.sql               # EXISTING — unchanged
└── 0008_performa_invoicing.sql     # NEW — performa_invoices/performa_invoice_lines/
                                       # performa_invoice_attachments tables; create_performa_invoice
                                       # function; the performa-invoice-attachments bucket; the
                                       # unique-per-trade-name invoice-number constraint (see
                                       # data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001-007's approach).

**Structure Decision**: Single Next.js application (same shape as 001-007) — unchanged. This
feature adds one new module (`lib/performa-invoices/*`, `app/actions/performa-invoices.ts`,
`components/performa-invoices/*`, `app/(dashboard)/performa-invoices/**`), one standalone
non-dashboard route (`app/performa-invoices/[invoiceId]/print/**`, reusing ADR-0006), and one
small additive export in `lib/customers/service.ts` — no changes to 006's or 007's existing routes
or services, no new route groups beyond one sibling and one standalone print route, no new
services.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. This feature introduces no genuinely new complexity beyond what 001-007 already
established — it composes ADR-0002, ADR-0003, and ADR-0006 exactly as each already anticipates,
and its one deliberate simplification (no edit/void/accept lifecycle) *reduces* surface area
relative to 007's own shape rather than adding to it. No entries required in this table.

| Violation | Why Needed | Simpler Alternative Rejected Because |
|-----------|------------|---------------------------------------|
| — | — | — |
