# Feature Specification: Performa Invoicing

**Feature Branch**: `008-performa-invoicing`
**Created**: 2026-09-22
**Status**: Draft
**Input**: User description: "Performa Invoicing: generate and post Performa Invoices for customers flagged Issues Performa Invoice (currently Habbitt only), against delivered-but-not-yet-invoiced quantities on customer PO lines, posting the corresponding ledger credit. Invoice lines reference customer PO lines directly (not Challan lines), snapshotting product/UOM/unit price at creation time. An invoice may combine delivered-but-uninvoiced quantity from more than one customer PO of the same customer. Creating an invoice is a single, immediate action: it advances the trade name's plain sequential invoice-number counter, increases each referenced PO line's Invoiced figure, computes gross/tax(18% default, header-level)/net totals, posts one ledger credit for the net total, and produces a printed document with amount in words — all atomically, with no separate confirmation step. This feature must never act for customers not flagged Issues Performa Invoice = Yes (their ledger credit already posted at Challan acceptance, 007). The formal GST Sales Tax Invoice is prepared externally by the accountant and is only stored here as an attached reference file — this feature never generates, calculates, or replicates it. Post-invoice reversal/adjustment is out of scope."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
-->

### User Story 1 - Generate and post a Performa Invoice against a single PO (Priority: P1)

An internal staff member picks a customer flagged "Issues Performa Invoice," selects one of that
customer's non-cancelled purchase orders, chooses one or more of its line items that still have
quantity delivered but not yet invoiced, enters the quantity being invoiced on each (defaulting to
the full remaining invoiceable amount), sets a tax rate (defaulting to 18%), chooses the trade name
to issue under, and generates the Performa Invoice — which immediately computes gross, tax, and net
totals, posts a ledger credit for the net total, updates each line's invoiced figure, and produces
a printed document (letterhead, invoice number and date, customer name, referenced PO number, line
table, totals, and the net total in words) ready to send to the customer.

**Why this priority**: This is the foundational capability and the entire reason the feature
exists — Habbitt's receivable only arises through this action, since no ledger credit was posted
for them at Challan acceptance (007). Nothing else in this feature has value without it.

**Independent Test**: Can be fully tested by taking a customer flagged "Issues Performa Invoice,"
an open PO of theirs with at least one line that has delivered quantity not yet invoiced, creating
an invoice against that line for an amount within the remaining invoiceable quantity, and
confirming: the invoice saves with an auto-generated, trade-name-scoped number; its gross/tax/net
totals are arithmetically correct; the referenced PO line's invoiced figure increases by the
invoiced amount; exactly one ledger credit entry equal to the net total appears for that customer;
and the printed/exportable view shows the correct letterhead, line table, totals, and amount in
words.

**Acceptance Scenarios**:

1. **Given** a customer flagged "Issues Performa Invoice" = Yes with an open PO whose line has
   delivered quantity greater than its currently invoiced quantity, **When** the staff member
   creates an invoice referencing that line with an invoiced quantity within the remaining
   invoiceable amount and selects a trade name, **Then** the invoice is saved with an
   auto-generated, trade-name-scoped sequential number, correct gross/tax/net totals, and that PO
   line's invoiced figure increases by the invoiced quantity.
2. **Given** an invoice has been saved, **When** the staff member opens its printed/exportable
   view, **Then** it shows the chosen trade name's printed name, address, signature, and stamp
   images, the invoice number and date, the customer's legal/billing name, the referenced PO
   number, a line table (item, UOM, quantity invoiced, unit price, line total) per line, the gross
   total, the tax rate and amount, the net total, and the net total expressed in words — with no
   manual copy-paste or manual calculation required.
3. **Given** the staff member is creating an invoice, **When** they accept the system's
   auto-generated invoice number without changes, **Then** it is used as a plain sequential value
   (no date suffix) and the trade name's next-invoice-number counter advances; **When** they
   instead type their own number, **Then** that value is stored and validated for uniqueness
   within that trade name instead.
