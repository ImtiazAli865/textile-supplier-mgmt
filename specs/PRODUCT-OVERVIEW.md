# Product Overview: MA Textile — Trading, Contract Manufacturing & Customer Billing

**Status**: Living document — updated as business scope evolves
**Last Updated**: 2026-09-20

This document captures the overall business context and module roadmap for the system.
Individual features are specified, planned, and implemented one at a time under
`specs/<NNN-feature-name>/`, following the Spec-Driven Development (SDD) cycle
(spec → plan → tasks → implement). This file is the shared context those features draw
from — it is not itself a feature spec, and it does not replace `/sp.specify` for any module.

This revision supersedes the previous version of this document in full. It reflects the
consolidated master specification agreed with the business owner on 2026-09-20 (recorded
verbatim in `history/prompts/general/0013-ma-textile-master-spec-build-order-review.general.prompt.md`),
including the resolved build-order questions and open points below.

## Glossary

| Term | Meaning |
|---|---|
| **PO (Purchase Order)** | A written order **issued by a customer to this business**. Always an incoming customer order — never this business's own purchases from suppliers (those are "purchases", per 002). |
| **Challan** | A delivery note printed and sent with goods; the customer's receiving staff sign it as proof of receipt. |
| **Performa Invoice** | A billing document this business issues to certain customers (currently only Habbitt) after delivery. |
| **Sales Tax Invoice / GST Invoice** | A formal tax invoice prepared by an external accountant, not by this system — stored only as an attachment. |
| **Lot** | A single raw-material purchase (e.g. 3,000 kg of fabric bought at one rate) — the unit production draws from. |
| **Packet** | One finished, packaged sellable unit (e.g. one 6-Pack Washcloth pack). |
| **Khata / Ledger** | A running Debit / Credit / Balance account, kept per customer and per contractor. |
| **Trade name** | One of the business's several billing identities (Global Distributors, M Zayan Impex, etc.), each with its own letterhead and NTN. |

## Business Model

The business supplies large retail chains in Karachi, Pakistan, through **two distinct
revenue streams**:

1. **Trading (buy and resell)** — items purchased from the market and resold to the
   customer at a margin, no manufacturing. Example: **Habbitt** (legal entity: Universal
   Retail (PVT) LTD), billed under trade name "Global Distributors" or "IBL Frontier
   Market". Bought per unit (yd, PAC, PAA, Units), resold at a markup.
   **Profit = Selling price − Purchase cost.**

2. **Contract manufacturing (buy fabric by weight, manufacture, sell)** — raw fabric is
   purchased **by weight (kg)** and handed to a manufacturing contractor who converts it
   into finished, packaged products. The contractor is paid a fixed rate per packet (e.g.
   Rs 6/packet); they sub-contract to home workers at a lower rate (e.g. Rs 5/packet),
   keeping the difference as their own commission. The business tracks only what it pays the
   contractor — never the contractor's commission margin or sub-workers' individual payments
   (out of scope; see the Labour / Commission Ledger note). Customers: **Chaseup** ("M Zayan Impex"),
   **ChaseValue** ("M.A Textile"), **Kifayat** ("Rashid Towel"). Products (data-driven,
   never hardcoded): 6-Pack Washcloth, 4-Pack Washcloth, 10-Pack Roll, 10-Pack Ribbon, etc.
   **Profit = Sales Revenue − Raw material cost − Labour/commission cost.**

### Worked example — the core Stream B calculation

A 3,000 kg lot is bought for Rs 200,000 (Rs 66.67/kg). Only ~2,900 kg actually converts
into sellable packets; ~100 kg is wastage. **The full 3,000 kg was paid for, so the entire
issued weight's cost must be absorbed into the packets produced.** Wastage is reported as a
quantity, a rupee value, and a percentage — but it is **never** deducted from the cost
basis, or real cost silently vanishes and profit is overstated.

## Product Catalog (foundation — build first)

Every PO line, challan line, invoice line, production batch and inventory record points at
a product. Nothing else works without it. Per product:

- Name, optional internal code
- **Customer-specific item codes** — one-to-many (a product may carry a different code per
  customer); a customer's PO code must resolve to the right product
- **Type**: `traded` or `manufactured`
- Stock UOM; selling UOM per customer (see UOM resolution below)
- Manufactured only: expected kg-to-packet yield ratio (planning/variance figure only —
  actual entered figures always win), default contractor labour rate per packet
- Traded only: current purchase cost per unit, maintained as a weighted average
- Default selling price per unit/packet (overridable per PO)
- Active/inactive status

