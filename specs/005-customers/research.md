# Research: Customers

**Feature**: `005-customers` | **Date**: 2026-09-20

Resolves technical unknowns before design. Infrastructure decisions already made in 001-004
(Server Components/Actions, Supabase-admin-only Postgres access, session-cookie auth, Zod
validation shared client/server, the ADR-0002 atomic-multi-table-write pattern, the ADR-0003
signed-URL Storage pattern) carry over unchanged and are not re-litigated here. Only decisions
specific to customers, their ledger, and their product mappings are recorded below.

## Decision: `create_customer`/`update_customer` are Postgres functions, mirroring 001's supplier pattern more closely than 003b did

- **Decision**: Creating or editing a customer calls a single Postgres function
  (`create_customer`, `update_customer`) that writes the `customers` row plus its
  `customer_contacts`, `customer_ship_to_addresses`, and `customer_trade_names` rows — and, on
  create only, a conditional `ledger_entries` opening-balance row — in one transaction. Deleting
  child rows and re-inserting them on update (contacts, ship-to addresses, trade-name hints)
  follows `update_supplier`'s exact delete-then-reinsert shape.
- **Rationale**: A customer create/update is structurally identical to 001's supplier
  create/update (one parent row, several 1:N child row sets) with one addition: create also
  conditionally writes a *different* table (`ledger_entries`) for the opening balance. FR-004's
  requirement that a customer record always reflect a complete, consistent set of contacts/
  addresses/hints — and FR-011/FR-013's requirement that the opening balance either fully posts
  or doesn't exist at all — are both correctness requirements a Postgres function makes
  structurally impossible to violate, exactly per ADR-0002.
- **Alternatives considered**: Sequential `supabase-js` calls (insert customer, then insert
  contacts, then ship-to addresses, then trade-name hints, then conditionally a ledger entry) —
  rejected for the same reason ADR-0002 already rejected it for suppliers and unit-purchases: a
  partial failure partway through would leave an inconsistent customer record with no way to
  detect it short of manual reconciliation.

## Decision: opening balance is captured as `{ amount: positive number, type: 'debit' | 'credit' }`, not a bare signed number

- **Decision**: The create form's opening-balance section asks for an amount (always entered as a
  positive number) and an explicit Debit/Credit choice, defaulting to Credit (the common case: a
  customer who already owes the business money as of cutover). `create_customer` inserts a
  `ledger_entries` row with that exact type and amount only when the amount is greater than zero;
  a zero or omitted amount inserts nothing.
- **Rationale**: `specs/PRODUCT-OVERVIEW.md`'s Customer Ledger section defines the ledger as
  literal Debit/Credit columns ("Billing events post as Credit; payments received post as Debit"),
  so entering the opening balance in the same two-value shape as every other ledger entry this
  system will ever write is more consistent than introducing a "positive means X, negative means
  Y" sign convention that exists only for this one field. The spec's own language ("a signed
  amount") is a business framing of the same idea — amount-plus-explicit-direction is the
  literal implementation of "signed," not a deviation from it.
- **Alternatives considered**: A single signed number (positive = customer owes, negative =
  customer has credit) — rejected as introducing a bespoke convention that every other write to
  `ledger_entries` (this feature's own, and 007/008's later) would not share, since those always
  specify type and amount separately per the business's own paper ledger format.

## Decision: payment terms are captured as an expected min/max day range, not a single fixed integer

- **Decision**: `customers` stores `payment_terms_min_days`/`payment_terms_max_days` (both
  non-negative integers, `max >= min`), not a single `payment_terms_days` value. 009-customer-ledger
  will read this range only to classify an actual payment as "within" or "beyond" the expected
  range for ageing/reporting; no code anywhere blocks, rejects, or auto-flags a payment based on it.
- **Rationale**: This feature's initial design assumed a single fixed number of days, but in
  practice each of this business's four minimum customers pays somewhere within a range rather
  than on a fixed day (Habbitt 30-45 days, Chaseup 90-120 days, ChaseValue and Kifayat ~45 days),
  and the actual payment date is never fully reliable even for the same customer. A single integer
  would misrepresent that reality and force an arbitrary choice of which end of the range to store.
- **Alternatives considered**: A single `payment_terms_days` value (the original design) —
  corrected once the user clarified that real payment behavior is a range, not a point value;
  free text like "Net 30-45" — rejected for the same reason free text was already rejected for a
  single value: 009 needs numeric bounds to compute ageing, not a string to re-parse.

