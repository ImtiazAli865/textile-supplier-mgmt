# Feature Specification: Labour / Commission Ledger (Contractor Khata)

**Feature Branch**: `011-labour-commission-ledger`
**Created**: 2026-09-29
**Status**: Draft
**Input**: User description: "011-labour-commission-ledger: Labour / Commission Ledger (contractor khata) for MA Textile. Tracks money the business OWES each external manufacturing contractor (a payable — mirror of 009's customer receivable), per ADR-0010. Earnings accrue only from Completed production batches; cash-only payments linked many-to-many to batches with per-batch amounts; one-time opening balance; manual adjustments; formal period settlements that lock earlier dates; printed settlement statement." (full text in `history/prompts/011-labour-commission-ledger/`)

## Clarifications

### Session 2026-09-29 (pre-spec agreement)

- Q: Reuse the customer ledger or a separate one? → A: A separate contractor ledger; receivables and payables never share a record. Batch completion posts the contractor's earning automatically (ADR-0010).
- Q: Contractor rate table? → A: None. The labour rate stays entered per batch, pre-filled from the product's default only (ADR-0008).
- Q: Sub-contract rate / commission margin? → A: Out of scope entirely; the contractor's own business (`specs/PRODUCT-OVERVIEW.md` note).
- Q: Payment method? → A: Cash only.
- Q: Payment ↔ batch link? → A: Many-to-many with an amount per batch. A payment may exceed its linked batches (the remainder is an advance or clears the opening balance). A batch may be paid across several payments. An earlier remainder cannot be linked to a later batch in this feature.
- Q: Deactivating a contractor with a balance? → A: Warn and allow.
- Q: Settlement? → A: A formal, printable record per period that freezes the figures and locks earlier dates; a batch completion dated inside a settled period is refused, not moved.
- Q: Concurrency? → A: Two staff may record payments at the same moment; the system must never over-pay a batch or let an entry slip into a period being settled.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - See what each contractor has earned and is owed (Priority: P1)

A staff member opens a contractor's khata and sees every amount earned and paid, in date order,
with a running balance — the same layout as the paper khata. Each completed production batch
appears automatically as an earning, for that batch's labour cost, on its completion date; nobody
types it in. Each completed batch also shows whether it is Unpaid, Part-paid or Paid. The
contractors list shows every contractor's current balance at a glance.

**Why this priority**: This is the core of the feature and replaces the hand-tallied Excel khata.
Without automatic earnings, nothing else (payments, settlement) has anything to act on.

**Independent Test**: Complete two batches for one contractor (labour cost Rs 15,000 and Rs 9,000).
Open the contractor's khata. Confirm two earning rows dated on the completion dates and a balance
of Rs 24,000 owed, both batches shown as Unpaid, and Rs 24,000 on the contractors list.

**Acceptance Scenarios**:

1. **Given** an Issued batch for contractor A, **When** staff complete it with a labour cost of
   Rs 15,000 dated 10 Oct, **Then** contractor A's khata shows an earning of Rs 15,000 dated
   10 Oct referencing that batch number, and the balance owed rises by Rs 15,000.
2. **Given** an Issued batch, **When** it is voided, **Then** nothing appears in any khata.
3. **Given** an Issued batch whose contractor is changed from A to B before completion, **When**
   it is completed, **Then** the earning appears only in B's khata.
4. **Given** a contractor with no batches, payments or opening balance, **When** staff open the
   khata, **Then** it shows an empty ledger and a balance of Rs 0.
5. **Given** earnings and payments on several dates, **When** staff view the khata, **Then** rows
   are in date order (ties in the order recorded) and each row's running balance equals the
   previous balance plus the earning or minus the payment.
6. **Given** a contractor who has been paid more than they have earned, **When** staff view the
   khata or the contractors list, **Then** the balance is shown clearly as an advance (paid
   ahead), not as an amount owed.

---

### User Story 2 - Record a cash payment covering one or more batches (Priority: P1)

A staff member pays a contractor cash and records it. They pick the date and see that contractor's
completed batches that are not yet fully paid, tick the ones this cash covers, and each ticked
batch's amount fills in with what is still unpaid on it (editable down for a part-payment). The
payment total adds itself up. They may enter a total larger than the ticked batches — for example
to pay against the opening balance or to give an advance — and the extra is recorded as unlinked.

