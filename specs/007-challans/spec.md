# Feature Specification: Challans

**Feature Branch**: `007-challans`
**Created**: 2026-09-21
**Status**: Draft
**Input**: User description: "Delivery challans against customer POs (006). A Challan is created against an existing customer PO, referencing one or more of its line items, and is issued under a trade name (004) — printed with S.NO | Article | Item Name | UOM | QTY columns matching the real challan format. Each Challan line records a quantity delivered AND a quantity accepted separately — they default equal but can be edited down if the signed challan comes back short. When accepted quantity is less than delivered quantity, staff must explicitly record what happens to the shortfall: 'return to inventory' or 'write off' — never left unspecified. Once a Challan is accepted, its accepted quantities roll up cumulatively into the corresponding PO line's delivered_quantity column. Ledger posting: for Chaseup/ChaseValue/Kifayat, an ACCEPTED Challan creates the ledger credit entry — but Habbitt's ledger credit comes from the Performa Invoice (008) instead, so this feature must not post a ledger entry for customers where 'Issues Performa Invoice' is true. A printed/exportable Challan document is needed, using the trade name's printed_name, printed_address, next_challan_number, and signature/stamp images. A Challan cannot reference PO lines that are already fully delivered, and cannot exceed a PO line's remaining (ordered minus already-delivered) quantity."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Issue a Challan against a customer PO (Priority: P1)

An internal staff member picks an open customer PO, selects one or more of its line items that
still have quantity remaining to deliver, enters the quantity actually being sent out on each
selected line, chooses the trade name to issue the Challan under, and produces a printed Challan
document (letterhead, Challan number, date, customer name, a line table of S.NO / Article / Item
Name / UOM / QTY, a totals row, and two signature lines) to send out with the goods.

**Why this priority**: This is the foundational capability — nothing else in this feature (short
receipts, shortfall handling, inventory/ledger effects) matters until a Challan can be created
against a PO and printed. It is also the dependency root for every later step in a Challan's
lifecycle.

**Independent Test**: Can be fully tested by picking an existing open PO with at least one
undelivered line, creating a Challan against one of its lines with a delivered quantity, and
confirming the Challan saves with an auto-generated, trade-name-scoped number, appears in a
Challan list, and its printed/exportable view shows the correct letterhead, line table, and
totals — all before any acceptance step occurs.

**Acceptance Scenarios**:

1. **Given** an open customer PO with a line that has quantity remaining to deliver, **When** the
   staff member creates a Challan referencing that line with a delivered quantity within the
   remaining amount and selects a trade name, **Then** the Challan is saved with status "Issued",
   an auto-generated Challan number in the form `CH #NNN/Mon` scoped to that trade name, and each
   selected line's accepted quantity defaults equal to its delivered quantity.
2. **Given** a Challan has been saved, **When** the staff member opens its printed/exportable
   view, **Then** it shows the chosen trade name's printed name and address, the Challan number
   and date, the customer's legal/billing name, the referenced PO number, a line table with S.NO,
   Article, Item Name, UOM, and QTY (the delivered quantity) per line, a totals row, the trade
   name's signature and stamp images auto-inserted, and two signature lines — with no manual
   copy-paste of any of this required.
3. **Given** the staff member is creating a Challan, **When** they accept the system's
   auto-generated Challan number without changes, **Then** it is used as shown and the trade
   name's next Challan number counter advances; **When** they instead type their own number,
   **Then** that value is stored and validated for uniqueness within that trade name instead.
4. **Given** the staff member is on the "Create Challan" form, **When** they submit without a PO,
   a trade name, or at least one line with a positive delivered quantity, **Then** the system
   rejects the submission with a clear validation error.
5. **Given** a PO line whose ordered quantity is already fully delivered (per its stored Delivered
   figure), **When** the staff member tries to select that line for a new Challan, **Then** the
   system excludes or rejects it — it cannot be referenced again.
6. **Given** a PO line with some quantity still remaining to deliver, **When** the staff member
   enters a delivered quantity on a Challan line that exceeds that remaining amount, **Then** the
   system rejects the submission with a clear error stating the remaining quantity available.

