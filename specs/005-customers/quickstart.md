# Quickstart: Customers

**Feature**: `005-customers` | **Date**: 2026-09-20

Extends the app already scaffolded for 001-004 — no new environment variables. Uses the same
Supabase project (Postgres + Auth + Storage). The new tables and Postgres functions are added in
[`supabase/migrations/0005_customers.sql`](../../supabase/migrations/0005_customers.sql).

## Prerequisites

- Everything from [004's quickstart.md](../004-trade-names-and-document-settings/quickstart.md)
  (Node.js 20+, Supabase project with `0001_init.sql` through `0004_trade_names.sql` applied, a
  staff user in Supabase Auth) already set up.
- `0005_customers.sql` applied to the same Supabase project before testing this feature.
- At least one active product (traded or manufactured) already exists in the Product Catalog
  (003), and at least one active trade name already exists (004), to exercise the product-mapping
  and trade-name-hint pickers.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Create a customer with an opening balance** (User Story 1): Go to "Add Customer", enter
   display name "Habbitt", legal name "Universal Retail (Pvt) Ltd", a billing address, at least
   one contact, payment terms (a min/max day range, e.g. 30-45), check "Issues Performa Invoice",
   pick one or more trade-name
   hints (e.g. Global Distributors, IBL Frontier Market), and enter an opening balance (e.g. Rs
   50,000, Credit, dated at today) → confirm it saves and appears in the customer list. Open its
   detail view → confirm display name and legal name show as two distinct fields, and the
   computed ledger balance shows Rs 50,000. Repeat for Chaseup, ChaseValue, and Kifayat with
   "Issues Performa Invoice" left unchecked and no opening balance → confirm their balances show
   Rs 0 and no ledger entry exists for them. Try submitting with no display name, legal name, or
   billing address → confirm a validation error and nothing saved.
3. **Map a customer-specific item code, selling unit, and default price** (User Story 2): Open
   Habbitt's detail view, add a product mapping (pick an existing product, enter Habbitt's own
   item code, selling unit, and a default price, e.g. Rs 2600 for Ball Fiber) → confirm it's saved
   and shown on Habbitt's detail page, with the price clearly labeled as a pre-fill suggestion.
   Open that same product's detail page → confirm the mapping also appears there. Add a
   *different* item code for a *different* customer on the *same* product → confirm both mappings
   coexist independently. Try adding a second mapping for Habbitt using the *same* item code but a
   *different* product → confirm a clear rejection. Try adding a mapping with only a default price
   set (no item code, no selling unit) → confirm it's accepted.
4. **Edit and deactivate a customer** (User Story 3): Edit an existing customer's address or
   payment terms, save → confirm the change persists; confirm the opening-balance section is not
   present/editable on the edit form at all. Deactivate an active customer → confirm it disappears
   from the default list but its record, ledger balance, and product mappings remain intact and
   viewable via the inactive filter; reactivate it → confirm it reappears in the default list.
5. **Confirm the opening balance is truly immutable** (FR-013): Attempt to find any UI path to
   edit a customer's opening balance after creation → confirm none exists (the edit form has no
   such field, and there is no other page that exposes one).

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
