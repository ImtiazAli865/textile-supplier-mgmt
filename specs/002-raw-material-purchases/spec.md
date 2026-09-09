# Feature Specification: Raw Material Purchases

**Feature Branch**: `002-raw-material-purchases`
**Created**: 2026-09-10
**Status**: Draft
**Input**: User description: "Raw Material Purchases: The textile business purchases raw material (e.g. fabric/cloth) by weight (kg) from suppliers already tracked in the Supplier Directory (001). Each purchase records: the supplier (linked to an existing Supplier record), a purchase date, the weight purchased (in kg), the rate per kg, and the resulting total cost (weight x rate). Staff need to view a list of raw material purchases (most recent first), filter/search by supplier and by date range, and see running totals (total kg purchased, total cost) for a selected period. Each purchase becomes a distinct \"lot\" that will later be consumed by Production Batches (a future feature) -- so each purchase needs a way to track how much of its purchased weight has been used vs. remains available, though the actual consumption logic belongs to the future Production Batches feature. This is the second feature of a larger textile trading, production and sales management system (built with Next.js + Firestore + Firebase Auth, deployed on Vercel), following 001-supplier-directory. Only authenticated internal staff can create, view, edit, or delete raw material purchase records."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record and view a raw material purchase (Priority: P1)

An internal staff member records that raw material (e.g. fabric/cloth) was purchased from an existing supplier — how much weight (kg), at what rate per kg — and the system calculates the total cost automatically. The purchase immediately appears in the purchase list and can be opened to view full details.

**Why this priority**: This is the foundational capability — without it there is no record of raw material inflow, which every later module (Production Batches, Labour Ledger, Profit Reports) depends on. It replaces manual purchase notes with a single source of truth.

**Independent Test**: Can be fully tested by recording one purchase against an existing supplier with a weight and rate, confirming the total cost is calculated correctly, and confirming the purchase appears in the list and its detail view shows everything entered. Delivers value on its own (a working record of raw material purchases and spend).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Purchase" form, **When** they select an existing supplier, enter a purchase date, weight purchased (kg), and rate per kg, and submit, **Then** the system saves the purchase with an automatically calculated total cost (weight × rate) and it appears at the top of the purchase list.
2. **Given** a purchase has been recorded, **When** the staff member opens its detail view, **Then** the supplier, purchase date, weight, rate per kg, total cost, and remaining (unused) weight are displayed accurately.
3. **Given** the staff member is on the "Add Purchase" form, **When** they submit without selecting a supplier, or without a purchase date, or with a weight or rate that is zero or negative, **Then** the system rejects the submission and shows a clear validation error identifying the missing or invalid field(s).

---

### User Story 2 - Search, filter, and total raw material purchases (Priority: P2)

An internal staff member narrows the purchase list by supplier and/or by a date range, and sees running totals (total kg purchased, total cost) for whatever set of purchases is currently displayed — e.g. to check total spend with a supplier last month.

**Why this priority**: Once purchases exist, staff need to quickly answer "how much did we buy, and for how much" over a period or from a supplier — this is the core reporting need until the dedicated Profit & Reports module (008) exists.

**Independent Test**: Seed the purchase list with several purchases across different suppliers and dates; verify that filtering by supplier, by date range, and by both together narrows the list correctly and that the displayed totals match the filtered records, independent of create/edit functionality.

**Acceptance Scenarios**:

1. **Given** multiple purchases from different suppliers exist, **When** the staff member selects a supplier filter, **Then** only purchases from that supplier are shown and the running totals (kg, cost) reflect only those purchases.
2. **Given** multiple purchases across different dates exist, **When** the staff member selects a date range, **Then** only purchases within that range are shown and totals recalculate accordingly.
3. **Given** no filters are applied, **When** the staff member opens the purchase list, **Then** all purchases are shown most-recent-first with totals reflecting the entire list.
4. **Given** a filter or filter combination matches no purchases, **When** applied, **Then** the system shows a clear "no results" state with zeroed totals rather than an empty or broken screen.

---

### User Story 3 - Edit and delete purchase records (Priority: P3)

An internal staff member corrects a purchase record (wrong weight, rate, date, or supplier entered) or removes one entered by mistake, as long as the raw material lot has not yet been used in production.

**Why this priority**: Keeps purchase records accurate. Lower priority than recording and viewing because a newly-launched purchase log is still useful even before any records need correcting, but required for data quality once mistakes happen.

**Independent Test**: Take an existing, unconsumed purchase record, edit one or more fields and confirm the changes persist and totals/cost recalculate; separately, delete an unconsumed purchase and confirm it is removed from the list and totals. Separately, once a purchase's remaining weight has been reduced (simulated for this feature, since actual consumption is done by a future feature), confirm edit and delete are blocked.

**Acceptance Scenarios**:

1. **Given** an existing purchase whose full weight is still unused, **When** the staff member edits its supplier, date, weight, or rate and saves, **Then** the updated values persist, the total cost recalculates automatically, and the remaining (unused) weight updates to match the new weight.
2. **Given** an existing purchase whose full weight is still unused, **When** the staff member deletes it, **Then** the record is permanently removed from the list and from all totals.
3. **Given** a purchase whose remaining weight is less than its originally purchased weight (i.e. partially or fully used by a production batch), **When** the staff member attempts to edit its weight or delete it, **Then** the system blocks the action and explains that the lot is already in use.

