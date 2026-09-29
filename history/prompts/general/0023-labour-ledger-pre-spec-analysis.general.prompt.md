---
id: 0023
title: Labour ledger pre-spec analysis
stage: general
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["analysis","pre-spec","011","contractors","ledger"]
links:
  spec: null
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - history/prompts/general/0023-labour-ledger-pre-spec-analysis.general.prompt.md
tests:
 - none (read-only analysis; live DB probe showed 0 contractors, 0 production_batches)
---

## Prompt

Merge to master is confirmed, and we're now on branch 011-labour-commission-ledger. Before 
writing any spec, please first respond with your analysis of how 011-labour-commission-ledger 
should relate to the features already built — no spec yet.

Business context:
1. 010 created a minimal contractors table (name, phone, active/inactive). This feature 
   extends it — tracking what's owed and paid to each contractor for their COMPLETED 
   production batches only (010's labour_cost figure, frozen per batch at completion).
2. Real-world business model: the contractor sub-contracts to home workers at a lower rate 
   (e.g., contractor charges MA Textile Rs 6/packet, pays their own home workers Rs 5/packet, 
   keeps Rs 1/packet as their own commission/margin) — but this internal sub-contracting is 
   the CONTRACTOR'S own business, invisible to this system (same as production batches — we 
   only deal with one contractor, not their 5-6 sub-partners).
3. 010 deferred any contractor-level or contractor×product rate table to this feature, since 
   010 kept the labour rate purely batch-entered (pre-filled from product default only). 
   Question: should 011 actually add such a rate table now, or is it still unnecessary?
4. This feature needs to track: what's owed per contractor (sum of labour_cost across their 
   Completed batches), payments made to the contractor, and a running balance — conceptually 
   similar to 009's customer ledger, but for money OWED BY the business TO a contractor 
   (payable), not money owed TO the business BY a customer (receivable).

Please tell me:
1. Should this introduce a new shared ledger-like table (mirroring 005's ledger_entries 
   pattern), or extend/reuse something existing?
2. How should a contractor's "earnings" be computed — a live SUM over their Completed 
   batches' labour_cost, or does something need to post an explicit entry when a batch 
   completes (similar to how 007/008 post to ledger_entries)?
3. Given point 2 above, should contractor rate tables be added now or left out entirely 
   (contractor rate stays purely ad-hoc per batch, as 010 already allows)?
4. Anything ambiguous or missing in 010's existing contractors/production_batches design 
   that this feature needs to resolve before building on top of it.

I want to agree on this before any spec gets written.

## Response snapshot

Recommended: new separate insert-only contractor_ledger_entries table (do not reuse customer-keyed ledger_entries); complete_production_batch redefined in 0011 to post a credit atomically (plus a harmless backfill; live DB currently has 0 batches); payments post debits; opening balance and manual adjustments post their own entries. No rate table now (sub-contracting invisible; product default + batch override suffices). Flagged 010 gaps: no correction path for completed batches, contractor opening balance, payment method (cash vs cheque), settlement meaning, deactivation with balance, PRODUCT-OVERVIEW sub-contract-rate/default-rate lines conflicting with the user's point 2 / ADR-0008, entry date = completion_date, ADR-0009 date convention.

## Outcome

- Impact: pre-spec agreement pending user answers; no code
- Tests: none
- Files: this PHR
- Next prompts: user answers open questions, then /sp.specify 011
- Reflection: PRODUCT-OVERVIEW still lists a per-contractor default rate and sub-contract rate that conflict with ADR-0008 and the user's stated model

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
