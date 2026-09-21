---
id: 0002
title: Performa Invoicing feature specification
stage: spec
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "performa-invoicing", "customer-purchase-orders", "challans", "ledger", "business-sensitive"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/008-performa-invoicing/spec.md
 - specs/008-performa-invoicing/checklists/requirements.md
 - history/prompts/008-performa-invoicing/0002-performa-invoicing-feature-specification.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

`/sp.specify 008-performa-invoicing`

(The literal slash-command argument was just the feature slug; per the command's own instruction,
the effective feature description was carried forward from the immediately preceding discussion
turn — see `history/prompts/008-performa-invoicing/0001-align-performa-invoicing-data-model.misc.prompt.md`
— where the user gave the business context and, via two rounds of `AskUserQuestion`, resolved:
invoice lines reference PO lines not Challan lines; invoice numbering is plain sequential (no
month suffix); posting is single-stage (creation = ledger posting, no issued→accepted lifecycle);
the ledger credit equals the invoice's net total (gross + tax); tax rate is set once per invoice
header, not per line; and post-invoice reversal/adjustment is deferred to a later feature. The
standard `/sp.specify` command-template boilerplate accompanying the argument is omitted here as
fixed, non-user-authored instructional content, consistent with this project's PHR convention of
recording user-authored input rather than repeating static command scaffolding verbatim.)

## Response snapshot

Created branch `008-performa-invoicing` and ran
`.specify/scripts/powershell/create-new-feature.ps1 -Json -Number 8 -ShortName "performa-invoicing"`
with a synthesized feature description reflecting the prior turn's resolved decisions. Wrote
`specs/008-performa-invoicing/spec.md` following the template structure and the style established
by `specs/007-challans/spec.md`:

- **User Story 1 (P1)** — generate and post a Performa Invoice against a single PO's
  delivered-but-uninvoiced quantity, immediately posting the ledger credit and PO-line invoiced
  figure in one atomic action (no separate confirm/accept step, per the resolved single-stage
  decision).
- **User Story 2 (P2)** — combine delivered-but-uninvoiced quantity from more than one PO of the
  *same* customer onto a single invoice (multi-PO, resolved at the master-spec level), with an
  explicit rejection scenario for cross-customer mixing.
- **User Story 3 (P3)** — attach the externally-prepared GST Sales Tax Invoice PDF as
  reference-only evidence, never generated or calculated by this feature.
- 10 edge cases covering: non-flagged customers, zero-remaining lines, race conditions between two
  near-simultaneous invoices against the same line, duplicate invoice numbers, PO-cancellation
  interaction (shown to be structurally impossible via 006's existing lock rule), zero-line
  submissions, live tax-rate recompute vs. frozen-on-create totals, and out-of-scope
  reversal/adjustment.
- 15 functional requirements (FR-001–FR-015) covering the flag gate, same-customer line
  validation, remaining-invoiceable-quantity guard, plain sequential per-trade-name numbering,
  header-level tax computation, the printed document's required contents, the atomic
  posting/invoiced-figure-increment requirement, the no-double-post guarantee for non-Performa
  customers, read-only/no-delete guarantees, optional GST attachment, list/detail views, auth, and
  audit fields.
- Key Entities: Performa Invoice, Invoice Line, GST Invoice Attachment (new), plus read/partial-
  write relationships into Customer PO Line, Customer PO, Trade Name, Customer, and Ledger Entry
  (from 006/004/005).
- Assumptions section makes explicit every decision resolved in the prior turn (single customer
  per invoice, plain sequential numbering, single-stage posting, header-level tax, net-total
  ledger credit, deferred reversal, and the 006 locking-rule side effect).
- Zero `[NEEDS CLARIFICATION]` markers — everything ambiguous had already been resolved via
  `AskUserQuestion` in the prior turn.

Wrote `specs/008-performa-invoicing/checklists/requirements.md`; all items passed on the first
validation pass (content quality, requirement completeness, feature readiness) since no open
questions remained going in.

## Outcome

- ✅ Impact: `008-performa-invoicing` now has a complete, validated spec ready for `/sp.clarify`
  (optional) or `/sp.plan`, fully grounded in the prior turn's resolved data-model decisions and
  the existing 004/005/006/007 shipped schema.
- 🧪 Tests: none (spec authoring turn).
- 📁 Files: `specs/008-performa-invoicing/spec.md`,
  `specs/008-performa-invoicing/checklists/requirements.md`, this PHR.
- 🔁 Next prompts: `/sp.clarify 008-performa-invoicing` (optional, given no markers remain) or
  `/sp.plan 008-performa-invoicing`.
- 🧠 Reflection: Resolving every ambiguity in the prior discussion turn (via `AskUserQuestion`)
  before writing the spec meant this pass produced zero `[NEEDS CLARIFICATION]` markers and a
  clean first-pass checklist — confirms that front-loading disagreement resolution into a
  pre-spec discussion (as this project's CLAUDE.md's "Human as Tool Strategy" calls for) pays off
  directly in spec quality and iteration count.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): requirements.md checklist — all items PASS on first pass.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
