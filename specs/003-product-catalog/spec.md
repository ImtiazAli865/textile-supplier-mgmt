# Feature Specification: Product Catalog

**Feature Branch**: `003-product-catalog`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "003-product-catalog: Foundation product catalog for MA Textile — traded and manufactured products, customer-specific item codes, UOM, yield ratios, labour rates, and pricing, as the shared reference data every later feature (customers, POs, challans, invoicing, production batches, inventory, reports) points at. See specs/PRODUCT-OVERVIEW.md §2 for full business context."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Create and view a product record (Priority: P1)

An internal staff member adds a new product to the catalog — either a **traded** item (bought
from the market and resold as-is) or a **manufactured** item (produced in-house from raw
material) — recording its name, the unit stock is held in, its default selling price, and the
details specific to its type (contractor labour rate and expected yield for manufactured
items; nothing extra to enter for traded items, since their cost is tracked automatically from
purchases). The new product immediately appears in the catalog and can be opened to view full
details.

**Why this priority**: This is the foundational capability — without a product catalog, no
other feature (customer POs, challans, invoicing, production batches, inventory, profit
reports) has anything to reference. It replaces the informal, undocumented list of items the
business currently keeps in its head and in Excel.

**Independent Test**: Can be fully tested by creating one traded product and one manufactured
product, each with all required fields for its type, and confirming both appear in the catalog
list and their detail views show everything entered accurately. Delivers value on its own (a
documented, browsable product catalog).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Product" form with type set to **traded**, **When**
   they enter a name, a stock unit of measure, and a default selling price, and submit, **Then**
   the product is saved as active and appears in the catalog list.
2. **Given** the staff member is on the "Add Product" form with type set to **manufactured**,
   **When** they enter a name, a stock unit of measure, an expected kg-to-packet yield ratio, a
   default contractor labour rate per packet, and a default selling price, and submit, **Then**
   the product is saved as active and appears in the catalog list.
3. **Given** a product has been created, **When** the staff member opens its detail view,
   **Then** all entered fields are displayed accurately, and only the fields relevant to its
   type are shown (e.g. a traded product never shows a yield ratio or labour rate).
4. **Given** the staff member is on the "Add Product" form, **When** they submit without a name,
   without a stock UOM, without a default selling price, or — for a manufactured product —
   without a yield ratio or labour rate, **Then** the system rejects the submission and shows a
   clear validation error identifying the missing or invalid field(s).

---

### User Story 2 - Search and filter the product catalog (Priority: P2)

An internal staff member quickly locates a product by typing part of its name, or narrows the
catalog by product type (traded/manufactured) and by active/inactive status — needed from day
one since every later feature (entering a customer PO, recording a production batch) will
require picking a product from what may become a long list.

**Why this priority**: Findability is the next most valuable capability once products exist —
staff need to locate the right product fast, and every downstream feature depends on this
lookup working well.

**Independent Test**: Seed the catalog with several products of varying names, types, and
statuses; verify that searching by partial name returns only matches, and that filtering by
type and by status narrows the list correctly, independent of create/edit functionality.

**Acceptance Scenarios**:

1. **Given** multiple products exist, **When** the staff member types part of a product name
   into the search box, **Then** only products whose name contains that text (case-insensitive)
   are shown.
2. **Given** products of both types exist, **When** the staff member selects a type filter
   (traded or manufactured), **Then** only products of that type are shown.
3. **Given** both active and inactive products exist, **When** the staff member filters by
   status, **Then** only products matching the selected status are shown; the catalog defaults
   to showing active products only.
4. **Given** a search or filter combination matches no products, **When** applied, **Then** the
   system shows a clear "no results" state rather than an empty or broken screen.

---

### User Story 3 - Edit and deactivate a product record (Priority: P3)

An internal staff member updates a product's details as they change (a new selling price, a
recalibrated yield ratio, an adjusted contractor rate) and marks a product inactive when the
business stops selling or producing it, without losing the historical record that later
features (POs, batches, reports) may already reference.

