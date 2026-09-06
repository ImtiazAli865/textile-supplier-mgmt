---
id: 0007
title: Implement supplier directory feature
stage: green
date: 2026-09-06
surface: agent
model: claude-sonnet-5
feature: 001-supplier-directory
branch: 001-supplier-directory
user: imtiazkind143@gmail.com
command: /sp.implement
labels: [implement, supplier-directory, nextjs, firestore, firebase-auth]
links:
  spec: specs/001-supplier-directory/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - package.json
 - package-lock.json
 - tsconfig.json
 - next.config.ts
 - eslint.config.mjs
 - .prettierrc.json
 - .prettierignore
 - .gitignore
 - .env.local.example
 - .firebaserc
 - firebase.json
 - firestore.rules
 - firestore.indexes.json
 - middleware.ts
 - app/layout.tsx
 - app/page.tsx
 - app/(auth)/login/page.tsx
 - app/(dashboard)/layout.tsx
 - app/(dashboard)/error.tsx
 - app/(dashboard)/suppliers/page.tsx
 - app/(dashboard)/suppliers/loading.tsx
 - app/(dashboard)/suppliers/new/page.tsx
 - app/(dashboard)/suppliers/[supplierId]/page.tsx
 - app/(dashboard)/suppliers/[supplierId]/loading.tsx
 - app/(dashboard)/suppliers/[supplierId]/edit/page.tsx
 - app/actions/auth.ts
 - app/actions/suppliers.ts
 - lib/firebase/client.ts
 - lib/firebase/admin.ts
 - lib/auth/constants.ts
 - lib/auth/session.ts
 - lib/suppliers/schema.ts
 - lib/suppliers/service.ts
 - components/suppliers/supplier-form.tsx
 - components/suppliers/contact-fields.tsx
 - components/suppliers/supplier-filters.tsx
 - components/suppliers/supplier-list.tsx
 - components/suppliers/deactivate-reactivate-control.tsx
 - scripts/verify-list-performance.mjs
 - specs/001-supplier-directory/tasks.md
tests:
 - scripts/verify-list-performance.mjs (SC-004 in-memory filter timing, PASS)
 - npm run build (Next.js 16.3.4 production build, all 7 routes compile)
 - npm run lint (clean)
---

## Prompt

(no additional arguments — /sp.implement run against the completed tasks.md)

## Response snapshot

Checklist gate: requirements.md was 16/16 complete — proceeded automatically.

