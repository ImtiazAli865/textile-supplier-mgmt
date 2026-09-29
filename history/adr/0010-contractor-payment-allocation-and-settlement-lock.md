# ADR-0010: Contractor payables use their own ledger, batch-linked cash payments, and period settlements that lock ledger dates

> **Scope**: Decision cluster for 011-labour-commission-ledger: (1) where contractor payables are
> recorded and how batch earnings reach them, (2) how one cash payment is linked to many batches,
> (3) how a period is formally settled and protected afterwards, (4) the row-locking discipline
> that makes (2) and (3) safe under concurrent use. Builds on
> [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md),
> [ADR-0004](0004-shared-tables-created-at-first-writer.md),
> [ADR-0006](0006-printed-documents-via-server-rendered-print-routes.md) and
> [ADR-0008](0008-production-batch-lifecycle-and-stock-split.md). Narrows ADR-0008 §3: 011
> extends `contractors` with payments and settlements only — the "sub-contract rate" it
> anticipated is now explicitly out of scope, and no contractor rate table is added.

- **Status:** Accepted
- **Date:** 2026-09-29
- **Feature:** 011-labour-commission-ledger
- **Context:** 010 freezes `labour_cost` on each batch at completion; completed is terminal and
  only an `issued` batch can be voided (`0010_production_batches.sql`). The business needs a
  contractor khata: what is owed, cash paid, running balance — a payable, the mirror image of
  009's customer receivable. Constraints checked against the shipped schema and agreed with the
  owner (2026-09-29): `ledger_entries.customer_id` is a `NOT NULL` FK to `customers` (0005), and
  every 009 read path treats that table as receivables; contractors are paid **cash only**; one
  payment often clears **several** batches, and a batch may be paid across several payments; a
  payment can exceed its linked batches (advance / opening-balance payoff); the business needs a
  **formal settlement** record per period, not just a running view; two staff members can record
  payments at the same moment. Live DB had 0 contractors and 0 batches at decision time, so no
  backfill of real data is involved. How contractors pay their own home workers is out of scope
  (`specs/PRODUCT-OVERVIEW.md`, Labour / Commission Ledger note).

## Decision

1. **Separate payables ledger, posted at the source event**
   - New insert-only `contractor_ledger_entries` (`contractor_id`, `entry_date`, `type`
     credit/debit, `amount > 0`, `source_type`/`source_id`, `description`, audit). Credit = we owe
     more; Debit = we owe less. Balance = sum of this table only.
   - Writers: batch completion (Credit = `labour_cost`, dated `completion_date`,
     `source_type 'production_batch'`) — `complete_production_batch` is `CREATE OR REPLACE`d in
     0011, 010's migration file untouched; cash payment (Debit, full payment amount); payment
     reversal (Credit); one-time opening balance per contractor (either direction); manual
     adjustment (either direction, reason required).
   - 013 keeps reading `production_batches.labour_cost` for cost; the ledger is money owed/paid.
2. **Payment ↔ batch many-to-many via an amount-bearing join table**
   - `contractor_payments` (cash only; `status active | reversed`; never edited).
   - `contractor_payment_allocations (payment_id, batch_id, amount > 0)`, unique per pair.
   - Rules, enforced in the recording function: batch is `completed` and belongs to the payment's
     contractor; allocation ≤ batch outstanding (`labour_cost` − active allocations); Σ allocations
     ≤ payment amount; remainder is allowed and simply stays in the ledger balance (advance /
     opening-balance payoff). A reversed payment's allocations stop counting.
   - Batch payment state (Unpaid / Part-paid / Paid) is derived, never stored on
     `production_batches`.
   - Unallocated remainders are **not** linkable to later batches in 011 (payments stay
     immutable). Accepted trade-off: a batch can read "Unpaid" while the contractor's overall
     balance already reflects an advance.
