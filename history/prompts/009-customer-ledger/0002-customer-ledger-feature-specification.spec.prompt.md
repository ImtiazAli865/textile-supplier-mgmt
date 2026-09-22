---
id: 0002
title: Customer Ledger feature specification
stage: spec
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "customer-ledger", "customers", "challans", "performa-invoicing", "payments"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/009-customer-ledger/spec.md
 - specs/009-customer-ledger/checklists/requirements.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

All four confirmed:
1. Reversal entry_date should be the bounce-discovery date, not backdated to the original
   payment date — the original debit was correct at the time it was recorded; the reversal
   documents a new event (learning the cheque bounced), consistent with this project's
   "never edit, always post a new visible correcting entry" principle.
2. Multi-PO Performa Invoice credit's PO display should follow the same convention already
   resolved in the master spec (§14, "one invoice, multiple POs"): derive and display as
   "PO-XXXXX / PO-YYYYY" dynamically via join, never stored.
3. Agreed — customer_payments.status being mutable is a deliberate, documented exception to
   this project's usual immutability pattern, since a cheque's real-world status genuinely
   changes over time.
4. Confirmed — Cleared has no ledger effect (the debit already posted at Received); only
   Bounced posts a reversal.

Please proceed to /sp.specify 009-customer-ledger.

## Response snapshot

Ran `git fetch --all --prune` and checked remote branches, local branches, and `specs/` for any
existing `*-customer-ledger` match — none found, so this is feature 009 with short name
`customer-ledger`. Ran `create-new-feature.ps1 -Number 9 -ShortName "customer-ledger"`, which
created and checked out branch `009-customer-ledger` and scaffolded `specs/009-customer-ledger/spec.md`
from the template.

Wrote the full spec with 5 prioritized, independently-testable user stories: (P1) view a
customer's running-balance ledger, matching the manual Excel Date/Invoice#/PO Number/Debit/
Credit/Balance layout, including the derived multi-PO display for Performa Invoice-sourced rows;
(P2) record a customer payment (cheque) that posts a Debit, optionally tied to an invoice/PO or
left as an untied lump sum; (P3) reverse a bounced cheque via a new, separately-dated Credit entry
with the payment's status becoming a final Bounced state; (P4) ageing/overdue classification
using each customer's stored payment-terms range, display-only; (P5) all-customers summary list
plus PDF/Excel export. 15 functional requirements, 7 Key Entities (introducing "Customer Payment"
as a new entity distinct from Ledger Entry), and an Assumptions section capturing all four
decisions confirmed in the prior discussion turn (PHR 0001) — including payment-status mutability
being called out as a deliberate, narrow exception to this project's usual full immutability
pattern. Zero `[NEEDS CLARIFICATION]` markers, since every architecturally significant question
was already resolved before this spec was written.

Created `specs/009-customer-ledger/checklists/requirements.md` and validated the spec against it
on the first pass — all items passed. One self-review correction made before finalizing: reworded
two Assumptions bullets that had leaked backticked table/column identifiers
(`customer_payments`, `ledger_entries`, `create_customer`, `payment_terms_min/max_days`) into
plain business prose, matching 008's cleaner precedent of keeping the spec free of
implementation-level naming even in the Assumptions section (005's spec had one such backtick
reference, but 008 avoided it entirely — followed the stricter convention).

## Outcome

- ✅ Impact: `specs/009-customer-ledger/spec.md` is complete and passes its quality checklist on
  the first validation pass, ready for `/sp.clarify` (likely a no-op given zero markers) or
  directly `/sp.plan`.
- 🧪 Tests: none (spec authoring turn).
- 📁 Files: `specs/009-customer-ledger/spec.md` (new), `specs/009-customer-ledger/checklists/requirements.md` (new).
- 🔁 Next prompts: `/sp.plan 009-customer-ledger` (or `/sp.clarify` first, though likely nothing to
  clarify since the pre-spec alignment discussion already closed every open decision).
- 🧠 Reflection: Running the pre-spec alignment discussion (PHR 0001) as its own turn before
  writing the spec paid off directly here — every decision that would normally surface as a
  `[NEEDS CLARIFICATION]` marker was already resolved, so the spec could be written once, cleanly,
  and pass its checklist without an iteration loop.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): spec quality checklist — 16/16 items PASS on first pass.
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
