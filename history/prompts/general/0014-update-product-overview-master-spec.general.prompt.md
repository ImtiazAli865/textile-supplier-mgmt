---
id: 0014
title: Update PRODUCT-OVERVIEW.md to master spec
stage: general
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: none
branch: 002-raw-material-purchases
user: ImtiazAli865
command: none
labels: ["architecture", "master-spec", "product-overview", "roadmap"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - specs/PRODUCT-OVERVIEW.md
tests:
---

## Prompt

Yes, agreed — go ahead and update PRODUCT-OVERVIEW.md

## Response snapshot

Rewrote `specs/PRODUCT-OVERVIEW.md` in full to match the master specification from
`history/prompts/general/0013-ma-textile-master-spec-build-order-review.general.prompt.md`,
incorporating the build-order and open-point resolutions agreed in that prior exchange.

Key content of the rewritten file:
- Glossary, two-stream business model (Trading / Contract Manufacturing) with the Stream B
  worked-example costing rule (wastage reported, never deducted from cost basis).
- Product Catalog, Customers, Trade Names & Document Settings, Production Batches, Labour/
  Commission Ledger, Finished Goods Inventory, Customer POs, Challans, Invoicing/Payments/
  Customer Ledger, Cross-Cutting Technical Requirements, Profit & Reports — condensed from
  the master spec's §2–§12.
- **Module Roadmap table** updated to the agreed revised order: 001/002 (done), 003
  Product Catalog, **003b** (new) Traded-Goods Purchasing extending 002 and introducing the
  `inventory_movements` table as its first writer, 004 Trade Names & Document Settings, 005
  Customers (now also introducing `ledger_entries` to hold each customer's opening
  balance), 006 Customer POs, 007 Challans (writes `inventory_movements` + `ledger_entries`
  Credits for non-Performa customers), 008 Performa Invoicing (writes `ledger_entries`
  Credits for Habbitt), 009 Customer Ledger (now presentation-only: balance view, ageing,
  payments/cheques, export), 010 Production Batches, 011 Labour/Commission Ledger, 012
  Finished Goods Inventory (now presentation-only over `inventory_movements`), 013 Profit &
  Reports.
- Added an explicit "Shared-table decisions" subsection explaining why
  `inventory_movements` and `ledger_entries` were pulled forward to 003b and 005
  respectively, including the manual/opening stock-adjustment hedge for the window where
  007 (Challans) ships before 010 (Production Batches).
- Added a "Resolved Open Points" section capturing all seven §14 decisions plus the
  already-decided free trade-name-selection rule, and a "Carried forward for later
  clarification" subsection for the two non-blocking items flagged in the prior exchange
  (customer trade-name list as soft default only; contractor rate-per-packet precedence
  deferred to the 010 spec).
- Retained Explicitly Out of Scope and Definition of Done sections from the master spec,
  and updated Cross-Cutting Notes for Future Specs to reference the new shared tables.

No other files were changed. No `/sp.specify`, `/sp.plan`, `/sp.tasks`, or `/sp.implement`
was run.

## Outcome

- ✅ Impact: `specs/PRODUCT-OVERVIEW.md` now reflects the agreed master spec and revised
  build order; this is the shared context future feature specs (starting with
  003-product-catalog) will draw from.
- 🧪 Tests: none (documentation-only change).
- 📁 Files: `specs/PRODUCT-OVERVIEW.md` (rewritten in full).
- 🔁 Next prompts: expected next step is `/sp.specify` for `003-product-catalog`; the
  shared-table pull-forward decision remains available to document via
  `/sp.adr shared-ledger-and-inventory-tables` if the user wants it recorded, and the
  003b traded-purchasing schema extension is a candidate for its own ADR once planned.
- 🧠 Reflection: Kept the rewrite as a condensed, cross-referenced living document rather
  than duplicating the full master spec verbatim (that verbatim copy already lives in PHR
  0013) — PRODUCT-OVERVIEW.md is meant to be read repeatedly by future specs, so density
  and a clear roadmap table mattered more than completeness of prose.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): not applicable — no automated graders configured for this stage.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
