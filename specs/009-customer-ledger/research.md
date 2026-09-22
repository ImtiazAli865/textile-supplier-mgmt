# Research: Customer Ledger

**Feature**: `009-customer-ledger` | **Date**: 2026-09-23

Resolves technical unknowns before design. Infrastructure decisions already made in 001-008
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server, ADR-0002's atomic-multi-table-write pattern, ADR-0006's
server-rendered print-route pattern) carry over unchanged and are not re-litigated here. Every
architecturally significant business decision (new `customer_payments` table vs. columns on
`ledger_entries`, bounce-reversal dating, multi-PO ledger-row rendering, payment-status
mutability as a deliberate exception) was already resolved with the user before the spec was
written — see
`history/prompts/009-customer-ledger/0001-align-customer-ledger-data-model.misc.prompt.md` and
`spec.md`'s Assumptions. This file turns those into concrete schema/function choices, plus the
mechanism-level decisions the spec deliberately left at business-language altitude: how ageing is
actually computed over a running-balance ledger with no per-invoice payment matching, and how
PDF/Excel export is produced with no new dependency.

## Decision: `customer_payments` is a new table; recording a payment and changing its status are two separate Postgres functions

- **Decision**: `record_customer_payment(...)` inserts one `customer_payments` row (status
  `received`) and one `ledger_entries` debit row, atomically. A separate
  `update_customer_payment_status(p_id, p_new_status, p_user_id)` handles both allowed
  transitions (`received → cleared`, `received → bounced`) — branching internally on whether a
  reversal `ledger_entries` credit row is also needed, rather than two separate
  `mark_payment_cleared`/`mark_payment_bounced` functions.
- **Rationale**: The two transitions share identical guard logic (payment must currently be
  `received`, or reject) and only differ in whether a ledger row is posted — one function with a
  status parameter avoids duplicating that guard, and still maps cleanly to FR-007's single
  requirement ("allow a staff member to change a Received payment's status to Cleared... or to
  Bounced..."). Recording vs. changing status are kept as two functions (not folded into one),
  because they are genuinely different user actions at different times, mirroring
  `create_challan`/`accept_challan` being separate functions for separate actions (007) rather
  than `create_performa_invoice`'s single-action shape (008, which has no later transition at
  all).
- **Alternatives considered**: Two separate `mark_customer_payment_cleared`/
  `mark_customer_payment_bounced` functions — rejected as needless duplication of the identical
  `status = 'received'` guard for no behavioral benefit. Folding recording and status-change into
  one function with an optional "already bounced" parameter — rejected as conflating two
  temporally distinct actions into one call signature for no reason.

## Decision: `customer_payments.status` is DB-enforced one-way via the function's own guard, not a `CHECK` or trigger — no `updated_at`/generic update trigger exists on this table

- **Decision**: `customer_payments` gets `created_at`/`created_by` (when recorded) and nullable
  `status_changed_at`/`status_changed_by` (set only on the one allowed transition). No
  `updated_at` column, no `set_updated_at()` trigger (0001's shared trigger, reused by every
  *editable* header table in this project). `update_customer_payment_status` is the only code
  path anywhere that issues an `UPDATE` against this table, and it only ever sets `status`,
  `status_changed_at`, `status_changed_by` — every other column (`amount`, `payment_date`,
  `cheque_number`, `bank_name`, `reference_type`, `reference_id`) has no update path at all, by
  omission, not by a database-level guard.
- **Rationale**: This mirrors how `ledger_entries` (005) and `performa_invoices` (008) already
  achieve immutability — structurally, by never exposing an update path, not via a `CHECK`
  constraint (a plain `CHECK` cannot compare `OLD` vs. `NEW` in Postgres; only a `BEFORE UPDATE`
  trigger can, and a trigger is heavier machinery than this project has needed anywhere so far).
  FR-008 needs exactly this shape: every field immutable except one, which itself may change
  exactly once. Adding the generic `set_updated_at()` trigger here would advertise a "this whole
  row is editable" convention this table deliberately isn't.