4. **Given** the staff member is on the "Create Performa Invoice" form, **When** they submit
   without a customer, a trade name, or at least one line with a positive invoiced quantity,
   **Then** the system rejects the submission with a clear validation error.
5. **Given** a customer not flagged "Issues Performa Invoice" (flag = No), **When** the staff
   member attempts to create an invoice for that customer, **Then** the system rejects the action
   — that customer's receivable already posted at Challan acceptance and must never be posted
   again here.
6. **Given** a PO line whose delivered quantity is already fully invoiced, **When** the staff
   member tries to select that line for a new invoice, **Then** the system excludes or rejects it.
7. **Given** a PO line with some delivered quantity still not invoiced, **When** the staff member
   enters an invoiced quantity on an invoice line that exceeds that remaining amount, **Then** the
   system rejects the submission with a clear error stating the remaining invoiceable quantity.
8. **Given** an invoice has been created, **When** the staff member or anyone else views it,
   **Then** it displays as fully read-only — no header field, line, or total can be changed through
   this feature.

---

### User Story 2 - Combine multiple POs of the same customer onto one invoice (Priority: P2)

An internal staff member preparing a Performa Invoice for a customer who has more than one PO with
delivered-but-uninvoiced quantity selects lines from more than one of that customer's POs onto the
same invoice, producing a single document and a single ledger credit that together cover all of
them.

**Why this priority**: This reflects a real, recurring billing pattern (one invoice settling
several POs at once) but is a natural extension of User Story 1 rather than a separate mechanism —
it depends on the single-PO flow already working correctly.

**Independent Test**: Can be fully tested by taking one customer with two open POs, each having at
least one line with delivered-but-uninvoiced quantity, creating a single invoice that includes a
line from each PO, and confirming: both PO lines' invoiced figures increase correctly, the printed
document lists both PO numbers and lines correctly attributed to each, the gross/tax/net totals
correctly sum across both, and exactly one ledger credit entry (not two) is posted for the combined
net total.

**Acceptance Scenarios**:

1. **Given** a customer with two non-cancelled POs, each having at least one line with delivered
   quantity not yet invoiced, **When** the staff member creates one invoice including a line from
   each PO, **Then** the invoice saves successfully, both referenced PO lines' invoiced figures
   increase correctly, and the invoice's totals reflect the sum across both POs' included lines.
2. **Given** such a combined invoice has been created, **When** the staff member views its
   printed/exportable form, **Then** each line clearly shows which PO it came from, and the
   invoice's PO reference is presented as the set of all POs actually included — never limited to
   just one.
3. **Given** an invoice combining lines from multiple POs, **When** it is created, **Then** exactly
   one ledger credit entry is posted for the customer, equal to the invoice's single combined net
   total — never one entry per included PO.
4. **Given** a staff member attempts to include, on the same invoice, a line belonging to a PO of a
   *different* customer than the invoice's own customer, **When** they submit, **Then** the system
   rejects the submission — an invoice's lines must all belong to POs of that one invoice's
   customer.

---

### User Story 3 - Attach the externally-prepared GST Sales Tax Invoice (Priority: P3)

Once the accountant has separately prepared the formal GST Sales Tax Invoice corresponding to a
Performa Invoice already created in the system, an internal staff member uploads that PDF and
attaches it to the Performa Invoice record for safekeeping and future reference.

**Why this priority**: Useful for record-keeping and audit trail, but strictly optional — the
Performa Invoice is already complete, printed, and posted to the ledger without it, and this
system never generates or depends on the GST invoice's content.

**Independent Test**: Can be fully tested by taking an already-created Performa Invoice, uploading
a PDF file to it, and confirming it is stored and retrievable from the invoice's detail view,
without altering any of the invoice's own totals, lines, or ledger effect.

**Acceptance Scenarios**:

1. **Given** an existing Performa Invoice, **When** the staff member uploads a GST Sales Tax
   Invoice PDF to it, **Then** the file is stored against that invoice and retrievable from its
   detail view.