**Why this priority**: Paying contractors is the other half of the khata; without it the balance
only ever grows.

**Independent Test**: With batches PB-0001 (Rs 15,000) and PB-0002 (Rs 9,000) Unpaid, record one
Rs 30,000 payment ticking both at full amount. Confirm both show Paid, Rs 6,000 is shown as
unlinked, and the khata balance is Rs 6,000 advance.

**Acceptance Scenarios**:

1. **Given** three Unpaid batches, **When** staff record one payment ticking all three at their
   full unpaid amounts, **Then** one payment is saved, all three batches show Paid, and the khata
   shows a single payment row for the full total.
2. **Given** a batch with Rs 9,000 unpaid, **When** staff tick it for Rs 4,000, **Then** it shows
   Part-paid with Rs 5,000 still unpaid; a later payment of Rs 5,000 against it makes it Paid.
3. **Given** a batch with Rs 5,000 unpaid, **When** staff try to put Rs 6,000 against it, **Then**
   the payment is refused with a message naming the batch and its unpaid amount.
4. **Given** ticked batches totalling Rs 24,000, **When** staff enter a payment total of
   Rs 20,000, **Then** the payment is refused: the amounts against batches cannot exceed the
   payment.
5. **Given** no batches ticked, **When** staff record a Rs 10,000 payment, **Then** it is saved as
   fully unlinked and reduces the balance by Rs 10,000.
6. **Given** two staff members recording payments for the same contractor at the same moment that
   both try to pay the full unpaid Rs 9,000 of one batch, **When** both submit, **Then** exactly one
   succeeds and the other is refused with the batch's now-current unpaid amount (Rs 0); the batch
   is never paid more than its labour cost.
7. **Given** a batch whose completion date is after the chosen payment date, **When** staff open
   the payment form, **Then** that batch is not offered for linking.
8. **Given** an inactive contractor with a balance owed, **When** staff record a payment, **Then**
   it is accepted (inactive contractors can still be paid off).

---

### User Story 3 - Record the opening balance at go-live (Priority: P1)

When the system goes live, each contractor may already be owed money from work before go-live, or
may already have received an advance. Staff record that figure once per contractor, in either
direction, so the khata continues from the real balance in the old Excel file.

**Why this priority**: Without it, every khata starts wrong and the Excel files cannot be retired.

**Independent Test**: For a contractor with no entries, record an opening balance of Rs 12,000
owed. Confirm it is the first khata row and the balance is Rs 12,000. Record a Rs 12,000 unlinked
payment and confirm the balance is Rs 0.

**Acceptance Scenarios**:

1. **Given** a contractor with no opening balance, **When** staff record Rs 12,000 owed to the
   contractor dated 1 Oct, **Then** it appears as the first khata row and the balance is Rs 12,000.
2. **Given** a contractor with no opening balance, **When** staff record an advance of Rs 3,000,
   **Then** the balance is Rs 3,000 advance.
3. **Given** a contractor who already has an opening balance, **When** staff try to record another,
   **Then** it is refused (corrections are made with an adjustment, User Story 4).
4. **Given** a contractor whose earliest existing entry is dated 5 Oct, **When** staff try to date
   the opening balance 8 Oct, **Then** it is refused: the opening balance must be on or before the
   contractor's earliest entry.
5. **Given** a contractor with no opening balance and a current settlement, **When** staff try to
   record an opening balance, **Then** it is refused with a message to post an adjustment instead;
   an adjustment dated after the settlement (e.g. reason "Opening balance missed at go-live")
   corrects the balance with the same financial effect.

---

### User Story 4 - Correct mistakes: reverse a payment, or post an adjustment (Priority: P2)

Payments and earnings are never edited. If a payment was recorded wrongly, staff reverse it with a
reason: the original stays visible, an offsetting row is added, and any batches it paid go back to
their earlier paid status. For anything else — a deduction for damaged work, or a completed batch
entered with the wrong packet count — staff post an adjustment (amount owed up or down) with a
required reason.

