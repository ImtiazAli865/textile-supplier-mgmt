# Implementation Plan: Supplier Directory

**Branch**: `001-supplier-directory` | **Date**: 2026-09-06 | **Revised**: 2026-09-16 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-supplier-directory/spec.md`

> **2026-09-16 revision**: Backend swapped from Firestore/Firebase Auth to Supabase (Postgres + Supabase Auth) per [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md). Business rules and user-facing behavior are unchanged; this plan now describes the Postgres/Supabase implementation. The original Firestore-based plan is preserved in git history at the commit implementing this feature (`c028944`).

## Summary

Internal staff need a central, searchable directory of textile suppliers, replacing spreadsheets. Built as a single Next.js (App Router, TypeScript) app: Server Components read supplier data from Postgres via a server-only Supabase client (service-role key), Server Actions handle create/update/deactivate/reactivate, and Supabase Auth (cookie-based session, via `@supabase/ssr`) gates every route. Name search and material/status filtering are done as native SQL (`ILIKE`, indexed joins) rather than Firestore's fetch-and-filter-in-memory workaround. See [data-model.md](./data-model.md) for the schema and [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md) for why.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, Tailwind CSS
**Storage**: Supabase Postgres — `suppliers`, `supplier_contacts`, `supplier_materials` tables (see [data-model.md](./data-model.md))
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`, same as before the migration
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app (web) — no separate backend service
**Performance Goals**: Supplier list search/filter renders in <2s at 500 records (SC-004) — easier to hold now that search/filter are indexed SQL instead of in-memory scans
**Constraints**: No client-side Postgres access — all reads/writes go through the server using the Supabase service-role key; that key never ships to the browser (mirrors the old "no client Firestore access" constraint)
**Scale/Scope**: Single internal business, up to ~500 supplier records, no multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template for this project — no ratified principles exist yet to gate against. Proceeding under the project's default guardrails instead (smallest viable diff, no speculative abstraction, testable increments per user story).

The Firebase → Supabase backend swap itself is the architecturally significant decision for this revision, and it has been recorded as [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md) (accepted 2026-09-16) — superseding the original plan's flagged-but-undocumented "Server Actions + Firestore Admin SDK" note.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no new violations introduced. The design stays within a single Next.js project with one additional managed service (Supabase) replacing the previous one (Firebase) — no net increase in the number of services.*

## Project Structure

### Documentation (this feature)

```text
specs/001-supplier-directory/
├── plan.md              # This file
├── research.md          # Phase 0 output (Firestore-era; superseded by ADR-0001 for storage choice)
├── data-model.md        # Phase 1 output — now Postgres schema
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md              # Phase 2 output (/sp.tasks)
```

### Source Code (repository root)

```text
middleware.ts                     # Supabase session refresh + auth gate for (dashboard)/* — MUST live at
                                   # repo root; Next.js does not run middleware placed inside app/

app/
├── (auth)/
│   └── login/
│       └── page.tsx              # Supabase Auth email/password sign-in (Server Action-driven form)
├── (dashboard)/
│   └── suppliers/
│       ├── page.tsx              # List + search/filter (Server Component)
│       ├── new/
│       │   └── page.tsx          # Create form
│       └── [supplierId]/
│           ├── page.tsx          # Detail view
│           └── edit/
│               └── page.tsx      # Edit form
└── actions/
    ├── auth.ts                    # Server Actions: signIn, signOut
    └── suppliers.ts               # Server Actions: createSupplier, updateSupplier,
                                    # setSupplierStatus, listSuppliers, getSupplier,
                                    # checkDuplicateSupplierName

lib/
├── supabase/
│   ├── server.ts                  # @supabase/ssr server client (cookies-bound) — used for auth only
│   └── admin.ts                   # supabase-js client with the service-role key (server-only) — all data access
├── auth/
│   └── session.ts                 # getCurrentUser/requireCurrentUser wrapping Supabase Auth's getUser()
└── suppliers/
    ├── schema.ts                  # Zod schemas: Supplier, Contact, SupplierInput (unchanged shape from Firestore era)
    └── service.ts                 # Postgres data-access functions used by actions

components/
└── suppliers/
    ├── supplier-form.tsx          # Shared create/edit form (react-hook-form + Zod) — unchanged
    ├── supplier-list.tsx          # Client component: renders + filters fetched list — unchanged
    ├── supplier-filters.tsx       # Search box + material/status filter controls — unchanged
    └── contact-fields.tsx         # Repeatable contact sub-form — unchanged
```

`components/` and `lib/*/schema.ts` needed no structural changes for this migration — the API-level TypeScript shapes returned by the service layer are unchanged, only how they're produced (SQL vs. Firestore reads) changed. This confirms the original three-layer separation (`schema.ts` / `service.ts` / Server Actions / components) paid for itself: swapping the backend touched `service.ts`, `lib/supabase/*`, `lib/auth/*`, and `middleware.ts` only.

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature (unchanged from the Firestore-era plan). When automated tests are added later, they belong at `tests/unit/suppliers/{schema,service}.test.ts` and `tests/integration/actions/suppliers.test.ts`, run against a real (test) Supabase project or `supabase start`'s local Postgres rather than an emulator.

**Structure Decision**: Single Next.js application (Option 1 shape, web variant) — unchanged from the original plan.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a deviation against. The backend swap replaces one managed service (Firebase) with another (Supabase) — no net increase in the number of services or deployables.
