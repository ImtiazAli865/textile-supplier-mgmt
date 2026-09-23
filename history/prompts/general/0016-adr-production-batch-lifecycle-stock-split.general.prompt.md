---
id: 0016
title: ADR production batch lifecycle stock split
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: none
branch: 009-customer-ledger
user: ImtiazAli865
command: /sp.adr production-batch-lifecycle-and-stock-split
labels: ["adr","010-production-batches","inventory_movements","lifecycle","contractors"]
links:
  spec: null
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - history/adr/0008-production-batch-lifecycle-and-stock-split.md
tests:
 - none (documentation only)
---

## Prompt

Reviewed your analysis — agreeing with all four of your technical recommendations:

1. Fabric stays tracked on the lot (raw_material_purchases.remaining_weight_kg), never enters 
   inventory_movements. Confirmed.
2. Lifecycle: Issued → Completed / Voided, matching Challans' pattern. Confirmed.
3. Labour rate pre-fills from products.default_labour_rate_per_packet only; the batch's 
   entered value always wins and freezes at completion. Create a minimal contractors table 
   in 010 (name, phone, active/inactive); defer any contractor-level or contractor×product 
   rate table to 011, since a flat per-contractor rate would be wrong (rate depends mostly on 
   the product). Confirmed.
4. Please run /sp.adr production-batch-lifecycle-and-stock-split — this affects 011/012/013.

On the four gaps, here's the real business input:

Gap 1 (unused fabric returns): Does NOT happen. Whatever fabric is issued always either 
converts to packets or becomes wastage — never returned unconverted. No "returned kg" field 
needed; cost basis is always the full issued kg, no adjustment.

Gap 2 (partial/multiple deliveries per batch): The business deals with exactly ONE contractor 
per batch relationship — that contractor internally works with 5-6 of their own sub-partners, 
but that's the contractor's own business, invisible to this system. Given that, and given how 
rare/complex true partial-delivery tracking would be, let's go with your recommended v1 
approach: single Complete action, no batch_receipts child table. If a delivery genuinely comes 
in stages, staff will just issue multiple smaller batches instead. Confirmed as your 
recommendation.

Gap 5 (existing unrecorded manufactured stock): CONFIRMED — real physical stock already exists 
on the shelf for some manufactured products with zero system record right now. Please add an 
opening-stock inventory_movements entry mechanism for manufactured products, using the same 
'opening_balance' source_type pattern 007 already established for traded products at its own 
cutover. This should be a one-time entry per manufactured product at 010's go-live, same shape 
as 007's backfill.

Please also apply your own listed smaller defaults (whole-number packets, weight-converted 
≤ weight-issued, inactive entities excluded from pickers, lot picker showing 
supplier·date·remaining/total·rate, split issue/completion dates) — all agreed.

One more important business detail on the Complete step: when the contractor returns the 
finished packets, staff record BOTH:
1. The packet count (this is what matters for selling — customer orders are placed in packet 
   units, and this is what drives quantity_on_hand and production output)
2. The total weight of the returned packets, weighed separately, as a cross-check/verification 
   against the weight issued (helps confirm the yield is reasonable) — this is informational 
   only, never overriding or blocking on the packet count entered.

Please incorporate both figures into the Complete step's fields.

Once the ADR is done, please proceed to /sp.specify 010-production-batches.

## Response snapshot

Created ADR-0008 (Accepted) clustering: stock split (fabric on lot remaining_weight_kg, packets via
inventory_movements), Issued→Completed/Voided lifecycle with side effects per transition, labour
rate pre-fill/freeze + minimal contractors table at 010, and one-time manufactured opening_balance
entry. Alternatives: fabric-as-product, single atomic action, decrement at complete, batch_receipts,
returned-kg, contractor-level rate, free-text contractor. No conflicts with ADR-0002/0004/0005.
Ran without plan.md (none exists pre-spec) using the agreed analysis as source; no create-adr
script exists so the file was written agent-natively.

## Outcome

- ✅ Impact: Decision record for 010 that 011/012/013 can rely on.
- 🧪 Tests: none
- 📁 Files: history/adr/0008-production-batch-lifecycle-and-stock-split.md
- 🔁 Next prompts: /sp.specify 010-production-batches
- 🧠 Reflection: Weighed-packet weight fills the master spec's "weight converted" slot; wastage derives from it.

## Evaluation notes (flywheel)

- Failure modes observed: sp.adr prerequisite (plan.md) not met; proceeded on explicit user request.
- Graders run and results (PASS/FAIL): clustered PASS; alternatives listed PASS; pros/cons PASS; concise PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
