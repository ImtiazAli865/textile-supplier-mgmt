# Feature Specification: Supplier Directory

**Feature Branch**: `001-supplier-directory`
**Created**: 2026-09-06
**Status**: Draft
**Input**: User description: "Supplier Directory: a textile business needs to manage its fabric/material suppliers. Users (internal staff) can create, view, edit, and deactivate supplier records. Each supplier has: company name, contact person(s) with phone/email, address, the materials/fabric types they supply, payment terms, status (active/inactive), and internal notes/rating. Staff can search and filter suppliers by name, material type, or status. This is the first feature of a larger textile supplier management system (built with Next.js + Firestore + Firebase Auth, deployed on Vercel) that will later include purchase orders, inventory tracking, and invoicing -- but this spec covers only the supplier directory."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and view supplier records (Priority: P1)

An internal staff member adds a new fabric/material supplier to the system with its company details, contacts, materials supplied, and payment terms, and can immediately see it in the supplier list and open it to view full details.

**Why this priority**: This is the foundational capability — without it there is no directory. It replaces ad-hoc spreadsheets/contact lists with a single source of truth and delivers value the moment the first supplier is entered.

**Independent Test**: Can be fully tested by creating one supplier record with all required fields and confirming it appears in the supplier list and its detail view shows everything entered. Delivers value on its own (a working central supplier record store).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Supplier" form, **When** they fill in company name, at least one contact (name + phone or email), address, materials supplied, and payment terms, and submit, **Then** the supplier is saved with status "active" and appears in the supplier list.
2. **Given** a supplier has been created, **When** the staff member opens its detail view, **Then** all entered fields (company info, contacts, materials, payment terms, status, notes/rating) are displayed accurately.
3. **Given** the staff member is on the "Add Supplier" form, **When** they submit without a company name or without any contact method, **Then** the system rejects the submission and shows a clear validation error identifying the missing field(s).

---

### User Story 2 - Search and filter suppliers (Priority: P2)

An internal staff member quickly locates a supplier by typing part of its name, or narrows the supplier list by material/fabric type and by active/inactive status.

**Why this priority**: Once suppliers exist, findability is the next most valuable capability — staff need to locate the right supplier fast, especially as the list grows past a handful of entries.

**Independent Test**: Seed the directory with several suppliers of varying names, materials, and statuses; verify that searching by partial name returns only matches, and that filtering by material type and by status narrows the list correctly, independent of create/edit functionality.

**Acceptance Scenarios**:

1. **Given** multiple suppliers exist, **When** the staff member types part of a company name into the search box, **Then** only suppliers whose name contains that text (case-insensitive) are shown.
2. **Given** multiple suppliers exist with different materials, **When** the staff member selects a material/fabric type filter, **Then** only suppliers supplying that material are shown.
3. **Given** both active and inactive suppliers exist, **When** the staff member filters by status, **Then** only suppliers matching the selected status are shown.
4. **Given** a search or filter combination matches no suppliers, **When** applied, **Then** the system shows a clear "no results" state rather than an empty or broken screen.

---

### User Story 3 - Edit and deactivate supplier records (Priority: P3)

An internal staff member updates a supplier's details as they change (new contact, updated payment terms, added materials) and marks a supplier inactive when the business stops sourcing from them, without losing the historical record.

**Why this priority**: Keeps the directory accurate over time. Lower priority than create/view/search because a newly-launched directory is still useful even before any records need editing or retiring, but this is required for long-term data quality.

**Independent Test**: Take an existing supplier record, edit one or more fields and confirm the changes persist and are reflected in list/detail views; separately, deactivate a supplier and confirm it is excluded from default views but still retrievable via the "inactive" status filter, and can be reactivated.

**Acceptance Scenarios**:

1. **Given** an existing supplier record, **When** the staff member edits any field and saves, **Then** the updated values are persisted and immediately visible in the list and detail views.
2. **Given** an active supplier, **When** the staff member deactivates it, **Then** its status changes to "inactive", it is excluded from the default (active) supplier list, and its record is preserved and viewable via the inactive filter.
3. **Given** an inactive supplier, **When** the staff member reactivates it, **Then** its status changes back to "active" and it reappears in the default list.

---

### Edge Cases

