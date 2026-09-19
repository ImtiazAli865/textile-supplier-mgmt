# Feature Specification: Traded-Goods Purchasing

**Feature Branch**: `003b-traded-goods-purchasing`
**Created**: 2026-09-20
**Status**: Draft
**Input**: User description: "003b traded-goods purchasing: Extend 002-raw-material-purchases so the same purchase log also records per-unit purchases of traded catalog items (Ball Fiber, Channel SMC, Screws, etc.) bought from suppliers, alongside the existing per-kg raw fabric purchases — so all purchasing lives in one place, per specs/PRODUCT-OVERVIEW.md §14.1 and the agreed 003b build-order step. Each unit-based purchase updates the purchased product's weighted-average cost and quantity on hand."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Record a per-unit purchase of a traded product (Priority: P1)

An internal staff member records that a traded catalog item (e.g. Ball Fiber) was purchased
from an existing supplier — how many units, at what rate per unit — and the system calculates
the total cost automatically, updates that product's current (weighted-average) purchase cost,
and increases its quantity on hand.

**Why this priority**: This is the foundational capability this feature adds — without it,
traded products never get a real purchase cost (their catalog entry still shows "not yet
established," per 003-product-catalog) and nothing tracks how much of them the business has on
hand. Every later feature that bills or ships traded items depends on this cost and quantity
being real.

**Independent Test**: Can be fully tested by recording one unit-based purchase against an
existing active traded product and supplier, confirming the total cost is calculated correctly,
the product's current purchase cost updates to match, its quantity on hand increases by the
purchased amount, and the purchase appears in the purchase list. Delivers value on its own (a
real, defensible cost for every traded product the business buys).

**Acceptance Scenarios**:

1. **Given** the staff member is on the "Add Purchase" form with mode set to **per-unit**,
   **When** they select an existing active supplier and an existing active traded product,
   enter a purchase date, quantity, and rate per unit, and submit, **Then** the system saves the
   purchase with an automatically calculated total cost (quantity × rate) and it appears at the
   top of the unified purchase list.
2. **Given** a unit-based purchase has just been recorded for a traded product with no prior
   purchase history, **When** the staff member opens that product's catalog detail view,
   **Then** its current purchase cost now shows the rate just entered (no longer "not yet
   established") and its quantity on hand has increased by the purchased quantity.
3. **Given** a traded product already has one or more prior purchases, **When** another
   unit-based purchase is recorded for it at a different rate, **Then** the product's current
   purchase cost updates to the weighted average across all of that product's purchases to
   date, and its quantity on hand increases again by the new purchase's quantity.
4. **Given** the staff member is on the "Add Purchase" form in per-unit mode, **When** they
   submit without selecting a supplier or product, without a purchase date, or with a quantity
   or rate that is zero or negative, **Then** the system rejects the submission and shows a
   clear validation error identifying the missing or invalid field(s).
5. **Given** the staff member is choosing a product for a per-unit purchase, **When** the
   product picker is shown, **Then** only active, traded-type products are offered —
   manufactured products never appear, since they are never purchased this way.

---

### User Story 2 - Browse the unified purchase log across both purchase modes (Priority: P2)

An internal staff member views the same purchase list already used for raw-material (per-kg)
purchases and sees per-unit (traded-item) purchases mixed in, clearly distinguished, and can
filter the combined list by supplier, date range, and — for per-unit rows — by product.

**Why this priority**: The whole point of extending the existing log rather than building a
separate one is a single place to see all purchasing. This is the next most valuable capability
once purchases of both kinds exist.

**Independent Test**: Seed the list with a mix of per-kg and per-unit purchases across
suppliers, dates, and products; verify each row clearly shows which mode it is and its relevant
quantity/unit, that filtering by supplier/date narrows both kinds of rows correctly, and that
filtering by product only affects per-unit rows.

**Acceptance Scenarios**:

1. **Given** both per-kg and per-unit purchases exist, **When** the staff member opens the
   purchase list, **Then** every row clearly shows its mode and the correct quantity and unit
   for that mode (e.g. "250.00 kg" vs. "40.00 PAC"), sorted most-recent-first regardless of
   mode.
2. **Given** purchases of both modes exist, **When** the staff member filters by supplier or by
   date range, **Then** matching rows of both modes are shown, and the running totals reflect
   only the filtered set.
3. **Given** per-unit purchases of multiple products exist, **When** the staff member filters by
   a specific product, **Then** only per-unit purchases of that product are shown (per-kg rows,
   which have no product, are excluded by this filter).
4. **Given** a filtered view containing a mix of modes, **When** the staff member views the
   running totals, **Then** total weight and total per-kg cost are shown for the per-kg rows,
   total units and total per-unit cost are shown for the per-unit rows (by product where that
   makes sense), and a combined grand total cost spans both — with no confusing "0" shown for a
   mode that simply has no rows in the current filter.

---

### User Story 3 - Edit and delete a per-unit purchase (Priority: P3)

An internal staff member corrects a per-unit purchase record (wrong quantity, rate, date,
supplier, or product entered) or removes one entered by mistake, as long as none of its
purchased quantity has yet been shipped to a customer.

**Why this priority**: Keeps purchase records accurate, mirroring the same data-quality need
already served for per-kg purchases in 002. Lower priority than recording and browsing because
correctness matters most once mistakes actually happen.

**Independent Test**: Take an existing, unconsumed per-unit purchase, edit one or more fields
and confirm the changes persist, the total cost recalculates, and the affected product's
weighted-average cost and quantity on hand are recalculated to match; separately, delete an
unconsumed per-unit purchase and confirm it is removed and the product's cost/quantity adjust
accordingly. Separately, once a purchase's remaining quantity has been reduced (simulated for
this feature, since actual consumption is done by a future feature), confirm edit and delete are
blocked.

**Acceptance Scenarios**:

1. **Given** an existing per-unit purchase whose full quantity is still unused, **When** the
   staff member edits its supplier, product, date, quantity, or rate and saves, **Then** the
   updated values persist, the total cost recalculates automatically, the remaining (unused)
   quantity updates to match the new quantity, and the affected product(s)' weighted-average
   cost and quantity on hand are recalculated to reflect the change.
2. **Given** an existing per-unit purchase whose full quantity is still unused, **When** the
   staff member deletes it, **Then** the record is permanently removed from the list and from
   all totals, and the affected product's weighted-average cost and quantity on hand are
   recalculated as if that purchase had never existed.
3. **Given** a per-unit purchase whose remaining quantity is less than its originally purchased
   quantity (i.e. partially or fully shipped to a customer), **When** the staff member attempts
   to edit or delete it, **Then** the system blocks the action and explains that the purchase is
   already in use.

---

### Edge Cases

- What happens when a traded product used in a per-unit purchase is later deactivated? The
  purchase record still displays that product's name and remains fully viewable and editable
  (subject to its own lock state); only active, traded-type products are offered when recording
  a *new* per-unit purchase.
- What happens if a traded product's last remaining purchase is edited or deleted? Its current
  purchase cost reverts to "not yet established" and its quantity on hand reverts toward zero,
  exactly as if that purchase had never been made — never left showing a stale or zero-but-real
  looking cost.
- What happens when a per-unit purchase's quantity is later reduced by a future feature (e.g.
  goods shipped to a customer)? The record becomes locked for edit/delete, exactly like a
  per-kg lot once part of it is used in production — this feature does not provide a way to
  reduce it itself.
