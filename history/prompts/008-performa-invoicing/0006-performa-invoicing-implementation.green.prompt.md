---
id: 0006
title: Performa Invoicing implementation
stage: green
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: /sp.implement
labels: ["green", "performa-invoicing", "customer-purchase-orders", "challans", "ledger", "postgres-functions", "business-sensitive"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - supabase/migrations/0008_performa_invoicing.sql
 - lib/performa-invoices/schema.ts
 - lib/performa-invoices/service.ts
 - lib/performa-invoices/storage.ts
 - lib/performa-invoices/number-to-words.ts
 - lib/customers/service.ts
 - app/actions/performa-invoices.ts
 - components/performa-invoices/performa-invoice-form.tsx
 - components/performa-invoices/performa-invoice-line-row.tsx
 - components/performa-invoices/performa-invoice-list.tsx
 - components/performa-invoices/performa-invoice-print-view.tsx
 - components/performa-invoices/performa-invoice-gst-attachment-upload.tsx
 - app/(dashboard)/performa-invoices/page.tsx
 - app/(dashboard)/performa-invoices/loading.tsx
 - app/(dashboard)/performa-invoices/new/page.tsx
 - app/(dashboard)/performa-invoices/[invoiceId]/page.tsx
 - app/(dashboard)/performa-invoices/[invoiceId]/loading.tsx
 - app/performa-invoices/[invoiceId]/print/page.tsx
 - app/(dashboard)/layout.tsx
 - specs/008-performa-invoicing/tasks.md
 - history/prompts/008-performa-invoicing/0006-performa-invoicing-implementation.green.prompt.md
tests:
 - npx tsc --noEmit (clean, full repo)
 - npm run lint (clean, full repo)
 - npm run build (clean, full repo — confirmed all four new routes resolve with no collisions)
 - Live Supabase verification (T028-T032) not run — blocked on the user applying the migration; this environment has no DDL access
---

## Prompt

`/sp.implement 008-performa-invoicing`

## Response snapshot

Ran `.specify/scripts/powershell/check-prerequisites.ps1 -Json -RequireTasks -IncludeTasks`,
confirming `tasks.md` and every other design doc present. No `checklists/` items were incomplete
(the spec-quality checklist had already passed in full during `/sp.specify`). Before writing any
code, read the actual shipped precedent closely: `lib/challans/{schema,service,storage}.ts`,
`lib/customer-pos/{service,storage}.ts` (for the append-only attachment pattern),
`components/challans/*.tsx`, every `app/(dashboard)/challans/**` route, the standalone
`app/challans/[challanId]/print/page.tsx`, `app/(dashboard)/layout.tsx`, and
`supabase/migrations/0007_challans.sql` in full — so every new file matches this project's
established conventions exactly rather than approximating them.

Executed all 32 tasks from `tasks.md`:

- **Foundational (T001-T005)**: `supabase/migrations/0008_performa_invoicing.sql` — the
  `customer_po_lines_invoiced_le_delivered` `CHECK` constraint (FR-015's hard backstop, added via
  `ALTER TABLE` against 006's table); `performa_invoices`/`performa_invoice_lines`/
  `performa_invoice_attachments` (the first two with no `updated_at`/update trigger at all, per
  research.md's insert-only decision); the `performa-invoice-attachments` Storage bucket; and
  `create_performa_invoice` — the single function this feature ever exposes, implementing exactly
  the two-round-hardened design from plan review: a `for update of cpl` row lock per referenced
  PO line, the locking loop iterated in `po_line_id`-sorted order (not client-submission order) to
  prevent multi-line-invoice deadlocks, and the insert loop using the *original* submitted order
  separately for `position`. `lib/performa-invoices/schema.ts`'s Zod schemas/types followed.
- **User Story 1 (T006-T020)**: `listPerformaInvoiceCustomersForSelect` (new export on 005's
  `lib/customers/service.ts`); `getInvoiceableLinesForPO`, `createPerformaInvoiceRecord`,
  `listPerformaInvoices`, `getPerformaInvoice`, `getPerformaInvoiceForPrint` in
  `lib/performa-invoices/service.ts` with full Postgres-error-to-friendly-message translation;
  `lib/performa-invoices/number-to-words.ts`'s `amountInWords` (South Asian Lakh/Crore
  convention, no dependency); the `createPerformaInvoice` Server Action; every component
  (`performa-invoice-line-row.tsx`, `performa-invoice-form.tsx`, `performa-invoice-list.tsx`,
  `performa-invoice-print-view.tsx`); and every route (list, new, detail, the standalone print
  route reusing ADR-0006 exactly, plus the dashboard nav link).
- **User Story 2 (T021)**: consolidated into T013 rather than built as a later edit —
  `performa-invoice-form.tsx`/`new/page.tsx` accept a `poGroups`/`availablePOs` array from the
  start, with "add another PO" implemented as a plain `method="GET"` HTML form (hidden inputs
  carry already-added `poId`s) rather than client-side fetching, matching research.md's documented
  server-round-trip preference. US1's single-PO flow and US2's multi-PO flow ended up being the
  same code path.
- **User Story 3 (T022-T026)**: `lib/performa-invoices/storage.ts` (upload/sign) +
  `addPerformaInvoiceAttachmentRecord` (the DB insert, mirroring `customer-pos`'s append-only
  split, not Challan's replace shape); the upload Server Action; `performa-invoice-gst-attachment-
  upload.tsx`; wired into the detail page. `getPerformaInvoice` resolved real attachment rows to
  signed URLs from the start (T008) rather than shipping a `[]` placeholder first, since the extra
  joined relation cost nothing to include upfront.
- **Polish (T027)**: verified via `grep` that `create_performa_invoice` is the only `.rpc(...)`
  call this feature makes anywhere, and no `update`/`delete` call targets `performa_invoices`/
  `performa_invoice_lines` — confirming FR-009/FR-010's "no lifecycle" guarantee statically, since
  it's checking the absence of a code path rather than database behavior.

Ran `npx tsc --noEmit`, `npm run lint`, and `npm run build` on the full repo after the first
complete pass — all clean, including the new route table (`/performa-invoices`,
`/performa-invoices/[invoiceId]`, `/performa-invoices/[invoiceId]/print`,
`/performa-invoices/new`) resolving with no collisions against the existing
`/challans/[challanId]/print` precedent. During review of the first pass, tightened
`lib/performa-invoices/service.ts`'s embedded-relation row types (`customer_po_lines`'s nested
`customer_pos` field) from object-or-null to the project's established `T | T[] | null` +
`firstOf` defensive pattern used everywhere else (e.g. `lib/challans/service.ts`) — this
environment cannot verify Supabase/PostgREST's actual runtime embedding shape without a live
query, so brought the typing in line with the codebase's existing defensive convention rather than
assuming the narrower shape. Re-ran `tsc`/`lint`/`build` clean after the fix.

T028-T032 (live verification against a real Supabase project) are **not run** — this environment
has no `DATABASE_URL`/`pg` package, the same sequencing gap as every prior feature (002 through
007). Documented in `tasks.md`'s Implementation Notes exactly as 007's precedent does, with the
user's next step spelled out (apply `0008_performa_invoicing.sql` in the Supabase SQL editor, then
run quickstart.md against a Habbitt-flagged customer with an accepted Challan on an open PO).

## Outcome

- ✅ Impact: `008-performa-invoicing` is fully implemented end to end — schema, the single
  hardened Postgres function, service layer, Server Actions, all UI components, and all four
  routes — with only two existing files touched (`app/(dashboard)/layout.tsx`'s nav link,
  `lib/customers/service.ts`'s one new export) and zero changes to `customer-pos`/`challans`
  routes, per the plan's stated scope. Static verification (types, lint, build, and a structural
  no-lifecycle grep check) is fully clean; live database verification is the one remaining gap,
  blocked on an environment limitation outside this session's control.
- 🧪 Tests: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all clean. T028-T032 (live
  Supabase checks) pending migration application by the user.
- 📁 Files: see `files` above — one new migration, one new `lib/` module (5 files), one new
  Server Actions file, five new components, six new route files, two small extensions to existing
  files (`lib/customers/service.ts`, `app/(dashboard)/layout.tsx`), `tasks.md` fully checked off
  through T027 with T028-T032 documented as blocked, this PHR.
- 🔁 Next prompts: apply `supabase/migrations/0008_performa_invoicing.sql` in the Supabase SQL
  editor, then complete T028-T032 (live verification) — either in a follow-up session or by the
  user directly per quickstart.md.
- 🧠 Reflection: Deliberately building User Story 1 and User Story 2 as one code path (rather than
  a single-PO form later retrofitted for multiple POs) removed an entire category of "does the
  extension break the base case" risk — worth defaulting to whenever a later user story's scope
  is a strict superset of an earlier one and the marginal implementation cost of building the
  general case first is small, which the tasks.md Notes section had already flagged as acceptable
  before implementation began.

## Evaluation notes (flywheel)

- Failure modes observed: initial embedded-relation typing was narrower than the codebase's
  established defensive convention — caught during self-review before reporting completion, not
  by an external check.
- Graders run and results (PASS/FAIL): `tsc`/`lint`/`build` — PASS (both before and after the
  typing fix). T027's structural check — PASS (grep-verified). T028-T032 — not run (blocked).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): when writing a new service file that embeds a
  Supabase relation, check an existing service file's row-typing convention *before* writing the
  interface, not after — would have avoided the one fix-up cycle here.
