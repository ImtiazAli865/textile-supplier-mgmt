---
id: 0001
title: Production batches feature specification
stage: spec
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: /sp.specify 010-production-batches
labels: ["spec","production-batches","contractors","opening-stock","inventory_movements"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - specs/010-production-batches/spec.md
 - specs/010-production-batches/checklists/requirements.md
tests:
 - none (specification only)
---

## Prompt

010-production-batches: Production Batches for MA Textile — convert a weight (kg) of a raw fabric lot (raw_material_purchases, weight mode) into whole-number packets of one manufactured product via one external contractor. Lifecycle Issued → Completed / Voided (mirrors Challans). Issue: pick lot (picker shows supplier·date·remaining/total kg·Rs/kg; fully consumed lots excluded), weight issued (≤ lot remaining, lot row-locked, decrements remaining_weight_kg at issue; triggers 002's existing lock), manufactured product (active only), contractor (active only), labour rate per packet (pre-filled from products.default_labour_rate_per_packet, editable while issued, frozen at completion), issue date; shows expected packets = kg × expected_yield_per_kg as suggestion only. Edit/Void only while Issued (void restores full issued weight to lot). Complete: packets produced (whole number, authoritative, drives stock and costing), total weight of the returned packets weighed separately (informational cross-check = weight converted; never overrides/blocks packet count; exceeding weight issued should be a soft warning due to packaging weight — to confirm), completion date; writes +packets inventory_movements row (source_type 'production_batch') dated on completion date and recomputes quantity_on_hand; computes and freezes raw material cost = weight ISSUED × lot rate/kg, labour cost = packets × rate, total cost, average cost per packet, wastage kg/Rs/% (reported only, never deducted), and yield variance vs expected (displayed, never enforced). Completed is read-only. No returned-kg field (unused fabric never returned). No partial receipts (issue smaller batches instead). One batch = one lot = one product = one contractor. Creates a minimal contractors table (name, phone, active/inactive) with simple management; payments/commission/contractor rates are 011. One-time opening-stock entry per manufactured product at go-live via inventory_movements source_type 'opening_balance' (same shape as 007's traded backfill), resolving 007's manufactured interim limitation. Issued batches list serves as work-in-progress view. See ADR-0008 and specs/PRODUCT-OVERVIEW.md Production Batches.

## Response snapshot

Created branch 010-production-batches and spec with 6 user stories (Issue P1, Complete P1, Opening
stock P1, Edit/Void P2, WIP list & detail P2, Contractors P2), 28 FRs, edge cases, assumptions,
dependencies, out-of-scope, 7 success criteria, and a worked example (3,000 kg @ Rs 66.67, 2,500
packets, Rs 10/packet → Rs 225,010 total, Rs 90.00/packet, 100 kg / Rs 6,667 / 3.33% wastage).
Three clarifications left open: returned weight > issued (soft warning vs block), correcting a
wrong opening stock entry, and whether opening stock carries a cost per packet.

## Outcome

- ✅ Impact: Spec ready for clarification answers, then /sp.plan.
- 🧪 Tests: none
- 📁 Files: spec.md, checklists/requirements.md
- 🔁 Next prompts: answer Q1–Q3 → /sp.plan
- 🧠 Reflection: Opening stock cost basis surfaced because 012 valuation depends on it.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): quality checklist 15/16 PASS (clarification markers pending)
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