- What happens when a staff member enters a company name that already exists? System allows it (duplicate legal entities/branches are possible) but should visually flag potential duplicates by name during entry.
- How does the system handle a supplier with no materials/fabric types selected? Not allowed — at least one material/fabric type is required, since it is a primary search/filter dimension.
- What happens when search text or filters match zero suppliers? Show an explicit empty-state message, not a blank screen.
- What happens if a staff member tries to deactivate a supplier that is already inactive, or reactivate one already active? The action is a no-op with the current status shown; no error.
- How does the system handle a supplier record with multiple contacts where one contact has neither phone nor email? Not allowed — each contact must have at least one of phone or email.
- What happens when the supplier list grows large (hundreds of records)? The list must remain searchable/filterable without significant delay (see SC-004).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a supplier record with: company name, one or more contacts (each with name and phone and/or email), address, one or more materials/fabric types supplied, payment terms, status, and optional internal notes and rating.
- **FR-002**: System MUST require company name, at least one contact with at least one contact method (phone or email), and at least one material/fabric type before a supplier record can be saved.
- **FR-003**: System MUST display a list of supplier records showing at minimum company name, materials supplied, and status.
- **FR-004**: System MUST allow a staff member to open a full detail view of any single supplier record.
- **FR-005**: System MUST allow a staff member to edit any field of an existing supplier record.
- **FR-006**: System MUST allow a staff member to deactivate an active supplier (set status to inactive) without deleting the underlying record.
- **FR-007**: System MUST allow a staff member to reactivate a previously deactivated supplier.
- **FR-008**: System MUST NOT permanently delete supplier records through normal use (deactivation is the only removal mechanism in this feature).
- **FR-009**: System MUST allow a staff member to search suppliers by partial, case-insensitive company name match.
- **FR-010**: System MUST allow a staff member to filter the supplier list by material/fabric type and by status (active/inactive), including combining both with a search term.
- **FR-011**: System MUST default the supplier list to showing active suppliers, with an explicit option to include or switch to inactive suppliers.
- **FR-012**: System MUST support recording free-text internal notes and an optional rating (1–5) per supplier.
- **FR-013**: System MUST support multiple contact persons per supplier, each with a name and phone and/or email, and an optional role/title.
- **FR-014**: System MUST require staff to be authenticated before viewing, creating, editing, or deactivating any supplier record.
- **FR-015**: System MUST record and display when each supplier record was created and last updated.

### Key Entities

- **Supplier**: Represents a fabric/material supplier company. Attributes: company name, address, materials/fabric types supplied (one or more), payment terms, status (active/inactive), internal notes, optional rating (1–5), created/updated timestamps. Has one or more Contacts.
- **Contact**: Represents a person at a supplier company. Attributes: name, phone (optional if email present), email (optional if phone present), role/title (optional). Belongs to exactly one Supplier.
- **Staff User**: An authenticated internal user who manages supplier records. This feature does not introduce distinct roles/permission levels — any authenticated staff user has full access to all supplier directory actions.

## Assumptions

- No role-based restrictions in this feature: every authenticated internal staff user can create, view, edit, and deactivate any supplier. Finer-grained permissions (e.g., admin-only deactivation) are out of scope until a need is identified.
- Materials/fabric types are entered as free-text tags (with suggestions from previously used values) rather than a fixed, pre-defined taxonomy, so the business isn't blocked from adding new material types as they emerge.
- "Deactivate" is a soft status change, not a deletion — no hard-delete capability is included in this feature.
- Rating is a simple 1–5 scale, optional, for internal reference only (not shown to suppliers).
- Duplicate company names are permitted (flagged, not blocked) since a supplier may have multiple branches or legitimately similar names.
- This feature is limited to the supplier directory itself; purchase orders, inventory, and invoicing (mentioned as future related work) are explicitly out of scope here and will reference Supplier records in later features.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can create a complete new supplier record in under 2 minutes.
- **SC-002**: A staff member can locate a specific known supplier via search or filter in under 10 seconds.
- **SC-003**: 100% of active suppliers are discoverable through the directory without needing an external spreadsheet or manual list.
- **SC-004**: The supplier list remains fully searchable and filterable with results appearing in under 2 seconds for a directory of at least 500 suppliers.
- **SC-005**: Zero loss of historical supplier data — deactivating a supplier never removes its record or history from the system.