Adding a product must be ordinary data entry, never a code change.

## Customers

At minimum: Habbitt, Chaseup, ChaseValue, Kifayat (more will be added). Per customer:

- Display name **and** legal/billing name + full billing address (they often differ —
  e.g. Habbitt's paperwork is addressed to "Universal Retail (PVT) LTD")
- Ship-to/warehouse address(es), telephone, NTN number, Sales Tax Registration number
- Contact person(s)
- **Trade name(s) usable for this customer** — a *default/sort-order hint only*, not an
  enforced restriction (see Trade Names below; any trade name stays selectable for any
  customer on any document)
- **"Issues Performa Invoice" flag** (Yes: Habbitt; No: Chaseup, ChaseValue, Kifayat) —
  this only changes which event posts a ledger Credit (see Customer Ledger below)
- Payment terms (drives invoice due dates and ageing)
- **Opening ledger balance** as of the go-live cutover date

Each customer has a completely independent ledger — never combined or netted.

## Trade Names & Document Settings

The business bills under five trade names, each a separate billing identity:

| Trade name | Currently used for |
|---|---|
| Global Distributors | Habbitt |
| IBL Frontier Market | Habbitt (alternate identity) |
| M Zayan Impex | Chaseup |
| Rashid Towel | Kifayat |
| M.A Textile | ChaseValue |

Trade name is **chosen manually per PO/document**, defaulting to the customer's primary or
last-used one. No rule may restrict which trade name is usable for which customer or goods
— that mapping must never be hardcoded, even though today's practice looks consistent.

Each trade name record holds: printed name and address, NTN number, Sales Tax Registration
number (if applicable), its own Challan number sequence and Invoice number sequence, and
its own signature image + company stamp image (uploaded once, auto-inserted into every
generated Challan and Performa Invoice — no manual copy-paste).

## Production Batches (Stream B)

Recorded per batch: raw material lot used (decrements its remaining weight — this
consumption is what triggers 002's existing read-only lock), weight issued (kg), product
produced (must be `manufactured`), packets actually produced, weight actually converted
(kg), contractor + rate per packet for this batch, batch date.

**Actual entered figures are always authoritative.** The product's expected yield ratio only
pre-fills a suggested packet count and shows a variance — it never overwrites an actual.

```
Raw material cost      = weight ISSUED (kg) × the lot's rate per kg
Labour cost            = packets produced × contractor rate per packet
Total production cost  = raw material cost + labour cost
Average cost / packet  = total production cost ÷ packets produced

Wastage (kg)  = weight issued − weight converted
Wastage (Rs)  = wastage (kg) × the lot's rate per kg   [reported only, never deducted]
Wastage (%)   = wastage ÷ weight issued
```

Simplest supported model: one lot → one product per batch (confirmed workable; multiple
batches cover multi-lot/multi-product scenarios).

## Labour / Commission Ledger (Contractor Khata)

Per contractor: name, contact. Amount earned accrues
automatically from production batches (packets × rate/packet); payments made are logged
separately; running balance = earned − paid. Weekly/monthly settlement views. Structurally
identical to a worker khata.

> **Revised 2026-09-29 (011 pre-spec agreement).** This section originally also listed a
> per-contractor "default rate/packet" and a reference-only "sub-contract rate so their
> commission margin is visible". Both were dropped deliberately, not overlooked:
> - **Sub-contract rate / commission margin — explicitly out of scope.** How a contractor
>   pays their own home workers or sub-partners (e.g. charging Rs 6/packet, paying Rs 5,
>   keeping Rs 1) is the contractor's own internal business and is invisible to this system.
>   MA Textile deals with, and pays, only the one contractor; it never records sub-worker
>   rates or margins, even for reference.
> - **No contractor rate table.** A flat per-contractor rate was already rejected by ADR-0008
>   (the rate depends mostly on the product). 011 also declines a contractor × product rate
>   table: the batch's rate is entered per batch, pre-filled from the product's default
>   labour rate only, and that entered rate is authoritative. Revisit only if real batches
>   show staff routinely overriding the product default for a particular contractor.

## Finished Goods Inventory

Stock per product, from two sources: production batches (manufactured) and purchases
(traded). Stock decreases when goods are **accepted** against a Challan, and increases
again on rejection/return. The inventory view shows quantity on hand and its cost value
(batch cost basis for manufactured, weighted-average purchase cost for traded).

Structurally, this is a read-side view over an insert-only `inventory_movements` ledger
(`product_id`, `qty_delta`, `reason`, `source_type`/`source_id`, `movement_date`) — see
Module Roadmap for when that table is introduced.

## Customer Purchase Orders

Modeled on the Oracle iSupplier pattern Chaseup already uses: Ordered / Delivered /
Invoiced quantities per line, with header Total/Delivered/Invoiced value and payment
status. POs arrive as PDFs and are entered manually: PO number/date, customer, purchaser,
delivery date, destination, **trade name this PO bills under**, line items (item code,
description, qty, UOM, unit price, line total), PO-level gross/tax/net, original PDF
attached. Each line's Ordered/Delivered/Invoiced quantities update from Challans and
Invoices.

## Challans (delivery notes)

One PO may be delivered across several Challans. Printed format: letterhead (selected
trade name), Challan #, date, customer legal name, line table (S.NO/Article/Item/UOM/QTY),
total row, two signature lines. The app does not capture a live signature — it produces the
printed Challan; the **scanned signed copy is uploaded afterwards** as proof of receipt.
Numbering: sequential with month suffix (`CH #001/Sep`), per trade name, auto-generated and
overridable.

**Delivered ≠ accepted.** Each line records quantity delivered and quantity accepted
(defaults equal, edited if the signed challan comes back short). Only the accepted quantity
counts toward the PO line's Delivered figure and toward what may be invoiced. Rejected
goods are explicitly recorded as "return to inventory" or "write off" — never assumed. A
later return (after acceptance) reverses inventory and, if already invoiced, produces a
credit adjustment on the customer ledger.

Accepting goods writes an `inventory_movements` row (decrement) and, for customers **not**
flagged "Issues Performa Invoice" (Chaseup, ChaseValue, Kifayat), also writes a `Credit` row
to `ledger_entries` — this is when their receivable arises, since no invoice exists inside
this system for them.

## Invoicing, Payments & the Customer Ledger

- **GST Sales Tax Invoice** — prepared externally by the accountant; this system only
  stores the received PDF as an attachment against the PO/Challan. Never replicate its
  calculation or layout.
- **Performa Invoice** — only for customers flagged "Issues Performa Invoice" = Yes
  (currently Habbitt only). Generated once a PO is fully/partly delivered; replaces the
  manual Excel→PDF process and the standalone "Global Distributors Performa Invoice" tool
  (merged in, not kept separate). Auto-inserts signature/stamp for the chosen trade name.
  Line tax rate configurable, defaulting to 18%. Numbering: sequential per trade name,
  auto-generated, overridable. Issuing an invoice updates the PO line(s)' Invoiced quantity
  and writes a `Credit` row to `ledger_entries` (Habbitt's posting event).
- **One invoice may cover multiple POs** — modeled via `invoice_lines.po_line_id` per
  line; the invoice header's PO list is derived from its lines, never stored separately.
- **Customer ledger** — Date | Invoice # | PO Number | Description | Debit | Credit |
  Balance. Billing events post as Credit; payments received post as Debit. **Balance is
  always a computed running total, never typed by hand.**
- **Payments (cheques)** — date, amount, cheque number, bank name, status
  (Received/Cleared/Bounced). A bounced cheque **reverses** via a new visible entry, never
  by deleting the original — the ledger stays an honest audit trail.
- **Opening balances** — required for go-live. Each customer's real existing Excel balance
  becomes an opening-balance row dated at cutover, from which the running balance
  continues. Historical row import is optional but supported.
- **Due dates & ageing** — invoice date + customer payment terms; outstanding view
  separates overdue from not-yet-due. Date-range filtering, prominent current balance,
  export to PDF/Excel.

## Cross-Cutting Technical Requirements

- **Users/access**: single internal team, Supabase Auth email/password (as in 001/002). No
  multi-tenancy, no customer login, no role hierarchy.
- **File attachments**: PO PDFs, scanned signed Challans, external GST invoice PDFs,
  signature/stamp images — needs Supabase Storage, set up starting with the first feature
  that needs it (004, trade names).
- **Document immutability**: the 002 pattern (read-only once partially consumed) extends
  to Challans (once issued) and invoices (once posted to the ledger). Corrections happen
  through explicit adjustment/reversal entries, never silent edits.
- **Traded-goods costing**: weighted average cost per product, recalculated on each
  purchase.
- **Consistency with 001/002**: Postgres schema with real foreign keys, Server Actions (no
  separate REST layer), ILIKE/substring search, active/inactive status over hard deletes
  where history matters, PKR with 2-decimal rounding, RLS on every table.
- **Scale**: small (4–10 customers, a handful of contractors, a few hundred POs/year, a
  few thousand ledger rows/customer over years). Design for clarity and correctness, not
  scale — no caching layers, search infra, queues, or sharding.

## Profit & Reports (final rollup)

Per production batch (raw material/labour/total cost, revenue, profit, wastage); per
product (produced/sold/revenue/cost/margin); per customer (billed/received/outstanding/
overdue); per traded item (weighted-avg cost vs. selling price, margin); overall business
profit over a date range; contractor commission summary; wastage trend across batches.

## Module Roadmap

Built in this order, each going through the full spec → plan → tasks → analyze → implement
cycle. Two shared, insert-only ledger tables (`inventory_movements`, `ledger_entries`) are
introduced **ahead of** their own presentation features, at the point their first real
writer appears — agreed 2026-09-20 to resolve two ordering tensions in the original build
plan (a Challan/Invoice-before-Ledger-feature conflict, and a Challan-before-Inventory-
feature conflict). See "Shared-table decisions" below.

| # | Feature | Summary | Status |
|---|---------|---------|--------|
| 001 | Supplier Directory | Suppliers: contacts, materials, active/inactive, search/filter | ✅ Implemented |
| 002 | Raw Material Purchases | Purchases by weight (kg)/rate, total cost, remaining-weight lock | ✅ Implemented |
| 003 | Product Catalog | Foundation catalog: traded/manufactured, customer item codes, yield ratios, labour rates, prices | ✅ Implemented |
| 003b | Traded-Goods Purchasing (extends 002) | Adds a per-unit `purchase_mode` to the existing purchases table (not the weight columns); introduces the `inventory_movements` table as its first writer | ✅ Implemented |
| 004 | Trade Names & Document Settings | Letterheads, NTN, signature/stamp upload, document number sequences, Supabase Storage setup | ✅ Implemented |
| 005 | Customers | Legal/display names, addresses, NTN, payment terms, usable trade names, Performa Invoice flag; introduces the `ledger_entries` table to hold each customer's opening balance | ✅ Implemented |
| 006 | Customer Purchase Orders | PO intake, line items, Ordered/Delivered/Invoiced tracking, PDF attachment | ✅ Implemented |
| 007 | Challans | Delivery challans against POs, accepted-vs-delivered, rejections/returns, signed-copy upload; writes `inventory_movements` and, for non-Performa customers, `ledger_entries` Credits | ✅ Implemented |
| 008 | Performa Invoicing | Invoice generation with auto signature/stamp, GST invoice attachment, invoice numbering; writes `ledger_entries` Credits for Performa-Invoice customers | ✅ Implemented |
| 009 | Customer Ledger | Presentation only: computed running-balance view, ageing, cheque/payment capture (with bounce reversal), opening-balance entry, export | ✅ Implemented |
| 010 | Production Batches | Lot → packets, wastage reporting, cost absorption, average cost per packet; writes `inventory_movements`; creates the minimal `contractors` table; one-time manufactured opening stock (+ at most one correction) | ✅ Implemented |
| 011 | Labour / Commission Ledger | Contractor khata: earnings posted by batch completion, cash-only payments linked to batches, opening balance, reversals and adjustments, period settlements that lock earlier dates (incl. batch completion), printable statement (ADR-0010) | ✅ Implemented |
| 012 | Finished Goods Inventory | Presentation only: stock-per-product views over `inventory_movements`, with cost value | Planned |
| 013 | Profit & Reports | Full rollup across purchases, batches, labour, POs, challans, invoices, ledger | Planned |

### Shared-table decisions (from the two ordering tensions)

- **`inventory_movements`** (insert-only: `product_id`, `qty_delta`, `reason`,
  `source_type`/`source_id`, `movement_date`) is created at **003b**, not 012, because
  traded-goods purchases are its first real writer. 007 and 010 write to it as they ship;
  012 is purely a read-side aggregation. A manual/opening stock-adjustment `reason` is
  included from day one as a hedge for the window where 007 (Challans against manufactured
  products) ships before 010 (Production Batches) — without it, manufactured stock could
  show negative with no recorded source until 010 exists.
- **`ledger_entries`** (`customer_id`, `entry_date`, `type` debit/credit, `amount`,
  `source_type`/`source_id`, `description`) is created at **005**, not 009, because a
  customer's opening balance (§9.5 requirement) must be postable at customer-creation
  time. 007 and 008 write Credits into it as they ship; `customer_payments` (cheque
  details, bounce handling) and all ageing/export views live entirely in 009.

## Resolved Open Points

1. **Traded-goods purchasing** — extend 002's existing purchases table (feature 003b)
   rather than a separate table, but via a new `purchase_mode` enum (`weight`/`unit`) and
   new nullable unit-mode columns (`quantity_units`, `rate_per_unit`, `remaining_units`,
   a mode-keyed generated `total_cost`) — not by overloading the existing weight columns,
   to avoid destabilizing the already-shipped consumption lock. Unit-mode rows require a
   `product_id`; weight-mode rows (fabric lots) do not.
2. **Tax on Performa Invoices** — configurable per line, defaulting to 18%.
3. **One invoice, multiple POs** — `invoice_lines.po_line_id` per line; the invoice
   header's PO list is derived, not stored (consistent with `total_cost`, the consumption
   lock, and the ledger's computed running balance).
4. **One batch, one lot, one product** — confirmed as the model; multiple batches cover
   multi-lot/multi-product scenarios.
5. **Currency and rounding** — PKR only, 2-decimal, as in 002.
6. **UOM mismatches** — default same-unit-different-label; a `conversion_factor numeric
   default 1` column on the customer-item-code mapping table is added now as a cheap hedge
   in case a real conversion is ever needed.
7. **Amount in words** — included on generated Performa Invoices.
8. **Trade name selection** — always a free per-document choice, defaulting to the
   customer's primary/last-used trade name; never restricted by customer or goods, even
   though today's usage pattern looks consistent. Not to be re-opened or re-encoded as a
   rule in any later spec.

### Carried forward for later clarification (non-blocking)

- Customer "usable trade names" (§ Customers) is a **default/sort-order hint only** in the
  UI — it must not be implemented as an enforced filter, since that would conflict with
  point 8 above.
- ~~When pre-filling a new production batch's contractor rate, precedence between the
  product's default labour rate and the contractor's own default rate is undecided~~ —
  **Resolved in 010 (ADR-0008)**: the batch pre-fills from the product's default labour rate
  only; the batch's entered rate is authoritative and frozen at completion. Any
  contractor-sourced rate is deferred to 011 and, if added, must be a contractor × product
  rate (a flat per-contractor rate would be wrong, since the rate depends mostly on the
  product); it would then take precedence over the product default for pre-fill only.

## Explicitly Out of Scope

Customer-facing portal/login; generating the formal GST Sales Tax Invoice; payroll or
per-worker payments to the contractor's home workers, and any record of a contractor's
sub-contract rate or commission margin (see the Labour / Commission Ledger note); e-commerce/online payments; barcode
scanning or warehouse location management; multi-currency; accounting integrations (Tally,
QuickBooks, FBR filing); mobile apps (responsive web is sufficient).

## Definition of Done for the Whole System

1. Every customer PO is entered once and its delivery, invoicing and payment status is
   visible without opening Excel.
2. Challans and Performa Invoices print with the correct letterhead, signature and stamp
   without any manual copy-paste.
3. Each customer's ledger balance matches the real balance, continuing correctly from the
   opening balance.
4. Production batches show kg in, packets out, wastage, and true cost per packet.
5. The contractor's weekly/monthly dues are calculated, not hand-tallied.
6. The Excel ledger files are retired.

## Cross-Cutting Notes for Future Specs

- **Data model continuity**: 003 (Product Catalog) is referenced by every later feature.
  003b introduces `inventory_movements`; 005 introduces `ledger_entries`. 007 and 010 write
  the former; 007 and 008 write the latter. 009 and 012 are presentation-only over tables
  that already exist by the time they're built.
- **Wastage visibility**: any feature touching raw-material-to-packet conversion must
  surface the weight difference/wastage explicitly, not just the converted amount.
- **Tech stack**: Next.js + Supabase (Postgres + Supabase Auth), deployed on Vercel (see
  [ADR-0001](../history/adr/0001-firebase-to-supabase-backend.md)). All modules from 003
  onward are planned directly against Postgres.

## Polish Backlog (known, low priority)

Pre-existing issues across features, deliberately deferred to a polish pass after 012/013.

- **Form submit before hydration (001–011)**: every React Hook Form form can be submitted in
  the brief moment after the page appears and before React hydrates it. That falls back to a
  plain browser GET to the same URL, which reloads the page and clears what was typed; nothing
  is saved. Fraction of a second in production, longer in dev on first compile. Fix idea: keep
  each Submit button disabled until hydrated. Logged 2026-09-29 during 011 QA.
- **Faint text inside inputs under a dark-mode OS setting (app-wide)**: inputs inherit the
  dark-mode foreground colour. Noted during 010's UI pass.