**Why this priority**: Mistakes will happen, but the core flow works without this; staff can defer
a correction briefly.

**Independent Test**: Record a Rs 9,000 payment against PB-0002, then reverse it with reason
"entered twice". Confirm the payment shows as reversed, an offsetting row appears, PB-0002 is
Unpaid again, and the balance is back where it was. Post a Rs 500 deduction and confirm the
balance drops by Rs 500 with the reason shown.

**Acceptance Scenarios**:

1. **Given** an active payment, **When** staff reverse it with a reason, **Then** the payment is
   marked reversed (with reason, date and who), an offsetting row for the same amount is added to
   the khata dated today, and its batch amounts stop counting towards those batches' paid status.
2. **Given** a reversed payment, **When** staff try to reverse it again, **Then** it is refused.
3. **Given** staff try to reverse a payment without a reason, **Then** it is refused.
4. **Given** staff post an adjustment increasing what is owed by Rs 1,200 with reason "PB-0003
   recorded 200 packets short", **Then** the khata shows it with its reason and the balance rises
   by Rs 1,200; no batch figures change.
5. **Given** staff post a deduction of Rs 500 with reason "damaged packets", **Then** the balance
   falls by Rs 500.
6. **Given** an adjustment without a reason or with an amount of 0, **Then** it is refused.

---

### User Story 5 - Settle a period and print the statement (Priority: P2)

At the end of a week or month, staff sit with the contractor, agree the figures, and settle up to a
chosen date. The system records a settlement for that period showing the opening balance, earned,
paid, adjustments and closing balance, freezes those figures, and from then on refuses anything
dated on or before that date for that contractor. Staff print a settlement statement for the
contractor to sign. If the closing balance is not zero the system warns but allows it; the balance
carries into the next period.

**Why this priority**: The business requires a formal settlement record, but the khata is usable
day to day before the first settlement.

**Independent Test**: With entries from 1–7 Oct, settle up to 7 Oct. Confirm the settlement shows
correct figures, then try to record a payment dated 6 Oct and confirm it is refused. Record one
dated 8 Oct and confirm it is accepted. Print the statement.

**Acceptance Scenarios**:

1. **Given** a contractor's first entry is dated 1 Oct and nothing is settled, **When** staff settle
   up to 7 Oct, **Then** a settlement for 1–7 Oct is saved with opening balance Rs 0, earned, paid,
   adjustments and closing balance calculated from the khata, and who settled it and when.
2. **Given** a settlement up to 7 Oct, **When** staff settle again up to 31 Oct, **Then** the new
   period is 8–31 Oct and its opening balance equals the previous closing balance.
3. **Given** a settlement up to 7 Oct, **When** staff try to record a payment, reversal,
   adjustment or opening balance dated on or before 7 Oct, **Then** it is refused with a message
   naming the settled date.
4. **Given** a settlement up to 7 Oct for contractor A, **When** staff try to complete one of A's
   batches with completion date 6 Oct, **Then** completion is refused with a message that A is
   settled up to 7 Oct; completing it dated 8 Oct or later succeeds.
5. **Given** a settlement for contractor A, **When** staff complete a batch for contractor B dated
   inside A's settled period, **Then** it succeeds (the lock is per contractor).
6. **Given** a closing balance of Rs 4,000 owed, **When** staff settle, **Then** the system warns
   that the balance is not zero and saves the settlement only after staff confirm.
7. **Given** staff choose a settle-up-to date after today, or before the period's start date,
   **Then** it is refused.
8. **Given** a contractor with no khata entries at all, **When** staff try to settle, **Then** it is
   refused (there is nothing to settle).
9. **Given** a settlement, **When** staff print its statement, **Then** it shows the contractor,
   period, opening balance, every khata row in the period with its running balance, the totals,
   the closing balance, and lines for both signatures.
10. **Given** two staff act on the same contractor at once, **When** one settles while the other
    records an entry for that contractor, **Then** the settlement's frozen
    figures always match the khata for that period exactly.

---

### User Story 6 - Reopen the latest settlement (Priority: P3)

If a settlement was made too early or with a mistake, staff can reopen the most recent settlement
for that contractor with a reason. It stays on record marked reopened; its dates are unlocked; a
new settlement can later be made over the same period.

