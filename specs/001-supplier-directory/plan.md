# Implementation Plan: Supplier Directory

**Branch**: `001-supplier-directory` | **Date**: 2026-09-06 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/001-supplier-directory/spec.md`

## Summary

Internal staff need a central, searchable directory of textile suppliers, replacing spreadsheets. Build it as a single Next.js (App Router, TypeScript) app: Server Components read supplier data from Firestore via the Admin SDK, Server Actions handle create/update/deactivate/reactivate, and Firebase Auth (session cookie) gates every route. Name search and material/status filtering are done by fetching the (small, ≤500-record) active/inactive supplier set and filtering in-memory, avoiding the need for a separate search index at this scale. See [research.md](./research.md) for the full rationale behind each choice.

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+
**Primary Dependencies**: Next.js 14+ (App Router), React 18+, `firebase-admin`, `firebase` (Auth client only), `zod`, `react-hook-form`, Tailwind CSS
**Storage**: Firestore — single `suppliers` collection (see [data-model.md](./data-model.md))
**Testing**: Vitest + Testing Library (unit/integration), Firestore Emulator for integration tests
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app (web) — no separate backend service
**Performance Goals**: Supplier list search/filter renders in <2s at 500 records (SC-004)
**Constraints**: No client-side Firestore access — all reads/writes go through the server (Admin SDK); Admin credentials never shipped to the browser
**Scale/Scope**: Single internal business, up to ~500 supplier records, no multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template for this project — no ratified principles exist yet to gate against. Proceeding under the project's default guardrails instead (smallest viable diff, no speculative abstraction, testable increments per user story), all of which this plan already follows: three independently-shippable user stories, no premature search-index infrastructure, no client Firestore access to avoid a second authorization surface.

📋 **Note**: Adopting Next.js Server Actions + Firestore Admin SDK (no public API layer) and in-memory search instead of a search index are both decisions with long-term structural consequences for how every future feature (Purchase Orders, Inventory, Invoicing) will access data. If you want this reasoned about formally: run `/sp.constitution` first to ratify project-wide principles, or `/sp.adr "Server Actions + Firestore Admin SDK for data access"` to record this specific decision. Not required to proceed — flagging per the project's ADR-suggestion policy.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md, quickstart.md): no new violations introduced. The design stays within a single Next.js project with no additional services.*

## Project Structure

### Documentation (this feature)

```text
specs/001-supplier-directory/
├── plan.md              # This file
├── research.md          # Phase 0 output
├── data-model.md        # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md              # Phase 2 output (/sp.tasks — not created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (auth)/
│   └── login/
│       └── page.tsx              # Firebase Auth email/password sign-in
├── (dashboard)/
│   └── suppliers/
│       ├── page.tsx              # List + search/filter (Server Component)
│       ├── new/
│       │   └── page.tsx          # Create form
│       └── [supplierId]/
│           ├── page.tsx          # Detail view
│           └── edit/
│               └── page.tsx      # Edit form
├── actions/
│   └── suppliers.ts              # Server Actions: createSupplier, updateSupplier,
│                                  # setSupplierStatus, listSuppliers, getSupplier
└── middleware.ts                 # Session-cookie auth gate for (dashboard)/*

lib/
├── firebase/
│   ├── client.ts                 # Firebase client SDK init (Auth only)
│   └── admin.ts                  # firebase-admin init (server-only)
├── auth/
│   └── session.ts                 # Session cookie create/verify helpers
└── suppliers/
    ├── schema.ts                  # Zod schemas: Supplier, Contact, SupplierInput
    └── service.ts                 # Firestore data-access functions used by actions

components/
└── suppliers/
    ├── supplier-form.tsx          # Shared create/edit form (react-hook-form + Zod)
    ├── supplier-list.tsx          # Client component: renders + filters fetched list
    ├── supplier-filters.tsx       # Search box + material/status filter controls
    └── contact-fields.tsx         # Repeatable contact sub-form

tests/
├── unit/
│   └── suppliers/
│       ├── schema.test.ts
│       └── service.test.ts
└── integration/
    └── actions/
        └── suppliers.test.ts       # Against Firestore Emulator
```

**Structure Decision**: Single Next.js application (Option 1 shape, web variant) — no separate `backend/`/`frontend/` split, since Server Components/Actions in the same app play both roles. This matches the "Single project" default in the plan template and avoids the complexity of a second deployable for an internal tool with one client.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a deviation against. No additional projects, services, or indirection layers beyond the single Next.js app were introduced.