**Why this priority**: Keeps the catalog accurate over time. Lower priority than create/view/
search because a newly-launched catalog is still useful before any product needs correcting,
but required for long-term data quality as prices and yields change.

**Independent Test**: Take an existing product, edit one or more fields and confirm the changes
persist and are reflected in list/detail views; separately, deactivate a product and confirm it
is excluded from the default list but still retrievable via the "inactive" filter and can be
reactivated.

**Acceptance Scenarios**:

1. **Given** an existing product, **When** the staff member edits its name, stock UOM, selling
   price, yield ratio, or labour rate (whichever apply to its type) and saves, **Then** the
   updated values persist and are immediately visible in list and detail views.
2. **Given** an existing product, **When** the staff member attempts to change its type (traded
   ↔ manufactured), **Then** the system does not permit it — type is fixed at creation.
3. **Given** an active product, **When** the staff member deactivates it, **Then** its status
   changes to inactive, it is excluded from the default (active) catalog list, and its record is
   preserved and viewable via the inactive filter.
4. **Given** an inactive product, **When** the staff member reactivates it, **Then** its status
   changes back to active and it reappears in the default list.

---

### Edge Cases

- What happens when a traded product has no purchase history yet? Its weighted-average purchase
  cost shows as "not yet established," never a misleading zero — this feature has no manual
  entry path for that value; it is populated automatically once a future purchasing feature
  records purchases against the product.
- What happens if staff try to change a product's type after creation? Not allowed — a new
  product record must be created instead, since type determines which fields and downstream
  costing rules apply.
- What happens when a manufactured product's yield ratio turns out to be consistently wrong in
  practice? It can be edited at any time — it is a planning figure only, used to pre-fill a
  suggested quantity on future production batches, and editing it never rewrites any past
  batch's actual recorded figures.
- What happens when a customer needs their own item code or selling unit for a product? Out of
  scope for this feature — see Assumptions. Customer-specific item codes and selling units
  require the Customer entity, which does not exist until a later feature.
- What happens if staff try to deactivate a product that is already inactive, or reactivate one
  already active? The action is a no-op with the current status shown; no error.
- What happens when default selling price, labour rate, or yield ratio is entered as zero or
  negative? Rejected — each must be greater than zero.
- What happens when the catalog grows large (hundreds of products)? It must remain searchable
  and filterable without significant delay (see SC-003).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to create a product
  record with: name, type (`traded` or `manufactured`, fixed at creation), stock unit of
  measure, default selling price, and status (defaulting to active).
- **FR-002**: System MUST require, for a `manufactured` product, an expected kg-to-packet yield
  ratio and a default contractor labour rate per packet, both greater than zero, before the
  record can be saved.
- **FR-003**: System MUST track, for a `traded` product, a current weighted-average purchase
  cost per unit as a system-derived, read-only value; this feature provides no way to set or
  edit it manually, and it displays as unestablished until a future purchasing feature records
  purchases against the product.
- **FR-004**: System MUST NOT allow a product's type to be changed once it has been created.
- **FR-005**: System MUST display a list of product records showing at minimum name, type,
  stock UOM, default selling price, and status.
- **FR-006**: System MUST allow a staff member to open a full detail view of any single product,
  showing only the fields relevant to its type.
- **FR-007**: System MUST allow a staff member to edit any field of an existing product other
  than its type.
- **FR-008**: System MUST allow a staff member to deactivate an active product (set status to
  inactive) without deleting the underlying record, and to reactivate a previously deactivated
  product.
- **FR-009**: System MUST NOT permanently delete product records through normal use
  (deactivation is the only removal mechanism in this feature).
- **FR-010**: System MUST allow a staff member to search products by partial, case-insensitive
  match on name or internal code.
- **FR-011**: System MUST allow a staff member to filter the product list by type
  (traded/manufactured) and by status (active/inactive), including combining both with a search
  term.
