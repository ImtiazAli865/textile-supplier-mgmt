# Feature Specification: Customers

**Feature Branch**: `005-customers`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "Customer records: display name, legal/billing name and address, ship-to/warehouse address(es), NTN, Sales Tax Registration number, contact persons, usable trade names (non-enforcing hint), Issues Performa Invoice flag, payment terms, opening ledger balance. Also introduces the shared ledger_entries table (its first writer) and the customer-product mapping (customer-specific item codes and per-customer selling UOM, deferred from 003-product-catalog). Per business direction: at minimum Habbitt (legal entity Universal Retail (PVT) LTD, NTN A029996-8), Chaseup, ChaseValue, Kifayat must be representable; trade names must remain fully unconstrained per customer (default/hint only, never an enforced restriction); legal name (for tax documents) is distinct from display name (used day-to-day)."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and view customer records (Priority: P1)

An internal staff member adds a customer to the system with its display name, legal/billing name
and billing address, ship-to/warehouse address(es), tax identifiers, contact people, payment
terms, and — if there's a real opening balance carried over from the business's existing
spreadsheet ledger at go-live — that opening balance, and can immediately see the customer in a
list and open it to view full details.

**Why this priority**: This is the foundational capability — every later feature (Purchase
Orders, Challans, Performa Invoicing, the Customer Ledger) references a Customer record, so
nothing downstream can be built or tested until customers exist as real data. Capturing the
opening balance at creation time (rather than as a separate later step) is what lets each
customer's ledger start from the correct real-world balance instead of zero.

**Independent Test**: Can be fully tested by creating one customer record with its required
fields — including a nonzero opening balance for at least one test customer — and confirming it
appears in the customer list, its detail view shows everything entered, and its running ledger
balance reflects the opening balance entered (spec Acceptance Scenarios below).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Customer" form, **When** they fill in display name,
   legal/billing name, billing address, and payment terms, and submit, **Then** the customer is
   saved with status "active" and appears in the customer list.
