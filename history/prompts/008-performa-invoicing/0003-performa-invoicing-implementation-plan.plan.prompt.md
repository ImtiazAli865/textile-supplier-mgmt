---
id: 0003
title: Performa Invoicing implementation plan
stage: plan
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "performa-invoicing", "customer-purchase-orders", "challans", "ledger", "postgres-functions", "business-sensitive"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/008-performa-invoicing/plan.md
 - specs/008-performa-invoicing/research.md
 - specs/008-performa-invoicing/data-model.md
 - specs/008-performa-invoicing/contracts/server-actions.md
 - specs/008-performa-invoicing/quickstart.md
 - history/prompts/008-performa-invoicing/0003-performa-invoicing-implementation-plan.plan.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

`/sp.plan 008-performa-invoicing`

(The literal slash-command argument was just the feature slug; the plan was generated entirely
from the already-written and already-validated `specs/008-performa-invoicing/spec.md`, per the
command's own Phase 0/Phase 1 workflow, plus direct inspection of the actual shipped 004/005/006/
007 schema and service-layer code to ground every design choice in what really exists rather than
what the spec alone implies.)

## Response snapshot

Ran `.specify/scripts/powershell/setup-plan.ps1 -Json` to scaffold `plan.md`. Before writing,
inspected the real, already-implemented codebase (not just prior specs) to ground every decision:
`specs/007-challans/{plan,research,data-model,contracts/server-actions,quickstart}.md` for style
and precedent; `lib/challans/service.ts`, `lib/customers/ledger.ts` for concrete
RPC-call/error-mapping/ledger-read patterns; `lib/customer-pos/service.ts` and
`lib/customers/service.ts` for exact existing exports (`getCustomerPO`, `listCustomerPOs`,
`listActiveCustomersForSelect`) and field-naming conventions (`deliveredQuantity`/
`invoicedQuantity` already returned by `getCustomerPO`); `lib/trade-names/schema.ts`/`service.ts`
confirming `nextInvoiceNumber` already exists, unused; the actual `app/`/`lib/`/`components/`/
`supabase/migrations/` tree via `find`; `history/adr/0005-*.md` and `0006-*.md` (the latter
explicitly naming 008 as its anticipated "second application"); package.json for exact dependency
versions.

Wrote four artifacts:

- **research.md** — six decisions, each citing the concrete precedent it follows or deliberately
  diverges from: (1) only `create_performa_invoice` exists, no update/void/accept counterparts,
  since FR-007's single-stage decision leaves no intermediate state to manage; (2)
  `performa_invoices`/`performa_invoice_lines` are insert-only from row zero (`created_at`/
  `created_by` only, no update trigger) — closer to `ledger_entries`' shape (005) than any editable
  header table; (3) gross/tax/net totals computed at read time from lines + a stored `tax_rate`,
  never stored as columns, matching 006/007's own total-computation precedent, with the one
  necessary exception being the `ledger_entries.amount` row itself; (4) `performa_invoice_lines`
  snapshots `product_id`/`uom`/`unit_price`, exactly reapplying 007's `challan_lines` reasoning; (5)
  `performa_invoice_attachments` is a child table (zero-to-many), the opposite cardinality choice
  from Challan's nullable-columns shape, using 007's own cardinality-based reasoning in the other
  direction; (6) amount-in-words is a ~50-line local utility using the South Asian
  (Lakh/Crore) numbering convention, no new dependency, matching ADR-0006's zero-new-dependency
  precedent; plus the entry-point UX decision (customer-first picker, no PO-detail-page shortcut,
  since an invoice can span multiple POs unlike a Challan) and the full `create_performa_invoice`
  step-by-step transaction design (customer-eligibility gate, per-line customer/cancellation/
  remaining-quantity validation, numbering, snapshot, PO-line increment, ledger post).
- **data-model.md** — `performa_invoices` (customer/trade-name refs, `invoice_number`, `invoice_date`,
  `tax_rate`, `created_at`/`created_by` only), `performa_invoice_lines` (PO-line ref, snapshotted
  product/uom/price, `invoiced_quantity`), `performa_invoice_attachments` (child table for GST PDF
  uploads), the `create_performa_invoice` function's full 10-step body with every error code named,
  the fourth Storage bucket, and the explicit statement that no update/void/accept function exists
  at all.
- **contracts/server-actions.md** — `createPerformaInvoice`, `uploadPerformaInvoiceGstAttachment`,
  `listPerformaInvoices`, `getPerformaInvoice`, `getPerformaInvoiceForPrint`,
  `getInvoiceableLinesForPO`, and one small new export on 005's own service
  (`listPerformaInvoiceCustomersForSelect`) — plus an explicit "Reused, unchanged" section naming
  every 004/006 export this feature calls without modification.
- **quickstart.md** — manual verification flow matching all three user stories plus the
  double-invoicing guard edge case, mirroring 007's quickstart structure.

Filled `plan.md`'s Technical Context, Constitution Check (concluding no new ADR is warranted — every
choice is a direct, unmodified application of ADR-0002/0003/0006, explicitly noting ADR-0006 itself
already names this feature as its anticipated second application), full Project Structure (grounded
in the actual current `app/`/`lib`/`components` tree, not a generic template), and an empty
Complexity Tracking table (no violations to justify — the single-stage design *reduces* surface
area relative to 007's four-function lifecycle). Ran
`.specify/scripts/powershell/update-agent-context.ps1 -AgentType claude`, which reported success
but produced no tracked diff in `CLAUDE.md` — its expected marker sections aren't present in this
project's customized `CLAUDE.md`, so it was a safe no-op, confirmed via `git status`/`git diff`.

## Outcome

- ✅ Impact: `008-performa-invoicing` now has a complete Phase 0/Phase 1 plan grounded directly in
  the real, already-implemented 004-007 codebase (not just prior spec/data-model text), with every
  Constitution Check item resolved as pure ADR reuse and zero complexity-tracking violations.
- 🧪 Tests: none (planning turn).
- 📁 Files: `specs/008-performa-invoicing/plan.md`, `research.md`, `data-model.md`,
  `contracts/server-actions.md`, `quickstart.md`, this PHR.
- 🔁 Next prompts: `/sp.tasks 008-performa-invoicing`.
- 🧠 Reflection: Reading the actual shipped `lib/challans/service.ts` and `lib/customer-pos/
  service.ts` (not just their feature's own data-model.md prose) surfaced concrete, reusable exports
  (`getCustomerPO` already returns `invoicedQuantity`; `listCustomerPOs` already filters by
  `customerId`) that let this plan avoid proposing any redundant new read functions — worth doing
  for every future plan, not just when a prior data-model doc seems ambiguous.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
