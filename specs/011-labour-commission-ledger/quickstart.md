# Quickstart: Labour / Commission Ledger — manual verification

**Feature**: `011-labour-commission-ledger` | **Date**: 2026-09-29

## Prerequisites

1. Apply `supabase/migrations/0011_labour_commission_ledger.sql`. 0001–0010 are already live
   (0010 re-verified 2026-09-29); apply only 0011.
2. `npm run dev`, then sign in.
3. **Every row created in this walkthrough is on the live database and must carry the `QA-011 `
   prefix**: contractor names, the supplier's company name, the product name, and every
   contractor created in a later section. Lots have no name of their own; a lot is QA data
   because its supplier is `QA-011 Supplier`, so never add a QA lot to a real supplier. Ledger
   entries, payments and settlements can't be edited or deleted, so an untagged row stays in the
   production khata for good; §9's cleanup finds rows only by this prefix. Below, "Rashid" is
   short for `QA-011 Rashid`, and so on.
   Seed through the UI (010 screens): contractors **`QA-011 Rashid`** and **`QA-011 Kamal`**;
   supplier **`QA-011 Supplier`** with one weight lot; a manufactured product
   **`QA-011 Washcloth`** with a default labour rate of Rs 10.00. Issue and complete for Rashid:
   - **PB-A**: 1,500 packets × Rs 10 → labour Rs 15,000, completed on **D1**
   - **PB-B**: 900 packets × Rs 10 → labour Rs 9,000, completed on **D1**
   - **PB-C**: issued only (not completed)

   Use dates in the recent past: D1 = 10 days ago; D2 = 7 days ago; D3 = 5 days ago.
4. Note: `production_batch_number_seq` may start above 1 (010 QA); only the numbers shown matter.

## 1. Automatic earnings and khata (US1)

- [ ] `/contractors` shows Rashid **Rs 24,000 owed**, Kamal **Rs 0** (FR-007).
- [ ] Rashid's khata: two earning rows dated D1 referencing PB-A / PB-B; running balance 15,000
      then 24,000 (US1-1, US1-5).
- [ ] PB-C is not in the khata (FR-002). Void PB-C: still nothing (US1-2).
- [ ] Batches section: PB-A and PB-B **Unpaid** with the full amount unpaid (FR-006).
- [ ] Issue PB-D to Rashid, edit it to Kamal, complete it (labour Rs 2,000, dated D2). The earning
      appears only in Kamal's khata (US1-3).
- [ ] Kamal before PB-D: empty khata, Rs 0 (US1-4).

## 2. Payments (US2)

- [ ] Rashid → Record payment, dated D2. Only PB-A and PB-B are offered. Tick both: amounts
      pre-fill 15,000 and 9,000. Enter a total of 30,000. Unlinked shows 6,000 (FR-011, FR-013).
- [ ] Save. Both batches **Paid**; one payment row of 30,000 in the khata; balance **Rs 6,000
      advance** (US2-1, US1-6).
- [ ] Reverse that payment (reason "test") — see §4 — to get back to 24,000 owed before continuing.
- [ ] Pay PB-B Rs 4,000 only: **Part-paid**, 5,000 unpaid. Pay 5,000 more: **Paid** (US2-2).
- [ ] Try Rs 6,000 against a batch with 5,000 unpaid: refused naming the batch and Rs 5,000 (US2-3).
- [ ] Tick batches totalling 15,000 with a payment total of 10,000: refused (US2-4).
- [ ] Record Rs 1,000 with no batches ticked: saved fully unlinked (US2-5).
- [ ] Complete a new batch for Rashid dated today; record a payment dated D2: that batch is not
      offered (US2-7).
- [ ] Deactivate Kamal (confirm text shows his balance, FR-031). Record a payment for Kamal:
      accepted (US2-8). Reactivate.

## 3. Opening balance (US3)

- [ ] Create contractor **`QA-011 Naveed`**. Record opening balance **Rs 12,000 owed**, dated D1.
      First khata row; balance 12,000 (US3-1). Record a 12,000 unlinked payment → balance 0.
- [ ] Try a second opening balance for Naveed: refused, pointing to adjustments (US3-3).
- [ ] Create **`QA-011 Imran`**; record an adjustment dated D2; then try an opening balance dated
      D3: refused — must be on or before D2 (US3-4). Dated D1: accepted.
- [ ] Advance direction: create **`QA-011 Advance`** and record an **advance of Rs 3,000** →
      balance "Rs 3,000 advance" (US3-2).

## 4. Reversal and adjustments (US4)

- [ ] Record Rs 9,000 against a Paid-able batch, then reverse it with reason "entered twice".
      Payment shows **reversed** with reason, date and user; a credit row dated today appears;
      the batch returns to its earlier status; balance is back (US4-1, FR-018).
- [ ] **Re-link after reversal** (ADR-0010 active filter): record a new payment for the full unpaid
      amount of that same batch → accepted, batch **Paid**.
- [ ] Reverse the reversed payment again: refused (US4-2). Reverse without a reason: refused (US4-3).
- [ ] Adjustment "Increase amount owed" Rs 1,200, reason "PB-A recorded 200 packets short":
      balance +1,200, PB-A's figures and status unchanged (US4-4, FR-022).
- [ ] Deduction Rs 500, reason "damaged packets": balance −500 (US4-5).
- [ ] Adjustment with blank reason or amount 0: refused (US4-6).

## 5. Settlement and print (US5)

Use a contractor whose earliest entry is D1 and who has entries on D1–D3.

