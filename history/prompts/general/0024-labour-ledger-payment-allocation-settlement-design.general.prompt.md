---
id: 0024
title: Labour ledger allocation and settlement design
stage: general
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["analysis","pre-spec","011","payments","settlement","allocation"]
links:
  spec: null
  ticket: null
  adr: history/adr/0008-production-batch-lifecycle-and-stock-split.md
  pr: null
files:
 - specs/PRODUCT-OVERVIEW.md
 - history/prompts/general/0024-labour-ledger-payment-allocation-settlement-design.general.prompt.md
tests:
 - none (design analysis)
---

## Prompt

Answers to all six questions, ready to proceed:

A. Yes — create a new contractor_ledger_entries table (shared, insert-only), mirroring 005's 
   ledger_entries pattern. Batch completion (010) should automatically post a Credit entry 
   for that batch's frozen labour_cost, the same way 007's accept_challan auto-posts to 
   customer ledger_entries.

B. Yes — no rate table in 011. Rate stays purely batch-entered (pre-filled from product 
   default only, per 010's existing design). Confirmed no contractor-level or 
   contractor×product rate table is needed.

C. Yes — drop the "sub-contract rate / commission margin" concept entirely from this 
   feature's scope. It's the contractor's own internal business (they may work with their 
   own 5-6 sub-partners), invisible to this system. Please also add a short note to 
   specs/PRODUCT-OVERVIEW.md explaining this is explicitly out of scope and why, rather than 
   silently removing the old mention, so it's not mistaken for an oversight later.

D. Payment method: Cash only (no cheque/bank-transfer handling needed for contractors, unlike 
   009's customer cheque tracking).

   Payments ARE linked to specific batch(es) — real example: "this Rs X payment clears the 
   labour cost for these specific batch(es)." Importantly, a single cash payment may cover 
   MORE THAN ONE batch at once (e.g., paying off 3 completed batches' labour cost together in 
   one transaction) — so the payment-to-batch relationship should be many-to-many, not 
   one-to-one. Please design accordingly (e.g., a join table, or an array of batch references 
   per payment) — this is a genuine design decision, not yet settled, so tell me your 
   recommended approach before finalizing the spec.

E. Warn-and-allow, not a hard block, for deactivating a contractor with an outstanding 
   balance — consistent with how customers/trade-names/products are already handled 
   elsewhere in this project.

F. Yes — a formal "settlement" record is needed, not just a running balance + payment list. 
   Please propose a concrete mechanism for this (e.g., an explicit "mark period settled" 
   action, similar in spirit to a snapshot/closing entry) as part of your analysis, since this 
   is new territory not yet covered by any pattern in 001-010.

Please incorporate all of this and give me your updated recommendation — especially on D's 
multi-batch-per-payment design and F's settlement mechanism — before we move to /sp.specify.

## Response snapshot

Edited PRODUCT-OVERVIEW.md (Stream B narrative, Labour/Commission Ledger section with dated revision note, Out of Scope list). Recommended D: contractor_payments (cash, immutable, reversible) + contractor_payment_allocations join table with per-batch amount (partial and split payments; optional unallocated remainder); one ledger Debit per payment; batch paid status derived; array and amount-less join rejected. Recommended F: contractor_settlements rows closing contiguous per-contractor periods with frozen opening/earned/paid/adjustment/closing figures; lock refuses any ledger entry dated in a settled period (including 010 completion); nonzero closing carries forward; reopen latest only, audited. Open questions on remainder, partial allocation, completion in settled period, reopen, print statement.

## Outcome

- Impact: pre-spec design agreed pending 5 answers; PRODUCT-OVERVIEW note added
- Tests: none
- Files: specs/PRODUCT-OVERVIEW.md
- Next prompts: answers, then /sp.specify 011
- Reflection: settlement lock reaches back into 010's completion function; flagged explicitly

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
