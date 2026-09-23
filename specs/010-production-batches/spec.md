# Feature Specification: Production Batches

**Feature Branch**: `010-production-batches`
**Created**: 2026-09-24
**Status**: Draft
**Input**: User description: "010-production-batches: Production Batches for MA Textile — convert a weight (kg) of a raw fabric lot (raw_material_purchases, weight mode) into whole-number packets of one manufactured product via one external contractor. Lifecycle Issued → Completed / Voided (mirrors Challans). Issue: pick lot (picker shows supplier·date·remaining/total kg·Rs/kg; fully consumed lots excluded), weight issued (≤ lot remaining, lot row-locked, decrements remaining_weight_kg at issue; triggers 002's existing lock), manufactured product (active only), contractor (active only), labour rate per packet (pre-filled from products.default_labour_rate_per_packet, editable while issued, frozen at completion), issue date; shows expected packets = kg × expected_yield_per_kg as suggestion only. Edit/Void only while Issued (void restores full issued weight to lot). Complete: packets produced (whole number, authoritative, drives stock and costing), total weight of the returned packets weighed separately (informational cross-check = weight converted; never overrides/blocks packet count; exceeding weight issued should be a soft warning due to packaging weight — to confirm), completion date; writes +packets inventory_movements row (source_type 'production_batch') dated on completion date and recomputes quantity_on_hand; computes and freezes raw material cost = weight ISSUED × lot rate/kg, labour cost = packets × rate, total cost, average cost per packet, wastage kg/Rs/% (reported only, never deducted), and yield variance vs expected (displayed, never enforced). Completed is read-only. No returned-kg field (unused fabric never returned). No partial receipts (issue smaller batches instead). One batch = one lot = one product = one contractor. Creates a minimal contractors table (name, phone, active/inactive) with simple management; payments/commission/contractor rates are 011. One-time opening-stock entry per manufactured product at go-live via inventory_movements source_type 'opening_balance' (same shape as 007's traded backfill), resolving 007's manufactured interim limitation. Issued batches list serves as work-in-progress view. See ADR-0008 and specs/PRODUCT-OVERVIEW.md Production Batches."

## Clarifications

### Session 2026-09-24

- Q: Returned packet weight greater than weight issued (packaging adds weight) — warn or block? → A: Soft warning staff can confirm past; wastage stored as 0 kg / Rs 0 / 0% with a flag (FR-019, US2-6).
- Q: How is a wrong opening stock entry corrected? → A: One correcting entry with a reason, only while no accepted Challan has taken that product's stock out and never below 0; originals never edited/deleted (FR-025, US3-4/5).
- Q: Does opening stock carry a cost? → A: Optional cost per packet stored with the entry, for 012/013 valuation (FR-024, US3-6).
- Q (raised in /sp.plan): Can a lot be deleted after its only batch is voided? → A: No. It becomes editable again but stays undeletable while any batch (voided included) references it, preserving traceability (US4-5, FR-012).

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Issue fabric to a contractor as a new batch (Priority: P1)

