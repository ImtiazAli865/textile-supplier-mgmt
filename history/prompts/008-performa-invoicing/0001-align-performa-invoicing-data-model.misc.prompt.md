---
id: 0001
title: Align Performa Invoicing data model before spec
stage: misc
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 007-challans
user: imtiazkind143@gmail.com
command: none
labels: ["planning", "data-model", "performa-invoicing", "customer-purchase-orders", "challans", "ledger", "checkpoint"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/008-performa-invoicing/0001-align-performa-invoicing-data-model.misc.prompt.md
tests:
 - none (planning/discussion turn; no code changed)
---

## Prompt

007-challans is complete and verified. Manual mode is on, so before writing any spec, please
first respond with your analysis of how 008-performa-invoicing should relate to the features
already built — no spec yet.

Business context:
1. Performa Invoicing exists ONLY for Habbitt (customers with issuesPerformaInvoice = true).
   For all other customers, the ledger credit already happens at Challan acceptance (007) —
   this feature must never double-post a ledger entry for a Challan that already posted one.
2. Real-world flow: once a PO is fully delivered (across one or more accepted Challans), a
   Performa Invoice is prepared and sent to Habbitt. A real example: Performa Invoice #18,
   dated 17-3-2026, against PO 10284, with a gross total, an 18% tax line, and a net total
   (e.g. gross 341,750 + tax 61,515 = net 403,265).
3. 006 already reserved an invoiced_quantity column on customer_po_lines for this feature
   to write to — but doesn't say whether invoicing should reference PO lines directly, or
   the accepted Challan lines that actually fulfilled them (since a PO line's delivered
   quantity may come from multiple Challans, and Challan lines already carry accepted
   quantity + snapshot price).
4. Trade names (004) already have a next_invoice_number counter, unused until now.
5. Per the master spec, this feature's job is to generate the Performa Invoice document and
   post its ledger credit — it does not touch the GST Sales Tax Invoice (that's prepared
   externally by the accountant and only attached as a file in this system).

Please tell me:
1. Should invoice lines reference Challan lines (capturing exactly what was actually
   delivered and accepted) or PO lines directly? What are the tradeoffs?
2. How should this feature avoid double-invoicing the same accepted Challan/delivered
   quantity twice?
3. Should one invoice be able to span multiple Challans (even multiple POs, per the master
   spec's earlier-resolved multi-PO invoice pattern), or is it strictly one PO per invoice?
4. Anything else in the existing data model (006/007) that's ambiguous or missing for this
   feature to build on top of.

I want to agree on this before any spec gets written.

## Response snapshot

Read `specs/006-customer-purchase-orders/data-model.md`, `specs/007-challans/data-model.md`,
`specs/005-customers/data-model.md`, `specs/004-trade-names-and-document-settings/data-model.md`,
and `specs/PRODUCT-OVERVIEW.md` to ground the answer in what actually shipped rather than
assumptions. Findings, all cited to file:line:

1. **Invoice lines → PO lines, not Challan lines.** Already resolved at the master-spec level
   (`invoice_lines.po_line_id`, PRODUCT-OVERVIEW.md:203-204, 294-296) and the data model makes it
   the right call: `customer_po_lines.delivered_quantity` is already the correct cumulative
   rollup across all Challans (`accept_challan` step 8, 007 data-model.md:184), and a PO line's
   `unit_price` freezes the moment `delivered_quantity > 0` (006's locking rule, data-model.md:
   50-54), so referencing the PO line can never see a stale price. Trade-off: no stored
   per-Challan provenance on an invoice line (reconstructible via a join, not stored — consistent
   with the project's existing "computed, not stored" pattern for PO totals, 006 data-model.md:
   123-128). Recommended invoice lines still snapshot product/uom/price at creation time,
   mirroring `challan_lines` (007 data-model.md:113-115).
2. **Double-invoicing guard**: transactionally validate each invoice line's quantity against
   `delivered_quantity - invoiced_quantity` and increment `invoiced_quantity` in the same
   function call, mirroring `accept_challan`'s own remaining-quantity pattern (007 data-model.md:
   130-134, 184). Double-posting the ledger credit for an already-credited Challan is already
   structurally impossible: `accept_challan` only posts when `issues_performa_invoice = false`
   (007 data-model.md:187-191), and 008 only ever runs when it's `true` — mutually exclusive
   paths gated by the same flag. Flagged one edge case: a customer's flag changing mid-flight
   after un-invoiced Challans exist.
3. **Multi-Challan and multi-PO invoices**: both fall out of #1 for free — multi-Challan because
   `delivered_quantity` is already summed; multi-PO because the master spec explicitly resolved
   "one invoice may cover multiple POs" with a derived, not stored, PO list (PRODUCT-OVERVIEW.md:
   203-204, 294-296). Recommended `invoices.customer_id` with no `po_id` column.
4. **Gaps surfaced**: no DB-level check tying `invoiced_quantity <= delivered_quantity` (006
   data-model.md:47, unlike 007's `accepted_quantity <= delivered_quantity` CHECK, data-model.md:
   117) — must live in the function body; invoice numbering format unresolved (Challans are
   month-suffixed, PRODUCT-OVERVIEW.md:176, but the user's real example "#18" is plain); tax
   placement/ledger-amount basis unresolved (per-line-configurable per master spec vs. one
   summary tax line in the real example); single-stage vs. Challan's two-stage issued→accepted
   posting lifecycle undecided; post-invoice reversal/adjustment (PRODUCT-OVERVIEW.md:182-184) is
   entirely unmodeled in 006/007.

Followed up with `AskUserQuestion` (two rounds) to close the open items before any spec work.
Decisions recorded:
- Invoice numbering: **plain sequential** (`#18`, `#19`, ...), no month suffix.
- Posting: **single-stage** — invoice creation immediately posts the ledger Credit (no separate
  issue-then-accept step like Challans).
- Post-invoice reversal/adjustment: **deferred** to a later feature; 008 ships creation + posting
  only.
- Ledger credit amount: **net total** (gross + tax), matching the actual receivable.
- Tax rate: **per invoice header**, not per line (one rate applied to the summed gross, matching
  the user's real-world example layout).

## Outcome

- ✅ Impact: Data-model direction for 008 agreed before any spec artifact exists — invoice lines
  reference PO lines (snapshotted), invoice header carries no `po_id`, quantity/price/posting
  rules are pinned down, and five previously-ambiguous decisions (numbering format, posting
  stage, reversal scope, ledger amount basis, tax granularity) are now resolved.
- 🧪 Tests: none (discussion turn).
- 📁 Files: none besides this PHR.
- 🔁 Next prompts: `/sp.specify 008-performa-invoicing` once the user is ready to turn this into
  a spec.
- 🧠 Reflection: Grounding every claim in actual `data-model.md` line citations (rather than the
  master spec alone) surfaced a real tension (PO-line rollup vs. Challan-line detail) that the
  master spec had already silently resolved — worth always re-checking resolved-vs-open status
  against the actual shipped schema, not just the roadmap doc, before presenting a recommendation.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
