# Research: Performa Invoicing

**Feature**: `008-performa-invoicing` | **Date**: 2026-09-22

Resolves technical unknowns before design. Infrastructure decisions already made in 001-007
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server, ADR-0002's atomic-multi-table-write pattern, ADR-0003's
signed-URL Storage pattern, ADR-0006's server-rendered print-route pattern) carry over unchanged
and are not re-litigated here. Every business-level ambiguity (PO-line vs. Challan-line reference,
double-invoicing guard, multi-PO invoices, numbering format, posting stage, ledger-credit basis,
tax granularity, reversal scope) was already resolved with the user before the spec was written —
see `history/prompts/008-performa-invoicing/0001-align-performa-invoicing-data-model.misc.prompt.md`
and `spec.md`'s Assumptions. This file only turns those already-resolved decisions into concrete
schema/function choices, plus the smaller technical unknowns the spec itself doesn't need to
settle (amount-in-words convention, entry-point UX, attachment cardinality).

## Decision: no update, void, or accept function exists for a Performa Invoice — only `create_performa_invoice`

- **Decision**: Unlike Challans (`create_challan`/`update_challan`/`void_challan`/`accept_challan`,
  four functions across a three-state lifecycle), this feature ships exactly one mutation:
  `create_performa_invoice`. There is no edit path, no void path, and no separate posting step —
  FR-007's single-stage decision means creation already is the terminal, fully-posted state.
- **Rationale**: Directly follows spec.md's Assumptions ("creating a Performa Invoice is a single,
  atomic, immediate action... there is no separate issue vs. post stage"). Building an edit or void
  path for a record the spec defines as permanently read-only from the moment it exists (FR-009)
  would be unrequested scope with no acceptance scenario asking for it.
- **Alternatives considered**: Mirroring Challan's issued→accepted shape "for consistency" —
  rejected; matching a pattern's *purpose* (a lifecycle with a real intermediate state) matters more
  than matching its shape when 008 has no such intermediate state by design (already settled with
  the user, not re-opened here).

## Decision: `performa_invoices`/`performa_invoice_lines` are insert-only, matching `ledger_entries`' shape, not `customer_pos`/`challans`' editable shape

- **Decision**: `performa_invoices` gets `created_at`/`created_by` only — no `updated_at`,
  `updated_by`, or update trigger, and no update/delete path in any Server Action or service
  function. `performa_invoice_lines` gets `created_at` only (not even a `created_by`, since a
  line's authorship is already the invoice's).