- What happens when staff try to select a manufactured-type product for a per-unit purchase?
  It is never offered — the product picker only lists active, traded-type products.
  Manufactured products' stock comes from production batches (a separate future feature), never
  from a purchase.
- What happens to the existing per-kg (raw material) purchase workflow? It is completely
  unaffected — same fields, same validation, same supplier-must-be-active rule, same
  consumption lock — this feature only adds a second, independent mode alongside it.
- What happens when a purchase-list filter combination (supplier, date range, product) matches
  nothing? Show an explicit empty-state message with totals shown as zero/not-applicable, not a
  blank screen (same convention as 002).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST allow an authenticated internal staff member to record a purchase in
  one of two modes — **per-kg** (unchanged from 002) or **per-unit** — choosing the mode when
  creating a new purchase.
- **FR-002**: For a per-unit purchase, system MUST require selecting an existing, active
  supplier; an existing, active, **traded-type** product; a purchase date not later than today;
  and a quantity and rate per unit that are both greater than zero, before the purchase can be
  saved.
- **FR-003**: System MUST automatically calculate and store a per-unit purchase's total cost as
  quantity × rate per unit; total cost MUST NOT be manually editable.
- **FR-004**: System MUST, whenever a per-unit purchase is created, edited, or deleted,
  recalculate the affected product's current purchase cost as the weighted average across all of
  that product's per-unit purchases to date (reverting to "not yet established" if none remain).
- **FR-005**: System MUST, whenever a per-unit purchase is created, edited, or deleted, adjust
  the affected product's quantity on hand to reflect the net effect of that product's per-unit
  purchases to date.
- **FR-006**: System MUST track, per per-unit purchase, a remaining (unused) quantity,
  initialized to equal the full purchased quantity at creation and reset to the new quantity on
  edit; this feature does not provide a mechanism to reduce it (a future feature will consume it
  when goods are shipped to a customer).
- **FR-007**: System MUST display per-kg and per-unit purchases together in a single, unified
  purchase list, sorted by purchase date, most recent first, with each row clearly showing its
  mode and the correct quantity/unit for that mode.
- **FR-008**: System MUST allow a staff member to filter the unified purchase list by supplier
  and by date range (both modes), and additionally by product (per-unit rows only), combinable
  with each other.
