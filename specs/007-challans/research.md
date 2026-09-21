# Research: Challans

**Feature**: `007-challans` | **Date**: 2026-09-21

Resolves technical unknowns before design. Infrastructure decisions already made in 001-006
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server, ADR-0002's atomic-multi-table-write pattern, ADR-0003's
signed-URL Storage pattern, ADR-0004's forward-declared-shared-table pattern) carry over unchanged
and are not re-litigated here. The two architectural questions already resolved with the user
before this spec was finalized — creating `inventory_movements` now, and making it the sole
source of truth for `products.quantity_on_hand` — are restated here only to the depth needed to
turn them into concrete schema/function decisions; their business rationale lives in
`spec.md`'s Assumptions and FR-011.

## Decision: `inventory_movements` gets the master spec's literal shape, created by this feature

- **Decision**: `inventory_movements (id, product_id, qty_delta, reason, source_type, source_id,
  movement_date, created_at, created_by)` — insert-only, no update/delete path anywhere in this
  feature, matching `ledger_entries`' immutability precedent (005 FR-013) and ADR-0004's stated
  principle that a shared table's shape comes from the master spec, not from whichever feature
  happens to write it first. `reason` and `source_type` are free text (no `CHECK`), exactly like
  `ledger_entries.source_type`, so 010-production-batches and any future manual-adjustment
  capability can introduce new values without a migration to widen anything.