2. **Given** a Performa Invoice with no GST invoice attached yet, **When** the staff member views
   or prints it, **Then** the invoice functions and displays normally — this attachment is never
   required to exist.
3. **Given** an attached GST invoice file, **When** the staff member views the Performa Invoice's
   totals or the customer ledger, **Then** nothing about them is derived from or affected by the
   attached file's content — it is reference-only.

---

### Edge Cases

- What happens when a staff member tries to create an invoice for a customer whose "Issues Performa
  Invoice" flag is No? Rejected (User Story 1, Acceptance Scenario 5) — that customer's ledger
  credit already posted at Challan acceptance.
- What happens when a staff member tries to select a PO line that has no delivered quantity at all
  (nothing has been accepted against it yet)? Excluded from selection — its remaining invoiceable
  quantity is zero, same as a fully-invoiced line.
- What happens when two invoices are created against the same PO line's remaining invoiceable
  quantity in quick succession? Each is validated against that line's currently recorded
  Delivered-minus-Invoiced figure at the moment it is created; the invoiced figure updates
  immediately upon each invoice's creation (no separate confirmation delay), so the second attempt
  sees the reduced remainder and is rejected if it would exceed it.
- What happens when a staff member types an invoice number that duplicates an existing one under
  the same trade name? Rejected with a clear duplicate error; the same number is allowed to recur
  across different trade names, since each trade name has its own sequence.
- What happens when the referenced PO is cancelled after some of its lines have already been
  invoiced? Cannot occur — a PO cannot be cancelled while any of its lines carries invoiced (or
  delivered) quantity, per the existing cancellation rule (006).
- What happens if a staff member tries to create an invoice with zero lines, or with every line's
  invoiced quantity at zero? Rejected — an invoice requires at least one line with a positive
  invoiced quantity.
- What happens to an invoice's tax amount if the tax rate is changed on the form before the invoice
  is created? The gross, tax, and net totals recompute live from whatever rate is currently set;
  once created, the invoice's stored rate and totals are permanently fixed.
- What happens when a customer has delivered-but-uninvoiced quantity on a PO, but that customer is
  not flagged "Issues Performa Invoice"? That quantity is simply never invoiced through this
  feature — it has no bearing on this feature at all, since that customer's receivable already
  arose at Challan acceptance.
- What happens if a return or shortfall is discovered on goods after they have already been
  invoiced? Out of scope for this feature — no reversal or adjustment path exists here (see
  Assumptions); it is left to a future capability.
- What happens when a staff member tries to edit or delete an already-created invoice? Rejected —
  an invoice is permanently read-only and unremovable through this feature once created.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated staff member to create a Performa Invoice only
  for a customer flagged "Issues Performa Invoice" = Yes, and MUST reject any attempt to create one
  for a customer flagged No.
- **FR-002**: System MUST allow a Performa Invoice's lines to be drawn from one or more of the
  invoice's customer's non-cancelled purchase orders, and MUST reject any line drawn from a
  purchase order belonging to a different customer than the invoice's own customer.
- **FR-003**: System MUST reject an invoice line whose requested invoiced quantity is zero,
  negative, or exceeds that referenced PO line's remaining invoiceable quantity (its currently
  recorded Delivered figure minus its currently recorded Invoiced figure).
- **FR-004**: System MUST auto-generate an invoice number as a plain sequential value (no date
  suffix), scoped per trade name using that trade name's next-invoice-number counter, advancing the
  counter when the auto-generated value is used, and MUST allow staff to override it with their own
  value, validated for uniqueness within that trade name.
- **FR-005**: System MUST record, at the invoice header level, a single tax rate (defaulting to
  18%, staff-overridable per invoice) and MUST compute: a gross total as the sum of all included
  lines' quantity multiplied by unit price; a tax amount as the gross total multiplied by the
  invoice's tax rate; and a net total as the gross total plus the tax amount.
