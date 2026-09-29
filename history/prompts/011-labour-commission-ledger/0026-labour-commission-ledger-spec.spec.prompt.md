---
id: 0026
title: Labour commission ledger spec
stage: spec
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: /sp.specify 011-labour-commission-ledger
labels: ["spec","011","contractors","ledger","payments","settlement"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - specs/011-labour-commission-ledger/spec.md
 - specs/011-labour-commission-ledger/checklists/requirements.md
tests:
 - spec quality checklist: all items pass (iteration 1)
---

## Prompt

011-labour-commission-ledger: Labour / Commission Ledger (contractor khata) for MA Textile. Tracks money the business OWES each external manufacturing contractor (a payable — mirror of 009's customer receivable), per ADR-0010. Extends 010's contractors table (name, phone, active/inactive). Earnings accrue ONLY from Completed production batches: 010's complete_production_batch is extended so completing a batch automatically posts a Credit to a new insert-only contractor_ledger_entries table for that batch's frozen labour_cost, dated on the batch's completion_date. Payments are CASH ONLY (no cheque/bank fields, no bounce handling). One payment can cover several completed batches of that contractor, and one batch can be paid across several payments (many-to-many with a per-batch allocated amount); each allocation ≤ the batch's outstanding labour cost; total allocations ≤ payment amount; any remainder is allowed and counts as an advance / clears the opening balance; later linking of an earlier remainder to a newly completed batch is NOT supported in 011 (accepted trade-off: a batch can show Unpaid while the overall balance reflects an advance). Each payment posts one Debit for its full amount. Batch payment status (Unpaid / Part-paid / Paid) is derived. Payments are never edited; a mistaken payment can be reversed with a reason (posts an offsetting Credit, its allocations stop counting). One-time opening balance per contractor at go-live (either direction: owed to them, or advance). Manual adjustment entries (credit or debit) with a required reason, for corrections/deductions (e.g. a completed batch entered with wrong packets — 010 has no correction path). Running balance = sum of the contractor's ledger entries; balance may go negative (advance). Formal settlement: staff pick a period end date (≤ today, Pakistan business date per ADR-0009); periods per contractor are contiguous (first starts at the contractor's first ledger entry, each next starts the day after the previous end), so weekly and monthly both work; settling freezes opening balance, earned, paid, adjustments and closing balance; closing balance need not be zero (warned, not blocked) and carries forward; once settled, NO contractor ledger entry may be dated on or before that period end — payments, reversals, adjustments, opening balance, and batch completion (010's completion is refused with a clear message, not pushed into the next period); only the most recent settlement can be reopened, with a reason, kept for audit. Printed settlement statement via ADR-0006's print-route pattern. Concurrency: two staff may record payments simultaneously — real row locks (contractor row first, then production_batches rows in ascending id) inside one atomic Postgres function per ADR-0002. Deactivating a contractor with a non-zero balance warns and allows (existing confirm pattern). Out of scope: contractor sub-contract rate / commission margin and home-worker payments (invisible to the system, see PRODUCT-OVERVIEW note); any contractor or contractor×product rate table (rate stays batch-entered, pre-filled from product default only); cheque/bank payments; correcting a completed batch's stock. Screens: contractor khata (ledger with running balance, per-batch paid status), record payment (tick unpaid completed batches, amounts pre-filled to outstanding, total auto-sums, optional remainder), reverse payment, opening balance, adjustment, settle period, reopen latest settlement, settlements list, printed statement, plus a contractors list showing current balance.

## Response snapshot

Skipped create-new-feature.ps1 (branch 011-labour-commission-ledger already exists off master; script would have numbered it 012). Wrote specs/011-labour-commission-ledger/spec.md: 6 user stories (P1 khata with automatic earnings; P1 multi-batch cash payment incl. concurrency scenario; P1 opening balance; P2 reversal/adjustment; P2 settlement + print; P3 reopen latest), 35 FRs, 8 SCs, edge cases, assumptions, dependencies, out of scope. Checklist passes; no clarification markers. Informed defaults: reversal dated today; payment in settled period not reversible; link only batches completed on/before payment date; opening balance on/before earliest entry; no CSV export.

## Outcome

- Impact: spec ready for /sp.clarify or /sp.plan
- Tests: quality checklist all pass
- Files: spec.md, checklists/requirements.md
- Next prompts: /sp.clarify (optional) or /sp.plan
- Reflection: all major forks pre-agreed, so spec needed no clarification markers

## Evaluation notes (flywheel)

- Failure modes observed: feature script incompatible with pre-created branch; bypassed
- Graders run and results (PASS/FAIL): spec checklist PASS
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
