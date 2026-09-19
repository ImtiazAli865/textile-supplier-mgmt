# Quickstart: Product Catalog

**Feature**: `003-product-catalog` | **Date**: 2026-09-20

Extends the app already scaffolded for 001-supplier-directory and 002-raw-material-purchases —
no new environment variables. Uses the same Supabase project (Postgres + Auth) and the same
local dev setup; the `products` table is added in
[`supabase/migrations/0002_products.sql`](../../supabase/migrations/0002_products.sql).

## Prerequisites

- Everything from [002's quickstart.md](../002-raw-material-purchases/quickstart.md) (Node.js
  20+, Supabase project with `0001_init.sql` applied, a staff user in Supabase Auth) already set
  up.
- `0002_products.sql` applied to the same Supabase project before testing this feature.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Create & view** (User Story 1): Go to "Add Product", choose type **traded**, enter a name,
   stock UOM, and default selling price → confirm it saves as active and appears in the catalog
   list; open its detail view → confirm only traded-relevant fields show, and the purchase cost
   shows as "not yet established". Repeat with type **manufactured**, entering a yield ratio and
   labour rate as well → confirm both extra fields save and display, and no purchase-cost field
   appears at all. Submit either form missing a required field (or a manufactured product
   missing yield ratio/labour rate) → confirm a validation error and nothing is saved.
3. **Search & filter** (User Story 2): With several products of both types and mixed status
   seeded, search by partial name → confirm only matches show. Filter by type → confirm only
   that type shows. Filter by status → confirm the default view is active-only, and switching to
   inactive shows only inactive products. Combine search + both filters. Pick a combination
   matching nothing → confirm an explicit empty state.
4. **Edit & deactivate** (User Story 3): Open an existing product, edit its price (and, for a
   manufactured product, its yield ratio or labour rate), save → confirm the new values persist.
   Confirm there is no control to change its type. Deactivate an active product → confirm it
   disappears from the default list but reappears under the inactive filter; reactivate it →
   confirm it returns to the default list.

## Tests

```bash
npm run test              # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