When fabric physically leaves the premises for a contractor, a staff member records a new
production batch. They pick the fabric lot it came from, enter the weight handed over, and choose
the manufactured product the contractor will make, the contractor, and the labour rate per packet.
The rate is pre-filled from the product's default and can be changed. They also enter the issue
date. The system shows the expected number of packets (weight × the product's expected yield) as a
suggestion. It deducts the issued weight from the lot's remaining weight straight away, so the
same kilograms can never be issued twice.

**Why this priority**: This is the root of the feature. Nothing can be completed, costed or counted
as stock until fabric has been issued against a lot. It also closes the most immediate real-world
gap: today there is no record of which fabric is sitting with which contractor.

**Independent Test**: Record a fabric lot of 3,000 kg at Rs 66.67/kg. Issue a batch of 3,000 kg
from it to a contractor for "6-Pack Washcloth". Confirm the batch shows as Issued with the expected
packet suggestion, the lot shows 0 kg remaining, and the lot can no longer be edited or deleted.

**Acceptance Scenarios**:

1. **Given** a fabric lot with 3,000 kg remaining, an active manufactured product and an active
   contractor, **When** staff issue a batch of 3,000 kg with an issue date of today, **Then** the
   batch is saved with status "Issued" and a batch number, and the lot's remaining weight becomes
   0 kg.
2. **Given** the issue form, **When** staff select a manufactured product, **Then** the labour rate
   field is pre-filled with that product's default labour rate per packet, and staff can overwrite
   it before saving.
3. **Given** a weight issued and a selected product with an expected yield, **When** the form is
   filled in, **Then** the expected packet count (weight × expected yield, rounded down to a whole
   packet) is displayed as a suggestion only.
4. **Given** a lot with 1,200 kg remaining, **When** staff try to issue 1,500 kg from it, **Then**
   the system rejects the batch, states the lot's remaining weight, and changes nothing.
5. **Given** a lot that was fully unused before this batch, **When** the batch is issued, **Then**
   the lot becomes read-only in the purchases screens (the existing "already used" lock from 002).
6. **Given** the lot picker, **When** staff open it, **Then** each lot shows supplier, purchase
   date, remaining / total kg, and rate per kg. Lots with 0 kg remaining are not offered, and only
   active manufactured products and active contractors can be selected.

---

### User Story 2 - Complete a batch when the packets come back (Priority: P1)

When the contractor returns the finished packets, a staff member opens the Issued batch and
completes it. They enter:
- the number of packets received, which is authoritative and drives stock and cost;
- the total weight of the returned packets, weighed separately, which is a cross-check only;
- the completion date.

The system then:
- adds the packets to the manufactured product's stock;
- calculates and freezes the batch's cost figures, with raw material cost always based on the full
  weight issued;
- reports wastage and the variance from the expected yield, without ever blocking completion
  because of either.

**Why this priority**: This is what produces sellable stock and a true cost per packet. Until it
exists, Challans for manufactured products cannot be accepted (007's documented limitation), and
the business still costs packets by hand.

**Independent Test**: Complete the 3,000 kg batch from User Story 1 with 2,500 packets, 2,900 kg
returned packet weight, and today's date. Confirm the product's quantity on hand rises by 2,500, and
the batch shows raw material cost Rs 200,010.00, the labour cost at its rate, total cost, average
cost per packet, and wastage of 100 kg / Rs 6,667.00 / 3.33%.

**Acceptance Scenarios**:

1. **Given** an Issued batch of 3,000 kg at a lot rate of Rs 66.67/kg with a labour rate of
   Rs 10.00/packet, **When** staff complete it with 2,500 packets and 2,900 kg returned packet
   weight, **Then** the batch shows:
   - raw material cost Rs 200,010.00 (3,000 × 66.67);
   - labour cost Rs 25,000.00;
   - total cost Rs 225,010.00;
   - average cost per packet Rs 90.00;
   - wastage 100 kg, Rs 6,667.00, 3.33%.
2. **Given** that same completion, **When** the manufactured product's stock is viewed, **Then** its
   quantity on hand has increased by exactly 2,500, dated on the completion date.
3. **Given** an expected yield that suggests 2,700 packets, **When** staff enter 2,500 actual
   packets, **Then** completion succeeds and the batch displays a variance of −200 packets
   (−7.41%) for information only.
4. **Given** the complete form, **When** staff enter a non-whole or zero packet count, **Then** the
   system rejects it with a clear message.
5. **Given** a returned packet weight that looks inconsistent with the packet count, **When** staff
   complete the batch, **Then** the packet count is saved exactly as entered. The weight never
   changes or blocks the packet count.
6. **Given** a returned packet weight greater than the weight issued, **When** staff complete the
   batch, **Then** the system shows a warning that staff can confirm past (the packaging adds
   weight). On confirmation the batch completes, with wastage shown as 0 kg / Rs 0 / 0% and a note
   that the returned weight exceeded the weight issued.
7. **Given** a Completed batch, **When** anyone views it, **Then** it is fully read-only. It offers
   no edit, void or re-complete action, and its labour rate and cost figures never change
   afterwards, even if the product's default rate or the lot is later changed.

---

### User Story 3 - Record opening stock for manufactured products already on the shelf (Priority: P1)

At go-live, real finished packets already exist on the shelf for some manufactured products, but
the system shows 0 stock for them. A staff member records a one-time opening stock quantity for
each such product. This lets Challans against those products be accepted immediately, without
waiting for a new batch to complete.

**Why this priority**: Without it, existing physical stock cannot be delivered and accepted through
Challans. Every such Challan would fail the stock check until new batches complete, which blocks
day-one business.

**Independent Test**: For a manufactured product with 0 on hand, record an opening stock of 400
packets. Confirm quantity on hand becomes 400 and a previously unacceptable Challan for 300 of that
product can now be accepted.

**Acceptance Scenarios**:

1. **Given** a manufactured product with no opening stock recorded, **When** staff record an
   opening stock of 400 packets with a date, **Then** the product's quantity on hand increases by
   400 and the entry is labelled "Opening balance" in the product's stock history.
2. **Given** a manufactured product that already has an opening stock entry, **When** staff try to
   record another one, **Then** the system refuses and shows the existing entry.
3. **Given** the opening stock screen, **When** staff enter a non-whole, zero or negative quantity,
   **Then** the system rejects it.
4. **Given** an opening stock entry of 400 that should have been 340, **When** no accepted Challan
   has yet taken stock of that product out, **Then** staff can record one correcting entry of −60,
   with a reason, labelled "Opening balance correction". The original entry is never edited or
   deleted.
5. **Given** a correcting entry already exists, or an accepted Challan has taken stock of that
   product out, **When** staff try to correct the opening stock, **Then** the system refuses. A
   correction may never take quantity on hand below 0.
6. **Given** the opening stock form, **When** staff enter a quantity with or without a cost per
   packet (greater than 0, 2 decimal places), **Then** the entry is saved either way. If a cost was
   given, it is stored with the entry so later inventory and profit reports (012/013) can value
   those packets; if left blank, those packets carry no cost.

---

### User Story 4 - Edit or void a batch before it is completed (Priority: P2)

While a batch is still Issued, staff can correct any of its details:
- lot, weight issued, product, contractor, labour rate or issue date, where the lot's remaining
  weight is adjusted to match;
- or void the batch entirely if it was recorded by mistake or the fabric never left, which returns
  the full issued weight to the lot.

**Why this priority**: Data-entry mistakes will happen, but the core flow works without this. Staff
can still issue and complete correctly entered batches.

**Independent Test**: Issue 1,000 kg from a lot, edit it to 800 kg and confirm the lot regains
200 kg. Then void it and confirm the lot is back to its full original remaining weight, and editable
again if no other batch uses it.

**Acceptance Scenarios**:

1. **Given** an Issued batch of 1,000 kg, **When** staff change the weight to 800 kg, **Then** the
   lot's remaining weight increases by 200 kg.
2. **Given** an Issued batch of 1,000 kg, **When** staff increase the weight beyond what the lot
   has left plus the batch's own 1,000 kg, **Then** the edit is rejected and nothing changes.
3. **Given** an Issued batch, **When** staff change it to a different lot, **Then** the full weight
   returns to the old lot and is deducted from the new lot under the same remaining-weight check.
4. **Given** an Issued batch, **When** staff void it and confirm, **Then** the batch status becomes
   "Voided", the full issued weight returns to the lot, the batch becomes read-only, and no stock
   or cost is recorded for it.
5. **Given** a lot whose only batch is voided, **When** the lot's remaining weight returns to its
   full purchased weight, **Then** the lot becomes editable again in the purchases screens. It
   stays **undeletable** while any batch, voided or not, references it, so every batch keeps its
   full lot traceability. A delete attempt is refused with a clear message.
6. **Given** a Completed or Voided batch, **When** staff attempt to edit or void it, **Then** the
   system refuses.

---

### User Story 5 - See what fabric is out with contractors, and review batches (Priority: P2)

Staff and the owner can see a batch list filterable by status (Issued / Completed / Voided),
contractor, product and date range, with a batch number search. The Issued view is the
work-in-progress picture: for each Issued batch it shows the contractor, product, weight issued,
fabric value (weight × lot rate), issue date and days outstanding, with totals for weight and
value. Each batch has a detail view showing all its entered figures and, once completed, its full
cost and wastage breakdown.

**Why this priority**: Visibility of fabric with contractors is a key business goal, but it depends
on batches existing first (User Stories 1–2).

**Independent Test**: With two Issued and one Completed batch, filter to Issued. Confirm only two
appear, with correct days outstanding and correct totals of kg and Rs value.

**Acceptance Scenarios**:

1. **Given** several batches, **When** staff filter by status "Issued", **Then** only Issued batches
   appear, each with contractor, product, weight issued, fabric value, issue date and days
   outstanding, plus totals for weight and value.
2. **Given** several batches, **When** staff filter by contractor, product or date range, or search
   by batch number, **Then** the list shows only matching batches, newest first by default.
3. **Given** a Completed batch, **When** staff open it, **Then** they see the lot (supplier, date,
   rate), weight issued, returned packet weight, packets produced, expected packets and variance,
   labour rate, raw material cost, labour cost, total cost, average cost per packet, and wastage in
   kg, Rs and %. If the returned weight exceeded the weight issued, a note says so beside the
   wastage figures.

---

### User Story 6 - Maintain the contractor list (Priority: P2)

Staff maintain a simple list of contractors: name and phone number, marked active or inactive.
Only active contractors can be chosen for new batches. Deactivating a contractor never affects
batches already recorded against them.

**Why this priority**: Every batch needs a contractor. The list is small (a handful of
contractors) and simple, but must exist before the first batch is issued.

**Independent Test**: Add a contractor, issue a batch to them, deactivate them. Confirm they no
longer appear for new batches but the existing batch still shows their name and can still be
completed.

**Acceptance Scenarios**:

1. **Given** the contractor list, **When** staff add a contractor with a name (and optionally a
   phone number), **Then** it is saved as active and can be chosen on new batches.
2. **Given** an existing contractor name, **When** staff add another contractor with the same name
   (ignoring case and surrounding spaces), **Then** the system rejects it as a duplicate.
3. **Given** an active contractor with an Issued batch, **When** staff mark the contractor inactive,
   **Then** they are no longer offered for new batches, but the Issued batch can still be edited
   (keeping that contractor) and completed.
4. **Given** a contractor, **When** staff edit their name or phone number, **Then** the change shows
   everywhere that contractor is displayed, including past batches.

---

### Edge Cases

- **Two staff issue from the same lot at the same time**, together asking for more than it has
  left: exactly one succeeds. The other is rejected with the lot's current remaining weight, and
  the lot is never taken below 0 kg.
- **Lot with a tiny leftover** (e.g., 0.40 kg): it stays selectable while its remaining weight is
  above 0. Closing out small residuals is not part of this feature.
- **Product deactivated while a batch is Issued**: that batch can still be edited (keeping the
  product) and completed. Inactive products are only excluded from being newly selected.
- **Issue date before the lot's purchase date**: rejected, because fabric cannot be issued before
  it was bought.
- **Completion date before the batch's issue date**: rejected.
- **Future dates**: issue, completion and opening-stock dates cannot be later than today.
- **Labour rate of 0 or negative**: rejected. The rate must be greater than 0.
- **Weight issued of 0 or negative**: rejected. **More than 2 decimal places**: rounded to 2
  decimal places, consistent with 002.
- **Returned packet weight of 0 or negative**: rejected. It must be greater than 0.
- **Expected yield suggestion vs. entered count**: the entered packet count always wins. No
  warning, block or auto-overwrite is triggered by the variance, however large.
- **A Challan for a manufactured product with insufficient stock**: still fails acceptance as today
  (007 behaviour unchanged). This feature only adds stock sources; it never relaxes the stock check.
- **An Issued batch's lot has other batches too**: voiding or editing one batch only affects its
  own weight on the lot, never other batches' shares.
- **Stock history for a manufactured product**: shows opening balance, opening balance correction
  and batch completion entries alongside 007's Challan entries in date order. Each is traceable to
  its source batch or labelled "Opening balance" / "Opening balance correction".

## Requirements *(mandatory)*

### Functional Requirements

**Contractors**

- **FR-001**: System MUST let staff create and edit contractors with a required name (unique,
  case-insensitive, trimmed) and an optional phone number, and mark a contractor active or
  inactive.
- **FR-002**: System MUST offer only active contractors when issuing or re-assigning a batch, while
  continuing to display and allow completion of batches whose contractor has since been
  deactivated.

**Issuing a batch**

- **FR-003**: System MUST let staff issue a production batch by recording: one fabric lot, weight
  issued (kg, greater than 0, 2 decimal places), one active manufactured product, one active
  contractor, a labour rate per packet (greater than 0, 2 decimal places), and an issue date (not
  in the future, not before the lot's purchase date).
- **FR-004**: System MUST offer only weight-based fabric lots with remaining weight above 0 in the
  lot picker, each shown with supplier, purchase date, remaining / total kg, and rate per kg.
- **FR-005**: System MUST reject any issue or edit that would take a lot's remaining weight below
  0, including when two issues against the same lot happen at the same time.
- **FR-006**: System MUST deduct the weight issued from the lot's remaining weight at the moment
  the batch is issued, so that the lot becomes locked against edit/delete exactly as 002 already
  does for used lots.
- **FR-007**: System MUST pre-fill the labour rate with the selected product's default labour rate
  per packet, and MUST save whatever rate staff finally enter as the batch's own rate.
- **FR-008**: System MUST display expected packets (weight issued × product's expected yield per
  kg, rounded down to a whole packet) as a suggestion only. It MUST never enforce it or overwrite an
  entered figure.
- **FR-009**: System MUST give every batch a unique, sequential, human-readable batch number.
- **FR-010**: Issuing a batch MUST NOT change any product's stock.

**Editing and voiding**

- **FR-011**: System MUST allow editing all issue fields of an Issued batch. Weight and lot changes
  adjust the affected lot(s)' remaining weight by exactly the difference, subject to FR-005.
- **FR-012**: System MUST allow voiding an Issued batch after confirmation. This returns its full
  issued weight to its lot and sets its status to Voided. A voided batch keeps its lot reference, so
  a lot referenced by any batch (voided included) can never be deleted.
- **FR-013**: System MUST make Completed and Voided batches fully read-only. No edit, void,
  complete or delete action is available, and no transition out of either state exists.

**Completing a batch**

- **FR-014**: System MUST let staff complete an Issued batch by recording: packets produced (whole
  number, at least 1), total weight of returned packets (kg, greater than 0, 2 decimal places), and
  a completion date (not in the future, not before the issue date).
- **FR-015**: On completion, System MUST increase the batch's manufactured product's quantity on
  hand by exactly the packets produced, as a stock history entry dated on the completion date and
  traceable to the batch.
- **FR-016**: On completion, System MUST calculate and permanently store:
  - raw material cost = weight **issued** × the lot's rate per kg;
  - labour cost = packets produced × the batch's labour rate;
  - total cost = raw material cost + labour cost;
  - average cost per packet = total cost ÷ packets produced.

  All money is rounded to 2 decimal places in PKR.
- **FR-017**: On completion, System MUST calculate and store wastage:
  - kg = weight issued − returned packet weight;
  - Rs = wastage kg × lot rate per kg;
  - % = wastage kg ÷ weight issued.

  These figures are reported only and MUST NOT be deducted from any cost.
- **FR-018**: System MUST display yield variance (packets produced − expected packets, as a count
  and a percentage of expected) on the completed batch, for information only.
- **FR-019**: The returned packet weight MUST NOT alter, block or validate the packet count. A
  returned weight greater than the weight issued MUST show a warning that staff can confirm past.
  In that case wastage is stored as 0 kg / Rs 0 / 0%, with the batch flagged as "returned weight
  exceeded issued".
- **FR-020**: Completed batches' labour rate and all cost/wastage figures MUST NOT change when the
  product's default rate, the product's expected yield, or the lot's details change later.

**Viewing**

- **FR-021**: System MUST provide a batch list filterable by status, contractor, product and date
  range, searchable by batch number, sorted newest first by default.
- **FR-022**: For Issued batches, the list MUST show weight issued, fabric value (weight × lot
  rate), issue date and days outstanding, with totals of weight and value across the filtered
  Issued batches.
- **FR-023**: System MUST provide a batch detail view showing all entered figures and, once
  completed, all computed cost, wastage and variance figures.

**Opening stock**

- **FR-024**: System MUST let staff record exactly one opening stock entry per manufactured
  product: a whole-number quantity of at least 1, a date not in the future, and an optional cost
  per packet (greater than 0, 2 decimal places). This increases the product's quantity on hand and
  appears in its stock history labelled "Opening balance".
- **FR-025**: System MUST refuse a second opening stock entry for a product that already has one.
  It MUST allow at most one correcting entry per product. The correction is a non-zero
  whole-number quantity with a required reason, labelled "Opening balance correction". It is only
  permitted while no accepted Challan has taken that product's stock out, and only if it does not
  take quantity on hand below 0. Opening and correcting entries are never edited or deleted.
- **FR-026**: Opening stock entries MUST NOT be offered for traded products. Their opening balance
  was already recorded when 007 went live.

**General**

- **FR-027**: Every issue, edit, void, completion and opening stock entry MUST record which staff
  member made it and when.
- **FR-028**: Each of issue, edit, void, completion and opening stock entry MUST either fully
  succeed (batch, lot weight and stock all updated together) or leave everything unchanged.

### Key Entities

- **Contractor**: An external manufacturing partner fabric is issued to. Name, phone, active or
  inactive. One contractor per batch. Their internal sub-partners are not tracked. Extended later
  by 011 with payments and rates.
- **Production Batch**: One issue of fabric from one lot to one contractor, to make one
  manufactured product. Holds the batch number, status (Issued / Completed / Voided), weight
  issued, labour rate, issue date and, once completed, packets produced, returned packet weight,
  completion date, the frozen cost, wastage and variance figures, and a flag set when the returned
  packet weight exceeded the weight issued (FR-019).
- **Fabric Lot** (existing, 002): A weight-based raw fabric purchase with a remaining weight.
  Batches draw it down, and voids and edits restore it.
- **Manufactured Product** (existing, 003): Supplies the default labour rate and expected yield.
  Its quantity on hand is changed by batch completions, its one-time opening stock entry, and
  that entry's single optional correction.
- **Stock History Entry** (existing, 007): An insert-only record of each stock change for a
  product. Gains three new kinds of entry: batch completion, manufactured opening balance, and
  its one correction.
- **Opening Stock Entry**: The one-time go-live quantity for a manufactured product. Holds the
  quantity, date, optional cost per packet, and at most one later correction (quantity and reason).

## Assumptions

- All authenticated staff can perform every action in this feature, consistent with 001–009.
  There are no separate roles.
- Raw fabric is tracked only as lots' remaining weight and never as a product or in stock
  history (ADR-0008). Only the manufactured output enters stock.
- Staged or partial deliveries are handled by issuing several smaller batches. A batch is completed
  exactly once.
- Issued fabric is never returned unconverted, so there is no "returned kg" field and the cost
  basis is always the full weight issued.
- The returned packet weight is the master spec's "weight converted" figure. Wastage is derived
  from it.
- No printed batch document is required in this feature.
- Currency is PKR only. Money is kept to 2 decimal places, weights to 2 decimal places, and packets
  are whole numbers.
- The master spec's single "batch date" is split into issue date and completion date.
  Stock is dated on completion.
- Scale is small (a handful of contractors, tens to low hundreds of batches per year), so no
  pagination or archival beyond the list filters is needed.

## Dependencies

- 002 / 003b: weight-mode fabric lots, their remaining weight, and the existing "used lot" lock.
- 003: manufactured products' default labour rate and expected yield.
- 007: the insert-only stock history and the stock-derived quantity on hand. This feature resolves
  007's documented manufactured-product limitation.
- ADR-0008: the lifecycle and stock split this spec implements.

## Out of Scope

- Contractor payments, earnings, balances, settlement, contractor-level or contractor×product rates
  (011). 011 will accrue earnings from Completed batches only.
- Stock valuation method for manufactured products and inventory views (012).
- Profit reporting (013). Realised per-batch profit is not derivable because Challans do not record
  which batch packets came from.
- Editing or reversing Completed batches, and general stock adjustments beyond the one-time opening
  entry.
- Multiple lots or products per batch, partial receipts, returned fabric, and lot close-out.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: Staff can issue a batch in under 1 minute and complete one in under 1 minute from the
  batch's page.
- **SC-002**: For every Completed batch, raw material cost equals weight issued × lot rate to the
  paisa, and average cost per packet equals total cost ÷ packets. This is verified against the
  3,000 kg / Rs 66.67 / 2,500-packet worked example.
- **SC-003**: A lot's remaining weight always equals its purchased weight minus the weight of its
  Issued and Completed batches, and is never negative, including under simultaneous issues.
- **SC-004**: A manufactured product's quantity on hand always equals its opening balance (plus any
  correction) plus packets from Completed batches, minus the net stock effect of accepted Challans.
- **SC-005**: The owner can answer "how much fabric, in kg and Rs, is with each contractor right
  now?" from one screen in under 30 seconds.
- **SC-006**: Existing on-shelf manufactured stock can be entered for all such products at go-live,
  after which Challans for that stock can be accepted the same day.
- **SC-007**: No batch's cost or wastage figures change after completion, regardless of later edits
  to the product or lot.