- **Alternatives considered**: A `BEFORE UPDATE` trigger that raises an exception if any column
  other than `status`/`status_changed_at`/`status_changed_by` changes, or if `status` changes
  more than once — rejected as unnecessary defense-in-depth at this project's scale (single
  internal team, one service-role trust boundary, no direct SQL access outside this codebase);
  the same reasoning 005/007/008 already applied to their own immutable tables, which rely on "no
  code path exists," not a DB trigger, to guarantee it.

## Decision: a bounced cheque's reversal is dated to the *actual* current date at the moment status changes, not a staff-entered date

- **Decision**: `update_customer_payment_status`'s reversal `ledger_entries` row uses
  `entry_date = current_date` — the date the status-change transaction runs — with no separate
  "bounce discovery date" input field on the status-change action.
- **Rationale**: Directly matches spec.md's own Acceptance Scenario wording ("posted, dated to the
  date the status was changed") and the confirmed business decision that a reversal documents "a
  new event (learning the cheque bounced)," not a backdated correction. Using the transaction's
  own date needs no extra input, and there is no acceptance scenario asking staff to backdate a
  bounce discovery to an earlier day.
- **Alternatives considered**: A staff-entered "bounce discovered on" date field, independent of
  today — rejected as unrequested scope; if a real need to backdate a reversal ever surfaces, it
  can be added later without touching the table shape (the column already exists, only the input
  source would change).

## Decision: ageing/overdue amounts are computed with FIFO (oldest-credit-first) allocation over each customer's chronological ledger — not per-invoice payment matching

- **Decision**: For a customer's outstanding balance, walk their `ledger_entries` in chronological
  order (`entry_date`, then `created_at` as a same-day tiebreaker) maintaining a queue of "open"
  credit entries, each starting with its own posted amount. Every debit (a payment) — and every
  reversal credit is itself just appended to the queue as a new credit, since it represents a new
  debt-increasing event — consumes amount from the *oldest* still-open credit entries first,
  reducing or fully closing them in order. Whatever remains open in the queue at the end is that
  customer's outstanding balance, broken down by the original `entry_date` of each still-open (or
  partially-open) credit. An outstanding portion is classified "beyond expected range" if
  `today − that credit's entry_date > payment_terms_max_days`, otherwise "within expected range."
  A customer's "overdue amount" (Story 5's summary) is the sum of only the beyond-range portions.

  ```text
  function computeAgeing(customerId, today, paymentTermsMaxDays):
    entries = fetch ledger_entries for customerId
              ordered by entry_date asc, created_at asc   # single chronological walk
    queue = []   # ordered list of { entryDate, remainingAmount }, oldest first

    for entry in entries:
      if entry.type == 'credit':
        # opening_balance / challan / performa_invoice / payment_reversal — all four
        # source types are indistinguishable here; each is just "a new debt-increasing
        # event," appended at the back of the queue under its OWN entry_date
        queue.push({ entryDate: entry.entryDate, remainingAmount: entry.amount })

      else:   # debit — a customer payment
        toConsume = entry.amount
        i = 0
        while toConsume > 0 and i < queue.length:
          head = queue[i]
          consumed = min(head.remainingAmount, toConsume)
          head.remainingAmount -= consumed
          toConsume -= consumed
          if head.remainingAmount == 0: i += 1   # fully closed, move to next-oldest
          # else: head partially closed, loop exits (toConsume is now 0)
        queue = [e for e in queue if e.remainingAmount > 0]
        # if toConsume > 0 here, the payment exceeded every open credit (an
        # "overpayment," spec.md Edge Cases — explicitly allowed). The excess is
        # simply dropped: this queue only ever tracks amounts still owed *to* the
        # business, never a negative/in-the-customer's-favor amount. The live
        # SUM(credit)-SUM(debit) balance (getCustomerLedgerBalance, unchanged) is
        # the actual source of truth for that negative state, not this queue.

    openEntries = [
      { entryDate: e.entryDate, remainingAmount: e.remainingAmount,
        withinRange: (today - e.entryDate) <= paymentTermsMaxDays }
      for e in queue
    ]
    overdueAmount = sum(e.remainingAmount for e in openEntries if not e.withinRange)
    return { openEntries, overdueAmount }
  ```

  **Handles a bounced payment correctly, but with one specific consequence worth being
  explicit about**: the original payment's debit already consumed the queue (in FIFO order)
  at the *payment's own* `entryDate` — that consumption is never undone or replayed. Marking
  it Bounced only ever appends a brand-new credit dated at `current_date` (the status-change
  moment, per the decision above) to the *back* of the queue, exactly like any other new
  credit. The total amount owed is correctly restored (it will re-sum to match
  `getCustomerLedgerBalance`), but the *age* of that restored amount is measured from the
  bounce-discovery date, not from whatever older delivery/invoice it was indirectly offsetting
  before the bounce. This is a direct, intended consequence of the already-agreed "a reversal
  documents a new event, dated today" decision (spec.md Assumptions) — not a bug in the
  allocation logic — but it does mean a customer whose payment bounces will *not* show as
  overdue on that amount again until `payment_terms_max_days` re-elapses from the bounce date,
  even though the underlying goods have been outstanding far longer. Acceptable at this
  project's manual-Excel-replacement scale (a handful of bounces a year at most), and
  consistent with how the business's own real process already treats a bounce as a fresh event
  requiring fresh follow-up, not a backdated correction.

  **Handles partial allocation correctly**: when a debit (including an untied lump-sum
  payment) is smaller than the oldest open credit, the `while` loop's single iteration reduces
  that head entry's `remainingAmount` without removing it from the queue and without changing
  its `entryDate` — so it stays classified by its *original* age, not reset by the partial
  payment. When a debit is *larger* than the oldest open credit, the loop continues consuming
  the next-oldest entries in order until the debit is exhausted, correctly spanning multiple
  credits in one payment (e.g. one large lump-sum payment closing out several old small
  credits at once).
