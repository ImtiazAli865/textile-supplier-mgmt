---
id: 0025
title: ADR contractor payment allocation settlement lock
stage: general
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.adr contractor-payment-allocation-and-settlement-lock
labels: ["adr","011","payments","settlement","locking"]
links:
  spec: null
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
tests:
 - none
---

## Prompt

All confirmed:

1. Yes — a payment can exceed its linked batches; the remainder counts as an advance/clears 
   the opening balance.
2. Yes — a batch can be paid across multiple payments.
3. Agreed — no linking an earlier unallocated advance to a later-completed batch in 011. 
   Noted trade-off: a batch may show "Unpaid" in its own status even when the overall 
   contractor balance already reflects the advance via the ledger. Acceptable for v1.
4. Refuse (as proposed) — a batch completion dated on or before a settled period's end date 
   for that contractor is rejected with a clear message, not silently pushed into the next 
   open period.
5. Yes — add a printed settlement statement, reusing ADR-0006's print-route pattern.

One technical confirmation needed: please confirm the "reserve batches first" mechanism for 
concurrent payment recording uses real row-level locking (select ... for update on the 
relevant production_batches rows, in a sorted order to avoid deadlock across multi-batch 
payments) — the same discipline used in 008/009 — not just an application-level ordering 
assumption. This matters since two staff members could genuinely record payments 
simultaneously.

Please run /sp.adr contractor-payment-allocation-and-settlement-lock, then proceed to 
/sp.specify 011-labour-commission-ledger.

## Response snapshot

Confirmed real FOR UPDATE locking; corrected precedent (008 locks sorted multi-row, 009 single row only). Created ADR-0010 (pre-plan, like ADR-0008): separate contractor_ledger_entries posted at completion/payment/reversal/opening/adjustment; contractor_payments + amount-bearing contractor_payment_allocations; contractor_settlements with frozen figures and date lock incl. 010 completion; global lock order contractor -> payment -> production_batches by id, completion re-checks contractor_id; in-function over-allocation assertion as backstop. Narrows ADR-0008 §3 (no sub-contract rate).

## Outcome

- Impact: ADR-0010 accepted; ready for /sp.specify
- Tests: none
- Files: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
- Next prompts: /sp.specify 011-labour-commission-ledger
- Reflection: plan.md absent; ADR written from agreed pre-spec decisions per ADR-0008 precedent

## Evaluation notes (flywheel)

- Failure modes observed: sp.adr expects plan.md; deviated deliberately
- Graders run and results (PASS/FAIL): clustered PASS; alternatives PASS; pros/cons PASS; concise PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
