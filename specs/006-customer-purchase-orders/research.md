# Research: Customer Purchase Orders

**Feature**: `006-customer-purchase-orders` | **Date**: 2026-09-20

Resolves technical unknowns before design. Infrastructure decisions already made in 001-005
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server, ADR-0002's atomic-multi-table-write pattern, ADR-0003's
signed-URL Storage pattern, ADR-0004's forward-declared-shared-table pattern) carry over unchanged
and are not re-litigated here. Only decisions specific to customer POs are recorded below.

## Decision: `create_customer_po` is a Postgres function; `update_customer_po` is too, but with a per-line upsert instead of delete-then-reinsert

- **Decision**: Creating a PO calls `create_customer_po`, which inserts the `customer_pos` row and
  its `customer_po_lines` rows in one transaction (mirroring `create_customer`'s shape). Editing a
  PO calls `update_customer_po`, which updates the header row, then — for its lines — does a
  **per-line upsert**: for each existing line no longer present in the submitted set, checks it
  isn't locked (`delivered_quantity > 0 or invoiced_quantity > 0`) before deleting it; for each
  submitted line matching an existing line's id where that line is locked, compares only the
  submitted `product_id`/`quantity_ordered`/`uom`/`unit_price` against the stored row and rejects
  the call *only* if one of those four differs — `customer_item_code`/`description` always pass
  through, locked or not; for each submitted line with no id, inserts it as new.
- **Rationale**: FR-002/FR-011 require the header and its lines to always be observed as a
  complete, consistent set (ADR-0002's boundary, same as `create_customer`/`create_supplier`).
  FR-014's edit lock is explicitly per-line ("that line's quantity, unit of measure, price, and
  product resolution become locked") — both per-line, not per-PO, *and* per-field, naming exactly
  four fields, not the whole line. An otherwise-editable PO may, once 007/008 exist, have some
  lines locked and others not, and even a locked line's `customer_item_code`/`description` — purely
  informational, never read by 007/008's own commercial logic — remain editable. 001's and 005's
  delete-then-reinsert shape for child rows (contacts, ship-to addresses, trade-name hints) works
  precisely because none of those child rows can individually become locked; it cannot express
  either kind of partial lock. A per-line upsert with a per-field comparison is the smallest change
  that makes both dimensions of the lock structural rather than a UI-only convention, consistent
  with how this project has consistently pushed absolute correctness rules into the database (e.g.
  005's partial unique index for item codes) rather than trusting application code alone.
  (An earlier draft of this decision collapsed the field-level distinction into "a locked line
  accepts no changes, full stop" — caught and corrected before the migration was applied, since it
  was stricter than FR-014's literal four-field list.)
- **Alternatives considered**: Delete-then-reinsert for lines too (matching 001/005 exactly) —
  rejected because it cannot honor a per-line lock at all, it would need to either delete *every*
  line (violating FR-014 the moment 007/008 exist) or delete *no* lines when any one is locked
  (violating FR-014's implication that unlocked lines on the same PO remain editable). Rejecting
  the entire line update whenever *any* line on the PO is locked (a coarser, per-PO lock) — also
  considered, and simpler to implement, but rejected as contradicting the spec's own wording
  ("**that line's** ... become locked", not "the PO's lines"). Treating a locked line as fully
  frozen to *any* field (a coarser, per-line-but-not-per-field lock — the first version actually
  implemented) — also rejected, for contradicting FR-014's own four-field list; the extra
  complexity of comparing just those four fields is the direct cost of implementing what FR-014
  actually specifies, no more and no less.

## Decision: `set_customer_po_status` is one small Postgres function, not two plain updates

- **Decision**: A single `set_customer_po_status(p_id, p_status, p_user_id)` function handles both
  directions. Reactivating (`'open'`) is an unconditional set, matching 005's
  `setCustomerStatusRecord`. Cancelling (`'cancelled'`) first checks whether any of that PO's
  lines has `delivered_quantity > 0 or invoiced_quantity > 0` and raises an exception if so
  (FR-015), before setting the status.
- **Rationale**: The cancel-direction check reads a second table (`customer_po_lines`) before
  writing the first (`customer_pos.status`); doing the check-then-write as two separate
  `supabase-js` calls from the service layer would reopen the exact TOCTOU gap ADR-0002 already
  closes for other multi-step correctness rules in this project. A single-statement function call
  makes the check-and-write atomic for free, at negligible cost (one small function, not a new
  architectural pattern).
- **Alternatives considered**: Plain `supabase-js` update guarded by a service-layer `SELECT`
  first (check locked lines, then update if none) — rejected for the TOCTOU gap above; in practice
  this feature alone can never actually trigger the gap (no other writer sets
  `delivered_quantity`/`invoiced_quantity` above zero until 007/008 ship), but the function is
  cheap enough that there's no reason to accept a known-fragile pattern now and revisit it later.

## Decision: destination/ship-to is captured as free text on the PO, never a live FK to `customer_ship_to_addresses`

- **Decision**: `customer_pos.destination_text` is plain text — either typed fresh, or, when
  submitted blank, filled server-side (in `createCustomerPORecord`/`updateCustomerPORecord`, per
  the decision immediately below) from the customer's current billing address — never a stored
  `ship_to_address_id` foreign key.
- **Rationale**: Found while reviewing 005's `update_customer`: it deletes and re-inserts every
  `customer_ship_to_addresses` row on every customer edit (research.md's own documented shape),
  which means those rows' ids are not stable across edits. A live FK from a PO to a specific
  ship-to address row would silently break (orphan or cascade-delete, depending on the FK clause)
  the next time staff edits that customer's addresses in 005 — entirely unrelated to anything
  006 did. Beyond the technical fragility, a PO is itself a historical document: it should show
  the destination as it was **at order time**, the same way a printed PO or invoice would, not
  whatever the customer's address happens to be today. Free text captures that correctly by
  construction.
- **Alternatives considered**: A `ship_to_address_id` FK with `on delete set null` — rejected: it
  wouldn't just risk breaking, it would *silently* null out a real historical field on every
  unrelated customer edit, which is worse than never having the reference. Changing 005's
  `update_customer` to preserve ship-to-address ids across edits instead — rejected as out of
  scope for this feature (a 005 change, not a 006 one) and unnecessary once free text solves the
  actual requirement (FR-001's "destination/ship-to reference" only needs to be *displayed*
  accurately, per spec Acceptance Scenario 4 — it doesn't need to stay live-linked).

## Decision: a blank destination defaults to the customer's billing address in the TypeScript service layer, not a client-side UI copy

- **Decision**: `createCustomerPORecord`/`updateCustomerPORecord` (`lib/customer-pos/service.ts`)
  check whether the submitted `destinationText` is blank; if so, they fetch the selected
  customer's `billing_address_*` columns (a plain read against 005's `customers` table) and format
  them into the string passed to `create_customer_po`/`update_customer_po`'s `p_destination_text`
  parameter. The Postgres functions themselves never apply this default — they just store whatever
  text they're given.
- **Rationale**: An earlier draft of this document described the default as "copied in by the UI,"
  which would require the create/edit form to fetch a customer's billing address as a live
  suggestion the moment a customer is picked — an extra client-server round trip (005's
  `getCustomer` is a Server-Component-only read, not exposed as a callable action, per its own
  contracts.md) for a value that's simpler and equally correct to resolve once, server-side, at
  the exact moment it's needed (create or update). This keeps the default in one place, testable
  without any UI interaction, and avoids adding a new client-callable read just for a fallback
  value.
- **Alternatives considered**: Fetching the customer's billing address client-side when the
  customer picker changes, and pre-filling the destination field with it (the literal original
  wording) — rejected as unnecessary complexity for a fallback that only matters when the field is
  left empty at submission; a service-layer default achieves the same visible outcome (spec
  Acceptance Scenario 4 only requires the *saved* destination to display accurately, not that the
  form previews it before submission).

## Decision: `customer_pos.trade_name_id` and `customer_po_lines.product_id` remain real foreign keys

- **Decision**: Unlike destination, the trade-name-bills-under field and each line's resolved
  product are stored as real FKs (`trade_names(id)`, `products(id)`), no cascade delete.
- **Rationale**: Neither `trade_names` (004) nor `products` (003) rows are ever hard-deleted or
  replaced with new ids on edit — only status changes (active/inactive) — so a stored id stays
  valid indefinitely, unlike `customer_ship_to_addresses`' delete-and-reinsert child-row shape.
  This is the same reasoning 005 already used for `customer_trade_names.trade_name_id`.
- **Alternatives considered**: None seriously — this is the default, safe case; the destination
  decision above is the one that needed scrutiny.

## Decision: a PO line's `customer_item_code` is a plain snapshot, not a live reference to its resolving mapping row

- **Decision**: `customer_po_lines.customer_item_code` is free text, populated from whatever the
  staff member typed/selected at entry time. There is no foreign key from a PO line back to the
  `customer_product_mappings` row that resolved it.
- **Rationale**: 005 allows a mapping to be edited or removed at any time (FR-015 of 005). If a PO
  line stored a live reference to the mapping row, editing or removing that mapping later would
  retroactively change or orphan a historical PO's data — which must never happen (spec Edge
  Cases: resolution still succeeds even if the product it resolved to is later deactivated;
  by the same logic, an already-saved line must not depend on the mapping surviving unchanged).
  `product_id` is the one part of the resolution that *does* need to survive as a real reference
  (it's what the PO line "is"), but the mapping identity and its default price are pre-fill inputs
  that need not be retraceable after the fact — the price/UOM that mattered is already snapshotted
  onto the line itself (FR-006).
- **Alternatives considered**: Storing `resolved_from_mapping_id` alongside `product_id` for
  traceability — rejected as unneeded complexity: nothing in the spec's Success Criteria or
  Acceptance Scenarios asks "which mapping resolved this line," only that resolution succeeded and
  the right product/price were captured.

## Decision: `resolveCustomerItemCode` is a read-only helper, not part of the create/update RPC

- **Decision**: `lib/customer-pos/item-code-resolution.ts` exposes
  `resolveCustomerItemCode(customerId, itemCode)`, a plain `supabase-js` select against 005's
  `customer_product_mappings` (`eq('customer_id', ...).eq('customer_item_code', ...)`). It is
  called from the client (via a Server Action) as the staff member types a line's item code, purely
  to pre-fill `product_id`/UOM/price on that line in the form. It is never called again inside
  `create_customer_po`/`update_customer_po` to "re-resolve" or validate a line at save time.
- **Rationale**: FR-006 requires the entered price to be authoritative "whether or not it matches
  ... or was entered with no mapping default available" — re-running resolution at save time would
  reintroduce exactly the coupling FR-006 rules out (what if the mapping changed between pre-fill
  and save? what if it was deleted?). The line's `product_id`, UOM, price, and description are
  submitted as already-decided values; resolution is purely a form-filling convenience that
  happens once, client-side, before submission.
- **Alternatives considered**: Passing only the raw `customer_item_code` to the create/update RPC
  and re-resolving `product_id` server-side — rejected: this would silently reject or misresolve a
  PO line the moment a code stops matching a mapping (e.g. the mapping was deleted after the form
  loaded), directly violating FR-007's "an unresolved mapping never blocks PO capture."

## Decision: a PO's total value is summed in TypeScript over its fetched lines, not a database aggregate

- **Decision**: `getCustomerPO`/`listCustomerPOs` fetch each PO's lines (a handful per PO — spec
  Assumptions/Scale) and compute `total = sum(quantity_ordered * unit_price)` in the service layer,
  the same way each line's own total is computed. No stored or generated "PO total" column exists
  on `customer_pos`.
- **Rationale**: Unlike 005's ledger balance (potentially thousands of rows per customer over
  years, hence a database-side `SUM`), a PO has, per spec Assumptions, typically 1-10 lines — an
  amount trivial to sum after an already-necessary fetch of those same rows for display. Introducing
  either a stored/cached total (redundant, driftable) or a database-side aggregate query (an extra
  round-trip for no measurable benefit at this scale) would be exactly the kind of premature
  optimization `specs/PRODUCT-OVERVIEW.md`'s Cross-Cutting Technical Requirements already warns
  against ("design for clarity and correctness, not scale").
- **Alternatives considered**: A `numeric` generated column on `customer_pos` summing its lines —
  not possible in Postgres (a generated column cannot aggregate across a child table); a database
  view or a `SUM(...) ... GROUP BY po_id` query — rejected as unnecessary indirection for a value
  that's cheaper to fold into the same query that already fetches the lines for display.

## Decision: PO attachments are a separate table + Storage bucket, uploaded/linked as a follow-up step, not inside the create/update RPC

- **Decision**: `customer_po_attachments` (id, po_id FK cascade, storage_path, file_name,
  content_type, uploaded_at, uploaded_by) is a plain 1:N table. `uploadCustomerPOAttachment(poId,
  file)` uploads the file to the new `customer-po-documents` bucket (private, signed-URL reads,
  mirroring `lib/trade-names/storage.ts` exactly) and inserts one row — called *after*
  `create_customer_po` has already returned a real `poId`, not bundled into that function.
- **Rationale**: A file upload to Supabase Storage cannot happen inside a Postgres function body
  (Storage is a separate API, not a Postgres extension this project uses transactionally). FR-009
  already establishes that a PO is fully valid with zero attachments, so there's no atomicity
  requirement to protect here the way there is for header+lines: a PO that saved successfully but
  had one attachment upload fail is still a complete, correct PO record — the failure is
  independently retryable (staff re-attaches), not a partial-invalid-state risk. This mirrors
  004's own upload-then-link ordering for signature/stamp assets (research.md's "three-step
  ordering").
- **Alternatives considered**: Passing file bytes into the Postgres function as a parameter and
  writing to Storage from `plpgsql` — not supported by Supabase's Storage API (no SQL-level
  access); doing the Storage upload before creating the PO row, then referencing a
  not-yet-associated path — rejected as building a dangling-file cleanup problem for zero benefit,
  when uploading after the PO exists has a real, stable `poId` to key off from the start.

## Decision: no attachment-removal action in this feature

- **Decision**: This feature adds no `removeCustomerPOAttachment` action. A wrong attachment is
  addressed by adding a corrected one, not by deleting the mistaken upload.
- **Rationale**: FR-009 only requires that zero-or-more attachments can be added; nothing in the
  spec's Acceptance Scenarios or Success Criteria requires removing one. Adding removal now would
  be exactly the kind of scope the project's guidelines ask to avoid ("don't add features beyond
  what the task requires"). If this turns out to matter in practice, it's a small, independent
  addition later (single-table delete, no RPC), not a design decision that needs to be made now.
- **Alternatives considered**: Building it anyway "for completeness" — rejected per the above.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001-005) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Supabase Postgres — three new tables (`customer_pos`, `customer_po_lines`, `customer_po_attachments`); three new Postgres functions; a second private Storage bucket (`customer-po-documents`) |
| Testing | Vitest + Testing Library (same intended stack as 001-005; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds one module, extends one existing service by one function) |
| Performance Goals | Trivial at a few hundred POs/year, 1-10 lines each; PO total summed in TypeScript over already-fetched lines, no database aggregate or cached column |
| Constraints | No client-side Postgres access; PO header+lines atomic via Postgres function (per-line upsert, not delete-then-reinsert, to honor FR-014's per-line lock); PO number unique per customer via DB constraint; destination captured as a text snapshot, never a live FK; item code/description are unparsed free text; an attachment is never required |
| Scale/Scope | Single internal business, a few hundred POs/year, 1-10 lines per PO typically, no multi-tenancy |
