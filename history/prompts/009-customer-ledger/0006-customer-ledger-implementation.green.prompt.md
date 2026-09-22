---
id: 0006
title: Customer Ledger implementation
stage: green
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: /sp.implement
labels: ["implementation", "customer-ledger", "customer-payments", "fifo-ageing", "csv-export", "route-handler"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: history/adr/0007-csv-export-via-route-handler.md
  pr: null
files:
 - supabase/migrations/0009_customer_ledger.sql
 - lib/customer-payments/schema.ts
 - lib/customer-payments/service.ts
 - lib/customer-ledger/types.ts
 - lib/customer-ledger/entries.ts
 - lib/customer-ledger/service.ts
 - lib/customer-ledger/ageing.ts
 - lib/customer-ledger/csv.ts
 - app/actions/customer-payments.ts
 - components/customer-payments/customer-payment-form.tsx
 - components/customer-payments/payment-status-actions.tsx
 - components/customer-ledger/ledger-table.tsx
 - components/customer-ledger/ledger-date-filter.tsx
 - components/customer-ledger/ageing-summary.tsx
 - components/customer-ledger/ledger-summary-list.tsx
 - components/customer-ledger/ledger-print-view.tsx
 - components/customer-ledger/ledger-summary-print-view.tsx
 - app/(dashboard)/customers/[customerId]/ledger/page.tsx
 - app/(dashboard)/customers/[customerId]/ledger/loading.tsx
 - app/(dashboard)/customers/[customerId]/payments/new/page.tsx
 - app/(dashboard)/customers/[customerId]/page.tsx
 - app/(dashboard)/customer-ledger/page.tsx
 - app/(dashboard)/customer-ledger/loading.tsx
 - app/(dashboard)/layout.tsx
 - app/customers/[customerId]/ledger/print/page.tsx
 - app/customer-ledger/print/page.tsx
 - app/api/customer-ledger/[customerId]/route.ts
 - app/api/customer-ledger/route.ts
 - specs/009-customer-ledger/tasks.md
tests:
 - npx tsc --noEmit (clean)
 - npm run lint (0 errors, 1 pre-existing warning pattern)
 - npm run build (clean; all new routes resolved correctly in the route table)
---

## Prompt

009-customer-ledger

## Response snapshot

Ran `check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`, confirmed the spec quality
checklist (16/16 items, PASS) so no user confirmation gate was needed, and confirmed existing
ignore files (`.gitignore`, `.prettierignore`, `eslint.config.mjs`) already cover this feature's
needs with nothing new to add. Read `lib/challans/service.ts`, `lib/performa-invoices/service.ts`
and `.schema.ts`, `app/actions/performa-invoices.ts`, the performa-invoices print route/component,
`middleware.ts` (confirmed its matcher does NOT cover new routes — every route/print-route gates
itself via `getCurrentUser()`, matching ADR-0006), `components/customers/customer-form.tsx` (the
react-hook-form + zodResolver pattern, chosen over 008's own plain-`useState` checklist-form
pattern since a payment-recording form is a simple field form, not a checklist), and
`lib/customer-pos/service.ts`/`lib/customers/service.ts` (confirmed `listCustomers()` only ever
filters to one status per call, informing a design decision below) before writing any code.

Implemented all 44 tasks across 8 phases in `tasks.md`, consolidating several where building the
full shape once was clearly cheaper than incremental edits (documented inline in tasks.md's new
"Implementation Notes" section, mirroring 008's own precedent) — most notably `getCustomerLedger`
(T007) built with its full `paymentStatus`/`createdAt`/`createdBy`/`statusChangedAt`/
`statusChangedBy` row shape from the start (T019's extension folded in), and `ledger-table.tsx`
(T008) built with `PaymentStatusActions` and the attribution tooltip wired in from the start
(T021 folded in).

Two structural decisions made during implementation, beyond what the design docs fully specified:
1. `getCustomerLedger` and `getCustomerAgeing` both need the same raw, chronologically-sorted
   `ledger_entries` fetch (research.md's stated intent). Having `service.ts` and `ageing.ts` import
   from each other directly would create a circular module dependency, so the shared fetch was
   extracted into a third module, `lib/customer-ledger/entries.ts` — a one-file addition beyond
   `plan.md`'s original Project Structure, made for a concrete, verified reason.
2. `listCustomerLedgerSummaries` needed every customer regardless of status (FR-011), but
   `lib/customers/service.ts`'s `listCustomers()` only ever filters to one status per call, and
   `plan.md` committed to leaving that file unchanged — so `listCustomerLedgerSummaries` calls it
   twice (active + inactive) and merges, rather than adding a new "all statuses" export there.

The FIFO ageing algorithm (`lib/customer-ledger/ageing.ts`) was implemented as a literal
translation of research.md's pseudocode, with one hardening beyond the pseudocode: every
subtraction is rounded to 2dp (PKR convention) to prevent floating-point residue from leaving a
fully-consumed queue entry lingering at e.g. `1e-13` instead of exactly `0`.

Wrote the full migration (`0009_customer_ledger.sql`): `customer_payments` table,
`record_customer_payment`, and `update_customer_payment_status` — including the `INVALID_STATUS`
guard and `for update` row lock exactly as data-model.md specifies, both verified present via a
direct re-read of the written SQL. Statically verified (T039, grep-based, matching 008's own
precedent for checking the absence of a code path) that `record_customer_payment` and
`update_customer_payment_status` are the only two `.rpc()` calls anywhere in the new modules, and
that no `.update()`/`.delete()` call anywhere in the codebase targets `ledger_entries` or
`customer_payments`.

Hit and fixed one real lint error during verification: the "Export CSV" links point at a Route
Handler returning a raw file, not a page — `@next/next/no-html-link-for-pages` flagged the
literal-string case on the all-customers summary page; fixed with a scoped
`eslint-disable-next-line` and an explanatory comment (the dynamic-`href` case on the per-customer
ledger page wasn't flagged, so no disable was added there — verified by re-running lint after each
change rather than disabling both preemptively).

`npx tsc --noEmit`, `npm run lint`, and `npm run build` all pass cleanly on the full repo. The
build's route table confirms every new route resolved correctly: `/api/customer-ledger`,
`/api/customer-ledger/[customerId]`, `/customer-ledger`, `/customer-ledger/print`,
`/customers/[customerId]/ledger`, `/customers/[customerId]/ledger/print`,
`/customers/[customerId]/payments/new` — no naming or route-group collisions with 001-008.

T040-T044 (live verification: concurrency race, cross-customer reference rejection,
bounce/ageing interplay, multi-PO rendering, full quickstart walkthrough) are **not yet run** —
this environment has no direct Postgres/DDL access (no `DATABASE_URL`, no linked Supabase CLI
project), the same sequencing constraint every prior feature (002 through 008) hit. 39/44 tasks
are complete; the remaining 5 are blocked on the user applying
`supabase/migrations/0009_customer_ledger.sql` in the Supabase SQL editor.

## Outcome

- ✅ Impact: Customer Ledger feature fully implemented — schema, both Postgres functions, full
  read-side service layer (ledger view, FIFO ageing, all-customers summary, PDF/CSV export), all
  Server Actions, all components, all routes (including this project's first two Route Handlers,
  ADR-0007). Code-level verification (types, lint, build) is clean. Live verification is the only
  remaining work, blocked on migration application.
- 🧪 Tests: `npx tsc --noEmit` clean; `npm run lint` 0 errors; `npm run build` clean, all routes
  resolve. No live-database verification yet (T040-T044).
- 📁 Files: 1 migration, 8 new `lib/` files across 2 new modules, 1 new Server Actions file, 8 new
  components across 2 new component directories, 7 new route files, 3 small extensions to
  existing files (`customers/[customerId]/page.tsx`, `(dashboard)/layout.tsx`), `tasks.md`
  (checkboxes + Implementation Notes).
- 🔁 Next prompts: User applies `0009_customer_ledger.sql` in the Supabase SQL editor, then asks
  to continue so T040-T044's live verification can run.
- 🧠 Reflection: The circular-import risk between `service.ts` and `ageing.ts` (both needing the
  same raw ledger fetch, research.md's own stated intent) wasn't something the design docs
  anticipated at the module-file level — worth extracting shared-fetch modules like
  `entries.ts` proactively during `/sp.plan`'s Project Structure step for any feature where two
  sibling files are designed to "reuse the same underlying fetch," rather than discovering the
  cycle only at implementation time.

## Evaluation notes (flywheel)

- Failure modes observed: one real lint error caught and fixed (raw-file-download `<a>` tag
  flagged by `no-html-link-for-pages`) — resolved correctly by understanding *why* the rule fired
  rather than reflexively switching to `next/link`, which would have been semantically wrong for
  a file download.
- Graders run and results (PASS/FAIL): `tsc --noEmit` PASS; `eslint` PASS (0 errors); `next build`
  PASS.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
