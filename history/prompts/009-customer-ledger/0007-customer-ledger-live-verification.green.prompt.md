---
id: 0007
title: Customer Ledger live verification
stage: green
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: none
labels: ["verification", "customer-ledger", "customer-payments", "concurrency", "fifo-ageing", "csv-export", "live-testing"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: history/adr/0007-csv-export-via-route-handler.md
  pr: null
files:
 - specs/009-customer-ledger/tasks.md
tests:
 - "T040-T044: DB-layer pass, 7/7 assertions PASS (concurrency race, cross-customer reference rejection, bounce/ageing dating, multi-PO rendering, balance cross-checks)"
 - "T040-T044: live browser walkthrough — ledger view, Record Payment form, Mark Cleared, all-customers summary, both print routes, CSV export with special-character filename sanitization (verified via actual downloaded file)"
---

## Prompt

Migration 0009_customer_ledger.sql applied successfully. Please now run the remaining
verification tasks (T040-T044):
1. Concurrency race — two concurrent update_customer_payment_status calls targeting the same
   payment (both trying to mark it Bounced or one Cleared/one Bounced), confirming the row
   lock serializes them and only one succeeds
2. Cross-customer reference rejection — confirm a payment referencing another customer's PO
   or invoice is rejected
3. Bounce/ageing interplay — record a payment, mark it Bounced, and confirm the reversal
   credit's age is classified from the bounce-discovery date, not the original delivery date
4. Multi-PO rendering — confirm a Performa Invoice covering multiple POs displays all PO
   numbers correctly on its ledger row
5. Full quickstart.md walkthrough via the real running app, including the CSV export with a
   customer name containing special characters (to verify the filename sanitization fix)

Show me the results of all five, and confirm any throwaway test data is cleaned up afterward.

## Response snapshot

Discovered the Supabase database was entirely empty (no customers/products/trade names at all,
except one genuinely pre-existing supplier + purchase from a week before this session,
correctly identified via a read-only query and left untouched throughout). Built a full
verification harness in `.qa-scratch/` (never committed, deleted at the end): confirmed `tsx
--conditions=react-server` lets Node import the actual production `lib/` modules directly
(bypassing the `server-only` package's throw via its `react-server` export condition) — so
verification called the real `recordCustomerPaymentRecord`, `updateCustomerPaymentStatusRecord`,
`getCustomerLedger`, `getCustomerAgeing`, `listCustomerLedgerSummaries`, `renderLedgerCsv`, and
`sanitizeFilenamePart` functions directly, not reimplemented logic.

Seeded a full realistic chain via real RPCs, not shortcuts: `create_supplier` →
`record_unit_purchase` (discovered mid-run that `products.quantity_on_hand` has a `>= 0` CHECK,
so a traded product needs real purchased stock before a Challan can decrement it — first attempt
without this correctly failed, fixed by adding the purchase step) → `create_customer` (×2, one
Habbitt-like customer flagged `issues_performa_invoice=true` with a display name deliberately
containing `&`, `"`, `/` to test filename sanitization, one plain customer for the cross-reference
test) → `create_customer_po` (×3) → `create_challan`/`accept_challan` (×2) →
`create_performa_invoice` spanning both POs, backdated 20 days for a realistic FIFO-ageing
timeline.

Ran all five checks against real data: T040 (concurrency — one of two simultaneous status-change
calls on the same payment succeeded, the other rejected with `PAYMENT_STATUS_FINAL`); T041
(cross-customer reference — rejected with the friendly error); T042 (bounce dating — the
reversal's `ledger_entries.entry_date` confirmed as today, not the 10-days-ago payment date or the
20-days-ago invoice date, with `getCustomerAgeing` showing the reversed amount as a fresh
today-dated open entry separate from the still-20-day-old invoice remainder); T043 (multi-PO — the
invoice's ledger row correctly showed both PO numbers). Two independent balance cross-checks also
passed (raw SUM vs. `getCustomerLedger.currentBalance`; summary vs. per-customer ledger).

Then drove the actual running app in a real browser as the QA user (password reset via
`admin.auth.admin.updateUserById` since the original was never saved): the ledger view rendered
all seeded rows correctly including the multi-PO row and both dated-today bounce reversals;
recorded a new payment live through the real form (including the PO-reference dropdown); clicked
"Mark Cleared" and confirmed zero ledger effect; checked the all-customers summary and both print
routes; and — the key T044 check — clicked "Export CSV" on the special-character customer and
confirmed via the actual downloaded file on disk (`ZZZ QA Customer A  Co Textiles  Ltd-ledger.csv`,
content matching the on-screen table exactly) that `sanitizeFilenamePart` works end-to-end through
the real Route Handler, not just as a unit-level function call.

Caught one real gap during cleanup: the payment recorded live through the browser wasn't tracked
in the seed script's own cleanup list (only script-created rows were), surfaced by the cleanup
script's own residue check reporting `customer_payments: 1` remaining — fixed with a small
follow-up script rather than leaving it. Final residue check confirmed 0 across every table this
feature or its prerequisites touch; the one genuinely pre-existing supplier/purchase was
untouched. Dev server stopped, downloaded CSV files removed, `.qa-scratch/` deleted.

## Outcome

- ✅ Impact: All 44 tasks in `tasks.md` now complete, including live verification (T040-T044) —
  all PASS, against real database state using real production code paths. 009-customer-ledger is
  fully implemented and verified.
- 🧪 Tests: 7/7 DB-layer assertions PASS; full browser walkthrough of all 5 user stories PASS,
  including the CSV filename sanitization verified via an actual downloaded file, not just a
  function call.
- 📁 Files: `specs/009-customer-ledger/tasks.md` (T040-T044 marked complete, Implementation Notes
  updated with full verification detail). No application code changed — this was a verification
  pass only, no bugs found requiring a fix.
- 🔁 Next prompts: None required — feature is complete. Possible follow-ups: wire up Vitest tests
  (deferred throughout 001-009 per each feature's own tasks.md), or proceed to the next roadmap
  feature.
- 🧠 Reflection: Running verification against the real `lib/` modules (via `tsx
  --conditions=react-server`) rather than hand-rolled SQL assertions caught something a
  reimplemented check would have missed entirely — the `products.quantity_on_hand` CHECK
  constraint gap in the seed data — and gave far higher confidence that the actual shipped code
  path (not a parallel approximation of it) was what got exercised. Worth using this pattern as
  the default for future features' live verification, not just ad hoc SQL/RPC calls.

## Evaluation notes (flywheel)

- Failure modes observed: one seed-script gap (products needing real stock before Challan
  acceptance) caught by a real CHECK constraint violation and fixed inline; one cleanup-tracking
  gap (the live-browser-created payment) caught by the cleanup script's own residue check and
  fixed before declaring done — both self-corrected within the same session, neither required
  user intervention.
- Graders run and results (PASS/FAIL): all 7 DB-layer assertions PASS; all manual browser checks
  PASS; final residue check PASS (0 remaining across all touched tables).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): for the next feature's live verification, default to
  the `tsx --conditions=react-server` pattern for exercising real `lib/` code directly, rather
  than reimplementing assertions in raw SQL/RPC calls.
