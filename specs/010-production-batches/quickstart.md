# Quickstart: Production Batches — manual verification

**Feature**: `010-production-batches` | **Date**: 2026-09-24

## Prerequisites

1. Apply `supabase/migrations/0010_production_batches.sql` to the project's Supabase database
   (after 0001–0009).
2. `npm run dev`, then sign in.
3. Seed data (through the UI):
   - An active supplier. A **weight-mode lot of 3,000 kg at Rs 66.67/kg**, purchase date a few days
     ago ("Lot A"). A second lot of 1,200 kg ("Lot B").
   - An active **manufactured** product "6-Pack Washcloth" with an expected yield of **0.90
     packets/kg** and a default labour rate of **Rs 10.00**.
   - A second manufactured product "Hand Towel" with no stock yet.
   - An open customer PO with a line for "6-Pack Washcloth", and an Issued Challan for 300 of it
     that **cannot be accepted today** (007's interim limitation, which this feature resolves).

## 1. Contractors (US6)

- [ ] Add "Rashid Contractor", phone optional. It's saved as Active.
- [ ] Add " rashid contractor " again. It's rejected as a duplicate (FR-001).
- [ ] Add "Second Contractor". Both appear in the list.

## 2. Issue (US1)

- [ ] New batch: open the lot picker. Each lot shows supplier · date · remaining/total kg · Rs/kg.
- [ ] Select "6-Pack Washcloth". The labour rate pre-fills with 10.00 and can be edited (US1-2).
- [ ] Enter 3,000 kg. The expected packets suggestion shows **2,700** (3,000 × 0.90, rounded down)
      (US1-3).
- [ ] Issue from Lot A to Rashid, dated today. The batch saves as **PB-0001, Issued**.
- [ ] Lot A shows 0 kg remaining, is missing from the picker, and the purchases screen shows it as
      locked (no edit or delete) (US1-5, FR-006).
- [ ] The product's quantity on hand is **unchanged** (FR-010).
- [ ] Try to issue 1,500 kg from Lot B (1,200 kg). It's rejected with "Only 1,200.00 kg remains…"
      and nothing changes (US1-4).
- [ ] Try an issue date before Lot B's purchase date. It's rejected.

## 3. Parallel-issue guard (FR-005, SC-003)

- [ ] Open the new-batch form for Lot B in two browser tabs. Submit 800 kg in both, one straight
      after the other. Exactly one succeeds; the other reports "Only 400.00 kg remains…". Lot B
      shows 400 kg.

## 4. Edit and void (US4)

- [ ] Edit the 800 kg Lot B batch to 600 kg. Lot B shows 600 kg remaining (US4-1).
- [ ] Edit it to 1,300 kg. It's rejected (only 600 + 600 available), and nothing changes (US4-2).
- [ ] Deactivate "Second Contractor", then reopen the edit form. They aren't offered, but a batch
      already assigned to them keeps working (US6-3).
- [ ] Void the Lot B batch and confirm. Status is **Voided**, Lot B is back to 1,200 kg, and the lot
      is editable again in purchases (US4-4/5).
- [ ] Try to delete Lot B. It's refused with "referenced by a production batch (voided batches
      included)" (US4-5, FR-012).
- [ ] The voided batch offers no edit, void or complete action (US4-6).

## 5. Complete: the worked example (US2, SC-002)

- [ ] Complete PB-0001 with **2,500 packets, 2,900 kg returned, today**. It shows:
  - [ ] Raw material cost **Rs 200,010.00**, labour **Rs 25,000.00**, total **Rs 225,010.00**,
        average **Rs 90.00/packet**.
  - [ ] Wastage **100.00 kg / Rs 6,667.00 / 3.33%**.
  - [ ] Expected 2,700, variance **−200 (−7.41%)**. This is informational and didn't block.
- [ ] "6-Pack Washcloth" quantity on hand is **+2,500**. The product detail's stock history shows
      "Production batch completed +2,500", linking to PB-0001 and dated today (FR-015).
- [ ] PB-0001 is fully read-only (US2-7).
- [ ] Change the product's default labour rate and expected yield. PB-0001's figures are
      **unchanged** (FR-020, SC-007).
- [ ] Try 0 packets or 2.5 packets on another batch. Both are rejected (US2-4).

## 6. Returned weight > issued (FR-019)

- [ ] Issue 100 kg from Lot B. Complete it with 80 packets and **102 kg** returned. A warning
      appears. Cancel: nothing is saved.
- [ ] Complete again and confirm. It completes with wastage **0 kg / Rs 0 / 0%**, a "returned weight
      exceeded issued" note, and 80 packets added to stock.

## 7. Opening stock (US3)

- [ ] Opening stock page: record **400** for "Hand Towel" with cost Rs 70.00. Quantity on hand is
      400, and stock history shows "Opening balance +400".
- [ ] Try a second opening entry for "Hand Towel". It's refused and the existing entry is shown
      (US3-2).
- [ ] Record a correction of **−60** with a reason. Quantity on hand is 340, and stock history shows
      "Opening balance correction −60" (US3-4).
- [ ] Try a second correction. It's refused (US3-5).
- [ ] Traded products aren't listed on the opening stock page (FR-026).
- [ ] For "6-Pack Washcloth", record opening stock of 50, then accept the 300-packet Challan from
      the prerequisites. **It is accepted**, because stock now exists from PB-0001 and the opening
      entry. That confirms 007's manufactured-product limitation is resolved (SC-006). Then try a
      correction on "6-Pack Washcloth". It's refused with "already gone out on an accepted
      Challan".
- [ ] Try a correction on a product whose stock would drop below zero. It's refused.

## 8. List and work in progress (US5, SC-005)

- [ ] Filter by status Issued. Only Issued batches show, with contractor, product, kg, fabric value,
      issue date and days outstanding, plus kg and Rs totals.
- [ ] Filter by contractor, product and date range, and search "PB-0001". Results are correct,
      newest first.
- [ ] Open a Completed batch. The full cost, wastage and variance breakdown shows, including the
      exceeded-weight note where it applies.