2. **Given** a customer has been created, **When** the staff member opens its detail view,
   **Then** all entered fields (display name, legal name, billing address, ship-to addresses,
   NTN, Sales Tax Registration number, contacts, payment terms, usable trade names, "Issues
   Performa Invoice" flag, opening balance) are displayed accurately — for example, Habbitt's
   detail view shows display name "Habbitt" and legal name "Universal Retail (Pvt) Ltd" as two
   distinct fields, not one.
3. **Given** the staff member is on the "Add Customer" form, **When** they submit without a
   display name, legal name, or billing address, **Then** the system rejects the submission and
   shows a clear validation error identifying the missing field(s).
4. **Given** the staff member creates a customer with a nonzero opening balance and an as-of
   date, **When** the record is saved, **Then** the system records a corresponding ledger entry
   dated at that as-of date, and the customer's running balance reflects it immediately.
5. **Given** the staff member creates a customer with no opening balance entered (or an amount of
   zero), **When** the record is saved, **Then** no ledger entry is created and the customer's
   running balance starts at zero.

---

### User Story 2 - Map a customer's own item codes and selling units to products (Priority: P2)

An internal staff member records that a specific customer refers to a specific product by their
own item code and/or orders it in their own unit of measure (e.g. Habbitt's PO shows
`[3109000002] Ball Fiber` and orders in "yd", while the business stocks it by a different internal
unit), and, when that customer has a fixed, agreed rate for that product (e.g. Ball Fiber to
Habbitt is consistently Rs 2600 per unit on every PO unless renegotiated), records that as a
default price — so that a future feature can resolve that customer's own PO codes to the right
product without guesswork, and pre-fill a sensible starting price on a new PO instead of leaving
it blank.

**Why this priority**: This is the mapping 003-product-catalog explicitly deferred here (it
requires a Customer entity that didn't exist yet). It's needed before Customer Purchase Orders
(006) can be built, but a customer record is already useful without it (User Story 1 stands
alone), so it's the next priority rather than bundled into creation.

**Independent Test**: Can be fully tested by taking an existing customer and an existing product,
recording a customer-specific item code and/or selling unit for that pairing, and confirming it's
saved and retrievable independently of any PO ever being entered.

**Acceptance Scenarios**:

1. **Given** an existing customer and an existing product, **When** the staff member records a
   customer-specific item code and a selling unit for that pairing, **Then** the mapping is saved
   and shown when viewing either the customer or the product.
2. **Given** a mapping already exists for a customer/product pair, **When** the staff member
   edits its item code or selling unit, **Then** the updated values are saved.
3. **Given** two different customers, **When** each records their own, different item code for
   the *same* product, **Then** both mappings are saved independently and neither overwrites the
   other.
4. **Given** a customer already has a mapping for a product with a specific item code, **When**
   the staff member tries to map a *different* product to that same customer using the *same*
   item code, **Then** the system rejects it with a clear error — a customer's item code must
   resolve to exactly one product.
5. **Given** an existing customer-product mapping with a default price recorded, **When** the
   staff member views the mapping, **Then** the default price is shown alongside the item code and
   selling unit, clearly labeled as a pre-fill suggestion, not a binding price.

---

### User Story 3 - Edit and deactivate customer records (Priority: P3)

An internal staff member updates a customer's details as they change (new contact, corrected
address, updated payment terms) and marks a customer inactive if the business stops serving them,
without losing the historical record or ledger history.

**Why this priority**: Keeps customer records accurate over time, matching how Suppliers (001)
and Trade Names (004) already handle edits and deactivation, but a newly launched customer
directory is already useful before any record needs editing or retiring.

**Independent Test**: Take an existing customer record, edit one or more fields and confirm the
changes persist; separately, deactivate a customer and confirm it's excluded from the default
list but its record — including its ledger history and product mappings — is preserved and
viewable via the inactive filter, and can be reactivated.

**Acceptance Scenarios**:

1. **Given** an existing customer record, **When** the staff member edits any field (other than
   its opening balance, see Edge Cases) and saves, **Then** the updated values are persisted and
   immediately visible in the list and detail views.
2. **Given** an active customer, **When** the staff member deactivates it, **Then** its status
   changes to "inactive", it's excluded from the default (active) customer list, and its record —
   including ledger entries and product mappings — is preserved.
3. **Given** an inactive customer, **When** the staff member reactivates it, **Then** its status
   changes back to "active" and it reappears in the default list.

---

### Edge Cases

- What happens when a staff member enters a display name or legal name that matches an existing
  customer? System allows it (not blocked), consistent with how duplicate names are handled for
  Suppliers (001) and Trade Names (004).
- What happens when a customer has no NTN or no Sales Tax Registration number? Allowed — both are
  optional, since not every customer is Sales Tax registered.
- What happens when a customer has no ship-to/warehouse address recorded? Allowed — the billing
  address is used as the effective ship-to address until a distinct one is added.
- Can a previously entered opening balance be edited after the fact? No — once saved, the opening
  balance's ledger entry is never silently edited, the same audit-trail principle already applied
  to bounced-cheque reversals and posted invoices elsewhere in this system (see Assumptions). A
  genuine correction is made by recording a new, visible adjusting ledger entry, not by changing
  the original.
- What happens when the same product needs a different selling unit for two different customers?
  Allowed and expected — the mapping is per customer-product pair, not global (User Story 2,
  Acceptance Scenario 3).
- What happens if a staff member tries to deactivate a customer that is already inactive, or
  reactivate one already active? The action is a no-op with the current status shown; no error.
- What happens to a customer's existing product mappings or ledger history if the customer is
  deactivated? Both are preserved untouched — deactivation never removes or hides historical data
  from the record itself, only from default list views.
- What happens when a staff member selects "usable trade names" for a customer and then, on an
  actual document (a later feature), picks a different trade name entirely? Allowed without
  restriction — usable trade names is a display/sort default only, never an enforced rule (see
  Assumptions; this must not be re-litigated in a later feature's spec).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a customer
  record with: display name, legal/billing name, billing address, one or more contacts, and
  payment terms as required fields, plus ship-to/warehouse address(es), NTN number, Sales Tax
  Registration number, usable trade name(s), an "Issues Performa Invoice" flag, and an opening
  balance (amount + as-of date) as optional fields.
- **FR-002**: System MUST require display name, legal/billing name, billing address, and at least
  one contact (with a phone or email) before a customer record can be saved.
- **FR-003**: System MUST display a list of customer records showing at minimum display name and
  status, defaulting to active customers with an explicit option to include or switch to inactive
  ones.
- **FR-004**: System MUST allow a staff member to open a full detail view of any single customer
  record, showing every field entered, including its computed running ledger balance.
- **FR-005**: System MUST allow a staff member to edit any field of an existing customer record
  except its opening balance and its status (governed by FR-013 and FR-007 respectively).
- **FR-006**: System MUST allow a staff member to deactivate an active customer and to reactivate
  a previously deactivated one, without deleting the underlying record or any of its ledger
  entries or product mappings.
- **FR-007**: System MUST NOT permanently delete customer records, their ledger entries, or their
  product mappings through normal use.
- **FR-008**: System MUST treat a customer's "usable trade name(s)" as a non-enforcing
  default/sort hint only — it MUST NOT restrict which trade name may be selected for that
  customer on any current or future document, and no later feature may encode such a restriction.
- **FR-009**: System MUST allow a staff member to set an "Issues Performa Invoice" flag per
  customer (true for Habbitt; false for Chaseup, ChaseValue, Kifayat, and any customer by
  default), for later features to read when deciding how a customer's billing events post to
  their ledger.
- **FR-010**: System MUST capture a customer's payment terms as an expected range in days (a
  minimum and a maximum, both non-negative integers, minimum ≤ maximum), for later features
  (009-customer-ledger) to classify an actual payment as "within" or "beyond" the expected range
  for ageing/reporting purposes. This range MUST NOT be used to block, reject, or auto-flag an
  actual payment as wrong — actual payment dates are always recorded as they really happen,
  independent of this range.
- **FR-011**: System MUST allow a staff member to record an opening ledger balance (a signed
  amount and an as-of date) at the time a customer is created. If the amount is nonzero, the
  system MUST record a corresponding ledger entry dated at the as-of date; if the amount is zero
  or not provided, no ledger entry is created.
- **FR-012**: System MUST maintain each customer's ledger balance as a computed running total
  derived from its ledger entries — never a value staff can type or overwrite directly.
- **FR-013**: System MUST NOT allow a customer's opening balance to be edited or removed once
  saved. A correction requires a new, separately visible adjusting ledger entry, never a change to
  the original entry.
- **FR-014**: System MUST support recording, per customer, a mapping to any product that includes
  a customer-specific item code and/or a customer-specific selling unit of measure and/or a
  default/agreed price for that customer-product pair, independent of any mapping that customer or
  that product has to any other product or customer respectively. The default price is a pre-fill
  suggestion only — a purchase order in 006-customer-purchase-orders always carries and stores its
  own price field, which is authoritative and may be overridden by staff at any time when a
  customer renegotiates.
- **FR-015**: System MUST allow a staff member to add, edit, or remove a customer-product mapping
  at any time.
- **FR-016**: System MUST prevent a single customer from having two different products mapped to
  the same customer-specific item code — a given customer's item code must resolve to exactly one
  product.
- **FR-017**: System MUST support multiple contact persons per customer, each with a name and
  phone and/or email, and an optional role/title, mirroring 001-supplier-directory's contact
  shape.
- **FR-018**: System MUST support zero or more ship-to/warehouse addresses per customer, distinct
  from its billing address.
- **FR-019**: System MUST require staff to be authenticated before viewing, creating, editing,
  deactivating, or mapping products to any customer record.
- **FR-020**: System MUST record and display when each customer record was created and last
  updated.

### Key Entities

- **Customer**: Represents a business the company sells to. Attributes: display name,
  legal/billing name, billing address, ship-to/warehouse addresses (zero or more), NTN number
  (optional), Sales Tax Registration number (optional), usable trade name(s) (hint only, zero or
  more), "Issues Performa Invoice" flag, payment terms (an expected range: minimum and maximum
  days), status (active/inactive), created/updated timestamps. Has one or more Contacts, zero or
  more Customer-Product Mappings, and zero or more Ledger Entries.
- **Contact**: A person at a customer company. Attributes: name, phone (optional if email
  present), email (optional if phone present), role/title (optional). Belongs to exactly one
  Customer.
- **Customer-Product Mapping**: Links one Customer to one Product with that customer's own item
  code (optional), selling unit of measure (optional), a default/agreed price (optional — a
  pre-fill suggestion for a future PO, never authoritative over that PO's own entered price), and
  a conversion factor (defaulting to 1, relative to the product's stock unit) as a hedge in case a
  real unit conversion is ever needed. A given (customer, item code) pair must resolve to exactly
  one product.
- **Ledger Entry**: A single insert-only debit or credit posting to a customer's account —
  introduced by this feature to hold each customer's opening balance, and written to by later
  features (Challans, Performa Invoicing) as billing events occur. Attributes: customer, entry
  date, type (debit/credit), amount, a reference to whatever posted it, and a description. A
  customer's ledger balance is always the computed sum of its entries, never stored or edited
  directly. This feature only writes the opening-balance entry; presentation (a full ledger view,
  ageing, payments) belongs to a later feature.
- **Staff User**: An authenticated internal user who manages customer records. This feature
  introduces no distinct roles/permission levels, consistent with 001/002/003/003b/004.

## Assumptions

- At least one contact (with a phone or email) is required per customer, mirroring
  001-supplier-directory's contact requirement — the master spec doesn't state this explicitly for
  customers, but a customer record with zero ways to reach anyone would be an obvious data-entry
  gap for a major counterparty.
- Payment terms are captured as an expected numeric range (minimum days, maximum days), not a
  single fixed integer and not free text like "Net 30", because in practice each of this
  business's customers pays somewhere within a range rather than on a fixed day (e.g. Habbitt
  30-45 days, Chaseup 90-120 days, ChaseValue and Kifayat around 45 days), and the actual payment
  date is never fully reliable — it routinely runs early or late even for the same customer. A
  single fixed number would misrepresent that reality, and free text can't be computed on. A later
  feature (the Customer Ledger, 009) uses this range only to classify an actual payment as "within
  expected range" or "beyond expected range" for ageing/reporting purposes — it is never a rule
  that blocks, rejects, or auto-flags a payment as wrong. Every payment's actual date is always
  recorded as it really happened, independent of this range.
- A nonzero opening balance always creates a ledger entry at customer-creation time; a zero or
  omitted opening balance creates no entry at all, so the ledger only ever contains meaningful
  postings, never zero-amount rows.
- Once posted, an opening balance's ledger entry is immutable — corrected only via a new, visible
  adjusting entry — following the same "never silently edit, always reverse/adjust visibly"
  principle the master spec already applies to bounced cheques and posted invoices. If this
  understanding of "never edit" is too strict for the go-live data-entry period itself, that's a
  candidate to revisit before `/sp.plan`.
- `ledger_entries` is introduced by this feature (per `specs/PRODUCT-OVERVIEW.md`'s
  "Shared-table decisions") because a customer's opening balance must be postable at
  customer-creation time. This feature is the table's only writer for now; Challans (007) and
  Performa Invoicing (008) will become writers when they ship, and the full ledger presentation
  (running-balance view, ageing, cheque/payment capture) is entirely owned by 009-customer-ledger,
  not this feature.
- A customer-product mapping's item code, selling unit, and default price are each optional
  independently (a customer might only need a different selling unit with no distinct code, or
  vice versa), but a mapping row only exists once at least one of the three is set for that
  customer-product pair. Customer-specific *pricing* is captured here as a default/agreed price —
  reversing this feature's earlier assumption that pricing has no customer default — because item
  rates per customer are typically fixed in practice (e.g. Ball Fiber to Habbitt is consistently
  Rs 2600/unit on every PO unless renegotiated), and this pattern holds across other customers and
  items too. This follows the same "expected value is a pre-fill suggestion, the actual record is
  always authoritative" pattern already used for the yield-ratio contradiction in
  010-production-batches: a PO in 006-customer-purchase-orders still carries and stores its own
  price field, which remains authoritative, and staff can override the default at any time when a
  customer renegotiates. Storing a default here only lets a future PO form pre-fill a sensible
  starting price instead of starting blank every time — it does not change
  006-customer-purchase-orders' own scope.
- No role-based restrictions in this feature: every authenticated internal staff user can create,
  view, edit, deactivate, and map products for any customer, consistent with 001/002/003/003b/004.
- Deactivation is a soft status change, not a deletion, consistent with 001's supplier pattern and
  004's trade-name pattern.
- Duplicate display/legal names are permitted (not blocked), consistent with 001's and 004's
  duplicate-name handling.
- This feature is limited to the customer record, its ledger opening-balance posting, and its
  product mappings; resolving a real incoming PO's item code against this mapping, generating
  Challans/Invoices, and the full ledger presentation (ageing, payments, cheque bounces) are
  explicitly out of scope here and belong to 006/007/008/009 respectively.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can create a complete new customer record (excluding product
  mappings) in under 3 minutes.
- **SC-002**: 100% of the business's active customers — at minimum Habbitt, Chaseup, ChaseValue,
  and Kifayat — are discoverable and editable through the customer directory, with the
  legal-name/display-name and trade-name-hint distinctions correctly represented for each.
- **SC-003**: Every customer's opening balance, once entered, matches its real-world starting
  balance from the business's existing spreadsheet ledger with zero discrepancy.
- **SC-004**: A customer-specific item code entered for a product resolves to exactly one product
  100% of the time — never ambiguous, never silently overwritten by a second mapping.
- **SC-005**: Zero loss of historical customer data — deactivating a customer never removes its
  record, ledger entries, or product mappings.