- **Rationale**: This table has no editable window at all — the immutability that Challans only
  reach *after* acceptance (FR-013 there) is this table's condition from row zero (FR-009 here).
  Giving it `updated_at`/an update trigger the way every other editable header table in this project
  has (`0001_init.sql`'s `set_updated_at()`) would advertise a mutation path that must never be
  used. `ledger_entries` (005) is the closer precedent: a financial-posting-event table that is
  insert-only by construction, not by convention.
- **Alternatives considered**: Reusing the shared `set_updated_at()` trigger on `performa_invoices`
  "for consistency with every other table" — rejected as actively misleading given FR-009's
  guarantee; a column and trigger that must structurally never fire is worse than not having it.

## Decision: gross/tax/net totals are computed at read time from lines + the invoice's stored `tax_rate`, never stored as columns

- **Decision**: `performa_invoices` stores exactly one financial-shape column beyond its
  identifiers: `tax_rate`. Gross total (`sum(invoiced_quantity * unit_price)` over the invoice's
  lines), tax amount (`gross_total * tax_rate / 100`), and net total (`gross_total + tax_amount`)
  are computed in TypeScript at read time over the invoice's already-fetched lines — the same
  pattern 006 uses for a PO's total and 007 uses for a Challan's total.
- **Rationale**: Because `performa_invoice_lines` snapshots `unit_price` at creation and is never
  editable afterward (FR-009), and `tax_rate` is likewise frozen at creation, a read-time
  recomputation can never diverge from what was actually posted — there is no edit path that could
  cause drift, unlike a hypothetical editable-lines scenario. Storing derived totals as columns
  would be redundant data with no correctness benefit, breaking this project's established
  "computed, not stored" convention for the same category of value (spec.md's own PRODUCT-OVERVIEW.md
  citation: "Balance is always a computed running total, never typed by hand").
- **The one number that IS stored independently**: the `ledger_entries` row `create_performa_invoice`
  inserts carries its own `amount` column, computed once at creation time using the exact same
  formula. This is not redundant with the "don't store totals" decision above — `ledger_entries` is
  a *separate*, already-established insert-only ledger (005 FR-013) that must carry its own value
  regardless of what any other table computes, exactly as Challan's ledger credit already does
  (007 FR-012).
- **Alternatives considered**: Storing `gross_total`/`tax_amount`/`net_total` as generated or
  plain columns on `performa_invoices` for defensive redundancy — rejected as unneeded complexity
  given the immutability guarantee above already makes recomputation provably safe, and this
  project has no precedent for storing a total anywhere it can be trivially and safely recomputed.

## Decision: `performa_invoice_lines` snapshots `product_id`, `uom`, `unit_price` from the PO line at creation time, exactly like `challan_lines`

- **Decision**: Same snapshot shape as 007's `challan_lines` (data-model.md), for the same reason —
  never re-read live afterward, including at print time.
- **Rationale**: Even though a PO line's `unit_price`/`product_id`/`uom` are already locked by 006
  once `delivered_quantity > 0` (and invoicing only ever targets lines that already have delivered
  quantity, FR-003), snapshotting here is still correct and consistent: it makes the invoice line
  self-contained and independently auditable without relying on a live join into a table this
  feature doesn't own, matching the same "financial or physical consequence gets snapshotted"
  principle 007's research.md already established. `customer_item_code` ("Article," if shown on the
  printed invoice) is resolved live via `po_line_id → customer_po_lines.customer_item_code`, same
  as 007 — it remains editable informational text under 006's own rules regardless of invoicing.
- **Alternatives considered**: None beyond what 007 already settled — this is a direct reapplication
  of an already-decided pattern, not a new evaluation.

## Decision: `performa_invoice_attachments` is a child table (zero-to-many), not nullable columns on the header

- **Decision**: A separate `performa_invoice_attachments` table, one row per uploaded GST Sales Tax
  Invoice PDF, `on delete cascade` from `performa_invoices` — shaped like 006's
  `customer_po_attachments`, not like 007's single-nullable-column-set `signed_copy_*` shape.
- **Rationale**: FR-011 explicitly allows "zero or more" GST invoice files per Performa Invoice —
  genuinely open-ended cardinality (a corrected/re-issued GST invoice might need to sit alongside an
  earlier one for audit purposes), unlike Challan's strict zero-or-one scanned copy. This is exactly
  the cardinality distinction 007's own research.md already used to justify Challan's opposite
  choice — applied here in the other direction.
- **Alternatives considered**: A single nullable `gst_invoice_storage_path` column set (007's
  shape) — rejected, since it could not represent more than one attached file without a future
  migration, and the spec explicitly says "zero or more," not "zero or one."

## Decision: amount-in-words uses the South Asian numbering convention (Hundred / Thousand / Lakh / Crore), implemented as a small local utility with no new dependency

- **Decision**: A pure `amountInWords(amount: number): string` function in
  `lib/performa-invoices/number-to-words.ts`, grouping digits as Ones/Tens/Hundreds/Thousands/
  Lakhs/Crores (the convention used on Pakistani business documents), rendering the net total's
  rupees in words followed by "Rupees" and, if the amount has a non-zero paisa component, "and ...
  Paisa," ending in "Only" — no new npm dependency.
- **Rationale**: Every dependency this project has added so far has been justified by a real gap
  (ADR-0006 rejected a PDF library for the same reason); a number-to-words converter is a
  self-contained, well-understood ~50-line algorithm with no meaningful library-quality difference
  from writing it directly, and pulling in a third-party package for it would be the first
  dependency in this project added for a problem this small. The South Asian grouping (not the
  international Million/Billion short scale) matches how amounts are actually written out on real
  Pakistani invoices and matches this business's own domain (NTN/GST-registered, PKR-only).
