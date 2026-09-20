# Feature Specification: Customer Purchase Orders

**Feature Branch**: `006-customer-purchase-orders`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Capture incoming customer POs — PO number, order date, line items with quantities and agreed price per line, resolved via 005's customer_product_mappings to a product using the customer's own item code, pre-filling price from default_price when available but always storing the PO's own entered price as authoritative. Different customers submit POs differently: Habbitt sends a PDF PO document; Chaseup issues POs through their own Oracle iSupplier portal with long portal-style PO numbers (e.g. '111202110000440639') and descriptions embedding both PO and Challan numbers (e.g. 'M ZAYAN IMPEX (FAROOQ SONS) 01 SEP 2026 Challan 54 PO 440639'). No integration with Chaseup's portal is needed — staff manually enter what's on the PO once received, but the PO number field must accommodate long portal-style numbers as well as simpler PDF-based ones like Habbitt's 'P14337'. This feature only captures/records the PO — it does not generate challans, invoices, or post to the ledger (those are 007/008/009)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record and view a customer PO (Priority: P1)

An internal staff member enters a customer purchase order as received — its PO number, the
customer it's from, the order date, and one or more line items (the customer's own item code
where available, quantity, unit of measure, and the price actually agreed for that line) — and can
immediately see it in a list of POs and open it to review everything entered, including which
product each line resolved to.

**Why this priority**: This is the foundational capability of the feature — nothing else (line
resolution, multi-channel intake, editing) matters until a PO can be captured and looked back up.
Every later feature (Challans, Invoicing, the Customer Ledger) references a PO or its lines, so
this is also the dependency root for 007/008/009.

**Independent Test**: Can be fully tested by recording one PO with at least two line items against
an existing customer that has at least one customer-product mapping (005) and one product with no
mapping, confirming the mapped line auto-resolves to its product while the unmapped line requires
(and accepts) a manual product pick, and that the saved PO appears in the list and its detail view
shows every field entered plus each line's resolved product and total.

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Customer PO" form with an existing customer selected,
   **When** they enter a PO number, order date, and at least one line item with quantity, unit of
   measure, and price, and submit, **Then** the PO is saved with status "Open" and appears in the
   PO list.
2. **Given** a customer has an existing customer-product mapping (005) with a default price for a
   given item code, **When** the staff member enters that item code on a PO line for that
   customer, **Then** the system resolves the line to the mapped product, pre-fills its unit of
   measure and price from the mapping, and the staff member can accept or override the pre-filled
   price — whatever price is on the line when saved is what's stored, regardless of the mapping's
   default.
3. **Given** the staff member enters an item code for which that customer has no existing mapping,
   **When** they continue, **Then** the system prompts them to pick the product manually and still
   allows the PO to be saved once a product is chosen — an unmapped code never blocks PO entry.
4. **Given** a PO has been saved, **When** the staff member opens its detail view, **Then** all
   header fields (customer, PO number, order date, and any optional fields entered) and every line
   item (entered item code, description, quantity, unit of measure, price, line total, and
   resolved product) are displayed accurately, along with the PO's total value as the sum of its
   line totals.
5. **Given** the staff member is on the "Add Customer PO" form, **When** they submit without a
   customer, PO number, order date, or at least one complete line item, **Then** the system
   rejects the submission and shows a clear validation error identifying what's missing.
6. **Given** a customer already has a PO recorded with a given PO number, **When** the staff member
   tries to save another PO for that *same* customer with the *same* PO number, **Then** the
   system rejects it with a clear duplicate error — the same PO number is allowed to recur across
   *different* customers (each customer numbers its own POs independently).

---

### User Story 2 - Accommodate how each customer actually submits a PO (Priority: P2)

An internal staff member enters a PO the way it actually arrives: for Habbitt, a short PO number
like "P14337" read off a PDF document that they also attach to the record; for Chaseup, a long
Oracle iSupplier portal-style PO number like "111202110000440639" with no PDF at all, typed in
along with whatever line description the portal shows (which may itself mention a Challan number,
e.g. "M ZAYAN IMPEX (FAROOQ SONS) 01 SEP 2026 Challan 54 PO 440639") — captured as-is, since the
system does not talk to Chaseup's portal.

**Why this priority**: Without this, the system would only work for one of the business's two
real intake patterns. It's P2 rather than bundled into P1 because a single-channel version of PO
capture (User Story 1) is already independently useful and testable before this flexibility is
verified.

**Independent Test**: Can be fully tested by recording one PO with a long, all-numeric portal-style
number and no attachment, and a second PO with a short alphanumeric number and a PDF attached,
confirming both save without any format rejection or truncation, and both display their PO number
and line description exactly as entered.

