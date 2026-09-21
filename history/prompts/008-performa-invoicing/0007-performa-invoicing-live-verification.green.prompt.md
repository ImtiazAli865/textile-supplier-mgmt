---
id: 0007
title: Performa Invoicing live verification
stage: green
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: none
labels: ["green", "performa-invoicing", "verification", "concurrency", "browser-testing", "business-sensitive"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/008-performa-invoicing/tasks.md
 - history/prompts/008-performa-invoicing/0007-performa-invoicing-live-verification.green.prompt.md
tests:
 - Live Supabase DB-layer verification (throwaway script) — 8/8 assertions PASS (concurrency race, cross-customer rejection, multi-PO combine)
 - amountInWords standalone verification — 13 representative amounts, all correct
 - Live browser walkthrough (npm run dev + real Chrome session, throwaway QA staff account) — full quickstart.md flow across all three user stories
 - Residue check after cleanup — 0 rows, 0 auth users
---

## Prompt

"Migration 0008_performa_invoicing.sql applied successfully. Please now run the remaining
verification tasks (T028-T032):
1. FR-015 concurrency test — two concurrent create_performa_invoice calls targeting the same
   PO line, confirming the row lock serializes them and the second correctly rejects if it
   would exceed the remaining invoiceable quantity
2. Cross-customer rejection — confirm a PO line from a different customer's PO is rejected
3. Amount-in-words correctness — verify the Lakh/Crore conversion against a few real amounts
   (including the example net total of Rs 403,265)
4. Multi-PO combine (US2) — one invoice spanning two POs of the same customer, confirming one
   combined ledger credit and correct per-PO attribution in the printed view
5. Full quickstart.md walkthrough via the real running app

Show me the results of all five, and confirm any throwaway test data is cleaned up afterward."

## Response snapshot

**Item 3 (amount-in-words)** — ran the actual shipped `lib/performa-invoices/number-to-words.ts`
standalone (Node's `--experimental-strip-types`) against 13 amounts including the business
context's real example: `403265` → `"Four Lakh Three Thousand Two Hundred Sixty Five Rupees
Only"`, plus `341750`/`61515` (the gross/tax from the same example), boundaries (1 Lakh, 1
Crore), and fractional-paisa cases — all arithmetically correct.

**Items 1, 2, 4 (DB-layer)** — wrote a throwaway Node script using the service-role client
directly (mirroring 007's own verification precedent): seeded clearly-marked `ZZZ QA` fixtures
(trade name, product, two customers, POs with lines at known quantities), then:
- Fired two genuinely concurrent `create_performa_invoice` RPC calls (`Promise.allSettled`)
  against the same 100-unit line, each requesting 60 units — exactly one succeeded, the other
  was rejected with `LINE_EXCEEDS_REMAINING_INVOICEABLE: ... has only 40.00 remaining`, and the
  line's final `invoiced_quantity` was confirmed at exactly 60 (never exceeding `delivered_
  quantity`) — proving the `for update of cpl` lock genuinely serializes concurrent transactions
  rather than racing.
- Called `create_performa_invoice` with a line from customer B's PO while `p_customer_id` was
  customer A — rejected with `PO_LINE_WRONG_CUSTOMER`.
- Created one invoice spanning two POs of the same customer — succeeded; confirmed both PO
  lines' `invoiced_quantity` updated correctly, both PO numbers correctly attributed per line,
  and exactly one `ledger_entries` row for the combined net total (12980, matching the computed
  expectation exactly).
All 8 assertions passed. Cleaned up every created row in FK-safe order and confirmed 0 residue.

**Item 5 (live browser walkthrough)** — this required real prerequisite data (a Habbitt-like
customer with genuine delivered-but-uninvoiced quantity), which didn't exist in this project's
Supabase instance yet (empty dev dataset). Seeded it via the actual business process, not a
shortcut: created a supplier, gave the product real stock via `record_unit_purchase` (003b),
created two customer POs, then used `create_challan`/`accept_challan` (007) to produce genuine
`delivered_quantity`. Created a throwaway QA auth user (no reusable staff password was available)
and signed in via a real Chrome session (`npm run dev`). Walked through: the customer-first
picker showing only the eligible customer; adding both POs to one draft via the "Add another PO"
GET-form control (no client-side fetching); submitting — invoice #1 created with correct gross
(Rs 395,250.00)/tax (Rs 71,145.00)/net (Rs 466,395.00) and a matching "Ledger credit posted"
banner; the fully read-only detail page (no edit/void controls anywhere); the print view showing
both PO numbers, correct per-line PO attribution, and "Four Lakh Sixty Six Thousand Three
Hundred Ninety Five Rupees Only" for the net total; uploading a GST attachment (a minimal
throwaway PDF) which rendered as a link resolving to a correctly-scoped signed URL in the
`performa-invoice-attachments` bucket, with totals/ledger unchanged; re-visiting the create form
with both PO lines now fully invoiced correctly showing "This PO has no delivered-but-uninvoiced
quantity."; submitting with no trade name selected showing the client-side validation message;
and a dedicated ineligible-customer check confirming it never appears in the picker, direct URL
access shows "not eligible," and the RPC itself rejects with `CUSTOMER_NOT_INVOICE_ELIGIBLE`.

Cleaned up everything afterward: all QA database rows (customers, POs, lines, challans, challan
lines, the invoice and its attachment row, product, purchase, supplier, trade name) in FK-safe
order, the uploaded file's Storage object, the throwaway auth user, every temporary `.mjs` script
(created directly at the repo root and in the session scratchpad, never committed), and stopped
the dev server. A follow-up query confirmed 0 residual rows and 0 residual auth users.

## Outcome

- ✅ Impact: All five requested verifications passed against the live, migration-applied
  database and a real running app — closing out T028-T032, the only remaining gap from the
  implementation pass. `008-performa-invoicing` is now fully verified end-to-end: schema,
  concurrency-hardened Postgres function, service layer, every UI flow across all three user
  stories, and the printed document's arithmetic, with zero residual test data.
- 🧪 Tests: DB-layer script — 8/8 PASS; `amountInWords` — 13/13 correct; live browser walkthrough
  — every quickstart.md scenario confirmed; residue check — 0 rows, 0 auth users, dev server
  stopped.
- 📁 Files: `specs/008-performa-invoicing/tasks.md` (T028-T032 marked complete with verification
  detail, Implementation Notes appended), this PHR. No application code changed — this was a
  verification-only session.
- 🔁 Next prompts: none required — the feature is complete and verified. A future session could
  add automated tests (Vitest, per research.md's documented but not-yet-wired stack) covering the
  same scenarios this manual pass just confirmed by hand.
- 🧠 Reflection: The live app walkthrough needed a full, realistic prerequisite chain (purchase →
  Challan → acceptance) rather than directly writing `delivered_quantity`, since the point of a
  browser walkthrough is confidence in the *real* end-to-end business process, not just the one
  function under test — worth remembering that DB-layer scripts and browser walkthroughs earn
  their keep differently: the script is for precise, repeatable edge-case control (exact
  concurrency timing, exact remaining quantities); the browser walkthrough is for confidence that
  the actual UI a staff member will use behaves correctly end to end.

## Evaluation notes (flywheel)

- Failure modes observed: the first seed-data attempt failed (`products_quantity_on_hand_check`
  violation) because it skipped the purchase-stock prerequisite for a traded product — caught
  immediately from the error message, fixed by adding the `record_unit_purchase` step, and the
  partial seed was cleaned up before retrying. No other failures.
- Graders run and results (PASS/FAIL): DB-layer script 8/8 PASS; standalone `amountInWords` 13/13
  correct; browser walkthrough — all scenarios confirmed via screenshot evidence; residue check —
  PASS (0/0).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): when seeding QA data for a feature that sits
  downstream of an inventory-affecting flow (Challans, purchases), check the relevant `CHECK`
  constraints on the upstream tables *before* writing the seed script, not after hitting the
  error — would have avoided the one retry cycle here.