---

### User Story 2 - Record acceptance, including a short receipt (Priority: P1)

Once the signed copy of a Challan comes back from the customer's receiving staff, an internal
staff member opens the Challan, confirms or edits each line's accepted quantity against what the
signed copy actually shows (defaulting to the delivered quantity, edited down if the customer
signed for less), and — for any line where the accepted quantity is less than delivered —
explicitly records whether the shortfall is returned to inventory or written off, before
finalizing ("accepting") the Challan.

**Why this priority**: This is where a Challan's real-world consequences happen — the PO line's
Delivered figure, warehouse stock, and (for most customers) the customer's ledger all update only
once acceptance is finalized. Without this, Challans would be paperwork with no effect on the
records they're meant to drive. It ties for P1 with User Story 1 because an "Issue" capability
with no way to ever finalize acceptance delivers no real business value on its own.

**Independent Test**: Can be fully tested by taking an Issued Challan with one line, first
accepting it with the accepted quantity equal to delivered (confirming the PO line's Delivered
figure increases by that amount), and separately taking a second Issued Challan and reducing one
line's accepted quantity below its delivered quantity, confirming acceptance is blocked until a
shortfall disposition is chosen, and that choosing one allows acceptance to complete.

**Acceptance Scenarios**:

1. **Given** an Issued Challan whose lines all have an accepted quantity equal to their delivered
   quantity, **When** the staff member finalizes acceptance, **Then** the Challan's status becomes
   "Accepted", each line's accepted quantity is added to its PO line's cumulative Delivered figure,
   and the Challan becomes read-only.
2. **Given** an Issued Challan, **When** the staff member edits a line's accepted quantity down
   below its delivered quantity, **Then** the system requires an explicit shortfall disposition —
   "return to inventory" or "write off" — for that line before acceptance can be finalized.
3. **Given** a Challan line with a shortfall and no disposition chosen yet, **When** the staff
   member attempts to finalize acceptance, **Then** the system rejects the action and identifies
   which line(s) still need a disposition.
4. **Given** a Challan line with a shortfall disposed as "return to inventory", **When**
   acceptance is finalized, **Then** the accepted quantity leaves inventory and the shortfall
   quantity is returned to inventory (net stock effect equals only the accepted amount lost).
5. **Given** a Challan line with a shortfall disposed as "write off", **When** acceptance is
   finalized, **Then** the accepted quantity leaves inventory and the shortfall quantity is not
   returned — it is recorded as written off with no offsetting stock increase.
6. **Given** an accepted Challan, **When** the staff member views it, **Then** it displays as
   read-only — no field on it (quantities, disposition, trade name, referenced lines) can be
   changed.
7. **Given** the staff member wants to attach the scanned signed copy of a Challan, **When** they
   upload it (before or after finalizing acceptance), **Then** it is stored against the Challan and
   retrievable from its detail view; finalizing acceptance never requires this upload to already
   exist.

---

### User Story 3 - Post the accepted Challan's value to the right place (Priority: P2)

When a Challan is accepted, the system automatically posts its financial and stock consequences to
the correct downstream record for that specific customer, with no staff judgment call required
about where the credit belongs: for customers who don't receive a separate Performa Invoice from
this business, the accepted Challan itself creates their ledger credit; for the one customer who
does (Habbitt), no ledger entry is posted here at all — that customer's credit will come from the
Performa Invoice feature instead.