- **Alternatives considered**: An npm package (e.g. a generic "number to words" library) — rejected
  as an unnecessary dependency for this scale of logic, and most such packages default to the
  international short scale, which would need overriding anyway. Reusing a hypothetical existing
  utility — none exists in this codebase; this is a genuinely new, self-contained addition.

## Decision: the entry point for creating an invoice is a dedicated customer-first flow, not a link from an existing PO's detail page

- **Decision**: `app/(dashboard)/performa-invoices/new/page.tsx` starts with a customer picker
  restricted to customers flagged "Issues Performa Invoice" = Yes, then lets staff select one or
  more of that customer's open POs and, per selected PO, the lines with invoiceable quantity. No
  change is made to `app/(dashboard)/customer-pos/[poId]/page.tsx` (006/007's PO detail page).
- **Rationale**: 007 added a "Create Challan" shortcut link on the PO detail page because a Challan
  is always scoped to exactly one PO — a natural, single-PO jumping-off point. An invoice can span
  multiple POs of the same customer (User Story 2), so anchoring the entry point to one specific PO
  doesn't generalize the same way; a customer-first picker is the natural shape for "gather
  everything invoiceable for this customer right now." This keeps the diff smaller (007's own PO
  detail page needs no changes) while still fully satisfying every acceptance scenario.
- **Alternatives considered**: Adding a "Create Performa Invoice" link on the PO detail page,
  pre-selecting that one PO and allowing more to be added afterward on the create form — a
  reasonable secondary convenience, but not required by any acceptance scenario and adds a second
  entry point to maintain; deferred as an easy follow-up rather than built speculatively now.

## Decision: `create_performa_invoice` validates each line's PO in-function (customer match, non-cancelled, remaining-invoiceable-quantity), performing every effect atomically, same shape as `accept_challan`

