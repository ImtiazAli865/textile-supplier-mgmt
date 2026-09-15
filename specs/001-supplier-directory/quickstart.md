# Quickstart: Supplier Directory

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06 | **Revised**: 2026-09-16 (Firebase → Supabase, see [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md))

## Prerequisites

- Node.js 20+
- A Supabase project (Postgres + Auth, email/password provider enabled)
- The schema applied: run [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql) in the Supabase SQL editor (or via the Supabase CLI) once per project
- At least one staff user created in Supabase Auth (Authentication → Users → Add user) to sign in with

## Environment variables

```env
# Client-safe Supabase config (used by middleware.ts and lib/supabase/server.ts for auth only)
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=

# Server-only Supabase secret (service role) key — bypasses Row Level Security.
SUPABASE_SECRET_KEY=
```

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user created in Supabase Auth.
2. **Create** (User Story 1): Go to "Add Supplier", submit with company name, one contact (name + email), an address, one material tag, and payment terms → confirm it appears in the list with status "active".
3. Submit the form again with no company name → confirm a validation error is shown and nothing is saved.
4. **Search & filter** (User Story 2): With several suppliers seeded, type a partial name into search → confirm only matches show. Apply a material filter and a status filter together → confirm the list narrows correctly. Search for something matching nothing → confirm an explicit empty state.
5. **Edit & deactivate** (User Story 3): Open an existing supplier, edit its payment terms, save → confirm the change is reflected. Deactivate it → confirm it disappears from the default (active) list but appears when filtering by "inactive". Reactivate it → confirm it reappears in the default list.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