3. **Settlement = frozen closing record + date lock**
   - `contractor_settlements (contractor_id, period_start, period_end, opening_balance, earned,
     paid, adjustments, closing_balance, note, settled_at/by, reopened_at/by, reopen_reason)`.
   - Periods are contiguous per contractor: the first starts at the contractor's first ledger
     entry, each next the day after the previous `period_end`; staff choose `period_end` (≤ today
     per [ADR-0009](0009-business-today-is-the-pakistan-calendar-date.md)), so weekly and
     monthly both work.
   - Settling computes the figures from the ledger and freezes them. Closing balance need not be
     zero; it carries forward as the next period's opening balance (non-zero is warned, not
     blocked).
   - **Lock**: once settled, no contractor ledger entry may be dated on or before the latest
     non-reopened `period_end` for that contractor — payments, reversals, adjustments, opening
     balance, and **batch completion** (refused with a clear message, never pushed into the next
     period). This is 011's one behavioural change to 010.
   - Only the most recent settlement may be reopened, with a reason; the row is kept, marked
     reopened.
   - Printed settlement statement via the ADR-0006 print-route pattern.
4. **Concurrency — real row locks in one global order**
   - Every function that writes a contractor ledger entry or a settlement first takes
     `SELECT … FROM contractors WHERE id = … FOR UPDATE`. The contractor row is the per-contractor
     mutex: it serialises payments against payments, and settlement against every writer, so the
     date-lock check and the settlement's figures can never race.
   - `record_contractor_payment` then locks the selected `production_batches` rows with
     `SELECT … FOR UPDATE` **in ascending `id` order** (the discipline of 008's
     `create_performa_invoice`, which locks `customer_po_lines` in sorted order), re-reads each
     batch's active allocations under the lock, validates, and only then inserts the payment,
     allocations and Debit — all in one function per ADR-0002. A concurrent payment touching the
     same contractor waits, then sees the first payment's allocations.
   - Reversal locks contractor → payment row → its allocated batches (sorted).
   - Redefined `complete_production_batch` reads the batch's `contractor_id`, locks that
     contractor row, then locks the batch row, and re-checks that `contractor_id` is unchanged
     (an `issued` batch's contractor is editable) — raising a retryable error if it changed.
     Global lock order is therefore always **contractor → payment → production_batches (by id)**,
     which rules out lock-order deadlocks between 011 writers. `update_production_batch` /
     `void_production_batch` lock only the batch (and lots) and never wait on a contractor row, so
     they cannot form a cycle with this order.
   - Backstop — every writer, not just the function: a `BEFORE INSERT OR UPDATE` row trigger on
     `contractor_payment_allocations` runs inside the writing transaction and, before the row is
     stored, (a) locks the referenced `production_batches` row `FOR UPDATE`, (b) sums `amount` over
     that batch's allocations **joined to `contractor_payments` and filtered to
     `status = 'active'`** (reversed payments' allocations never count, so a reversed payment
     frees its batches immediately), excluding the row being updated, (c) adds the new row's
     amount, and (d) raises if the total exceeds the batch's `labour_cost` — which rolls back the
     whole transaction (payment, allocations, ledger Debit). The trigger also refuses a batch that
     is not `completed` or belongs to another contractor. Because it takes the batch lock itself,
     it holds under concurrency even for a future code path or manual SQL that skips
     `record_contractor_payment`, giving the same guarantee as 008's
     `customer_po_lines_invoiced_le_delivered` `CHECK`. Inside `record_contractor_payment` the batch
     is already locked, so the trigger adds no extra waiting. Reversal is one-way (`active →
     reversed`, never back, enforced in the reversal function), so reversing only ever lowers a
     batch's allocated total and needs no check on `contractor_payments`.

## Consequences

### Positive

- Receivables and payables never share a table, so no existing 005/007/008/009 query can pick up
  contractor rows; the 009 running-balance and export shape is reusable.
- One table answers "what do we owe this contractor", including opening balance, advances and
  corrections — cases a live SUM over batches cannot express.
- "This Rs X covers these 3 batches" is recorded exactly, including partial and split payments,
  with per-batch paid status derived from data rather than tracked by hand.
- A settlement is a durable, printable agreement whose figures cannot silently change afterwards;
  the date lock makes that a database guarantee, not a convention.
- Two staff recording payments at once cannot over-allocate a batch or slip an entry into a
  period being settled.

### Negative

- `labour_cost` exists twice (batch and ledger Credit); safe because both are written in one
  transaction and neither can change, but it needs a reconciliation check in QA.
- 010 behaviour changes: completion can now be refused because of a settled period, and every
  completion takes a contractor-row lock (negligible at this scale; completions for the same
  contractor serialise).
- A batch can show "Unpaid" despite an advance (no later linking in 011).
- A wrongly completed batch still cannot be corrected at source (ADR-0008); 011 only offers a
  manual ledger adjustment, and the stock side stays as-is.
- Reopening a settlement is a deliberate escape hatch that staff must use carefully; only the
  latest can be reopened, so fixing an old period means reopening in reverse order.
- The over-allocation backstop is a trigger rather than a declarative `CHECK` (a cross-row sum
  cannot be one), so its logic — notably the `status = 'active'` filter — must be covered by
  tests; a bug there would either block valid payments or let a batch be over-paid.

## Alternatives Considered

**Reuse `ledger_entries` with a nullable party column** — Rejected: breaks the `NOT NULL`
customer FK, and every existing receivable read path would need a filter; one missed filter
leaks payables into a customer balance.

**Live SUM of completed batches' `labour_cost` − payments (no posting)** — Rejected: correct for
batches alone (completion is terminal) but has no home for opening balance, adjustments or
reversals, and forks from the customer ledger's model.

**Array of batch ids on the payment row** — Rejected: no FK integrity, no per-batch amount, no
uniqueness, and awkward to lock or sum.

**Join table without an amount (payment must equal the batches' exact total)** — Rejected: rules
out partial payment, split payment, and payments with an advance/opening-balance remainder.

**Settlement as a view only (filter by period)** — Rejected by business: a formal record is
required.

**Settlement with no lock (snapshot only)** — Rejected: a later back-dated entry would make the
signed statement disagree with the ledger silently.

**Late entries pushed into the next open period** — Rejected: an entry's date would no longer mean
what it says; refusing with a clear message was preferred (owner, 2026-09-29).

**Application-level ordering / optimistic checks instead of row locks** — Rejected: two
simultaneous requests can both pass a read-then-write check; only `FOR UPDATE` inside the
function serialises them.

**Contractor × product rate table** — Rejected for 011 (no evidence rates differ by contractor;
batch-entered rate is authoritative). Revisit only if staff routinely override the product default
for one contractor.

## References

- Master spec: `specs/PRODUCT-OVERVIEW.md` (Labour / Commission Ledger and its 2026-09-29 note;
  Explicitly Out of Scope)
- Schema: `supabase/migrations/0005_customers.sql` (`ledger_entries`),
  `0008_performa_invoicing.sql` (`create_performa_invoice` sorted `for update of cpl`; the
  `customer_po_lines_invoiced_le_delivered` backstop), `0009_customer_ledger.sql`
  (`customer_payments`, `record_customer_payment`), `0010_production_batches.sql` (`contractors`,
  `production_batches`, `complete_production_batch`)
- Related ADRs: [ADR-0002](0002-atomic-multi-table-writes-via-postgres-functions.md),
  [ADR-0004](0004-shared-tables-created-at-first-writer.md),
  [ADR-0006](0006-printed-documents-via-server-rendered-print-routes.md),
  [ADR-0008](0008-production-batch-lifecycle-and-stock-split.md),
  [ADR-0009](0009-business-today-is-the-pakistan-calendar-date.md)
- Prompt History: `history/prompts/general/0023-labour-ledger-pre-spec-analysis.general.prompt.md`,
  `history/prompts/general/0024-labour-ledger-payment-allocation-settlement-design.general.prompt.md`
  (analysis and agreement; 011 spec/plan not yet written — to be referenced once they exist)