**Why this priority**: This is what makes a Challan's acceptance trustworthy across the two
different billing patterns in use — it depends on User Story 2's acceptance step already existing,
so it is sequenced after it, but it's still core to the feature's correctness (a wrong or duplicate
ledger posting would misstate a customer's balance).

**Independent Test**: Can be fully tested by accepting one Challan against a PO for a customer
flagged "Issues Performa Invoice" = No and confirming exactly one ledger credit entry appears for
that customer, and separately accepting a Challan for a customer flagged "Issues Performa Invoice"
= Yes and confirming no ledger entry is created for that customer as a result.

**Acceptance Scenarios**:

1. **Given** a Challan against a PO whose customer has "Issues Performa Invoice" = No, **When**
   the Challan is accepted, **Then** exactly one ledger credit entry is posted for that customer,
   equal to the sum of each accepted line's quantity multiplied by its PO line's unit price.
2. **Given** a Challan against a PO whose customer has "Issues Performa Invoice" = Yes, **When**
   the Challan is accepted, **Then** no ledger entry is posted by this feature for that customer.
3. **Given** the "Issues Performa Invoice" flag is determined per the PO's customer record,
   **When** any Challan is accepted for any customer, **Then** the posting behavior follows that
   customer's own flag value — never a hardcoded assumption about which customer is which.

---

### Edge Cases

- What happens when a staff member tries to select a PO line for a new Challan that already has no
  quantity remaining to deliver? Rejected — that line is excluded from selection (User Story 1,
  Acceptance Scenario 5).
- What happens when two Challans are issued against the same PO line before either is accepted?
  Each is validated independently against the PO line's currently recorded (accepted) Delivered
  figure at the moment it's created — a deliberate simplification, since only acceptance is
  authoritative for that figure (see Assumptions).
- What happens to a Challan that was issued but never gets its signed copy back, or is created in
  error? It can be voided while still in "Issued" status, preserving its record but excluding it
  from active/open Challan views; a voided Challan has no PO-line, inventory, or ledger effect,
  since none occurred before acceptance.
- What happens when a staff member tries to void or edit a Challan that's already been accepted?
  Rejected — an accepted Challan is permanently read-only; corrections after acceptance are out of
  scope for this feature (see Assumptions).
- What happens when a shortfall line is disposed as "write off" — does the write-off ever get
  reversed later? Not by this feature; write-off is a terminal disposition here.
- What happens if a staff member tries to accept a Challan with zero lines having any accepted
  quantity greater than zero? Rejected — acceptance requires at least one line with a positive
  accepted quantity.
- What happens when the referenced PO is cancelled after a Challan against it has already been
  issued but not yet accepted? Acceptance is blocked until the PO is reactivated — a cancelled PO
  cannot receive newly accepted deliveries.
- What happens when a staff member tries to create a new Challan against a PO that is cancelled?
  Rejected — a cancelled PO cannot have new Challans issued against it.
- What happens when a staff member types a Challan number that duplicates an existing one under
  the same trade name? Rejected with a clear duplicate error; the same number is allowed to recur
  across different trade names, since each trade name has its own sequence.
- What happens to a traded product's existing purchase-based stock once this feature ships? It is
  captured as a one-time opening Inventory Movement equal to that product's quantity-on-hand as it
  stood immediately before cutover (FR-011) — nothing is lost, and quantity-on-hand does not jump
  or reset at the moment this feature goes live.
- What happens when a staff member edits or deletes an existing unit-mode purchase (003b) for a
  product that also has Challan-driven Inventory Movements? The purchase's own Inventory Movement
  is adjusted or removed to match, and quantity-on-hand — being always the sum of all of that
  product's movements — reflects the corrected purchase total together with every Challan
  movement, with neither ever silently overwriting the other.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a Challan
  against a single existing, non-cancelled customer PO, selecting a trade name and one or more of
  that PO's line items to include, with a delivered quantity entered per selected line.
- **FR-002**: System MUST reject a Challan line that references a PO line whose remaining
  quantity (ordered minus the PO line's currently recorded Delivered figure) is zero, and MUST
  reject a Challan line whose delivered quantity exceeds that remaining amount.
- **FR-003**: System MUST default each Challan line's accepted quantity equal to its delivered
  quantity at creation, and MUST allow the accepted quantity to be edited down (never above the
  delivered quantity) any time before the Challan is accepted.
- **FR-004**: System MUST auto-generate a Challan number in the form `CH #NNN/Mon`, sequential and
  scoped per trade name using that trade name's next-Challan-number counter (004), advancing the
  counter when the auto-generated value is used, and MUST allow staff to override it with their
  own value instead, validated for uniqueness within that trade name.
- **FR-005**: System MUST produce a printed/exportable Challan document showing: the chosen trade
  name's printed name and address (and its signature and stamp images, auto-inserted with no
  manual copy-paste), the Challan number and date, the referenced PO's customer legal/billing
  name and PO number, a line table with S.NO, Article, Item Name, UOM, and QTY (the delivered
  quantity) per line, a totals row, and two signature lines.
- **FR-006**: System MUST allow zero or one scanned signed copy to be attached to a Challan at any
  point in its lifecycle, and MUST NOT require this attachment to exist before a Challan can be
  accepted.
- **FR-007**: System MUST provide a distinct "accept" action on an Issued Challan that, for every
  line where the accepted quantity is less than the delivered quantity, requires an explicit
  shortfall disposition of either "return to inventory" or "write off" to be recorded before
  acceptance can complete, and MUST reject the accept action if any such line lacks a disposition.
- **FR-008**: System MUST reject the accept action if no line on the Challan has a positive
  accepted quantity.
- **FR-009**: Upon a Challan being accepted, System MUST add each line's accepted quantity to its
  corresponding PO line's cumulative Delivered figure (the value reserved for this purpose by
  006's customer PO lines).
- **FR-010**: Upon a Challan being accepted, System MUST record, as a new Inventory Movement, the
  accepted quantity on each line as stock leaving inventory for the corresponding product, and,
  for any line with a "return to inventory" shortfall disposition, MUST record a separate
  Inventory Movement for the shortfall quantity as stock returning to inventory for that product;
  a "write off" shortfall disposition MUST record no offsetting movement.
- **FR-011**: System MUST make Inventory Movements the sole source of truth for every product's
  quantity-on-hand figure, with no process permitted to set that figure any other way. Because
  quantity-on-hand already exists and is maintained directly from purchase history by
  003b-traded-goods-purchasing, this feature MUST, at the point it ships: (a) create one opening
  Inventory Movement per existing traded product, equal to that product's quantity-on-hand as
  computed from its purchase history immediately beforehand, so no existing stock is lost or
  double-counted; and (b) change how a unit-mode purchase's creation, edit, or deletion affects
  quantity-on-hand, so that each such event writes or adjusts its own Inventory Movement instead
  of directly overwriting the figure. From that point on, a product's quantity-on-hand MUST always
  equal exactly the sum of its Inventory Movements, whether they originated from a purchase, a
  Challan, or (in the future) a production batch.
- **FR-012**: Upon a Challan being accepted, System MUST determine the referenced PO's customer's
  "Issues Performa Invoice" flag and, only when that flag is No, post one ledger credit entry for
  that customer equal to the sum, across the Challan's lines, of each line's accepted quantity
  multiplied by its PO line's unit price; when that flag is Yes, System MUST NOT post any ledger
  entry for that Challan.
- **FR-013**: System MUST make an accepted Challan fully read-only — no header field, line
  quantity, disposition, or referenced PO line may be changed through this feature once accepted.
- **FR-014**: System MUST allow a staff member to void an Issued (not yet accepted) Challan,
  excluding it from default/active Challan views while preserving its record. System MUST NOT
  allow voiding a Challan that has already been accepted, under any circumstance — this is the
  same read-only guarantee FR-013 establishes, restated here against the void action specifically.
- **FR-015**: System MUST NOT permanently delete Challan records, their lines, or their
  attachments through normal use.
- **FR-016**: System MUST display a list of Challans showing at minimum Challan number, date,
  referenced PO number, customer, trade name, and status, filterable by PO, by customer, and by
  status, and MUST allow a staff member to open a full detail view of any single Challan showing
  every header field, every line (delivered quantity, accepted quantity, and disposition where
  applicable), and any attached scanned copy.
- **FR-017**: System MUST require staff to be authenticated before viewing, creating, editing,
  voiding, accepting, or attaching documents to any Challan record.
- **FR-018**: System MUST record and display when each Challan was created, last updated, and (once
  applicable) accepted, and by whom.

### Key Entities

- **Challan**: Represents one delivery note issued against a single customer PO. Attributes:
  referenced PO (reference), trade name (reference), Challan number, Challan date, status
  (Issued / Accepted / Voided), accepted-at timestamp and accepting staff user (once accepted),
  created/updated timestamps. Has one or more Challan Lines and zero or one attached scanned
  signed copy.
- **Challan Line**: Attributes: Challan (reference), referenced PO line (reference — must belong
  to the Challan's own PO), delivered quantity (required, positive), accepted quantity (defaults
  equal to delivered, editable down to zero before acceptance, never above delivered), shortfall
  disposition ("return to inventory" / "write off" — required only when accepted quantity is less
  than delivered quantity, and only meaningful once set at or before acceptance).
- **Inventory Movement** (new, shared, insert-only): One recorded stock change for one product —
  attributes: product (reference), quantity change (positive for stock returning, negative for
  stock leaving), reason (e.g. "Opening balance at cutover", "Purchase recorded", "Challan
  accepted", "Challan shortfall returned to inventory"), source record it came from, movement
  date. This feature introduces this record type and makes it, from this point forward, the only
  thing that determines a product's quantity-on-hand — including one opening movement this
  feature backfills per existing traded product, and every future purchase (003b) as well as every
  Challan (this feature). A future Production Batches feature will also write to it.
- **Product** (from 003/003b; its quantity-on-hand figure is redefined by this feature): This
  feature does not change what quantity-on-hand means to other features, only how it is kept
  correct — it becomes a pure derived total of the product's Inventory Movements (FR-011) instead
  of being overwritten directly from purchase history.
- **Customer PO Line** (from 006; read and partially written by this feature): This feature reads
  a line's ordered quantity and currently recorded Delivered figure to validate new Challan lines,
  and is the sole writer of that Delivered figure's increases, adding each accepted Challan line's
  accepted quantity to it upon acceptance.
- **Trade Name** (from 004; read and partially written by this feature): Supplies the printed
  name, address, signature image, and stamp image used on a printed Challan, and its next-
  Challan-number counter, which this feature advances when an auto-generated number is used.
- **Customer** (from 005; read-only in this feature): Supplies the legal/billing name printed on a
  Challan and the "Issues Performa Invoice" flag that determines whether accepting a Challan posts
  a ledger entry for that customer.
- **Ledger Entry** (from 005; written by this feature, conditionally): One credit entry posted per
  accepted Challan, only for customers whose "Issues Performa Invoice" flag is No.
- **Staff User**: An authenticated internal user who manages Challan records. This feature
  introduces no distinct roles/permission levels, consistent with every prior feature in this
  project.

## Assumptions

- A Challan always references lines from exactly one customer PO — combining lines from multiple
  POs onto a single Challan is not supported, matching the master spec's framing of "one PO may be
  delivered across several Challans" (the reverse relationship is not described and isn't needed
  at this business's scale).
- A Challan's lifecycle has three states: "Issued" (just created and printable; lines editable),
  "Accepted" (finalized — PO-line, inventory, and ledger effects posted; fully read-only
  thereafter), and "Voided" (cancelled before ever being accepted; no effects were ever posted).
  This reflects the real-world sequence described in the master spec: the Challan is printed and
  sent out with goods first, and the signed copy — confirming what was actually accepted — comes
  back afterward, so "issue" and "accept" are necessarily separate steps in time, not one action.
- The printed Challan's QTY column shows each line's delivered quantity — the amount being sent
  out at print time — since the accepted quantity is only known once the signed copy returns,
  after the document has already been printed and sent.
- A PO line's "remaining quantity" (used to block over-delivery) is always computed from that PO
  line's currently stored Delivered figure, which itself only changes when a Challan referencing
  it is accepted (per 006's data model, where this figure is defined as the cumulative *accepted*
  total). Two Challans issued against the same line before either is accepted are each validated
  independently against that same stored figure at creation time — a deliberate simplification
  appropriate to this business's low transaction volume and manual, one-at-a-time entry pattern,
  rather than a reservation/holds system.
- Uploading the scanned signed copy is a recommended but non-blocking step — it can happen before
  or after a Challan is accepted, or not at all, and never gates the accept action itself, mirroring
  006's treatment of PO attachments as optional evidence rather than a required gate.
- A Challan's own line pricing is not separately entered — the unit price used to compute the
  ledger credit on acceptance (FR-011) is always the corresponding PO line's own unit price, since
  a Challan documents delivery of what the PO already priced, not a new pricing event.
- Reversing or adjusting an already-accepted Challan (for example, a customer returning
  previously-accepted goods weeks later) is explicitly out of scope for this feature. The master
  spec anticipates such a mechanism for the future, but this feature only needs to get a Challan
  from creation through a correct first acceptance; later corrections belong to a future
  adjustment/reversal capability, consistent with how 002 and 006 handle post-lock corrections.
  This feature's only "undo" path is voiding a Challan that hasn't been accepted yet.
- A voided Challan's assigned number (if auto-generated) is never reused and its counter advance is
  never rolled back, consistent with this project's general pattern of not reclaiming identifiers
  from cancelled/voided records (e.g. 006's cancelled PO numbers).
- Only active, non-cancelled customer POs can receive newly issued Challans; a PO that becomes
  cancelled after a Challan against it was already issued (but not yet accepted) blocks that
  Challan's acceptance until the PO is reactivated, since accepting would otherwise post effects
  against a PO the business has declared void.
- This feature introduces the `Inventory Movement` record type described in Key Entities as new,
  shared, and insert-only, and makes it the single source of truth for every product's
  quantity-on-hand from this point forward — not scoped to Challans alone. This corrects course
  from the master roadmap's original assumption that this record type would already exist by this
  point (it was planned for, but not actually built, by 003b-traded-goods-purchasing); this
  feature is its real first table-owner.
- Resolving the conflict this creates with 003b's existing behavior — where a product's
  quantity-on-hand is fully overwritten from the sum of its purchase quantities every time any
  unit-mode purchase for that product is created, edited, or deleted — is explicitly this
  feature's responsibility, not deferred. Left alone, that overwrite would silently discard any
  Challan-driven stock decrement the next time an unrelated purchase for the same product was
  edited. This feature resolves it once and for all (FR-011) by backfilling each existing traded
  product's current quantity-on-hand as one opening Inventory Movement, and by having 003b's
  purchase-recompute logic write/adjust its own Inventory Movement per purchase event instead of
  writing the quantity-on-hand column directly — a change made via a new migration in this
  feature (redefining the existing Postgres function), not by editing 003b's already-applied
  migration file. After this feature ships, purchases and Challans both affect stock only by
  writing Inventory Movements; quantity-on-hand itself is never written to directly by anything,
  anywhere, again.
- A future Production Batches feature follows the same pattern already established here: it writes
  its own Inventory Movements rather than touching quantity-on-hand directly.
- Currency, rounding, and authentication conventions are unchanged from prior features (PKR,
  2-decimal rounding, Supabase Auth session required).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can create and print a typical Challan (3-5 lines) in under 3
  minutes.
- **SC-002**: 100% of accepted Challan lines' accepted quantities are reflected in their PO
  line's Delivered figure with zero discrepancy.
- **SC-003**: 100% of shortfall lines (accepted less than delivered) have an explicit disposition
  recorded before the Challan reaches "Accepted" status — zero Challans are ever accepted with an
  unresolved shortfall.
- **SC-004**: 100% of accepted Challans for customers flagged "Issues Performa Invoice" = No
  produce exactly one ledger credit entry each; 0% of accepted Challans for customers flagged
  "Issues Performa Invoice" = Yes produce any ledger entry.
- **SC-005**: Every printed Challan carries the correct trade name letterhead, signature, and
  stamp images with zero manual copy-paste, 100% of the time.
- **SC-006**: Zero loss of historical Challan data — voiding a Challan never removes its record,
  lines, or attachments.
- **SC-007**: Every product's quantity-on-hand always equals the sum of its recorded Inventory
  Movements, with zero discrepancy, both immediately after this feature's cutover backfill and
  after any subsequent mix of purchase and Challan activity.