**Acceptance Scenarios**:

1. **Given** the staff member is entering a Chaseup-style PO, **When** they type a PO number that
   is a long string of digits (18+ characters) and a line description containing embedded PO and
   Challan references, **Then** the system accepts and stores both verbatim, with no length limit
   or format pattern rejecting them, and performs no parsing or interpretation of the embedded
   Challan reference.
2. **Given** the staff member is entering a Habbitt-style PO, **When** they type a short PO number
   like "P14337" and attach the received PDF document, **Then** the system accepts the PO number
   and stores the attached file against the PO record, retrievable from its detail view.
3. **Given** any PO being entered, **When** the staff member has no document to attach (e.g. a
   portal-based PO with no PDF), **Then** the system still allows the PO to be saved — an
   attachment is never required regardless of which customer or intake channel it came from.

---

### User Story 3 - Correct or cancel a recorded PO (Priority: P3)

An internal staff member fixes a data-entry mistake on a PO that hasn't been acted on yet (wrong
quantity, wrong price, wrong item code resolution), or cancels a PO outright if the customer
withdraws it before any delivery has been recorded against it.

**Why this priority**: Keeps PO records accurate, matching how other records in this system
(Suppliers, Trade Names, Customers) support edits, but a newly launched PO intake is already
useful before any record needs correcting — this rounds it out rather than blocking it.

**Independent Test**: Take an existing PO with no delivered or invoiced activity, edit a line's
quantity and price and confirm the change persists and the PO's total recalculates; separately,
cancel a PO and confirm it's excluded from the default (open) PO list but remains viewable and its
data intact.

**Acceptance Scenarios**:

1. **Given** an existing PO none of whose lines have any delivered or invoiced quantity recorded
   against them, **When** the staff member edits a header field or a line's quantity, unit of
   measure, price, or item-code/product resolution, and saves, **Then** the updated values persist
   and the PO's total recalculates from the updated lines.
2. **Given** an open PO, **When** the staff member cancels it, **Then** its status changes to
   "Cancelled", it's excluded from the default (open) PO list, and its record — header and all
   line items — is preserved and viewable via an explicit "show cancelled" filter.
3. **Given** a PO that already has delivered or invoiced quantity recorded against one or more
   lines (once 007/008 exist), **When** the staff member attempts to edit those lines' quantity or
   price, or to cancel the PO, **Then** the system rejects the action — a PO with delivery or
   invoicing activity against it is corrected only through 007/008's own adjustment mechanisms, not
   by editing or cancelling it here.

---

### Edge Cases

- What happens when the same PO number is entered for two different customers? Allowed — PO
  number uniqueness is scoped per customer, since each customer numbers its own POs independently
  (User Story 1, Acceptance Scenario 6).
- What happens when a line's item code doesn't match any existing customer-product mapping? The
  staff member manually selects the product for that line; the PO still saves (User Story 1,
  Acceptance Scenario 3). The system does not require or auto-create a mapping as a side effect.
- What happens when a PO line has no customer item code at all (the customer's document doesn't
  show one)? Allowed — the staff member selects the product directly for that line.
- What happens when a staff member enters a zero or negative quantity or price on a line? Rejected
  with a validation error — both must be positive.
- What happens to a PO's total if a line is added, edited, or removed? The total is always
  recomputed as the sum of current line totals — never a value staff can type or override
  directly.
- What happens when a staff member tries to cancel a PO that's already cancelled, or edit fields
  that aren't locked by delivery/invoicing activity on an otherwise-locked PO? Header fields not
  tied to delivery/invoicing (e.g. purchaser name, requested delivery date) remain editable even
  once some lines are locked; cancelling an already-cancelled PO is a no-op with the current status
  shown, not an error.
- What happens to a PO's line items and attachments if the PO is cancelled? Both are preserved
  untouched — cancellation never removes or hides historical data from the record itself, only
  from default list views.
- What happens when a customer's own item code on a PO line resolves (via mapping) to a product
  that's since been deactivated? The resolution still succeeds and the line is saved — product
  status doesn't block PO capture; that products stay orderable historically is intentional.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a customer PO
  record with: an existing active customer, a PO number, an order date, and one or more line
  items as required fields, plus a purchaser name, a requested delivery date, a destination/ship-to
  reference, a trade name this PO bills under, and one or more attached documents as optional
  fields.
- **FR-002**: System MUST require customer, PO number, order date, and at least one complete line
  item (item code and/or product, quantity, unit of measure, price) before a PO can be saved.
