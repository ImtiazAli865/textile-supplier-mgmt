# Feature Specification: Trade Names & Document Settings

**Feature Branch**: `004-trade-names-and-document-settings`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "004-trade-names-and-document-settings: Trade name records (printed name/address, NTN, Sales Tax Registration number, per-trade-name Challan and Invoice number sequences, signature image + company stamp image upload) and the Supabase Storage setup that backs the image/attachment uploads. Source: specs/PRODUCT-OVERVIEW.md § \"Trade Names & Document Settings\" and § \"Cross-Cutting Technical Requirements\". Five trade names exist today (Global Distributors, IBL Frontier Market, M Zayan Impex, Rashid Towel, M.A Textile) but the set must be manageable, not hardcoded. Trade name selection itself is a per-document concern used by later features (006-008), not part of this feature's own scope beyond the trade name record and its assets."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and view trade name records (Priority: P1)

An internal staff member adds one of the business's billing identities (a "trade name") to the system with its printed name, printed address, and tax registration details, and can immediately see it in a list and open it to view full details.

**Why this priority**: This is the foundational capability — every later document-generating feature (Purchase Orders' trade-name choice, Challans, Performa Invoices) references a trade name record, so nothing downstream can be built or tested until trade names exist as real data rather than a hardcoded list.

**Independent Test**: Can be fully tested by creating one trade name record with its required fields and confirming it appears in the trade name list and its detail view shows everything entered. Delivers value on its own (the five existing trade names become real, manageable records instead of being hardcoded).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Trade Name" form, **When** they fill in printed name and printed address and submit, **Then** the trade name is saved with status "active" and appears in the trade name list.
2. **Given** a trade name has been created, **When** the staff member opens its detail view, **Then** all entered fields (printed name, address, NTN number, Sales Tax Registration number, status) are displayed accurately.
3. **Given** the staff member is on the "Add Trade Name" form, **When** they submit without a printed name or without a printed address, **Then** the system rejects the submission and shows a clear validation error identifying the missing field(s).

---

### User Story 2 - Upload signature and stamp images (Priority: P2)

An internal staff member uploads a signature image and a company stamp image for a trade name once, so that every Challan or Performa Invoice generated under that trade name in later features can auto-insert them with no manual copy-paste, and can replace either image later if it changes.

**Why this priority**: Required before the Challans (007) and Performa Invoicing (008) features can produce a usable printed document, but the trade name record itself (User Story 1) already delivers value without it, so this follows rather than blocks it.

**Independent Test**: Can be fully tested by opening an existing trade name record, uploading a signature image and a stamp image, and confirming both are shown on the record and retrievable; separately, replacing an image and confirming the new one takes effect.

**Acceptance Scenarios**:

1. **Given** an existing trade name record with no signature image, **When** the staff member uploads an image file as its signature, **Then** the image is saved against that trade name and displayed on its detail view.
2. **Given** a trade name already has a stamp image, **When** the staff member uploads a new stamp image, **Then** the new image replaces the old one on that trade name's record.
3. **Given** the staff member attempts to upload a non-image file as a signature or stamp, **Then** the system rejects the upload and shows a clear error, and the trade name's existing image (if any) is unchanged.

---

### User Story 3 - Configure per-trade-name document number sequences (Priority: P2)

An internal staff member views and, when needed, manually sets the next Challan number and next Invoice number for a trade name, so that document numbering can be seeded correctly during migration from the business's current manual process and corrected later if it ever drifts.

**Why this priority**: Required before the Challans (007) and Performa Invoicing (008) features can auto-generate correct document numbers, but — like signature/stamp upload — it extends an already-valuable trade name record rather than being required for User Story 1's value.

**Independent Test**: Can be fully tested by opening an existing trade name record, setting its next Challan number and next Invoice number to specific values, and confirming both are saved and displayed, independent of any actual Challan or Invoice being issued (issuance is out of scope here).

**Acceptance Scenarios**:

1. **Given** a newly created trade name, **When** the staff member views its detail, **Then** a next Challan number and a next Invoice number are shown with a sensible starting default.
2. **Given** an existing trade name, **When** the staff member manually overrides its next Challan number or next Invoice number to a specific value, **Then** the new value is saved and displayed as the current setting.
3. **Given** two different trade names, **When** each has its document number sequences set independently, **Then** changing one trade name's sequence values never affects the other's.

---

### User Story 4 - Edit and deactivate trade name records (Priority: P3)

An internal staff member updates a trade name's details as they change (corrected address, updated tax registration number) and marks a trade name inactive if the business stops billing under it, without losing its historical record.

**Why this priority**: Keeps the trade name directory accurate over time, matching how Suppliers (001) already handle edits and deactivation, but a newly launched trade name directory is already useful before any record needs editing or retiring.

**Independent Test**: Take an existing trade name record, edit one or more fields and confirm the changes persist; separately, deactivate a trade name and confirm it is excluded from default selection lists but still retrievable and reactivatable.

**Acceptance Scenarios**:

1. **Given** an existing trade name record, **When** the staff member edits any field and saves, **Then** the updated values are persisted and immediately visible in the list and detail views.
2. **Given** an active trade name, **When** the staff member deactivates it, **Then** its status changes to "inactive", it is excluded from the default (active) trade name list, and its record — including images and sequence settings — is preserved.
3. **Given** an inactive trade name, **When** the staff member reactivates it, **Then** its status changes back to "active" and it reappears in the default list.

---

### Edge Cases

- What happens when a staff member enters a printed name that matches an existing trade name? System allows it (not blocked), consistent with how duplicate supplier names are handled in 001.
- What happens when a trade name has no NTN number or no Sales Tax Registration number? Allowed — both are optional, since not every trade name is Sales Tax registered (per the business's current five trade names).
- How does the system handle an attempt to deactivate a trade name that is already inactive, or reactivate one already active? The action is a no-op with the current status shown; no error.
- What happens if a staff member uploads an oversized image file? The system rejects it with a clear error naming the size limit, and the trade name's existing image (if any) is unchanged.
- What happens if a staff member tries to view or edit a trade name's signature/stamp image or document number settings while unauthenticated? Access is denied, same as every other action in this feature.
- What happens to a trade name's already-generated documents if its signature/stamp image is later replaced? Unaffected — only documents generated after the replacement use the new image (out of scope to verify here since document generation is a later feature).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a trade name record with: printed name, printed address, optional NTN number, optional Sales Tax Registration number, and status (defaulting to active).
- **FR-002**: System MUST require printed name and printed address before a trade name record can be saved.
- **FR-003**: System MUST display a list of trade name records showing at minimum printed name and status.
- **FR-004**: System MUST allow a staff member to open a full detail view of any single trade name record, showing all its fields, its uploaded signature and stamp images (if present), and its current document number settings.
- **FR-005**: System MUST allow a staff member to edit any field of an existing trade name record.
- **FR-006**: System MUST allow a staff member to deactivate an active trade name and to reactivate a previously deactivated one, without deleting the underlying record.
- **FR-007**: System MUST NOT permanently delete trade name records, their images, or their document number settings through normal use.
- **FR-008**: System MUST allow a staff member to upload a signature image and a company stamp image for a trade name, independently of each other, and to replace either image at any time.
- **FR-009**: System MUST restrict uploaded signature/stamp images to standard image file types and to a maximum file size, rejecting anything else with a clear error that leaves the trade name's existing image (if any) unchanged.
- **FR-010**: System MUST store uploaded signature/stamp images so that only the application, acting on behalf of an authenticated staff member, can retrieve them — never via a publicly guessable or world-readable URL.
- **FR-011**: System MUST allow a staff member to view and manually set/override each trade name's next Challan number and next Invoice number.
- **FR-012**: System MUST track each trade name's Challan number sequence and Invoice number sequence independently — changing one trade name's sequence values MUST NOT affect any other trade name's sequence values.
- **FR-013**: System MUST record and display when each trade name record was created and last updated.
- **FR-014**: System MUST require staff to be authenticated before viewing, creating, editing, deactivating, or uploading assets for any trade name record.

### Key Entities

- **Trade Name**: Represents one of the business's billing identities. Attributes: printed name, printed address, NTN number (optional), Sales Tax Registration number (optional), next Challan number, next Invoice number, status (active/inactive), created/updated timestamps. Has at most one current signature image and one current stamp image.
- **Signature/Stamp Image**: A staff-uploaded image file backing a Trade Name's signature or company stamp, used by later features when generating a printed document. Belongs to exactly one Trade Name; replacing it discards the previous file.
- **Staff User**: An authenticated internal user who manages trade name records. This feature does not introduce distinct roles/permission levels — any authenticated staff user has full access to all trade name actions, consistent with 001/002/003b.

## Assumptions

- Trade names are a small set (five today) but must be fully manageable — creatable, editable, deactivatable — like Suppliers in 001, not a hardcoded list, per the explicit input to this feature.
- Signature and stamp images are optional at trade-name creation time; a trade name may be saved without either and have them added later, since the business will migrate its five existing trade names' assets over time. Whether a document-generating feature (007 Challans, 008 Performa Invoicing) requires both to exist before it will render a document is that feature's own concern, not enforced here.
- The "next Challan number" / "next Invoice number" fields managed here are a plain overridable value per trade name and document type. The increment-on-issue behavior, the `CH #001/Sep` month-suffix print format, and any per-month reset behavior belong to the Challans (007) and Performa Invoicing (008) features that actually issue documents — this feature only stores and lets staff view/override the setting.
- No role-based restriction: any authenticated staff user has full access, consistent with the "single internal team" model already established in 001/002/003b.
- Accepted image types are standard raster formats (e.g., PNG, JPEG); the exact maximum file size is an implementation default sized for a scanned signature/stamp image, not a business rule requiring sign-off.
- Duplicate printed names are permitted (not blocked), consistent with 001's supplier-name duplicate handling.
- Which trade name a given Purchase Order/Challan/Invoice bills under, and any default/last-used suggestion, is a per-document concern owned by later features (006-008); this feature manages only the trade name master record and its assets.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can create a complete new trade name record (excluding images) in under 1 minute.
- **SC-002**: A staff member can upload or replace a trade name's signature or stamp image in under 30 seconds.
- **SC-003**: 100% of the business's active billing identities are discoverable and editable through the trade name directory, with none of them hardcoded in application code.
- **SC-004**: Zero loss of historical trade name data — deactivating a trade name never removes its record, its images, or its document number settings.
- **SC-005**: Every trade name record's data (name, address, tax IDs, images, document number settings) is available for the Purchase Orders, Challans, and Performa Invoicing features to consume without any re-entry.