**Why this priority**: A rare escape hatch; settlements can be avoided until staff are confident.

**Independent Test**: Settle up to 7 Oct, reopen it with a reason, record a payment dated 6 Oct,
settle up to 7 Oct again. Confirm two settlement records exist for that period — one reopened,
one current — and the new one includes the 6 Oct payment.

**Acceptance Scenarios**:

1. **Given** the most recent settlement for a contractor, **When** staff reopen it with a reason,
   **Then** it is marked reopened (with reason, who and when), stays visible in the settlements
   list, and its dates are no longer locked.
2. **Given** a contractor with two current settlements, **When** staff try to reopen the older one,
   **Then** it is refused (only the most recent can be reopened).
3. **Given** a reopen without a reason, **Then** it is refused.
4. **Given** a reopened settlement, **When** staff print it, **Then** the statement is clearly
   marked as reopened / no longer valid.

---

### Edge Cases

- **Earning equals zero**: impossible — 010 requires at least 1 packet and a rate above zero, so a
  completed batch's labour cost is always above zero.
- **A payment dated inside a settled period** cannot be reversed (the reversal would change which
  batches the signed statement showed as paid); staff must reopen the settlement first.
- **Reversal date** is always today (Pakistan business date), so a reversal is refused if today is
  itself inside a settled period (possible only if a settlement was made up to today).
- **Opening balance missed until after the first settlement**: the opening balance action is closed
  (FR-020); staff post an adjustment dated after the latest settlement instead. It is labelled as an
  adjustment, not "Opening balance", and it affects the next period, not the already-signed one. If
  the labelled opening balance really matters, staff can reopen every settlement (latest first,
  FR-028), record it, and settle again.
- **Balance exactly zero** after settlement: no warning.
- **Contractor deactivated with a balance**: allowed after a confirmation that states the balance;
  the contractor's khata, payments and settlements stay available.
- **A batch completed with a completion date after the contractor was deactivated**: allowed (010
  already lets a batch finish with a contractor deactivated after issue); the earning posts as usual.
- **A period with no activity** (e.g., a quiet week): can still be settled; earned, paid and
  adjustments are Rs 0 and closing equals opening.
- **Rounding**: all amounts are PKR with 2 decimals, as elsewhere in the system; no amount is ever
  recalculated after it is recorded.
- **Very long khata**: a contractor's full history (a few thousand rows over years) remains
  viewable; staff can narrow it by date range.
- **Unlinked advance followed by a new batch**: the batch shows Unpaid even though the balance
  already reflects the advance. Accepted trade-off for this feature; the khata balance is the
  authoritative figure.

## Requirements *(mandatory)*

### Functional Requirements

**Earnings from batches**

- **FR-001**: System MUST, when a production batch is completed, record an earning in that batch's
  contractor's khata equal to the batch's labour cost, dated on the batch's completion date and
  referencing the batch — in the same all-or-nothing step as the completion itself.
- **FR-002**: System MUST NOT record any earning for Issued or Voided batches.
- **FR-003**: System MUST refuse to complete a batch whose completion date is on or before the end
  date of that contractor's latest current (not reopened) settlement, with a clear message.

**Khata and balances**

- **FR-004**: System MUST show, per contractor, a khata listing every earning, payment, payment
  reversal, opening balance and adjustment in date order, with description, linked batch or
  payment reference, amount earned/owed-up, amount paid/owed-down, and running balance.
- **FR-005**: System MUST compute a contractor's balance as the sum of all their khata entries, and
  show a negative balance as an advance.
- **FR-006**: System MUST show each completed batch's payment status — Unpaid, Part-paid or Paid —
  with its labour cost, amount paid and amount unpaid, derived from the active (non-reversed)
  payments linked to it; on the contractor's khata and on the batch's own detail view.
- **FR-007**: System MUST show every contractor's current balance on the contractors list.
- **FR-008**: System MUST let staff narrow a khata to a date range, showing the balance brought
  forward at the start of the range.
- **FR-009**: Khata entries MUST never be edited or deleted; corrections are made only by payment
  reversal or adjustment.

**Payments**