## Decision: a customer's ledger balance is computed live via `SUM`, never cached on the customer row

- **Decision**: `getCustomer` computes the running balance as
  `SUM(CASE WHEN type = 'credit' THEN amount ELSE -amount END)` over that customer's
  `ledger_entries` rows at read time (via `lib/customers/ledger.ts`), rather than maintaining a
  `customers.current_balance` column the way 003b maintains `products.current_purchase_cost`.
- **Rationale**: 003b's cached, fully-recomputed columns exist because a product's cost/quantity
  is read constantly across many other features (purchase lists, future batch costing) and is
  cheap to fully recompute from a handful of purchase rows. A customer's ledger balance is, for
  this feature, read in exactly one place (the customer detail view), and
  `specs/PRODUCT-OVERVIEW.md`'s Cross-Cutting Technical Requirements explicitly says this project
  designs "for clarity and correctness, not scale — no caching layers" at its stated scale (a few
  thousand ledger rows per customer over years — trivial for an indexed `SUM`). Introducing a
  cached column now would also raise exactly the kind of incremental-vs-recompute drift question
  003b deliberately avoided, for a table (`ledger_entries`) two more features (007, 008) will
  write to before 009 even exists to decide whether caching is warranted there.
- **Alternatives considered**: A cached `customers.current_balance`, recomputed on every
  `ledger_entries` write (matching 003b's `recompute_product_purchase_stats` shape) — rejected as
  premature for a value with exactly one reader today; deferred to whenever 009-customer-ledger's
  own performance needs (if any) actually require it.

## Decision: `ledger_entries` has no update or delete path anywhere in this feature

- **Decision**: No Server Action, service function, or Postgres function in this feature ever
  updates or deletes a `ledger_entries` row. The only write path is the conditional insert inside
  `create_customer`. `update_customer` never touches it, and no "edit ledger entry" UI exists in
  this feature at all.
- **Rationale**: This is the direct implementation of FR-013 (opening balance immutable once
  posted) and of the table's own documented nature as "insert-only" in
  `specs/PRODUCT-OVERVIEW.md`'s Shared-table decisions. Making the guarantee structural (no code
  path exists to violate it) rather than a UI-level convention (a form simply doesn't expose an
  edit button, but an API could still be called directly) is consistent with how this project
  already treats other immutability rules (002's consumption lock is enforced server-side, not
  just hidden in the UI).
- **Alternatives considered**: Allowing edits to the opening balance while no other ledger
  activity exists yet for that customer — considered (it would help correct a same-day
  data-entry mistake during the go-live migration), but rejected per the user's explicit
  confirmation of this scope call before `/sp.plan`: corrections go through a new, visible
  adjusting entry, never an edit to history, even during migration.

## Decision: customer-product mappings are plain single-table CRUD, not a Postgres function

- **Decision**: `addProductMapping`/`updateProductMapping`/`removeProductMapping` in
  `lib/customers/product-mappings.ts` call `supabase-js` `.insert()`/`.update()`/`.delete()`
  directly against `customer_product_mappings` — no RPC involved.