- **FR-012**: System MUST default the product list to showing active products, with an explicit
  option to include or switch to inactive products.
- **FR-013**: System MUST round selling price, purchase cost, labour rate, and yield ratio
  values to 2 decimal places for storage and display.
- **FR-014**: System MUST require staff to be authenticated before viewing, creating, editing,
  or deactivating any product record.
- **FR-015**: System MUST record and display when each product record was created and last
  updated.

### Key Entities

- **Product**: Represents one catalog item, either bought-and-resold or manufactured in-house.
  Attributes: name, optional internal code (free-text, informal, not enforced-unique), type
  (`traded` | `manufactured`, immutable after creation), stock unit of measure, default selling
  price, status (active/inactive), created/updated timestamps. Manufactured-only attributes:
  expected kg-to-packet yield ratio (a single expected figure, not a min–max range), default
  contractor labour rate per packet. Traded-only attribute: current weighted-average purchase
  cost per unit (derived, read-only, populated by a future purchasing feature — not this one).
- **Staff User**: An authenticated internal user who manages the catalog. This feature
  introduces no distinct roles/permission levels, consistent with 001 and 002.

Explicitly **not** part of this feature's data model: customer-specific item codes and
per-customer selling units of measure. Both require a Customer entity, which does not exist
until a later feature — see Assumptions.

## Assumptions

- Product type (`traded` vs `manufactured`) is fixed at creation. Reclassifying a product
  requires creating a new catalog record rather than converting an existing one, since type
  determines which fields apply and which future costing logic (weighted-average purchase cost
  vs. batch-based production cost) is used.
- The manufactured yield ratio is stored as a single expected packets-per-kg figure, not a
  min–max range. It is a planning/variance figure only, consumed by the future Production
  Batches feature to pre-fill a suggested packet count — never authoritative over a batch's
  actually entered figures.
- A traded product's weighted-average purchase cost is fully derived and read-only in this
  feature. It has no value until the future traded-goods-purchasing feature (which extends
  002-raw-material-purchases) starts recording purchases against the product; until then it
  displays as "not yet established," not zero.
- Customer-specific item codes and per-customer selling units of measure (described in
  `specs/PRODUCT-OVERVIEW.md` §2) are explicitly deferred out of this feature: they are
  inherently a mapping between a Product and a Customer, and the Customer entity does not exist
  until feature 005. That mapping will be introduced as part of 005-customers or
  006-customer-purchase-orders, whichever spec first needs to resolve a customer's own PO item
  code to a product.
- Internal product code is a free-text, optional, non-unique reference field for the business's
  own convenience — it is not used by this feature as a system lookup key.
- Default selling price, contractor labour rate, and yield ratio must each be greater than
  zero, consistent with 002's numeric validation convention.
- No role-based restrictions in this feature: every authenticated internal staff user can
  create, view, edit, and deactivate any product, consistent with 001 and 002.
- Deactivation is a soft status change, not a deletion, consistent with 001's supplier pattern
  (and unlike 002's raw material purchases, which use a hard delete because they have no
  downstream references yet — products will have many once later features ship).
- This feature is limited to the product catalog itself; customer-specific pricing/codes,
  purchasing (traded or raw material), production batches, inventory, and sales are explicitly
  out of scope here and will reference Product records in later features. See
  `specs/PRODUCT-OVERVIEW.md` for full business context and the module roadmap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can create a complete new product record (traded or manufactured)
  in under 1 minute.
- **SC-002**: A staff member can locate a specific known product via search or filter in under
  10 seconds.
- **SC-003**: The product catalog remains fully searchable and filterable with results appearing
  in under 2 seconds for a catalog of at least 500 products.
- **SC-004**: Adding a new product to the business (e.g. a new manufactured packet type or a new
  traded item) requires zero code changes — it is completed entirely through the product
  creation form.
- **SC-005**: Zero loss of historical product data — deactivating a product never removes its
  record or history from the system.