- **Decision**: One Postgres function, run once per invoice creation:
  1. Validates the customer exists and `issues_performa_invoice = true` (`CUSTOMER_NOT_INVOICE_ELIGIBLE`
     otherwise — FR-001/FR-008).
  2. Validates the trade name exists (`TRADE_NAME_NOT_FOUND`).
  3. For each submitted line: validates its `po_line_id`'s parent PO belongs to the invoice's
     customer and is not cancelled (`PO_LINE_WRONG_CUSTOMER`, `PO_CANCELLED`); rejects a `po_line_id`
     submitted more than once (`DUPLICATE_PO_LINE`, mirroring `create_challan`'s own check);
     computes that line's remaining invoiceable quantity as `delivered_quantity - invoiced_quantity`
     and rejects if it's `<= 0` (`LINE_FULLY_INVOICED`) or the submitted quantity exceeds it
     (`LINE_EXCEEDS_REMAINING_INVOICEABLE`) — FR-003, FR-015.
  4. Resolves `invoice_number`: if null/blank, uses `trade_names.next_invoice_number` as a plain
     integer (no padding, no date suffix — just its current value cast to text), then increments the
     counter; otherwise uses the submitted value as given (table-level uniqueness enforces FR-004).
  5. Inserts the `performa_invoices` row.
  6. Inserts each `performa_invoice_lines` row via `jsonb_array_elements(p_lines) with ordinality`
     for `position`, snapshotting `product_id`/`uom`/`unit_price` from the referenced PO line.
  7. For each line: `update customer_po_lines set invoiced_quantity = invoiced_quantity +
     p_line.invoiced_quantity where id = po_line_id` (FR-007, FR-015).
  8. Computes `gross_total = sum(invoiced_quantity * unit_price)` across the inserted lines,
     `tax_amount = round(gross_total * p_tax_rate / 100, 2)`, `net_total = gross_total + tax_amount`.
  9. Inserts one `ledger_entries` row (`customer_id = p_customer_id`, `entry_date = p_invoice_date`,
     `type = 'credit'`, `amount = net_total`, `source_type = 'performa_invoice'`, `source_id` = the
     new invoice's id, `description = 'Performa Invoice ' || invoice_number`, `created_by =
     p_user_id`) — FR-007. Unlike `accept_challan`'s conditional `sum > 0` guard, no guard is needed
     here: at least one line is required (enforced by Zod, matching `create_challan`'s own
     convention of not duplicating that check in SQL) and every line's `invoiced_quantity` and
     `unit_price` are both `> 0` by `CHECK` constraint, so `net_total > 0` always holds.
  10. Returns the new invoice's `id`.
  Steps 1-9 either all happen or none do (single function call = single transaction), the same
  guarantee `accept_challan` provides for its own effects.
- **Rationale**: Every one of these steps must be observed together or not at all — an invoice
  that exists with only some of its PO-line/ledger effects posted would misstate a customer's
  balance, the exact failure category ADR-0002 exists to close. This is ADR-0002's pattern applied
  to a create function with more validation surface than 006/007's own create functions had (the
  cross-customer and cross-PO checks), not a new pattern.
- **Alternatives considered**: A separate confirmation RPC after a "draft" insert (mirroring
  Challan's issue→accept split) — rejected per the single-stage decision already resolved with the
  user. Performing the PO-line and ledger writes as separate `supabase-js` calls from the service
  layer — rejected for reopening the same partial-write risk ADR-0002 exists to close.

## Decision: `create_performa_invoice` locks each referenced PO line with `select ... for update` before validating it, and a new `CHECK` constraint on `customer_po_lines` backstops FR-015 at the database level

- **Decision**: Step 4 of `create_performa_invoice` (data-model.md) reads each referenced PO line's
  `delivered_quantity`/`invoiced_quantity` via `select ... for update of cpl` — an explicit
  row-level exclusive lock, not a plain `select` — before validating the requested quantity against
  the remainder and before incrementing `invoiced_quantity` later in the same function. Separately,
  this feature's migration adds `alter table customer_po_lines add constraint
  customer_po_lines_invoiced_le_delivered check (invoiced_quantity <= delivered_quantity)` — a
  cross-column `CHECK` on a table 006 already created, applied via this feature's own migration
  (never editing `0006_customer_purchase_orders.sql` in place).
- **Rationale**: FR-015 says the Invoiced figure must never exceed Delivered "under any sequence of
  invoice creation, including when multiple invoices are created in close succession against the
  same line" — a correctness requirement about a real financial posting, not a cosmetic one. A plain
  `select` (read remaining) followed later by an `update` (write the increment) — without a lock in
  between — is a textbook check-then-act race: two overlapping transactions could both read the
  same pre-update remainder, both pass validation, and both commit, together posting more invoiced
  quantity than was ever delivered. `for update of cpl` closes this by making the second
  transaction's own read block until the first transaction's full effect (including its own
  `invoiced_quantity` increment) is either durably committed or fully rolled back — the second
  transaction's validation then runs against genuinely current data, not a stale snapshot. The
  `CHECK` constraint is added as well, not instead, because it costs nothing and converts any future
  bug that somehow bypasses the lock (a new code path added later that forgets `for update`, for
  example) from a silent, discovered-much-later data-integrity error into an immediate, loud
  transaction failure at the database's own boundary.
- **Why this differs from 007's own accepted simplification for a similar-looking check**: 007's
  spec.md Edge Cases explicitly accepts that two Challans issued against the same PO line *before
  either is accepted* are each validated independently against a stale "remaining to deliver"
  figure, with no lock — a deliberate, accepted simplification for that feature's low, manual,
  one-at-a-time transaction volume. That check happens at Challan *creation* (a draft-like, easily
  corrected step long before any ledger effect exists) and 007's own `accept_challan` — the step
  that actually posts effects — has no equivalent unlocked remaining-quantity re-check at all,
  because a Challan's `accepted_quantity` is already fixed by the time it's accepted. This feature's
  situation is different in kind: `create_performa_invoice` posts a real ledger credit and a real
  PO-line-figure increment in the *same* single action that does the validation — there is no
  earlier "draft" step where a mistake would be cheap to catch and fix later, so the validation
  and the write need to be genuinely atomic with respect to each other, not just sequenced within
  one function body.
- **A second, related fix**: the locking loop iterates `p_lines` sorted by `po_line_id` ascending,
  not client-submission order. This is the first feature where a single transaction can lock more
  than one `customer_po_lines` row at once (User Story 2's multi-PO invoices) — without a fixed
  lock-acquisition order, two concurrent invoices sharing two or more of the same lines but listing
  them in different orders could deadlock (each holding one lock while waiting on the other),
  surfacing as a raw `deadlock_detected` error instead of the intended clean validation rejection.
  Sorting before the loop is standard lock-ordering deadlock avoidance, costs nothing, and affects
  only lock-acquisition sequence — never the invoice's stored/printed line order, which is derived
  separately from `p_lines`' original submitted order in the later insert step. Given the fix is a
  single `order by` clause with no tradeoff, it is applied outright rather than documented as an
  accepted simplification (unlike 007's Challan-creation race, which was a genuine cost/benefit
  tradeoff at that feature's scale).
- **Alternatives considered**: Relying only on the `CHECK` constraint and letting a race surface as
  a generic constraint-violation error to whichever request loses — rejected as a strictly worse
  user experience for a case the lock already prevents cleanly (the loser would see a confusing
  low-level database error instead of the same friendly `LINE_EXCEEDS_REMAINING_INVOICEABLE`
  message every other rejection path already produces); the lock is kept as the primary mechanism
  and the constraint as a backstop, not the reverse. Locking the parent `customer_pos` row instead
  of the individual `customer_po_lines` row — rejected as unnecessarily coarse, since it would
  serialize unrelated invoices against *different* lines of the *same* PO with no correctness
  benefit (the race only exists per-line, since that's the granularity `invoiced_quantity` and
  `delivered_quantity` are tracked at). A Postgres `SERIALIZABLE` isolation level for the whole
  function instead of a targeted row lock — rejected as heavier machinery (retry-on-conflict logic
  would be needed at the call site) for a race this project can close precisely with an ordinary,
  well-understood `for update` lock at exactly the one row that matters.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001-007) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies (amount-in-words is a local utility, printed document reuses ADR-0006's browser-native print pattern, no PDF library) |
| Storage | Supabase Postgres — new `performa_invoices`, `performa_invoice_lines`, `performa_invoice_attachments` tables; one new function `create_performa_invoice` (no update/void/accept counterparts, by design); one new `ALTER TABLE` on 006's `customer_po_lines` adding `customer_po_lines_invoiced_le_delivered check (invoiced_quantity <= delivered_quantity)`; a fourth private Storage bucket (`performa-invoice-attachments`) |
| Testing | Vitest + Testing Library (same intended stack as 001-007; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds one module; no changes to 006's or 007's existing routes/services beyond one small additive export in `lib/customers/service.ts`) |
| Performance Goals | Trivial at this feature's scale (Habbitt-only, a few dozen invoices/year at most); an invoice's totals are summed in TypeScript over its (handful of) already-fetched lines, matching 006/007's own total-computation precedent |
| Constraints | No client-side Postgres access; invoice header + lines + PO-line increments + ledger credit written atomically in one Postgres function (ADR-0002); each referenced PO line is read with `select ... for update` before validation, so concurrent invoice creation against the same line serializes correctly (FR-015) rather than racing; `invoice_number` unique per trade name via a DB constraint; `performa_invoice_lines` snapshots `product_id`/`uom`/`unit_price` at creation, never re-reads them live; a Performa Invoice is fully read-only and undeletable from the moment it's created, with no update/void/accept path existing at all |
| Scale/Scope | Single customer today (Habbitt), a few dozen invoices/year, typically 1-10 lines per invoice possibly spanning 1-3 POs, no multi-tenancy |
