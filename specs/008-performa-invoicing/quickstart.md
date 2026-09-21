# Quickstart: Performa Invoicing

**Feature**: `008-performa-invoicing` | **Date**: 2026-09-22

Extends the app already scaffolded for 001-007 — no new environment variables. Uses the same
Supabase project (Postgres + Auth + Storage). The new tables, new function, and Storage bucket are
added in
[`supabase/migrations/0008_performa_invoicing.sql`](../../supabase/migrations/0008_performa_invoicing.sql).

## Prerequisites

- Everything from [007's quickstart.md](../007-challans/quickstart.md) (Node.js 20+, a Supabase
  project with `0001_init.sql` through `0007_challans.sql` applied, a staff user in Supabase Auth)
  already set up.
- `0008_performa_invoicing.sql` applied to the same Supabase project before testing this feature.
- At least one active trade name (004), with a signature image and a stamp image uploaded, so
  printed invoices exercise the auto-inserted images.
- A customer flagged `issues_performa_invoice = true` (Habbitt) with at least two open POs, each
  having at least one line with an accepted Challan against it (007) so that
  `delivered_quantity > invoiced_quantity` on those lines — the only state this feature can act on.
- A customer flagged `issues_performa_invoice = false` (e.g. Chaseup) with at least one accepted
  Challan, to confirm this feature correctly refuses to act on their POs at all.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Generate and post a Performa Invoice against a single PO** (User Story 1): Start a new
   Performa Invoice, pick Habbitt, pick one of their open POs, select one of its lines with
   invoiceable quantity, enter an amount within the remaining invoiceable quantity, leave the tax
   rate at its 18% default, pick a trade name, and save → confirm the invoice saves with an
   auto-generated plain sequential number (e.g. "1" the first time), correct gross/tax/net totals,
   and that PO line's Invoiced figure increases by the invoiced amount. Confirm exactly one ledger
   `credit` row appears for Habbitt equal to the net total. Open its printed view
   (`/performa-invoices/[id]/print`) → confirm letterhead, invoice number/date, customer legal
   name, PO number, line table, gross/tax/net totals, and the net total in words all render
   correctly. Try submitting with no customer, no trade name, or no lines → confirm a validation
   error. Try selecting a fully-invoiced line, and try entering an invoiced quantity above a line's
   remaining invoiceable amount → confirm both are rejected with a clear error. Try creating an
   invoice for the Chaseup PO (flag = No) → confirm it is rejected outright.
3. **Combine multiple POs of the same customer** (User Story 2): Start a new invoice for Habbitt,
   add lines from two different open POs, and save → confirm both PO lines' Invoiced figures
   increase correctly, the printed view lists both PO numbers with lines correctly attributed to
   each, the totals sum across both, and exactly one ledger credit entry (not two) is posted for
   the combined net total. Try adding a line belonging to a different customer's PO onto the same
   invoice → confirm it is rejected.
4. **Attach the GST Sales Tax Invoice** (User Story 3): On an already-created invoice, upload a PDF
   → confirm it's stored and retrievable from the invoice's detail view, and that the invoice's
   totals/ledger effect are unchanged. Confirm the invoice displays and prints normally with no
   attachment at all.
5. **Immutability**: Confirm there is no edit, void, or delete action exposed anywhere for an
   existing Performa Invoice — the detail view is read-only in full.
6. **Double-invoicing guard**: Attempt to invoice the same PO line's remaining quantity twice in
   quick succession (two separate invoices) such that the second would exceed what remains →
   confirm the second is rejected, naming the remaining invoiceable quantity actually available.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions, incl. number-to-words) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
