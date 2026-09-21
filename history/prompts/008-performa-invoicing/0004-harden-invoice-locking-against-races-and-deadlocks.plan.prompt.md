---
id: 0004
title: Harden invoice locking against races and deadlocks
stage: plan
date: 2026-09-22
surface: agent
model: claude-sonnet-5
feature: 008-performa-invoicing
branch: 008-performa-invoicing
user: imtiazkind143@gmail.com
command: none
labels: ["plan", "performa-invoicing", "concurrency", "postgres-functions", "correctness", "business-sensitive"]
links:
  spec: specs/008-performa-invoicing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/008-performa-invoicing/data-model.md
 - specs/008-performa-invoicing/research.md
 - specs/008-performa-invoicing/plan.md
 - history/prompts/008-performa-invoicing/0004-harden-invoice-locking-against-races-and-deadlocks.plan.prompt.md
tests:
 - none (design-review turn; no code changed)
---

## Prompt

**Message 1** (after being shown the plan summary and asking to see the full spec first):

"The spec looks solid. Before /sp.tasks, please paste the full data-model.md and the
create_performa_invoice function's design from contracts/server-actions.md or research.md —
specifically how it enforces FR-015 (Invoiced never exceeding Delivered under concurrent
creation) atomically, and how it rejects a PO line belonging to a different customer than the
invoice's own customer."

**Message 2** (after the fix below was applied and explained):

"One small addition before /sp.tasks: since this is the first feature where a single transaction
locks multiple customer_po_lines rows at once (multi-PO invoices, User Story 2), please confirm
create_performa_invoice processes p_lines in a stable, deterministic order (e.g., sorted by
po_line_id) rather than the order submitted by the client. Without this, two concurrent multi-line
invoices could lock the same two lines in opposite order and hit a Postgres deadlock instead of a
clean validation error — rare given this business's manual, one-at-a-time entry pattern, but a
one-line ORDER BY fix eliminates it entirely.

If already handled, or if you'd rather note it as an accepted low-risk simplification (similar to
007's documented two-Challans race condition), that's fine too — just confirm which."

## Response snapshot

**Round 1**: Pasted the full `spec.md`. Then, reviewing my own `data-model.md` against the FR-015
concurrency question, found it genuinely under-specified: step 3 (validate remaining quantity) and
step 7 (increment `invoiced_quantity`) were only described as happening "in the same transaction,"
with no row locking specified — a plain read-then-write is a real check-then-act race under true
concurrent execution. Fixed the design rather than explaining around the gap:
- Rewrote the per-line validation step to use `select ... for update of cpl` — a row-level
  exclusive lock on the specific `customer_po_lines` row, held for the rest of the transaction, so
  a concurrent second transaction targeting the same line blocks until the first commits or rolls
  back and then reads genuinely current data.
- Added a new database-level backstop: `alter table customer_po_lines add constraint
  customer_po_lines_invoiced_le_delivered check (invoiced_quantity <= delivered_quantity)` via this
  feature's own migration (006 only had `>= 0`) — defense-in-depth in case any future code path
  forgets the lock.
- Added a "Concurrency guarantee for FR-015" subsection to `data-model.md` walking through the
  commit/rollback interleaving explicitly, and a new "Decision" in `research.md` explaining why
  this differs from 007's own *accepted* unlocked race for Challan-creation (that check happens at
  a cheap, easily-corrected draft-like step before any ledger effect; this one posts a ledger
  credit in the same atomic action as the validation, so it needs to be genuinely race-free, not
  just sequenced). Updated `plan.md`'s Technical Context Storage/Constraints lines to match.
  Explicitly answered the cross-customer question too: the same locked query joins
  `customer_po_lines` to `customer_pos` and compares `customer_id` in one pass, raising
  `PO_LINE_WRONG_CUSTOMER` before any insert happens.

**Round 2**: The user correctly identified a second, distinct gap in the just-fixed design: the
locking loop iterated `p_lines` in whatever order the client submitted them, and since User Story 2
lets one transaction lock more than one `customer_po_lines` row, two concurrent multi-line invoices
sharing two or more lines but listing them in different orders could deadlock (circular wait),
surfacing as a raw `deadlock_detected` Postgres error instead of a clean rejection. Confirmed this
was **not** already handled, and — since the fix is a single `order by` clause with no tradeoff
(unlike 007's genuinely cost/benefit Challan-creation race, which was accepted as a documented
simplification) — fixed it outright rather than documenting it as accepted risk: the locking loop
now iterates `p_lines` sorted by `po_line_id` ascending, a standard lock-ordering deadlock-avoidance
technique, explicitly noting this sort affects only lock-acquisition order, never the invoice's
stored/printed line order (which step 7 still derives from the client's original submitted order
via `with ordinality`). Documented this in both `data-model.md` (the loop's SQL shape plus a new
paragraph in the Concurrency guarantee subsection) and `research.md` (appended to the existing
locking Decision, explaining why this is a straight fix rather than a noted simplification).

## Outcome

- ✅ Impact: `create_performa_invoice`'s concurrency design is now genuinely correct under real
  overlapping transactions, not just "atomic in the sequential case" — row-level locking with a
  deterministic lock-acquisition order plus a hard database `CHECK` backstop, closing two distinct
  gaps (a TOCTOU race on FR-015, and a deadlock risk specific to multi-line invoices) the user
  caught by reviewing the actual generated artifacts rather than accepting the summary.
- 🧪 Tests: none (design-review turn).
- 📁 Files: `specs/008-performa-invoicing/data-model.md`, `research.md`, `plan.md`, this PHR.
- 🔁 Next prompts: `/sp.tasks 008-performa-invoicing`.
- 🧠 Reflection: Both gaps came from describing a design at the level of "these steps happen in one
  transaction" without working through what "concurrent" actually means at the Postgres
  row-locking level — worth explicitly reasoning through lock acquisition (what's locked, in what
  order, what blocks vs. deadlocks) any time a plan involves more than one row being read-then-
  written across potential concurrent callers, not just asserting atomicity from "it's one function
  call."

## Evaluation notes (flywheel)

- Failure modes observed: initial design under-specified concurrency control (read-then-write with
  no lock; no deterministic lock order for multi-row transactions) — both caught by user review,
  not self-caught before presenting the design.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): when a plan involves a Postgres function that both
  validates and mutates more than one row, proactively reason through row-locking and lock-order
  before presenting the design, rather than waiting for review to surface it.