- **FR-010**: System MUST let staff record a cash payment to a contractor (active or inactive) with
  a date (not after today), an amount above zero, and an optional note.
- **FR-011**: System MUST let staff link a payment to any number of that contractor's completed
  batches with an amount per batch, offering only batches that are completed on or before the
  payment date and still have an unpaid amount, and pre-filling each ticked batch's amount with its
  unpaid amount.
- **FR-012**: System MUST refuse a payment if any batch amount is zero or less, exceeds that batch's
  unpaid amount at the moment of saving, or if the batch amounts together exceed the payment amount.
- **FR-013**: System MUST allow the payment amount to exceed the linked batch amounts, recording the
  difference as unlinked, and MUST show the unlinked amount on the payment.
- **FR-014**: System MUST record the payment, its batch links and its khata entry all together or
  not at all.
- **FR-015**: System MUST guarantee that two payments recorded at the same moment can never together
  pay any batch more than its labour cost, and that neither can land in a period being settled at
  the same moment.
- **FR-016**: System MUST refuse a payment dated on or before the contractor's latest current
  settlement end date.
- **FR-017**: Payments MUST never be edited or deleted.

**Payment reversal**

- **FR-018**: System MUST let staff reverse an active payment with a required reason, which marks the
  payment reversed (reason, who, when), adds an offsetting khata entry for the full payment amount
  dated today, and stops its batch amounts counting towards batch payment status — all together or
  not at all.
- **FR-019**: System MUST refuse to reverse a payment that is already reversed, or whose payment
  date is on or before the contractor's latest current settlement end date, or when today is on or
  before that date.

**Opening balance**

- **FR-020**: System MUST let staff record at most one opening balance per contractor, in either
  direction (owed to the contractor, or advance already given), with an amount above zero, a date
  not after today and on or before the contractor's earliest existing khata entry — and only while
  the contractor has no current (not reopened) settlement. Once a current settlement exists, the
  opening balance action MUST be refused with a message directing staff to post an adjustment
  (FR-021) instead; there is no exception to the settlement lock (FR-027).

**Adjustments**

- **FR-021**: System MUST let staff post an adjustment to a contractor's khata — increasing or
  decreasing what is owed — with an amount above zero, a date not after today, and a required
  reason; refused if dated on or before the contractor's latest current settlement end date.
- **FR-022**: Adjustments MUST NOT change any production batch's figures or payment status.

**Settlement**

- **FR-023**: System MUST let staff settle a contractor's khata up to a chosen end date that is not
  after today and not before the period start, where the period start is the day after the latest
  current settlement's end date, or the contractor's earliest khata entry date if none exists.
- **FR-024**: System MUST refuse to settle a contractor with no khata entries.
- **FR-025**: On settling, System MUST calculate from the khata and save the period's opening
  balance, total earned, total paid (net of reversals), total adjustments and closing balance,
  with who settled and when, and an optional note. These figures MUST NOT change afterwards.
- **FR-026**: System MUST warn when the closing balance is not zero and save the settlement only
  after staff confirm.
- **FR-027**: Once settled, System MUST refuse every new khata entry for that contractor dated on or
  before the settlement end date, from every source (FR-003, FR-016, FR-019, FR-020, FR-021).
- **FR-028**: System MUST let staff reopen only the most recent current settlement of a contractor,
  with a required reason; the settlement stays on record marked reopened (reason, who, when) and no
  longer locks dates.
- **FR-029**: System MUST list each contractor's settlements (current and reopened) with period and
  figures.
- **FR-030**: System MUST provide a printable settlement statement showing contractor name and
  phone, period, opening balance, every khata row in the period with running balance, totals,
  closing balance, and signature lines for the business and the contractor; a reopened settlement's
  statement MUST be clearly marked as reopened.

**Contractors**

- **FR-031**: When staff deactivate a contractor with a non-zero balance, System MUST state the
  balance in the confirmation and allow the deactivation once confirmed.

**General**

- **FR-032**: All "today" checks MUST use the Pakistan calendar date (ADR-0009).
- **FR-033**: All amounts MUST be PKR with 2 decimal places.
- **FR-034**: Every recorded entry, payment, reversal, settlement and reopen MUST store who did it and
  when.