- **Rationale**: `specs/PRODUCT-OVERVIEW.md` already specifies this exact column set under
  "Shared-table decisions." ADR-0004 (written during 005's plan) already asserted this table would
  exist by now, created by 003b — that assertion was wrong (003b never built it; see
  `spec.md` Assumptions and the project memory this session recorded). This feature is the actual
  first writer and should be recorded as such, correcting ADR-0004's factual claim rather than
  leaving two contradictory records of "who created this table."
- **Alternatives considered**: None on the shape itself — ADR-0004's principle (master-spec shape,
  not the first writer's own invention) already settled this; the only open question was *when*
  and *by whom*, resolved with the user (spec.md Assumptions).

## Decision: `recompute_product_purchase_stats()` keeps computing `current_purchase_cost`, but a product's `quantity_on_hand` is redefined to be `SUM(inventory_movements.qty_delta)`, maintained by a new shared helper and written to by every event that moves stock

- **Decision**: Split what was one overloaded function into two concerns:
  1. `recompute_product_purchase_stats(p_product_id)` — **unchanged shape**, still fully
     recomputes `current_purchase_cost` as the weighted average over current per-unit purchase
     rows. It **stops** writing `quantity_on_hand`.
  2. A new `recompute_product_quantity_on_hand(p_product_id)` — sets
     `products.quantity_on_hand = coalesce((select sum(qty_delta) from inventory_movements where
     product_id = p_product_id), 0)`. Called after any insert into `inventory_movements` for that
     product.
  Each unit-mode purchase mutation now also writes its own movement, keyed to the purchase row, so
  the ledger stays insert-only even when a purchase is corrected:
  - `record_unit_purchase`: after inserting the purchase row, inserts one movement
    `(product_id, qty_delta = +quantity_units, reason = 'Purchase recorded', source_type =
    'purchase', source_id = purchase.id, movement_date = purchase_date)`, then calls
    `recompute_product_quantity_on_hand`.
  - `update_unit_purchase`: inserts one **net-delta** movement — `qty_delta = (new
    quantity_units) - (old quantity_units)`, `reason = 'Purchase updated'`, same `source_type`/
    `source_id` pattern (and, if the purchase's `product_id` itself changed, a full reversal on the
    old product plus a full addition on the new one instead of a single net-delta row) — then
    recomputes quantity-on-hand for every product touched.
  - `delete_unit_purchase`: inserts one reversing movement (`qty_delta = -quantity_units`,
    `reason = 'Purchase deleted'`) before the purchase row is deleted, then recomputes.
  This is implemented as a **new migration** (`0007_challans.sql`) that `CREATE OR REPLACE`s all
  four existing functions from `0003_traded_purchases.sql` — the applied `0003_traded_purchases.sql`
  file itself is never edited, matching how every other cross-feature schema change in this project
  has been made (e.g. 006 never edited 001's migration to add FKs to new tables).
- **Rationale**: This is the resolution the user chose (spec.md FR-011) after the collision was
  found: leaving `recompute_product_purchase_stats` as-is would silently reset `quantity_on_hand`
  to a purchase-only figure the next time any purchase for a product with Challan activity was
  edited. Net-delta movements (rather than one reversing + one new row per edit) keep the ledger
  proportional to actual purchase edits, which are rare and low-volume at this business's scale,
  while still never mutating a previously-written row.
- **Alternatives considered**: Editing `0003_traded_purchases.sql` in place — rejected; Postgres
  migrations in this project are append-only artifacts of what was actually applied to a real
  database over time, exactly like every other migration file here. Making
  `recompute_product_purchase_stats` itself insert the movement (instead of the three
  `record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase` callers) — rejected because
  that function is a *pure recompute* with no memory of what changed (it re-derives from a full
  table scan), so it cannot express a net-delta movement; only the three mutation functions know
  the before/after values.

## Decision: `challan_lines` snapshots `product_id`, `uom`, and `unit_price` from the PO line at creation time; `customer_item_code` ("Article" on the printed document) is resolved live

- **Decision**: A Challan line stores its own `product_id`, `uom`, and `unit_price`, copied from
  the referenced `customer_po_lines` row at the moment the Challan is created — never re-read from
  the PO line afterward, including at acceptance (where `unit_price` drives the ledger credit,
  FR-012) and at print time. The printed "Article" column, by contrast, resolves
  `customer_po_lines.customer_item_code` live via `po_line_id` at read/print time, with no
  snapshot.
- **Rationale**: 006's own `update_customer_po` only locks a PO line's `product_id`/
  `quantity_ordered`/`uom`/`unit_price` once that line's `delivered_quantity` is nonzero — but
  `delivered_quantity` stays `0` until a Challan referencing it is *accepted* (FR-009), not merely
  issued. That leaves a real window: a Challan can sit "Issued" for days waiting for its signed
  copy, during which the PO line it references is still fully editable in 006. Resolving
  `unit_price`/`uom`/`product_id` live at acceptance time would mean the ledger credit or the
  recorded product could silently diverge from what was actually printed and physically sent to
  the customer. This is the same category of risk as the `quantity_on_hand` collision the user
  caught — a later feature's edit silently invalidating an earlier feature's already-issued
  document — so it gets the same treatment: snapshot the fields that carry financial or physical
  consequence. `customer_item_code` is the one exception: 006 itself documents this field as
  "purely informational" and keeps it editable even on *locked* PO lines, so there is no
  correctness reason to snapshot it here either — resolving it live is simpler and matches 006's
  own stance on its significance.
- **Alternatives considered**: Resolving everything live via `po_line_id` (the naive join) —
  rejected for the divergence risk above. Snapshotting `customer_item_code` too, for uniform
  treatment — rejected as unnecessary rigor for a field 006 itself treats as always-editable
  informational text; snapshotting it would mean a staff member's deliberate typo fix in 006 never
  shows up on a Challan created before the fix, which is the opposite of what "purely
  informational" is meant to allow.
- Because of this snapshot, `challan_lines.po_line_id` exists purely to (a) validate the
  remaining-quantity rule at creation/edit time and (b) know which PO line's `delivered_quantity`
  to increment at acceptance — it carries no `on delete cascade`, so the ordinary foreign-key
  default (`RESTRICT`) already prevents a referenced `customer_po_lines` row from ever being
  deleted while a Challan (issued, accepted, or voided) still points to it, with no extra code
  needed in this feature or in 006.

## Decision: `update_challan` fully replaces its lines (delete-then-reinsert), not a per-line upsert like `update_customer_po`

- **Decision**: While a Challan is "Issued," editing it deletes and reinserts its `challan_lines`
  wholesale, re-validating remaining-quantity and re-snapshotting `product_id`/`uom`/`unit_price`
  for every submitted line — matching 001/003b/004/005's simpler child-row shape, not 006's
  per-line-upsert-with-lock shape.
- **Rationale**: 006 needed a per-line upsert specifically because FR-014's lock is scoped to
  *individual* PO lines — some lines on one PO can be locked while others aren't. A Challan has no
  equivalent partial state: FR-013 makes the *entire* Challan read-only the moment it's accepted,
  and while "Issued" every one of its lines is uniformly editable. There is nothing for a per-line
  lock check to protect against here, so the extra complexity 006 needed doesn't apply.
- **Alternatives considered**: Mirroring 006's per-line upsert anyway "for consistency" — rejected
  per this project's smallest-viable-diff default; matching a pattern's *purpose* (protect a
  partial lock) matters more than matching its shape when the partial lock doesn't exist here.

## Decision: `accept_challan` is one Postgres function covering every FR-009 through FR-012 effect

- **Decision**: A single `accept_challan(p_id, p_user_id)` function, run once per acceptance,
  performs in order: (1) status/PO-cancellation guard checks; (2) the "at least one line has
  positive accepted quantity" check (FR-008); (3) the "every shortfall line has a disposition"
  check (FR-007); (4) one `inventory_movements` insert per line for its accepted (leaving) quantity
  and, where disposed "return to inventory," one more for the returned shortfall (FR-010); (5)
  `recompute_product_quantity_on_hand` for every distinct product touched; (6) one
  `customer_po_lines.delivered_quantity` increment per line (FR-009); (7) the conditional ledger
  credit, computed once as `sum(accepted_quantity * challan_lines.unit_price)` across the whole
  Challan, gated on the PO's customer's `issues_performa_invoice` flag (FR-012); (8) the status
  flip to `'accepted'` with `accepted_at`/`accepted_by`.
- **Rationale**: Every one of these steps must be observed together or not at all — a Challan
  that's "accepted" with only some of its stock/ledger/PO-line effects posted would be a worse
  data-integrity failure than the collision this session already caught once. This is ADR-0002's
  boundary applied to a state-transition function rather than a create/update function, which the
  project has no precedent for yet but is a direct extension of the same principle (push
  correctness into one atomic database call, never split across sequential `supabase-js` round
  trips).
- **Movement dates**: the accepted quantity's "leaving" movement uses the Challan's own
  `challan_date` (when the goods physically left, which is what the printed document already
  states), while a "returned to inventory" shortfall movement uses the current date (when the
  return is actually being confirmed, which may be materially later than `challan_date`). A
  "write off" shortfall writes no movement at all (FR-010) — the loss is represented by the
  absence of a return, not a recorded negative entry.
- **No re-validation of the remaining-quantity rule at acceptance**: `accept_challan` does not
  re-check that accepting won't push a PO line's cumulative `delivered_quantity` past its
  `quantity_ordered`. This matches spec.md's own Edge Cases entry, which documents two
  Challans-in-flight against the same line as a deliberate, accepted simplification appropriate to
  this business's low, manual transaction volume — not a gap this plan needs to close.
- **Alternatives considered**: Splitting acceptance into smaller functions (e.g. one for
  inventory, one for the PO-line rollup, one for the ledger) called sequentially from the service
  layer — rejected for reopening the same TOCTOU/partial-write risk ADR-0002 already exists to
  close, for no benefit (none of these steps is independently useful without the others).

## Decision: the printed/exportable Challan is a dedicated Server Component route with a print stylesheet, not a new PDF-generation dependency

- **Decision**: `app/challans/[challanId]/print/page.tsx` — a standalone route **outside** the
  `(dashboard)` route group (so it renders with none of the dashboard's nav chrome, no CSS fighting
  needed to hide it), gated by the same `getCurrentUser()`/`redirect("/login")` check
  `(dashboard)/layout.tsx` already uses (duplicated here in three lines, since this route
  deliberately opts out of that layout). It renders the Challan's letterhead, line table, totals,
  signature/stamp images, and signature lines as plain HTML/CSS with `@media print` rules (A4
  sizing, hidden non-print chrome), and staff use the browser's native Print → Save as PDF for an
  exportable file.
- **Rationale**: This is the first feature in the roadmap that must actually *generate* a
  formatted document (004 only stores images; 006 only stores *uploaded* PDFs, never generates
  one) — squarely the kind of "first real writer of a reusable pattern" ADR-0003 (Storage) and
  ADR-0004 (shared tables) already exist for, so it's surfaced in this plan's Constitution Check as
  an ADR candidate rather than decided silently. At this project's scale (a handful of internal
  staff, occasional document printing, no automated bulk-PDF requirement, deployed on Vercel with
  serverless function constraints) a server-rendered print stylesheet needs zero new dependencies,
  zero new infrastructure (no headless-browser rendering service, no PDF-library bundle size), and
  is trivially reusable by 008-Performa-Invoicing's own printed document later.
- **Alternatives considered**: A React-to-PDF library (e.g. `@react-pdf/renderer`) — rejected as a
  new dependency and a second, parallel layout system (its own primitives, not real HTML/CSS) for
  a document simple enough that CSS print rules already handle it correctly. Server-side headless-
  browser rendering (Puppeteer/Playwright to PDF) — rejected as materially heavier
  infrastructure (large serverless bundle, cold-start cost, timeout risk on Vercel) for no benefit
  over a browser's own built-in print-to-PDF, at this business's internal, low-volume usage.
  `pdf-lib`/`jsPDF` (manual, imperative page-layout code) — rejected as more code and more fragile
  than describing the same layout in HTML/CSS, especially for image placement (signature/stamp).

📋 **Architectural decision detected**: generating printed business documents via a dedicated
Server Component route + `@media print` CSS, with no PDF-generation library, established as the
project-wide pattern for every future feature that must produce a formatted printed document (next:
008-Performa-Invoicing) — Document reasoning and tradeoffs? Run `/sp.adr
printed-documents-via-server-rendered-print-routes`. Not created automatically; waiting for user
consent per project policy.

## Decision: the scanned signed copy is two nullable columns on `challans` itself, not a child attachment table

- **Decision**: `signed_copy_storage_path`, `signed_copy_file_name`, `signed_copy_content_type`,
  `signed_copy_uploaded_at`, `signed_copy_uploaded_by` — all nullable, directly on `challans`. A
  new private bucket `challan-attachments` (ADR-0003 pattern, same shape as
  `lib/trade-names/storage.ts`/`lib/customer-pos/storage.ts`). Re-uploading follows 004's
  established three-step ordering: upload the new file, point the row at it, best-effort delete
  the old object.
- **Rationale**: 006's `customer_po_attachments` is a child table because a PO can have zero-to-
  *many* attachments (FR-009 of 006). FR-006 of this feature caps a Challan at zero-or-*one*
  scanned copy — a genuinely different cardinality, and a child table for a strict 0-or-1
  relationship would be unnecessary indirection (an extra join, an extra table, for a value that's
  simpler as a nullable column set on the row it belongs to).
- **Alternatives considered**: Mirroring 006's child-table shape regardless, for surface
  consistency — rejected per the same smallest-viable-diff reasoning as the `update_challan`
  decision above: matching an unrelated feature's *shape* isn't a goal when the underlying
  cardinality differs.

## Decision: manufactured-product Challans may not be acceptable until 010-production-batches ships or an opening movement is recorded by other means — an accepted, pre-existing roadmap limitation, not something this feature fixes

- **Decision**: This feature does not add any "manually adjust inventory" capability. The
  `inventory_movements.reason`/`source_type` columns are free text specifically so such a
  capability (or a one-off manual insert) can be added later without a migration — matching
  `specs/PRODUCT-OVERVIEW.md`'s own stated purpose for including this hedge "from day one." Nothing
  further is built here.
- **Rationale**: Manufactured products' `quantity_on_hand` has had no writer at all until this
  point (010-production-batches is still "Planned"). A Challan accepted against a manufactured
  product before any stock — from a production batch or a manual entry — exists will attempt a
  negative `quantity_on_hand`, which the existing `check (quantity_on_hand >= 0)` constraint
  (003b) will correctly reject with a database error. This is a real, user-facing limitation during
  the window between this feature shipping and 010 shipping, but it is the master spec's own
  documented, accepted tradeoff for the agreed roadmap ordering (`specs/PRODUCT-OVERVIEW.md`'s
  "Shared-table decisions" section names this exact window explicitly) — not a new gap introduced
  by this feature, and not something in scope for it to solve with a new UI.
- **Alternatives considered**: Building a minimal manual-adjustment action now, to unblock this
  window — rejected as unrequested scope; neither the spec nor the master roadmap asks this
  feature to build it, only to not preclude it.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001-006) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies (printed document uses browser-native print, no PDF library) |