- **FR-009**: System MUST display running totals for the currently displayed/filtered purchases,
  broken out by mode (total weight and cost for per-kg rows; total quantity and cost for
  per-unit rows) plus a combined total cost across both modes.
- **FR-010**: System MUST allow a staff member to open a full detail view of any single purchase
  of either mode, showing the fields relevant to that mode.
- **FR-011**: System MUST allow a staff member to edit any field of an existing per-unit
  purchase, provided none of its purchased quantity has yet been consumed.
- **FR-012**: System MUST allow a staff member to permanently delete an existing per-unit
  purchase, provided none of its purchased quantity has yet been consumed.
- **FR-013**: System MUST prevent editing or deleting a per-unit purchase once any part of its
  purchased quantity has been consumed, and MUST explain why the action is blocked.
- **FR-014**: System MUST NOT offer manufactured-type or inactive products when selecting a
  product for a new per-unit purchase.
- **FR-015**: System MUST leave all existing per-kg purchase behavior (creation, editing,
  deletion, the consumption lock, filtering, and totals) unchanged.
- **FR-016**: System MUST round quantity, rate, cost, and quantity-on-hand values to 2 decimal
  places for storage and display.
- **FR-017**: System MUST require staff to be authenticated before viewing, creating, editing,
  or deleting any purchase record of either mode.
- **FR-018**: System MUST record and display when each per-unit purchase record was created and
  last updated.

### Key Entities

- **Purchase (extended)**: Now represents either a per-kg lot (unchanged from 002) or a per-unit
  purchase of a traded product. Per-unit attributes: supplier reference, product reference,
  purchase date, quantity purchased, rate per unit, total cost (derived: quantity × rate),
  remaining (unused) quantity, created/updated timestamps. A per-unit purchase always references
  exactly one Product; a per-kg purchase never references a Product (unchanged from 002).
- **Product (extended from 003-product-catalog)**: Traded products gain a quantity-on-hand
  figure, starting at zero, that this feature increases with each per-unit purchase (and
  recalculates on edit/delete); their current purchase cost (already part of 003's data model,
  previously always "not yet established") is now actively maintained by this feature.
- **Supplier**: Existing entity from 001, reused identically for both purchase modes.

## Assumptions

- This feature extends the existing purchase log (002) rather than introducing a separate
  traded-goods purchase record, so all purchasing — raw fabric by weight and traded items by
  unit — lives in one place, per the decision already recorded in
  `specs/PRODUCT-OVERVIEW.md` §14.1 and the agreed build order.
- Weighted-average purchase cost is a simple average over the full history of a product's
  per-unit purchases (not FIFO/LIFO or a rolling window) — a defensible, easy-to-explain method
  appropriate at this business's scale, per `specs/PRODUCT-OVERVIEW.md` §11's costing decision.
- A traded product's quantity-on-hand, introduced here, reflects only this feature's purchases.
  Later features (goods shipped to a customer, returns) will further adjust it; presenting a
  full inventory dashboard (stock across all products, cost value of stock, etc.) is explicitly
  out of scope here and belongs to the future Finished Goods Inventory feature — this feature is
  only responsible for correctly recording each purchase's effect on the one product it concerns.
- "Remaining quantity" on a per-unit purchase exists purely so a future feature (recording goods
  shipped to a customer) has a value to consume against — exactly parallel to how 002's
  "remaining weight" exists for the future Production Batches feature. No UI or logic to reduce
  it is part of this feature.
- Manufactured products are never purchased — their stock comes from production batches, a
  separate future feature — so the per-unit purchase product picker only ever offers traded,
  active products.
- No role-based restrictions in this feature: every authenticated internal staff user can
  create, view, edit, and delete any purchase of either mode, consistent with 001/002/003.
- Currency, rounding, and authentication conventions are unchanged from 002/003 (PKR, 2-decimal
  rounding, Supabase Auth session required).
- This feature is limited to purchasing itself; recording goods shipped to a customer (which
  will consume per-unit purchases' remaining quantity and decrease a product's quantity on
  hand), production batches, and the full finished-goods inventory dashboard are explicitly out
  of scope here and belong to later features in the roadmap.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A staff member can record a new per-unit purchase in under 1 minute.
- **SC-002**: Immediately after recording a per-unit purchase, the purchased product's catalog
  entry shows an updated current purchase cost and quantity on hand — never left showing "not
  yet established" once at least one purchase exists.
- **SC-003**: A staff member can view the combined purchase list and distinguish per-kg from
  per-unit entries at a glance, in under 10 seconds.
- **SC-004**: Running totals for a filtered view remain accurate and update with no perceptible
  delay (under 2 seconds), regardless of how many rows are per-kg vs. per-unit.
- **SC-005**: 100% of per-unit purchases' displayed total costs exactly equal quantity × rate
  per unit — no manual override ever causes a discrepancy.
- **SC-006**: Zero regressions — every existing per-kg purchase workflow continues to work
  exactly as it did before this feature shipped.