- **`payment_terms_min_days`'s role, resolved explicitly**: only `payment_terms_max_days` feeds
  `computeAgeing`'s `withinRange` boolean (FR-009, as reworded) — `min_days` is never passed into
  or used by this function at all. It is a separate, purely presentational value: `getCustomerLedger`
  already returns it as part of the customer object (contracts.md), and
  `components/customer-ledger/ageing-summary.tsx` renders it next to each open entry as a static
  context label (e.g. "Expected within 15-30 days"), computed from `paymentTermsMinDays`/
  `paymentTermsMaxDays` directly, with no allocation logic of its own. This was previously
  ambiguous — FR-009's original wording implied both bounds drove the classification — resolved
  during `/sp.analyze` (finding A1).
- **Rationale**: This project's ledger is explicitly a running-balance model with no per-invoice
  reconciliation (spec.md Assumptions; the original business context's own words: "Habbitt's
  ledger tracks a running balance rather than invoice-by-invoice reconciliation"), so there is no
  stored link from a payment to "the specific invoice it settles." FIFO/oldest-first allocation is
  the standard, well-understood technique for producing an ageing breakdown in exactly this
  situation (a single running account with undifferentiated debits and credits) without inventing
  new stored state or asking staff to manually match payments to invoices — something the spec
  never asks for and the real business process doesn't do today. It is computed entirely in
  TypeScript over a customer's already-fetched ledger entries (a few hundred to a few thousand
  rows over years, per `specs/PRODUCT-OVERVIEW.md`'s stated scale) — a single linear pass, no new
  storage, no new Postgres function.
- **Alternatives considered**: Ageing the *entire* current balance by the single most recent
  ledger entry's date — rejected, since it would understate age for a customer whose balance is
  actually dominated by one very old unpaid credit and a few small recent ones. Requiring an
  explicit invoice/PO selection on every payment so ageing could match 1:1 — rejected outright by
  the spec itself (payments may be untied lump sums, User Story 2), and would contradict the
  business's own real usage pattern. LIFO (most-recent-first) allocation — rejected as the
  opposite of standard ageing practice and not how any real accounts-receivable ageing convention
  works.
- **Note for the user**: this FIFO mechanism is a genuine design decision made at the plan stage
  (the spec intentionally stayed at business-language altitude — "within/beyond expected range" —
  without prescribing the allocation mechanism). Worth a second look once real multi-year ledger
  data exists, but it is the standard technique for this exact shape of problem and needed no new
  schema.

## Decision: PDF export reuses ADR-0006's server-rendered print-route pattern (third application); Excel export is a CSV Route Handler, no new dependency

- **Decision**: Per-customer ledger PDF and the all-customers summary PDF are each a standalone
  print route outside `(dashboard)` (`app/customers/[customerId]/ledger/print/page.tsx`,
  `app/customer-ledger/print/page.tsx`), styled with `@media print`, browser Print → Save as PDF —
  the same mechanism ADR-0006 already establishes for Challans (007) and Performa Invoices (008).
  "Excel" export is a `text/csv` file (columns matching the on-screen table exactly) served by a
  Next.js Route Handler (`app/api/customer-ledger/[customerId]/route.ts` for one customer,
  `app/api/customer-ledger/route.ts` for the all-customers summary), with a `Content-Disposition:
  attachment` header — no `xlsx`/`exceljs`/similar package. This is this project's **first** Route
  Handler (001-008 have used only Server Actions and Server Components).
- **Rationale**: PDF: this is squarely ADR-0006's stated scope ("Documents how this project
  produces a formatted, printable/exportable business document... not a decision specific to
  Challans alone") applied a third time — no new ADR needed, per that ADR's own text anticipating
  reuse. Excel: CSV opens natively in Excel with full fidelity for flat tabular data (this ledger
  view has no merged cells, formulas, or multi-sheet needs — just rows and columns), and this
  project has added zero PDF/document-generation dependencies so far specifically to avoid exactly
  this category of dependency (ADR-0006's own rejection of `@react-pdf/renderer`/Puppeteer/
  `pdf-lib`). A Route Handler (not a Server Action) is the correct Next.js primitive for a raw
  file download with a specific content type and filename — Server Actions serialize return
  values as RSC payloads, not raw byte streams with custom headers.
- **Alternatives considered**: An `xlsx`-generation library (e.g. `exceljs`, `xlsx`) for a "real"
  `.xlsx` file — rejected for now as the first dependency this project would add purely for
  export formatting, for a requirement CSV already satisfies (opens directly in Excel); revisit if
  a future need for multi-sheet workbooks, cell formatting, or formulas actually arises. Returning
  CSV text from a Server Action and constructing a client-side `Blob`/download link — rejected as
  more client-side plumbing than a Route Handler for the exact same outcome, and it's the first
  time this project would need a Server Action to return something other than plain
  JSON-serializable data.
- **Flagged for the user**: this is a new, reusable pattern (flat tabular CSV export via a Route
  Handler) that later features needing export (`specs/PRODUCT-OVERVIEW.md`'s 012/013, which also
  mention export) would likely reuse rather than re-decide — see this plan's Constitution Check
  for the ADR-suggestion note.

## Decision: a payment's optional invoice/PO reference is a polymorphic `(reference_type, reference_id)` pair, matching `ledger_entries.source_type`/`source_id`'s existing shape exactly

- **Decision**: `customer_payments.reference_type text` (nullable, `'customer_po'` or
  `'performa_invoice'`) and `reference_id uuid` (nullable, no FK). `record_customer_payment`
  validates — only when both are provided — that the referenced row exists and belongs to the
  same `customer_id` as the payment, raising `REFERENCE_NOT_FOUND` or
  `REFERENCE_WRONG_CUSTOMER` otherwise (FR-006).
- **Rationale**: Directly reuses the polymorphic, no-FK pattern `ledger_entries.source_type`/
  `source_id` already established (005), for the identical reason: the two possible referenced
  tables don't share a common parent to FK against, and the reference is informational only
  (FR-005) — never joined for correctness, only for display and the same-customer guard.
  Introducing a different shape here (e.g. two separate nullable FK columns,
  `referenced_po_id`/`referenced_invoice_id`) would work but adds two nullable FK columns where
  one polymorphic pair already has project-wide precedent and identical semantics.
- **Alternatives considered**: Two separate nullable FK columns (`referenced_po_id uuid
  references customer_pos(id)`, `referenced_invoice_id uuid references performa_invoices(id)`,
  mutually exclusive via a `CHECK`) — a reasonable alternative with real FK integrity, but
  rejected in favor of consistency with the already-established `ledger_entries` shape used
  everywhere else in this project for the same "polymorphic, display-only reference" need.

## Decision: ledger-row display fields (PO Number, Invoice #/Description) are resolved by batched joins in `lib/customer-ledger/service.ts`, grouped by `source_type` — nothing new stored on `ledger_entries`

- **Decision**: `getCustomerLedger(customerId, dateRange?)` fetches all matching `ledger_entries`
  rows, groups their `source_id`s by `source_type`, and issues one batched query per group
  (`challans` joined to `customer_pos(po_number)`; `performa_invoices` joined through
  `performa_invoice_lines → customer_po_lines → customer_pos` for the distinct PO-number list;
  `customer_payments` for cheque number/bank/status, itself optionally resolving its own
  `reference_type`/`reference_id` the same way) — then maps each result back onto its ledger row
  in TypeScript. `opening_balance` rows need no join at all (their `description` is already
  complete, per 005). `ledger_entries.description` already carries the human-readable label for
  every existing source type (`'Opening balance at go-live'`, `'Challan ' || challan_number`,
  `'Performa Invoice ' || invoice_number`); this feature's own two new source types
  (`'payment'`, `'payment_reversal'`) follow the identical convention (`'Cheque ' ||
  cheque_number || ' received'` / `'... bounced — reversal'`), so no separate description
  resolution is needed anywhere — only the PO-number column needs a join.
- **Rationale**: FR-002 explicitly requires PO Number to be "derived... at display time — never
  stored redundantly on the ledger entry itself," and this batched-by-source-type join is the
  direct, minimal way to do that without N+1 queries (one query per source type, not one query per
  row) — the same shape 008's own `getPerformaInvoice` already uses for its per-line PO
  attribution (`customer_po_lines.po_id → customer_pos.po_number`, `data-model.md`).
- **Alternatives considered**: A single Postgres view or function that resolves everything
  server-side in one query (e.g. a `UNION ALL` across source types with `LEFT JOIN`s) — rejected
  as unnecessary complexity at this project's scale (a few hundred to a few thousand rows per
  customer over years) and inconsistent with this project's established "compute at read time in
  the service layer" convention (`getChallan`, `getPerformaInvoice`) rather than building
  SQL-side reporting views.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001-008) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies (PDF export reuses ADR-0006's browser-native print pattern; Excel export is CSV served by a new Route Handler, no `xlsx`/PDF library) |
| Storage | Supabase Postgres — new `customer_payments` table; two new functions `record_customer_payment` and `update_customer_payment_status`; no new shared/forward-declared table (`ledger_entries` and `customers` already exist, 005) |
| Testing | Vitest + Testing Library (same intended stack as 001-008; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds two modules — `lib/customer-payments/*`, `lib/customer-ledger/*` — plus this project's first Route Handlers for CSV export; no changes to 005/007/008's existing routes/services beyond reusing their already-exported read functions) |
| Performance Goals | Trivial at this feature's scale (4-10 customers, a few thousand ledger rows/customer over years, per `specs/PRODUCT-OVERVIEW.md`); ledger rows, running balance, and FIFO ageing are all computed in TypeScript over one customer's already-fetched entries — no database aggregate, no cached column |
| Constraints | No client-side Postgres access; a payment's recording and its ledger debit are written atomically in one Postgres function (ADR-0002), likewise a bounce's status change and its reversal credit; `customer_payments` has no update path beyond its one status-transition function; ledger entries and payment records are never edited or deleted through any code path in this feature |
| Scale/Scope | 4-10 customers, a handful of payments/month across all of them, a few thousand ledger rows/customer over years, no multi-tenancy |