| Storage | Supabase Postgres — new `challans`, `challan_lines`, `inventory_movements` tables; new/redefined Postgres functions (`create_challan`, `update_challan`, `void_challan`, `accept_challan`, `recompute_product_quantity_on_hand`, and a `CREATE OR REPLACE` of 003b's `record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase`/`recompute_product_purchase_stats`); a one-time backfill of opening `inventory_movements` for existing traded products; a third private Storage bucket (`challan-attachments`) |
| Testing | Vitest + Testing Library (same intended stack as 001-006; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds one module, extends 003b's migration-owned functions via a new migration, no new service or deployable) |
| Performance Goals | Trivial at this feature's scale (a few hundred Challans/year); a Challan's total is summed in TypeScript over its (handful of) already-fetched lines, matching 006's PO-total precedent |
| Constraints | No client-side Postgres access; Challan header+lines atomic via Postgres functions (ADR-0002); `accept_challan` posts every FR-009–FR-012 effect atomically or not at all; `challan_number` unique per trade name via a DB constraint; `challan_lines` snapshots `product_id`/`uom`/`unit_price` at creation, never re-reads them live; `quantity_on_hand` is written only by `recompute_product_quantity_on_hand`, never directly, from this feature onward |
| Scale/Scope | Single internal business, a few hundred Challans/year, typically 1-10 lines per Challan, no multi-tenancy |
