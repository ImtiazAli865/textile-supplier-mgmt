# Quickstart: Customer Purchase Orders

**Feature**: `006-customer-purchase-orders` | **Date**: 2026-09-20

Extends the app already scaffolded for 001-005 — no new environment variables. Uses the same
Supabase project (Postgres + Auth + Storage). The new tables, Postgres functions, and Storage
bucket are added in
[`supabase/migrations/0006_customer_purchase_orders.sql`](../../supabase/migrations/0006_customer_purchase_orders.sql).

## Prerequisites

- Everything from [005's quickstart.md](../005-customers/quickstart.md) (Node.js 20+, a Supabase
  project with `0001_init.sql` through `0005_customers.sql` applied, a staff user in Supabase
  Auth) already set up.
- `0006_customer_purchase_orders.sql` applied to the same Supabase project before testing this
  feature.
- At least one active customer (005) exists — ideally Habbitt (with `issues_performa_invoice =
  true`) and Chaseup, to exercise both intake patterns.
- At least one active product exists, and at least one 005 customer-product mapping (with an item
  code and a default price) is recorded for Habbitt, to exercise auto-resolution; and at least one
  product with **no** mapping, to exercise the manual-pick fallback.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Record a PO with mapped and unmapped lines** (User Story 1): Go to "Add Customer PO", pick
   Habbitt, enter a PO number and order date, add a line using Habbitt's mapped item code →
   confirm the product, UOM, and price auto-fill, then override the price → add a second line
   using an item code with no mapping → confirm the system prompts a manual product pick and still
   lets the PO save → submit → confirm it appears in the PO list with status "Open" and its total
   equals the sum of both lines' totals (using the *overridden* price, not the mapping default).
   Open its detail view → confirm every field, both lines, and the resolved products display
   accurately, along with its created/last-updated timestamps (FR-019). Try saving a PO for
   Habbitt with the exact same PO number again → confirm a clear duplicate rejection; try the same
   PO number for Chaseup → confirm it's accepted. Record a second PO for a different customer,
   then use the PO list's customer filter to show only Habbitt's POs → confirm only Habbitt's PO
   appears (FR-012). Leave the destination field blank on a PO for a customer with a recorded
   billing address → confirm the saved PO's destination shows that customer's billing address
   (spec Assumptions).
3. **Exercise both intake channels** (User Story 2): Record a Chaseup PO with a long, all-numeric
   PO number (e.g. "111202110000440639") and a line description containing an embedded Challan
   reference (e.g. "M ZAYAN IMPEX (FAROOQ SONS) 01 SEP 2026 Challan 54 PO 440639"), no attachment →
   confirm it saves and both fields display verbatim, untouched. Record a Habbitt PO with a short
   PO number ("P14337") and attach a sample PDF → confirm the attachment is stored and viewable
   (as a signed URL) from the detail view.
4. **Edit and cancel a PO** (User Story 3): Edit an existing PO's line quantity and price, save →
   confirm the change persists and the total recalculates. Cancel an open PO → confirm it's
   excluded from the default (open) list but its record, lines, and attachments remain viewable
   via the "show cancelled" filter; reactivate it → confirm it reappears in the default list. Try
   cancelling an already-cancelled PO → confirm it's a no-op, not an error.
5. **Confirm zero and negative values are rejected**: Try saving a line with a zero quantity or a
   zero price → confirm a validation error and nothing saved.
6. **Confirm the delivered/invoiced placeholders exist but are inert** (FR-017): Open any PO's
   detail view → confirm each line shows a delivered and invoiced quantity of `0`, with no way to
   edit either through this feature's own screens (there is no such input anywhere in the UI).

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