- **FR-003**: System MUST provide a PO number field with storage capacity of at least 30
  characters and MUST impose no minimum length and no required format or pattern on the value
  entered — so both short PDF-style numbers (e.g. Habbitt's "P14337", 6 characters) and long
  all-numeric portal-style numbers (e.g. Chaseup's "111202110000440639", 18 characters) are
  accepted as-is, without truncation, padding, or rejection for being "too short" or "too long"
  (up to that 30-character capacity).
- **FR-004**: System MUST enforce that a PO number is unique per customer (the same customer
  cannot have two PO records with the same PO number) while allowing the same PO number string to
  recur across different customers without conflict.
- **FR-005**: For each PO line, System MUST accept a customer-specific item code (optional) and,
  when that code matches an existing 005 customer-product mapping for the selected customer,
  automatically resolve the line to that mapping's product and pre-fill the line's unit of measure
  and price from the mapping's selling unit and default price.
- **FR-006**: System MUST always store and treat the price actually entered on a PO line as
  authoritative, whether or not it matches, was overridden from, or was entered with no mapping
  default available — the mapping's default price is a pre-fill convenience only, never re-applied
  or re-validated against after the line is saved.
- **FR-007**: When a line's item code does not match any existing mapping for that customer, or no
  item code is entered, System MUST require the staff member to manually select the product for
  that line and MUST still allow the PO to be saved once a product is selected — an unresolved
  mapping never blocks PO capture.
- **FR-008**: System MUST allow a free-text description per PO line, stored and displayed exactly
  as entered, to capture descriptions from customer systems that embed other references (e.g.
  Chaseup's portal descriptions embedding a Challan number) without the system parsing or
  interpreting that embedded text.
- **FR-009**: System MUST allow zero or more file attachments (e.g. a PDF of the customer's PO
  document) per PO, and MUST NOT require an attachment to save a PO, since not every intake
  channel produces one (e.g. Chaseup's portal-based POs).
- **FR-010**: System MUST reject a PO line with a zero or negative quantity, or a zero or negative
  price.
- **FR-011**: System MUST compute each PO line's total as quantity × price, and the PO's overall
  total as the sum of its line totals — both always computed, never independently typed or
  overridden.
- **FR-012**: System MUST display a list of PO records showing at minimum customer, PO number,
  order date, and total value, defaulting to open (non-cancelled) POs with an explicit option to
  include or switch to cancelled ones, and MUST support filtering the list by customer.
- **FR-013**: System MUST allow a staff member to open a full detail view of any single PO,
  showing every header field, every line item (including its resolved product and computed
  total), and any attached documents.
- **FR-014**: System MUST allow a staff member to edit any field of an existing PO — header or line
  — at any time, except that once a line has a nonzero delivered or invoiced quantity recorded
  against it (written only by 007-Challans and 008-Performa-Invoicing respectively, never by this
  feature), that line's quantity, unit of measure, price, and product resolution become locked to
  further edits through this feature.
- **FR-015**: System MUST allow a staff member to cancel an open PO and to reactivate a previously
  cancelled one, without deleting the underlying record or any of its line items or attachments,
  EXCEPT that a PO with any line carrying nonzero delivered or invoiced quantity MUST NOT be
  cancellable through this feature.
- **FR-016**: System MUST NOT permanently delete PO records, their line items, or their attachments
  through normal use.
- **FR-017**: System MUST introduce, on each PO line, a delivered-quantity and an invoiced-quantity
  value that default to zero and are read-only through this feature's own screens — reserved for
  007-Challans and 008-Performa-Invoicing respectively to update as those features ship. Per
  `specs/PRODUCT-OVERVIEW.md`'s Challans section, the delivered-quantity value 007 writes here
  represents cumulative *accepted* quantity across that PO line's Challans, not raw quantity
  shipped — the delivered-vs-accepted distinction and short-receipt/rejection handling
  (return-to-inventory vs. write-off) are Challan-line-level concepts entirely owned by 007 and
  are explicitly out of scope for this feature (see Assumptions).
- **FR-018**: System MUST require staff to be authenticated before viewing, creating, editing,
  cancelling, or attaching documents to any PO record.
- **FR-019**: System MUST record and display when each PO record was created and last updated.

### Key Entities

- **Customer Purchase Order (PO)**: Represents one incoming order from a customer. Attributes:
  customer (reference), PO number, order date, purchaser name (optional), requested delivery date
  (optional), destination/ship-to reference (optional — defaults to the customer's billing address
  per 005 when no distinct ship-to is chosen), trade name this PO bills under (optional hint,
  pre-filled from the customer's usable-trade-name default when unambiguous per 005's FR-008, but
  changeable up through Challan/Invoice issuance), status (open/cancelled), computed total value
  (sum of line totals), created/updated timestamps. Has one or more PO Line Items and zero or more
  attached documents.
- **PO Line Item**: Attributes: PO (reference), customer item code as entered (optional), resolved
  product (reference — required to save the line, whether auto-resolved via mapping or manually
  picked), free-text description as entered (optional, stored verbatim), quantity ordered
  (required, positive), unit of measure (required), unit price (required, positive, always
  authoritative regardless of any mapping default), computed line total (quantity × price),
  quantity delivered (defaults 0; written only by 007-Challans as the cumulative *accepted*
  quantity across that line's Challans — see Assumptions), quantity invoiced (defaults 0; written
  only by 008-Performa-Invoicing).
- **Customer-Product Mapping** (from 005; read-only in this feature): Consulted by item code to
  auto-resolve a PO line's product and to suggest a pre-fill unit of measure and price. Never
  created, edited, or removed by this feature.
- **Staff User**: An authenticated internal user who manages PO records. This feature introduces no
  distinct roles/permission levels, consistent with 001/002/003/003b/004/005.

## Assumptions

- Only active customers (005) can have new POs recorded against them; a PO already recorded
  against a customer who's since been deactivated remains fully viewable.
- No PO-level tax field is captured by this feature. Per `specs/PRODUCT-OVERVIEW.md`, the GST
  Sales Tax Invoice is prepared externally by the accountant and only stored as an attachment in a
  later feature — a PO's total here is simply the sum of its line totals (gross), with no separate
  tax computation owned by this feature.
- A PO's "payment status" (whether/how much of it has been paid) is a 009-Customer-Ledger concern,
  derived from ledger entries that don't exist until 007/008 post them — it is not a field stored
  on the PO itself in this feature.
- "Purchaser" is captured as a free-text name, not linked to a structured 005 Contact record,
  since the source documents (a PDF or a portal export) typically show it as plain text rather
  than a system-matched contact.
- Short-receipt and rejection handling is entirely out of scope for this feature and belongs to
  007-Challans. Per `specs/PRODUCT-OVERVIEW.md`'s Challans section, "delivered ≠ accepted": each
  Challan line separately records a quantity delivered and a quantity accepted (defaulting equal,
  edited down if the signed challan comes back short), and rejected goods are explicitly recorded
  as "return to inventory" or "write off" — never assumed. Only the *accepted* quantity rolls up
  into the PO line's delivered-quantity value this feature introduces (FR-017); this feature
  itself has no concept of a delivered-vs-accepted split, short receipts, rejections, returns, or
  write-offs on a PO line — it only ever sees the single rolled-up accepted total once 007 starts
  writing it.
- Delivered-quantity and invoiced-quantity columns are introduced on the PO line by this feature
  (so 007 and 008 have a place to write to when they ship) following the same pattern
  `specs/PRODUCT-OVERVIEW.md` already uses for `ledger_entries` in 005 — introduced by the feature
  that defines the entity ahead of its later real writers. This feature is never a writer of
  nonzero values into either column.
- The "lock once delivered/invoiced activity exists" rule in FR-014/FR-015 has no observable effect
  until 007/008 ship (since this feature never sets those quantities above zero itself), but is
  specified now so the PO/line-item data model doesn't need a breaking change later — consistent
  with how 005 pre-declared `ledger_entries`' shape for writers that didn't exist yet.
- Destination/ship-to defaults to the customer's billing address (rather than requiring a distinct
  ship-to) when the customer has none recorded, mirroring 005's own edge-case default for
  ship-to/warehouse addresses.
- Duplicate PO numbers across different customers are permitted (not blocked), since each
  customer's numbering is independent and the (customer, PO number) pair is what must be unique
  (FR-004), consistent with this system's general pattern of not blocking incidental duplicates
  (e.g. 005's duplicate customer names).
- This feature is limited to capturing and correcting the PO record itself. Generating Challans,
  generating Performa Invoices, and posting any billing event to the customer ledger are explicitly
  out of scope here and belong to 007, 008, and 009 respectively — this feature performs no
  inventory or ledger writes of any kind.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can record a typical multi-line customer PO (5 line items) in under 5
  minutes.
- **SC-002**: 100% of real PO numbers from both known intake channels — Habbitt's short PDF-style
  numbers and Chaseup's long portal-style numbers (18+ digits) — are stored and displayed exactly
  as entered, with zero truncation or format-based rejection.
- **SC-003**: For any PO line whose item code already has a customer-product mapping (005), the
  product resolves automatically 100% of the time with no manual product lookup required by staff.
- **SC-004**: Zero loss of historical PO data — cancelling a PO never removes its record, line
  items, or attachments.
- **SC-005**: Every PO's displayed total matches the sum of its line totals with zero discrepancy,
  in 100% of POs, at all times.