---

### Edge Cases

- What happens when a supplier used in an existing purchase is later deactivated in the Supplier Directory? The purchase record still displays that supplier's name and remains fully viewable; only active suppliers are offered when creating a *new* purchase.
- What happens when weight or rate is entered with more than 2 decimal places? The system rounds to 2 decimal places for storage and display.
- What happens when a purchase date is set in the future? Not allowed — purchase date cannot be after today, since it records something that has already happened.
- What happens when staff try to edit non-quantity fields (e.g. date) on a purchase that has already been partially consumed? Not allowed — once any part of a lot has been consumed, the entire record is locked to preserve the integrity of downstream production-cost calculations; only deletion/weight-editing restrictions are visible in this feature, since consumption itself is introduced by a later feature.
- What happens when the purchase list grows large (hundreds/thousands of records)? The list must remain searchable/filterable with totals recalculating without significant delay (see SC-004).
- What happens when a search/filter combination matches no purchases? Show an explicit empty-state message with totals shown as zero, not a blank screen.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to record a raw material purchase by selecting an existing, active supplier and entering a purchase date, weight purchased (kg), and rate per kg.
- **FR-002**: System MUST automatically calculate and store total cost as weight × rate; total cost MUST NOT be manually editable.
- **FR-003**: System MUST require a supplier, a purchase date not later than today, and a weight and rate that are both greater than zero before a purchase record can be saved.
- **FR-004**: System MUST display a list of purchase records sorted by purchase date, most recent first.
- **FR-005**: System MUST allow a staff member to filter the purchase list by supplier and by date range, including combining both filters together.
- **FR-006**: System MUST display running totals (total weight in kg, total cost) for whichever set of purchases is currently displayed (filtered or unfiltered).
- **FR-007**: System MUST allow a staff member to open a full detail view of any single purchase record.
- **FR-008**: System MUST allow a staff member to edit any field of an existing purchase record, provided none of its purchased weight has yet been consumed.
- **FR-009**: System MUST allow a staff member to permanently delete an existing purchase record, provided none of its purchased weight has yet been consumed.
- **FR-010**: System MUST prevent editing or deleting a purchase record once any part of its purchased weight has been consumed, and MUST explain why the action is blocked.
- **FR-011**: System MUST track, per purchase record, a remaining (unused) weight value, initialized to equal the full purchased weight at creation; this feature does not provide a mechanism to reduce it (a future Production Batches feature will consume it).
- **FR-012**: System MUST round weight and rate values to 2 decimal places for storage and display.
- **FR-013**: System MUST record and display when each purchase record was created and last updated.
- **FR-014**: System MUST require staff to be authenticated before viewing, creating, editing, or deleting any purchase record.

### Key Entities

- **Raw Material Purchase**: Represents one purchase "lot" of raw material bought from a supplier. Attributes: supplier reference, purchase date, weight purchased (kg), rate per kg, total cost (derived: weight × rate), remaining (unused) weight (kg), created/updated timestamps. References exactly one Supplier.
- **Supplier**: Existing entity from the Supplier Directory (001). Only active suppliers are selectable for new purchases; a purchase retains and displays its supplier's name even if that supplier is later deactivated.

## Assumptions

- Currency is a single implicit currency (Rs, per the business context) — no multi-currency support in this feature.
- Weight (kg) and rate (per kg) are entered as decimal numbers rounded to 2 decimal places; total cost is always system-calculated, never manually entered.
- "Remaining weight" exists on each purchase so that the upcoming Production Batches feature (003) has a field to consume against, but no UI or logic to reduce it is part of this feature — it always equals the full purchased weight for every record created here.
- Once a purchase's remaining weight is reduced below its purchased weight (by a future feature), the entire record becomes read-only in this feature (no edits, no delete) to keep downstream batch-cost calculations consistent; deletion is otherwise a hard delete (no soft-delete/deactivation, unlike Supplier records) since an untouched purchase has not yet fed into any other record.
- No role-based restrictions in this feature: every authenticated internal staff user can create, view, edit, and delete any raw material purchase, consistent with 001-supplier-directory.
- Purchase date cannot be in the future; there is no restriction on how far in the past it can be (needed for backfilling historical purchases when the system first launches).
- This feature is limited to recording and reporting raw material purchases themselves; consuming a purchase's weight into a production batch, wastage calculation, and labour costing are explicitly out of scope here and belong to the Production Batches feature (003), which will reference these purchase records. See `specs/PRODUCT-OVERVIEW.md` for full business context and module roadmap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can record a new raw material purchase in under 1 minute.
- **SC-002**: A staff member can find all purchases from a specific supplier within a given date range, and see their total cost, in under 10 seconds.
- **SC-003**: Running totals (kg, cost) update to match the currently displayed/filtered purchases with no perceptible delay (under 2 seconds).
- **SC-004**: The purchase list remains fully searchable and filterable with results appearing in under 2 seconds for at least 1,000 purchase records.
- **SC-005**: 100% of displayed total costs exactly equal weight × rate for their record — no manual override ever causes a discrepancy.
