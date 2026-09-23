---
id: 0015
title: Production batches pre-spec analysis
stage: general
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: none
branch: 009-customer-ledger
user: ImtiazAli865
command: (manual mode — analysis before /sp.specify for 010-production-batches)
labels: ["010-production-batches","inventory_movements","labour-rate","lifecycle","analysis"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/0015-production-batches-pre-spec-analysis.general.prompt.md
tests:
 - none (analysis only)
---

## Prompt

009-customer-ledger is complete and verified. Manual mode is on, so before writing any spec, 
please first respond with your analysis of how 010-production-batches should relate to the 
features already built — no spec yet.

Business context:
1. The business buys raw fabric by weight (kg) as a "traded" product via 002/003b. A 
   Production Batch converts a weight of that raw material into units of a separate 
   "manufactured" product (e.g., "6-Pack Washcloth"), via an external contractor.
2. Real example: a 3,000 kg lot of fabric costing Rs 200,000 converts to ~2,900 kg worth of 
   packets; ~100 kg is wastage. Packets sell around Rs 120 each.
3. CRITICAL accounting rule already resolved in the master spec: the raw material cost 
   absorbed into the batch's output packets must be based on the weight ISSUED to the batch, 
   not the weight that successfully converted. Wastage is reported separately (kg / Rs value 
   / percentage) but its cost is NOT excluded from the packets' cost — it's absorbed into 
   them, exactly like real manufacturing.
4. Also already resolved: the product catalog's expected_yield_per_kg (003) is a PRE-FILL 
   SUGGESTION only — a batch's actual entered output quantity is always authoritative. The 
   system should display the variance between expected and actual, never enforce or block on it.
5. Products (003) also carry a default_labour_rate_per_packet, which a batch may override.
   An open point flagged during 003b's spec review — never resolved — is the priority order 
   when multiple labour-rate sources could apply (product default vs. a specific 
   contractor's own default rate vs. a batch's own entered rate). This needs to be decided now.
6. 007 made inventory_movements the sole source of truth for products.quantity_on_hand, and 
   explicitly named "a future Production Batches feature" as its next writer — for 
   manufactured products, whose quantity_on_hand has been stuck at 0 this whole time (no 
   writer existed until now). This feature needs to both DECREASE the raw material product's 
   stock (weight issued) and INCREASE the manufactured product's stock (units produced/accepted).
7. Contractor payment/commission tracking itself (actually paying the contractor for 
   completed batches) is explicitly OUT of scope here — that's 011-labour-commission-ledger. 
   This feature only records the agreed labour cost per batch as a liability/cost figure, 
   the way 006 records a PO's agreed price without itself handling payment.

Please tell me:
1. How should a batch's raw material consumption interact with inventory_movements — does 
   creating a batch immediately decrement the raw material product's stock, or only upon 
   some "issue" step, given the business's real workflow (fabric physically handed to the 
   contractor before conversion happens)?
2. What's the right priority order for labour rate — product default, contractor default, or 
   batch-entered value — and should this feature introduce a contractor-level default rate at 
   all, or leave that to 011?
3. Does a batch need a lifecycle (e.g., Issued → Completed) similar to Challans' 
   Issued→Accepted, given the real-world gap between handing fabric to a contractor and 
   receiving finished packets back? Or is this a single atomic action like Performa Invoicing?
4. Anything ambiguous or missing in the existing data model this feature needs to resolve 
   before building on top of it.

I want to agree on this before any spec gets written.

## Response snapshot

Key correction: raw fabric is NOT a traded product — weight-mode purchases (002) are lots in
raw_material_purchases with product_id forced NULL (0003 check constraint); consumption is
remaining_weight_kg on the lot, which drives 002's edit/delete lock. So a batch issues against a
lot (remaining_weight_kg), and writes inventory_movements only for the manufactured output.
Recommended: two-state lifecycle Issued → Completed (+ Voided from Issued); lot decremented at
Issue; +packets movement at Complete; costs computed at Complete. Labour rate: batch-entered is
authoritative; pre-fill = product default (contractor default deferred to 011, which then takes
precedence). Contractors: introduce a minimal `contractors` table in 010 (shared-table-at-first-
writer, ADR-0004) with name/contact only; 011 extends it. Listed data-model gaps: lot has no
fabric description, no lot-level wastage close-out, manufactured cost basis for 012/013, void
after completion, partial returns, date semantics, 007 interim limitation resolution.

## Outcome

- ✅ Impact: Pre-spec alignment for 010; surfaced a factual mismatch in the user's framing (fabric lot vs traded product).
- 🧪 Tests: none
- 📁 Files: this PHR only
- 🔁 Next prompts: user confirms/adjusts decisions → /sp.specify 010-production-batches
- 🧠 Reflection: Verifying the schema before answering caught that item 6's "decrease raw material product stock" doesn't map to the built model.

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
