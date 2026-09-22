---
id: 0001
title: Align Customer Ledger data model before spec
stage: misc
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: none
labels: ["planning", "data-model", "customer-ledger", "customers", "challans", "performa-invoicing", "checkpoint"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/009-customer-ledger/0001-align-customer-ledger-data-model.misc.prompt.md
tests:
 - none (planning/discussion turn; no code changed)
---

## Prompt

008-performa-invoicing is complete and verified. Manual mode is on, so before writing any
spec, please first respond with your analysis of how 009-customer-ledger should relate to
the features already built — no spec yet.

Business context:
1. This feature ties together the ledger_entries table that 005 (opening balances), 007
   (Challan acceptance credits for non-Performa customers), and 008 (Performa Invoice
   credits for Habbitt) have all been writing to independently. 009's job is to present
   this as a real running-balance ledger per customer, and to add the missing piece:
   recording actual customer PAYMENTS (debits) — cheque number, bank, status
   (Received/Cleared/Bounced), with a reversal entry when a cheque bounces.
2. 005 already stores each customer's expected payment-terms range (payment_terms_min_days,
   payment_terms_max_days) — meant to be used here for ageing/reporting classification only
   ("within expected range" / "beyond expected range"), never as a rule that blocks or flags
   a payment as wrong.
3. Per the master spec's document workflow: manual Excel ledger tracked Credit (delivery/
   invoice) = Debit (cheque received) = running Balance. This feature should replicate that
   view per customer, plus an overall list/summary across all customers.
4. A bounced cheque needs a reversing ledger entry (per our earlier design principle: never
   silently edit a posted entry, always post a new visible correcting one) — same "audit
   trail" pattern already used for 005's opening balance immutability.

Please tell me:
1. Should cheque/payment records be a new table (e.g. customer_payments) that WRITES
   ledger_entries, similar to how 007/008 each write it via their own Postgres functions?
   Or should payment fields (cheque number, bank, status) live directly on ledger_entries
   rows of type 'debit'?
2. How should a bounced cheque's reversal work mechanically — does the original debit entry
   get a linked reversing credit entry, and does the cheque's own status field just change
   to 'Bounced', or does something else happen?
3. Should this feature allow recording a payment that isn't tied to any specific
   invoice/challan (a lump-sum payment against the overall balance), given the real business
   example we saw earlier where Habbitt's ledger tracks a running balance rather than
   invoice-by-invoice reconciliation?
4. Anything ambiguous or missing in 005/007/008's existing ledger_entries design that this
   feature needs to resolve before building on top of it.

I want to agree on this before any spec gets written.

## Response snapshot

Read `supabase/migrations/0005_customers.sql` (ledger_entries table + create_customer),
`0007_challans.sql` (accept_challan's ledger write), `0008_performa_invoicing.sql`
(create_performa_invoice's ledger write), `lib/customers/ledger.ts` (live balance query),
`specs/PRODUCT-OVERVIEW.md`, and `specs/005-customers/spec.md`'s edge cases to ground the
answer in what actually shipped and what the master spec already pre-agreed (2026-09-20
shared-table decision), rather than re-deriving from scratch. Findings, all cited:

1. **New `customer_payments` table** — already decided at the master-spec level, not just a
   recommendation: PRODUCT-OVERVIEW.md:282-283 explicitly states `customer_payments` (cheque
   details, bounce handling) "live entirely in 009." Mirrors 007/008: a
   `record_customer_payment(...)` Postgres function inserts into `customer_payments` and a
   debit into `ledger_entries` (`source_type = 'payment'`, `source_id = customer_payments.id`)
   in one transaction (ADR-0002). Rejected putting cheque fields on `ledger_entries` directly —
   that table is structurally immutable (0005_customers.sql:163) and a mutable `status` field
   doesn't belong there.
2. **Bounced-cheque reversal**: two distinct mechanics. `customer_payments.status` mutates in
   place (`Received → Bounced`) via a `mark_payment_bounced(id)` function — precedented by
   `challans.status` mutating in `accept_challan` (0007_challans.sql:579), not by any prior
   ledger-table behavior. Separately, that same function posts a brand-new `ledger_entries`
   credit row (`source_type = 'payment_reversal'`, `source_id = customer_payments.id`) — never
   edits the original debit, per PRODUCT-OVERVIEW.md:208-210 and the identical precedent already
   written into specs/005-customers/spec.md:129-133 (opening-balance edge case explicitly citing
   the bounced-cheque immutability principle). Flagged the reversal's `entry_date` (backdated to
   original payment vs. dated at bounce-discovery) as an open decision, recommending the latter.
3. **Lump-sum/untied payments**: yes, and the schema already anticipates this —
   `ledger_entries.source_id` has deliberately no FK and is nullable (0005_customers.sql:165,
   "deliberately polymorphic... Null for this feature's rows"). Recommended `customer_payments`
   carry an optional, non-validated reference to what it's against, matching how
   `payment_terms_min/max_days` is already classification-only, never enforcement
   (0005_customers.sql:39).
4. **Gaps surfaced**: rendering the spec's required "PO Number" ledger column
   (PRODUCT-OVERVIEW.md:205) is non-trivial for `performa_invoice`-sourced credits, since one
   invoice can span multiple POs by design (PRODUCT-OVERVIEW.md:203-204, 294-296,
   derived-not-stored) — needs an explicit rendering decision; `source_type` has no lookup
   table so 009's read path must hand-roll a join per known value; `customer_payments` having a
   mutable status is a deliberate, narrow exception to the project's general immutability
   pattern and should be stated as such rather than assumed generic; whether `Cleared` status
   has any ledger effect at all (assumed no — only `Bounced` posts) needs explicit confirmation.

## Outcome

- ✅ Impact: Data-model direction for 009 agreed before any spec artifact exists —
  `customer_payments` as a new table writing `ledger_entries` via a Postgres function (mirroring
  007/008), reversal-via-new-entry mechanics pinned to precedent already written into 005's own
  spec, lump-sum payments confirmed supported by the existing polymorphic `source_id` design, and
  four open items surfaced (reversal entry_date policy, multi-PO ledger row rendering, mutable
  status as a stated exception, Cleared's no-op status) for the user to close before `/sp.specify`.
- 🧪 Tests: none (discussion turn).
- 📁 Files: none besides this PHR.
- 🔁 Next prompts: `/sp.specify 009-customer-ledger` once the user is ready to turn this into a
  spec, after closing the four open items above.
- 🧠 Reflection: This is the second feature in a row (after 008) where the master spec's
  "Shared-table decisions" section had already pre-resolved the primary architectural question
  (new table vs. columns on the shared table) — checking that section first, before reasoning
  from the shared table's shape alone, avoided re-litigating an already-settled call and let the
  analysis focus on the genuinely open mechanics (reversal timing, multi-PO rendering).

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