- **FR-035**: Only signed-in staff may view or change any of this data (same access as every other
  feature).

### Key Entities

- **Contractor** *(existing, from 010)*: name, phone, active/inactive. Gains a khata, payments and
  settlements; no rates are added.
- **Khata entry**: one line in a contractor's khata — date, direction (owed up / owed down), amount,
  kind (batch earning, payment, payment reversal, opening balance, adjustment), reference to its
  source, description or reason. Never edited or deleted.
- **Payment**: a cash payment to one contractor — date, amount, note, active or reversed (with
  reversal reason, who, when). Has zero or more batch links.
- **Payment–batch link**: the amount of one payment applied to one completed batch of the same
  contractor. A batch can have links from several payments; a payment can link several batches.
- **Settlement**: one closed period for one contractor — start and end dates, frozen opening
  balance, earned, paid, adjustments, closing balance, note, who and when; current or reopened (with
  reason, who, when).
- **Production batch** *(existing, from 010)*: supplies contractor, completion date and frozen labour
  cost; its payment status is derived from payment links.

## Assumptions

- The khata's direction convention is "positive = the business owes the contractor". Earnings,
  owed-to-contractor opening balances, upward adjustments and payment reversals increase it;
  payments, advance opening balances and deductions decrease it.
- The labour cost frozen on the batch at completion is the amount earned; no rounding or
  re-derivation happens in this feature.
- A payment can only be linked to batches completed on or before the payment date; paying earlier is
  recorded as an unlinked advance.
- The opening balance, if any, is the first entry in time for that contractor; contractors created
  after go-live usually have none.
- Reversal is dated today rather than on the original payment date, matching 009's bounce reversal,
  so the khata shows when the correction happened.
- Batch links cannot be added to or removed from an existing payment; to change them, reverse the
  payment and record it again.
- Scale: a handful of contractors, a few hundred batches and payments per year; no pagination
  beyond a date-range filter is needed.
- CSV export of the khata is not required in this feature (can reuse ADR-0007 later if asked).

## Dependencies

- 010 Production Batches: contractors, completed batches with frozen labour cost and completion
  date, and the batch completion step (extended here to post the earning and honour the settlement
  lock).
- ADR-0010 (this feature's decisions), ADR-0002 (all-or-nothing writes), ADR-0006 (print pages),
  ADR-0008 (batch lifecycle), ADR-0009 (Pakistan business date).
- Live database: 0 contractors and 0 production batches at the time of writing, so no existing
  batch earnings need back-posting; the change must still be safe if some exist.

## Out of Scope

- Contractor sub-contract rates, commission margin, and any payment to the contractor's home workers
  or sub-partners (`specs/PRODUCT-OVERVIEW.md`, Labour / Commission Ledger note).
- Any contractor or contractor × product labour rate table.
- Cheque, bank-transfer or online payments, and cheque bounce handling.
- Linking an earlier payment's unlinked remainder to a later batch.
- Correcting a completed batch's packets, stock or cost (010 gap; the money side is handled with an
  adjustment).
- Reopening any settlement other than the most recent.
- Khata CSV export; profit reports (013).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Every completed batch appears in its contractor's khata with no manual entry — 100% of
  completed batches, 0 for issued or voided ones.
- **SC-002**: Staff can record one cash payment covering three batches in under 1 minute.
- **SC-003**: Each contractor's balance always equals the sum of all their khata entries — every
  entry that increases what is owed counted as plus, every entry that decreases it counted as
  minus, whichever way the opening balance went — verifiable by hand for any contractor.
- **SC-004**: Under a simultaneous-payment test (two staff paying the same batch at once), 0 batches
  end up paid above their labour cost, in every run.
- **SC-005**: After a settlement, 0 entries of any kind can be recorded for that contractor dated
  on or before its end date, and its frozen figures match the khata for the period exactly.
- **SC-006**: Staff can settle a period and print its statement in under 2 minutes.
- **SC-007**: A contractor's current balance is visible from the contractors list without opening
  the khata.
- **SC-008**: The contractor Excel khata files can be retired: the opening balance plus recorded
  activity reproduces each contractor's real balance on the first settlement.