- **FR-006**: System MUST produce a printed/exportable Performa Invoice document showing: the
  chosen trade name's printed name, address, and signature/stamp images auto-inserted with no
  manual copy-paste; the invoice number and date; the customer's legal/billing name; every included
  purchase order's number; a line table (item, UOM, quantity invoiced, unit price, line total) per
  line, each attributable to its source PO when an invoice spans more than one; the gross total,
  tax rate and amount, and net total; and the net total expressed in words.
- **FR-007**: Upon creating a Performa Invoice, System MUST, within that same action: add each
  included line's invoiced quantity to its corresponding PO line's cumulative Invoiced figure, and
  post exactly one ledger credit entry for the invoice's customer equal to the invoice's net total.
  There is no separate confirmation, issuing, or acceptance step — creating the invoice is itself
  the posting event.
- **FR-008**: System MUST NOT create a Performa Invoice, or post any ledger entry, for a customer
  flagged "Issues Performa Invoice" = No — for such customers the ledger credit already occurred at
  Challan acceptance (007), and this feature MUST NOT duplicate it.
- **FR-009**: System MUST make a created Performa Invoice fully read-only — no header field, line,
  or total may be changed through this feature once created.
- **FR-010**: System MUST NOT permanently delete Performa Invoice records or their lines through
  normal use.
- **FR-011**: System MUST allow zero or more externally-prepared GST Sales Tax Invoice PDF files to
  be attached to a Performa Invoice at any point after it is created, purely as reference evidence,
  and MUST NOT generate, calculate, or replicate the GST Sales Tax Invoice's own content.
- **FR-012**: System MUST display a list of Performa Invoices showing at minimum invoice number,
  date, customer, trade name, included PO number(s), and net total, filterable by customer and by
  trade name, and MUST allow a staff member to open a full detail view of any single invoice
  showing every header field, every line (with its source PO), the computed totals, and any
  attached GST invoice file(s).
- **FR-013**: System MUST require staff to be authenticated before viewing, creating, or attaching
  documents to any Performa Invoice record.
- **FR-014**: System MUST record and display when each Performa Invoice was created and by whom.
- **FR-015**: System MUST prevent a PO line's Invoiced figure from ever exceeding its Delivered
  figure, under any sequence of invoice creation, including when multiple invoices are created in
  close succession against the same line.

### Key Entities

- **Performa Invoice**: Represents one billing document issued to a customer flagged "Issues
  Performa Invoice." Attributes: customer (reference), trade name (reference), invoice number,
  invoice date, tax rate, gross total, tax amount, net total, created timestamp and staff user. Has
  one or more Invoice Lines and zero or more attached GST Sales Tax Invoice files. Always
  read-only from the moment it is created.