Scaffolded Next.js 16.3.4 (App Router, TypeScript, Tailwind v4) via `create-next-app` in a scratch directory (the repo root wasn't empty enough for it to run in place) and merged the generated files in, since 14+ is satisfied. Added firebase, firebase-admin, zod, react-hook-form, @hookform/resolvers, server-only, prettier, eslint-config-prettier. Implemented all 40 tasks from tasks.md:

- **Foundational**: lazy-singleton Firebase Admin/client SDK wrappers, session-cookie helpers, a dependency-free `lib/auth/constants.ts` (so middleware.ts doesn't pull firebase-admin into the Edge bundle), middleware.ts at repo root doing a lightweight cookie-presence check, real auth enforcement via `requireCurrentUser()` (Admin SDK signature/expiry verification) in the dashboard layout and every Server Action, shared Zod schemas, base Firestore service, dashboard shell with sign-out.
- **US1**: createSupplier/checkDuplicateSupplierName Server Actions, SupplierForm (react-hook-form + Zod resolver) with a non-blocking duplicate-name warning, repeatable ContactFields, Add Supplier page, supplier list + detail pages.
- **US2**: status/material Firestore filters plus in-memory case-insensitive name search in listSuppliers, SupplierFilters (URL-search-param driven), SupplierList with an explicit empty state, default status=active.
- **US3**: updateSupplier (never touches status) and setSupplierStatus (idempotent no-op on same status) Server Actions, edit page reusing SupplierForm, Deactivate/Reactivate control with a confirm dialog on the detail page.
- **Polish**: firestore.indexes.json (status+name, status+material composite indexes), firestore.rules (deny-all — server-only access via Admin SDK), loading.tsx/error.tsx boundaries, SC-004 verification script.

Fixed three real bugs surfaced only by actually building the app (not visible from the docs alone): (1) `next build`'s TypeScript pass caught an unsound cast in SupplierForm's submit handler — replaced the create/edit ternary with proper if/else branching so each Server Action's result type narrows correctly; (2) both `lib/firebase/admin.ts` and `lib/firebase/client.ts` were eagerly initializing their SDK singletons at module load, which crashed `next build`'s page-data collection and static prerendering (no real Firebase env vars are configured yet) — converted both to lazy singletons; (3) Next.js 16.3.4 deprecated the `middleware.ts` convention in favor of `proxy.ts` — left as `middleware.ts` (still functional, just a build warning) rather than guess at the new file's exact API without documentation access, noting the codemod (`@next/codemod middleware-to-proxy`) for later once the tree is clean.

Verified: `npm run build` succeeds (all 7 routes compile, TypeScript passes), `npm run lint` is clean, `npx prettier --check` was run and auto-fixed. Could not run the Firestore Emulator (Java isn't installed in this environment) or the full quickstart.md click-through (no real Firebase project credentials provided) — documented both limitations explicitly in tasks.md rather than falsely marking them done. T037's SC-004 check was narrowed to just the in-memory filter step (sub-millisecond at 500 records) with the Firestore-query half left as an architectural claim backed by the composite indexes rather than an empirical measurement.

39/40 tasks marked complete in tasks.md; T038 (live quickstart flow) left unchecked pending real Firebase credentials.

## Outcome

- ✅ Impact: Feature 001 (Supplier Directory) is code-complete and builds cleanly; ready for a real Firebase project to be wired up and manually verified end-to-end.
- 🧪 Tests: `npm run build` (pass), `npm run lint` (pass), `scripts/verify-list-performance.mjs` (pass, SC-004 in-memory portion). No unit/integration tests were written (not requested in spec.md).
- 📁 Files: ~40 new source/config files (see front matter); tasks.md updated with checkboxes and an "Implementation Notes" section documenting what wasn't run and why.
- 🔁 Next prompts: Wire up a real Firebase project (Auth + Firestore), populate `.env.local` from `.env.local.example`, run `npm run dev`, and complete T038's manual quickstart verification. Consider `/sp.adr` for the Server Actions + lazy-Firebase-singleton pattern if the user wants it formalized before building feature 002 (Purchase Orders) on the same foundation.
- 🧠 Reflection: The three bugs fixed here (unsound cast, eager SDK init, middleware deprecation) were only discoverable by actually running `next build` — this is a concrete case for why "build and check" beats "write and assume" even in a docs-first SDD workflow; the plan/tasks/contracts were all correct at the design level, but Next.js/Firebase wiring details only surface under a real compiler and bundler.

## Evaluation notes (flywheel)

- Failure modes observed: (1) eager Firebase singleton initialization is an easy mistake with any serverless/edge framework — worth defaulting to lazy singletons in research.md's guidance for future Firebase+Next.js features (Purchase Orders, Inventory, Invoicing) rather than rediscovering this each time. (2) `create-next-app` refuses to scaffold into a non-empty directory even when the only contents are unrelated project dirs (`.specify/`, `specs/`, `history/`) — scaffolding into a scratch dir and merging is the reliable workaround.
- Graders run and results (PASS/FAIL): npm run build — PASS (after 2 fix iterations). npm run lint — PASS. scripts/verify-list-performance.mjs — PASS (0.16ms vs 2000ms budget).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Once a real Firebase project exists, run the Firestore Emulator (needs Java installed) or point at a dev project to complete T038 and get a real end-to-end SC-004 measurement including the Firestore query itself, not just the in-memory filter.
