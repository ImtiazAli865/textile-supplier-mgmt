# Quickstart: Challans

**Feature**: `007-challans` | **Date**: 2026-09-21

Extends the app already scaffolded for 001-006 — no new environment variables. Uses the same
Supabase project (Postgres + Auth + Storage). The new tables, redefined 003b functions, new
Postgres functions, backfill, and Storage bucket are added in
[`supabase/migrations/0007_challans.sql`](../../supabase/migrations/0007_challans.sql).

## Prerequisites

- Everything from [006's quickstart.md](../006-customer-purchase-orders/quickstart.md) (Node.js
  20+, a Supabase project with `0001_init.sql` through `0006_customer_purchase_orders.sql`
  applied, a staff user in Supabase Auth) already set up.
- `0007_challans.sql` applied to the same Supabase project before testing this feature.
- At least one active trade name (004), with a signature image and a stamp image uploaded, so
  printed Challans exercise the auto-inserted images (FR-005).
- At least one open customer PO (006) exists for a customer with `issues_performa_invoice = false`
  (e.g. Chaseup) with at least one line for a **traded** product that already has purchase-based
  stock (003b), and a second open PO for the customer with `issues_performa_invoice = true`
  (Habbitt), to exercise both ledger-posting paths.
- Optionally, one open PO line for a **manufactured** product, to observe the documented interim
  limitation (research.md) — accepting a Challan against it will fail with a stock constraint error
  until 010-production-batches ships or an opening movement is recorded by other means.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Issue a Challan and print it** (User Story 1): From an open Chaseup PO's detail view, start a
   new Challan, select one of its undelivered lines, enter a delivered quantity within its
   remaining amount, pick a trade name, and save → confirm it saves with status "Issued" and an
   auto-generated number in the form `CH #001/<current month abbreviation>`, and that the trade
   name's next-Challan-number counter advanced. Open its printed view (`/challans/[id]/print`) →
   confirm the letterhead (printed name/address), Challan number/date, customer legal name, PO
   number, a line table with S.NO/Article/Item Name/UOM/QTY (QTY = delivered quantity), a totals
   row, and the trade name's signature/stamp images all render with no manual entry beyond what was
   already saved. Try selecting a PO line whose remaining quantity is already `0`, and try entering
   a delivered quantity above a line's remaining amount → confirm both are rejected with a clear
   error naming the remaining quantity available. Try submitting with no PO, no trade name, or no
   lines → confirm a validation error. Type a duplicate Challan number for the same trade name →
   confirm a clear rejection; the same number for a *different* trade name should succeed.
3. **Record acceptance, including a short receipt** (User Story 2): Accept the Issued Challan from
   step 2 with its accepted quantity left equal to delivered → confirm the PO line's Delivered
   figure increases by that amount and the Challan becomes read-only (no field editable). Create a
   second Challan against the same or another PO line, edit its accepted quantity down below
   delivered, and try to accept it before choosing a shortfall disposition → confirm acceptance is
   rejected, naming the line that still needs one. Choose "return to inventory" → accept → confirm
   the product's quantity-on-hand reflects only the *accepted* amount leaving (the shortfall came
   back). Repeat with a third Challan disposed "write off" → confirm quantity-on-hand reflects the
   full delivered amount leaving with no return. Upload a scanned signed copy to any of these
   Challans, both before and after accepting one → confirm it's stored and retrievable either way.
4. **Post to the right ledger destination** (User Story 3): After accepting the Chaseup Challan
   (flag = No) → confirm exactly one new `credit` row appears for Chaseup, equal to `sum(accepted
   quantity × that line's unit price)`. Create and accept a Challan against the Habbitt PO (flag =
   Yes) → confirm no ledger entry is created for Habbitt as a result.
5. **Void and immutability**: Create a Challan and void it before accepting → confirm it disappears
   from the default/active Challan list but remains viewable, with no PO-line, inventory, or ledger
   effect. Try voiding or editing an already-accepted Challan → confirm both are rejected.
6. **Cancelled-PO interaction**: Issue a Challan against a PO, then cancel that PO (006) before
   accepting the Challan → confirm accepting is blocked until the PO is reactivated.
7. **Quantity-on-hand consistency** (FR-011, SC-007): Note a traded product's quantity-on-hand
   before and after an accepted Challan touching it, then edit an unrelated field on one of that
   product's existing purchases (003b) → confirm quantity-on-hand still reflects the Challan's
   effect afterward (it must not reset to a purchase-only figure).

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