- **Invoice Line**: Attributes: invoice (reference), referenced PO line (reference — the PO it
  belongs to must match the invoice's own customer), invoiced quantity, unit price and UOM
  (snapshotted from the PO line at creation time), line total.
- **GST Invoice Attachment** (new): A stored external file linked to a Performa Invoice, uploaded
  after the fact, with no calculation or content ever derived from it by this feature.
- **Customer PO Line** (from 006; read and partially written by this feature): This feature reads
  a line's Delivered and currently recorded Invoiced figures to compute what remains invoiceable,
  and is the sole writer of that Invoiced figure's increases.
- **Customer PO** (from 006; read-only in this feature): Supplies the PO number(s) printed on an
  invoice and the customer each of its lines belongs to, for the same-customer validation.
- **Trade Name** (from 004; read and partially written by this feature): Supplies the printed name,
  address, signature image, and stamp image used on a printed invoice, and its next-invoice-number
  counter, which this feature advances when an auto-generated number is used.
- **Customer** (from 005; read-only in this feature): Supplies the "Issues Performa Invoice" flag
  that gates whether this feature may act for that customer at all, and the legal/billing name
  printed on an invoice.
- **Ledger Entry** (from 005; written by this feature): One credit entry posted per created
  invoice, equal to that invoice's net total, only for customers flagged "Issues Performa Invoice" =
  Yes.
- **Staff User**: An authenticated internal user who creates and views Performa Invoice records.
  This feature introduces no distinct roles/permission levels, consistent with every prior feature
  in this project.

## Assumptions

- An invoice's customer is singular even though its lines may span multiple POs — every PO included
  on one invoice must belong to that same one customer (User Story 2, Acceptance Scenario 4), since
  the ledger credit posts to exactly one customer's account. Combining multiple *customers* onto one
  invoice is not supported.
- Invoice numbering is a plain sequential value per trade name (e.g. "#18"), with no date/month
  suffix — unlike Challan numbering (007), which does append a month suffix. This matches the
  business's real-world example invoice number.
- Creating a Performa Invoice is a single, atomic, immediate action: there is no separate "issue"
  vs. "post" stage the way Challans have an issued→accepted lifecycle (007). Once created, an
  invoice already carries its ledger effect and is permanently read-only.
- The invoice's tax rate is one value per invoice header, applied to the invoice's summed gross
  total, not an independent rate per line — matching the real-world printed layout of one gross
  line, one tax line, and one net total line, and defaulting to 18%.
- A Performa Invoice's ledger credit equals its net total (gross plus tax) — this is the customer's
  real receivable. This differs from a Challan-driven credit for non-Performa-Invoice customers,
  which has no tax component since no invoice exists in that path (007).
- Reversing or adjusting an already-created Performa Invoice — for example when a shortfall or
  return is discovered on goods that were already invoiced — is explicitly out of scope for this
  feature. This feature only needs to get an invoice from creation through correct posting; later
  corrections belong to a future adjustment/reversal capability, consistent with how 007 scopes out
  post-acceptance reversal for Challans.
- Because a PO line becomes "locked" once its Invoiced figure is greater than zero (an existing rule
  from 006), creating a Performa Invoice against a line has the side effect of preventing that PO
  line's price, product, quantity, or UOM from ever being edited again, and prevents its PO from
  being cancelled while any of its lines carries invoiced quantity — both already enforced by 006,
  not something this feature needs to separately implement.
- Attaching the external GST Sales Tax Invoice PDF is optional and non-blocking, mirroring how
  Challan signed-copy uploads (007) and PO attachments (006) are treated elsewhere in this project —
  it never gates and is never required for invoice creation.
- A customer's "Issues Performa Invoice" flag is assumed stable once Performa Invoicing is in use
  for them. This feature does not define behavior for what happens to already-accepted-but-
  uninvoiced Challan quantity if that flag is changed after go-live — that scenario is out of scope.
- Currency, rounding, and authentication conventions are unchanged from prior features (PKR,
  2-decimal rounding, Supabase Auth session required).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can generate and print a typical Performa Invoice (1-5 lines, one PO)
  in under 3 minutes.
- **SC-002**: 100% of created Performa Invoices produce exactly one ledger credit entry for their
  customer, equal to the invoice's net total, with zero discrepancy.
- **SC-003**: 0% of Performa Invoices are ever created for a customer not flagged "Issues Performa
  Invoice" = Yes.
- **SC-004**: 100% of invoiced line quantities are reflected in their PO line's Invoiced figure
  immediately upon invoice creation, with zero discrepancy, and that figure never exceeds the
  line's Delivered figure.
- **SC-005**: Every printed Performa Invoice carries the correct trade name letterhead, signature,
  and stamp images, correct gross/tax/net totals, and the net total in words, with zero manual
  copy-paste or manual calculation, 100% of the time.
- **SC-006**: Zero loss of historical invoice data — no created Performa Invoice or its lines can be
  deleted through normal use.
- **SC-007**: A single Performa Invoice can successfully combine delivered-but-uninvoiced quantity
  from more than one customer PO of the same customer, with correct per-PO traceability preserved
  in the printed document and exactly one combined ledger credit posted.