- [ ] Settle → preview shows period **D1 → chosen end**, opening 0 (or the opening balance),
      earned, paid (net of reversals), adjustments, closing. Settle up to D2. If closing ≠ 0, a
      warning appears and saving needs a confirm (US5-1, US5-6).
- [ ] Check by hand: closing = opening + earned − paid + adjustments, and equals the khata running
      balance on D2 (SC-003, SC-005).
- [ ] Try a payment, adjustment, or reversal of a payment dated ≤ D2: each refused naming D2
      (US5-3, FR-019). An opening balance: refused with the "post an adjustment" message (FR-020).
- [ ] Complete a batch for this contractor dated ≤ D2: **refused** with "settled up to D2";
      dated D3: succeeds, earning posted (US5-4, FR-003).
- [ ] Complete a batch for a *different* contractor dated ≤ D2: succeeds (US5-5).
- [ ] Settle again up to today: period starts D2 + 1; opening = previous closing (US5-2).
- [ ] Settle with an end date after today, or before the period start: refused (US5-7).
- [ ] New contractor **`QA-011 Empty`** with no entries → Settle: refused "nothing to settle"
      (US5-8).
- [ ] Print the statement: contractor name/phone, period, opening, every row in the period with
      running balance, totals, closing, two signature lines; no mismatch banner (US5-9, FR-030).

## 6. Reopen (US6)

- [ ] Try to reopen the older of two current settlements: refused (US6-2). Without a reason:
      refused (US6-3).
- [ ] Reopen the latest with a reason: marked reopened, still listed; its dates unlocked (US6-1).
      Record a payment dated inside that period; settle the same end date again. Two records for
      the period — one reopened, one current; the new one includes the payment.
- [ ] Print the reopened one: "REOPENED — NOT VALID" banner (US6-4).

## 7. Concurrency (FR-015, US2-6, US5-10)

Run with a scratchpad script (010 live-QA pattern: `tsx` with `--conditions=react-server` and the
project tsconfig) calling the service functions directly as a signed-in user id.

- [ ] **Two payments, one batch**: a batch with Rs 9,000 unpaid; fire two
      `recordContractorPaymentRecord` calls for 9,000 each with `Promise.all`, 10 runs. Every run:
      exactly one succeeds, the other fails with `ALLOCATION_EXCEEDS_UNPAID…:0`; the batch's paid
      total never exceeds 9,000 (SC-004).
- [ ] **Payment vs settlement**: fire a payment dated today and a settlement up to today together,
      10 runs (reopen between runs). Every run is one of: (a) settlement includes the payment and
      its figures match the khata; or (b) payment refused `PERIOD_SETTLED`. Never a settlement
      whose figures miss a payment that was saved.
- [ ] **Deterministic variant** (optional, needs `psql` with the database connection string):
      session A `begin; select record_contractor_payment(…);` (do not commit); session B
      `select settle_contractor_period(…);` — B waits. Commit A. B returns and its `paid` includes
      A's amount.
- [ ] **Trigger backstop**: in the SQL editor, `insert into contractor_payment_allocations`
      directly for a Paid batch with amount 1 → refused `OVER_ALLOCATED`. Direct `update` or
      `delete` on `contractor_ledger_entries` → refused `IMMUTABLE_RECORD`.

## 8. Reconciliation check (SQL editor)

```sql
-- Every completed batch has exactly one earning equal to its labour cost; nothing else does.
select b.batch_number, b.status, b.labour_cost, e.amount
from production_batches b
left join contractor_ledger_entries e
  on e.source_type = 'production_batch' and e.source_id = b.id
where (b.status = 'completed') <> (e.id is not null)
   or (b.status = 'completed' and e.amount <> b.labour_cost);
-- Expect 0 rows (SC-001).
```

## 9. Clean up (live Supabase — research.md, "race tests run on live Supabase")

All QA runs on the live database, so every QA row must be tagged and removed. This covers both
the T040 script's rows and everything created by hand in §1–§6.

- [ ] **Untagged-row check first**: list the `contractors` (`name`), `suppliers`
      (`company_name`) and `products` (`name`) rows created since QA started whose name does
      **not** start with `QA-011 `, and the `raw_material_purchases` created since then whose
      supplier is not a `QA-011` supplier. Each one must be real business data. If any is a QA row
      entered without the prefix, stop and fix it before cleaning up: the cleanup can't see it.
- [ ] Open `specs/011-labour-commission-ledger/qa/cleanup-qa-011.sql` in the Supabase SQL editor.
      Nothing needs filling in: the script counts the `QA-011` rows in each table itself when it
      starts.
- [ ] **Dry run**: run it as written, ending in `rollback`. Read the per-table counts it prints
      and check they look right for what the seed script and the walkthrough created. Confirm it
      reaches the end with no count-mismatch error, and afterwards the QA rows are **still
      present** and a direct `update` on `contractor_ledger_entries` is **still refused**
      (`IMMUTABLE_RECORD`), proving the triggers were restored.
- [ ] **Real run**: change the final `rollback` to `commit` and run it.
- [ ] Zero residue: the script's final queries return 0 rows for every `QA-011` scope in every
      table the seed wrote to (the four 011 tables, `production_batches`, `inventory_movements`,
      `raw_material_purchases`, `products`, `contractors`, and the QA supplier's tables), and a direct `update` on `contractor_ledger_entries` is refused
      again.
- [ ] Reset the batch number if QA consumed numbers:
      `select setval('production_batch_number_seq', <last real number or 1>, <true|false>);`