- **Rationale**: A mapping row has no child tables and no other table's derived state depends on
  it (unlike a unit-mode purchase's effect on `products.quantity_on_hand`). This is exactly the
  single-table case ADR-0002 itself says does not need its pattern — the same reasoning 004
  already applied to `trade_names`.
- **Alternatives considered**: None seriously — follows directly from ADR-0002's stated boundary.

## Decision: a customer-product mapping includes an optional default/agreed price, not just item code and selling unit

- **Decision**: `customer_product_mappings` gets an optional `default_price numeric(12,2) check
  (default_price > 0)` column, and the row-existence check widens from "at least one of item
  code/selling unit" to "at least one of item code/selling unit/default price"
  (`customer_product_mappings_has_value_check`). It is pure pre-fill data: read only by
  006-customer-purchase-orders to suggest a starting price on a new PO line item; a PO's own
  entered price remains authoritative and is never validated against this column.
- **Rationale**: This feature's initial design explicitly excluded customer pricing from the
  mapping (deferring it entirely to a PO's own price field), on the assumption that prices are
  always negotiated per-PO. The user corrected this: item rates per customer are typically fixed
  in practice (e.g. Ball Fiber to Habbitt is consistently Rs 2600/unit on every PO unless
  renegotiated), a pattern that holds across other customers and items too. Storing a default here
  follows the same "expected value is a pre-fill suggestion, the actual record is always
  authoritative" pattern already used for the yield-ratio contradiction in
  010-production-batches — it doesn't change 006's own scope (a PO still carries and stores its
  own price, and staff can override the default at any time), it just lets that PO form pre-fill
  instead of starting blank.
- **Alternatives considered**: Excluding pricing entirely from this mapping (the original design)
  — corrected per the user's explicit business-pattern evidence; a separate `customer_prices`
  table — rejected as an unnecessary second table for a single optional column with no lifecycle
  of its own, when it fits naturally alongside the mapping's other per-customer-per-product
  overrides.

## Decision: a customer's item code is enforced unique via a DB-level partial unique index, not application-only validation

- **Decision**: `customer_product_mappings` gets a partial unique index on
  `(customer_id, customer_item_code) where customer_item_code is not null`, in addition to the
  service layer checking for a friendly error message before insert/update.
- **Rationale**: FR-016 ("a customer's item code must resolve to exactly one product") is a data
  integrity rule, not just a UX nicety — a race between two staff members entering the same code
  for different products at the same time must be structurally impossible, not just
  application-checked-then-hopefully-not-raced. This mirrors 003's `products_type_fields_check`
  and 003b's `purchases_mode_fields_check` philosophy of pushing correctness rules into the
  database wherever they're absolute, not merely usual.
- **Alternatives considered**: Application-only validation (check-then-insert in the service
  layer, no DB constraint) — rejected as the exact TOCTOU (time-of-check-to-time-of-use) gap this
  project has consistently closed with DB constraints elsewhere.

## Decision: "usable trade names" is a proper join table (`customer_trade_names`) with a position column, not a raw array column

- **Decision**: A customer's trade-name hints are stored as rows in `customer_trade_names`
  (`customer_id`, `trade_name_id`, `position`), not a `uuid[]` column on `customers`.
- **Rationale**: A join table gets a real foreign key to `trade_names(id)` (so a hint can never
  reference a trade name that doesn't exist, and RLS/cascade behavior stays consistent with every
  other relationship in this schema), and `position` preserves the "primary/last-used" ordering
  hint mentioned in `specs/PRODUCT-OVERVIEW.md`'s Customers section, mirroring
  `supplier_contacts.position`'s exact role. This is the same reasoning 001 already used for
  `supplier_contacts`/`supplier_materials` over an embedded-array shape.
- **Alternatives considered**: A `preferred_trade_name_ids uuid[]` column on `customers` —
  rejected: no FK integrity (a deleted... though trade names are never hard-deleted either, this
  keeps the schema's referential-integrity story uniform), and no clean way to express ordering
  without a parallel-array hack.

## Decision: billing address is flat columns on `customers`; ship-to addresses are a separate 1:N table

- **Decision**: `customers` gets flat `billing_address_*` columns (mirroring `suppliers.address_*`
  exactly), while `customer_ship_to_addresses` is a proper child table for the zero-or-more
  ship-to/warehouse addresses.
- **Rationale**: Exactly 001's own reasoning: a required, singular address with a fixed shape is
  a normal relational fit as flat columns; a genuinely one-to-many collection (ship-to addresses)
  needs its own table the way `supplier_contacts` does.
- **Alternatives considered**: None — directly reuses 001's already-established convention for
  the same shape of problem.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001-004) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `@supabase/supabase-js`, `@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Supabase Postgres — six new tables (`customers`, `customer_contacts`, `customer_ship_to_addresses`, `customer_trade_names`, `customer_product_mappings`, `ledger_entries`) plus two new Postgres functions |
| Testing | Vitest + Testing Library (same intended stack as 001-004; not yet wired into `package.json`) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (adds one module, extends two others by one function each) |
| Performance Goals | Trivial at 4-10 customers; ledger balance computed live, no caching (per Cross-Cutting Technical Requirements) |
| Constraints | No client-side Postgres access; customer create/update atomic across its child rows; `ledger_entries` insert-only, no update/delete path in this feature; a customer's item code unique via DB constraint; trade-name hints never enforced as a restriction |
| Scale/Scope | Single internal business, 4-10 customers today, a few thousand ledger rows per customer over years, no multi-tenancy |
