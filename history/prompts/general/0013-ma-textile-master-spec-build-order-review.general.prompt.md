---
id: 0013
title: MA Textile master spec build-order review
stage: general
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: none
branch: 002-raw-material-purchases
user: ImtiazAli865
command: none
labels: ["architecture", "master-spec", "build-order", "product-catalog", "ledger", "inventory"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
tests:
---

## Prompt

# MA Textile — Complete System Specification (Master Context)

This is the authoritative, consolidated description of the business and the system to be built. It supersedes all earlier partial descriptions, including the current `specs/PRODUCT-OVERVIEW.md` — please update that file to match this document.

**Already built and working** on the current stack (Next.js + Supabase/Postgres + Supabase Auth, deployed to Vercel):
- **001-supplier-directory** — suppliers with contacts, materials, active/inactive status, search/filter
- **002-raw-material-purchases** — purchases by weight (kg) with rate/kg, total cost, remaining-weight tracking, and a read-only lock once a lot is partially consumed

Everything below describes what still needs to be built, and how it connects to those two.

---

## 0. Glossary

Terms used throughout this document, as the business uses them:

| Term | Meaning |
|---|---|
| **PO (Purchase Order)** | A written order **issued by a customer to this business**. In this system, "PO" always means an incoming customer order — never this business's own purchases from suppliers (those are "purchases", per 002). |
| **Challan** | A delivery note printed and sent with goods. The customer's receiving staff sign it as proof of receipt. |
| **Performa Invoice** | A billing document this business issues to certain customers (currently only Habbitt) after delivery. |
| **Sales Tax Invoice / GST Invoice** | A formal tax invoice prepared by an **external accountant**, not by this system. Only stored as an attachment. |
| **Lot** | A single raw-material purchase (e.g. 3,000 kg of fabric bought at one rate) — the unit that production draws from. |
| **Packet** | One finished, packaged sellable unit (e.g. one 6-Pack Washcloth pack). |
| **Khata / Ledger** | A running Debit / Credit / Balance account, kept per customer and per contractor. |
| **Trade name** | One of the several business identities used for billing (Global Distributors, M Zayan Impex, etc.), each with its own letterhead and NTN. |

---

## 1. The business in one page

The business supplies large retail chains in Karachi, Pakistan. There are **two distinct revenue streams**, and the system must handle both.

### Stream A — Trading (buy and resell)
Items are purchased from the market and resold to the customer at a margin, with no manufacturing. Example customer: **Habbitt** (legal entity: Universal Retail (PVT) LTD), billed under the trade names **"Global Distributors"** or **"IBL Frontier Market"**. Typical items: Bonded Polyester Fibre, Cushion Dori, Channel SMC 12"/14", Gun Pin, Hydraulic Hinges, Screws, Upholstery Zip, Markin Fabric, Ball Fiber. Bought per unit (yd, PAC, PAA, Units) at a purchase price, resold at a higher price.

**Profit = Selling price − Purchase cost.**

### Stream B — Contract manufacturing (buy fabric by weight, manufacture, sell)
Raw fabric is purchased **by weight (kg)** from market suppliers. It is handed to a **manufacturing contractor** who converts it into finished, packaged products. The contractor is paid a fixed rate per packet produced (e.g. Rs 6/packet); the contractor sub-contracts to home workers at a lower rate (e.g. Rs 5/packet), keeping the difference (Rs 1/packet) as their own commission. The business tracks **what it pays the contractor** and, for reference only, **the contractor's commission margin** — never the sub-workers' individual payments.

Example customers: **Chaseup** (billed as "M Zayan Impex"), **ChaseValue** (billed as "M.A Textile"), **Kifayat** (billed as "Rashid Towel"). Typical products: 6-Pack Washcloth, 4-Pack Washcloth, 10-Pack Roll, 10-Pack Ribbon — more will be added, so this must be data-driven, never hardcoded.

**Profit = Sales Revenue − Raw material cost − Labour/commission cost.**

### Worked example of Stream B — the core calculation to get right
A 3,000 kg lot of fabric is bought for Rs 200,000 (Rs 66.67/kg). The lot is issued to production. Only ~2,900 kg actually converts into sellable packets; the ~100 kg difference is wastage and must be clearly visible as a number the owner can watch.

**Important costing rule:** the full 3,000 kg was paid for, so the **entire issued weight's cost (Rs 200,000) must be absorbed into the packets produced**. Wastage is reported as a quantity and as a rupee value, but it is **not** deducted from the cost basis — otherwise roughly Rs 6,667 of real cost would silently vanish and reported profit would be overstated. See §4 for the exact formulas.

---

## 2. Products — the foundation (build this first)

Nothing else works without a product catalog. Every PO line, challan line, invoice line, production batch and inventory record points at a product.

Each product record needs:
- **Name** (e.g. "6-Pack Washcloth", "Ball Fiber", "Channel SMC 12\"")
- **Internal code** (optional, this business's own reference)
- **Customer-specific item codes** — customers use their own codes on their POs (e.g. `[3109000002] Ball Fiber` from Habbitt, `10000008306632` from Chaseup). One product may carry a **different code for each customer**, so this is a one-to-many relationship, not a single field. When a customer's PO is entered, their code should resolve to the right product.
- **Type**: `traded` (bought and resold as-is) or `manufactured` (produced from raw material)
- **Stock UOM** — the unit stock is held in (usually "packet" for manufactured goods, the purchase unit for traded goods)
- **Selling UOM per customer** — customers order in their own units (yd, PAC, PAA, Units, sets, feet, pcs). See §14.6.
- For `manufactured` products only:
  - **Expected kg-to-packet yield ratio** (e.g. 1 kg → 8–10 packets). This is a **planning/variance figure only** — see §4 for how it is used versus actual production figures.
  - **Default contractor labour rate per packet** (a batch may override it)
- For `traded` products only:
  - **Current purchase cost per unit** (maintained as a weighted average — see §11)
- **Default selling price per unit/packet** — may be overridden per PO, since each customer's PO carries its own agreed price
- Active/inactive status

Adding a new product must be ordinary data entry — never a code change.

---

## 3. Customers

At minimum: **Habbitt**, **Chaseup**, **ChaseValue**, **Kifayat**. More will be added.

**Legal name vs. display name.** The customer's legal entity on paperwork often differs from the name the business uses daily. Habbitt's POs and invoices are addressed to **"Universal Retail (PVT) LTD" / "UNIVERSAL RETAILS (PRIVATE) LIMITED"** (3rd Floor, One IBL Center, Plot No. 1, Block 7 & 8, D.M.C.H.S., Tipu Sultan Road, Off Shahrah-e-Faisal, Karachi; NTN A029996-8), while the business calls them "Habbitt". Chaseup's portal documents are issued by "Head Office - Sun Consulting". So each customer needs both a **display name** and a **legal/billing name and address**.

Per customer:
- Display name; legal/billing name; full billing address; ship-to / warehouse address(es); telephone; **NTN number**; Sales Tax Registration number if applicable
- Contact person(s)
- **Trade name(s) usable for this customer** — see §10. This can be more than one (Habbitt uses both Global Distributors and IBL Frontier Market), so trade name is **selected per PO/document**, defaulting to the customer's primary one. It is never a single fixed value on the customer record.
- **Flag: "Issues Performa Invoice" (Yes/No)** — Habbitt = Yes; Chaseup, ChaseValue, Kifayat = No. Every other part of the workflow applies to all customers regardless of this flag.
- **Payment terms** (e.g. "90 Days", "Net 60") — drives invoice due dates and ageing (§9)
- **Opening ledger balance** as of the go-live cutover date (§9)

Each customer has a **completely independent ledger** — never combined or netted against another customer.

---

## 4. Production batches (Stream B only) — quantity *and* cost value

A production batch records the conversion of raw material into finished goods.

### Recorded per batch
- Which **raw material lot** was used (links to 002-raw-material-purchases, and decrements that lot's remaining weight — this consumption is what triggers the existing read-only lock on the lot)
- **Weight issued (kg)** from that lot
- **Product** produced (must be a `manufactured` product)
- **Packets actually produced** (entered by the user — the real counted figure)
- **Weight actually converted (kg)** (entered by the user — the real figure)
- **Contractor** assigned (§5) and the **rate per packet** paid for this batch
- Batch date

### Expected yield vs. actual — resolving the apparent overlap
The product's expected kg-to-packet yield ratio (§2) and the user's entered actuals could conflict. To be explicit:

- **Actual entered figures are always authoritative.** All costs and inventory come from what the user actually counted.
- The expected yield ratio is used only to **pre-fill a suggested packet count** when the batch is created, and to show a **variance** ("expected ~24,000 packets from 3,000 kg, actual 23,100 — 3.8% under").
- The system must never silently overwrite an actual with a calculated value.

### Calculated and stored per batch
```
Raw material cost   = weight ISSUED (kg) × the lot's purchase rate per kg
Labour cost         = packets produced × contractor rate per packet
Total production cost = raw material cost + labour cost
Average cost per packet = total production cost ÷ packets produced

Wastage (kg)        = weight issued − weight converted
Wastage value (Rs)  = wastage (kg) × the lot's rate per kg   [reported only]
Wastage %           = wastage ÷ weight issued
```

**Note the deliberate choice:** raw material cost uses **weight issued**, not weight converted. The business paid for every kilogram it took out of the lot, so the packets produced must carry that full cost. Wastage is surfaced separately as a quantity, a rupee value and a percentage so the owner can monitor it — but it is never deducted from the cost basis. Reporting wastage and absorbing its cost are two different things, and both are required.

Total production cost is the **cost basis** of those packets and is what gets subtracted from sales revenue to produce profit (§12). The data model must support that link from day one.

Visible at a glance on the batch record: kg issued, kg converted, wastage (kg / Rs / %), packets produced, expected-vs-actual variance, total production cost, average cost per packet.

---

## 5. Labour / commission ledger (contractor khata)

Each manufacturing contractor has a running account, settled weekly or monthly:
- **Contractor profile**: name, contact, default rate per packet, and (for reference only) the rate they sub-contract at, so their per-packet commission margin can be displayed
- **Amount earned** — accrues automatically from production batches (packets produced × rate per packet)
- **Payments made** to the contractor: date, amount, note
- **Running balance** = total earned − total paid = currently owed
- **Weekly and monthly settlement views** showing packets produced and amount due for the period

Structurally identical to a worker khata: work accrues a balance, payments reduce it.

---

## 6. Finished goods inventory

Stock on hand per product, from two different sources depending on product type:
- **Manufactured products** — stock increases when a production batch is recorded
- **Traded products** — stock increases when a purchase of that item is recorded (see §14.1 on how traded purchasing fits alongside the existing weight-based 002)

Stock **decreases** when goods are accepted by the customer against a Challan (§8), and **increases again** if goods are rejected or returned.

The inventory view shows per product: quantity on hand and the total cost value of that stock (cost basis from §4 for manufactured goods, weighted-average purchase cost for traded goods).

---

## 7. Customer Purchase Orders

The pattern to follow is the enterprise supplier portal this business's own customers use (Oracle iSupplier, as used by Chaseup): a PO detail view where each line shows **Ordered / Delivered / Invoiced** quantities side by side, with a header summary of **Total value / Delivered value / Invoiced value / Payment status**.

POs arrive as PDFs from the customer's system and are entered manually. Capture:
- PO Number, PO Date, Customer, Purchaser/contact name, Delivery Date, Destination/warehouse
- Which **trade name** this PO will be billed under (§10)
- Line items: item code, description, Qty, UOM, Unit Price, Line total
- PO-level Gross Amount, Sales Tax and Net Amount where the customer's PO states them
- The original PO PDF as an **attachment**

Real example — Habbitt PO **P14337**, 05/08/2026, 12 lines: `[3109000003] Bonded Polyester Fibre (Falta)` 700 yd @ Rs 100 = Rs 70,000 … `[3109000002] Ball Fiber` 170 PAC @ Rs 2,850 = Rs 484,500. Gross Rs 1,152,700 + Sales Tax Rs 207,486 = Net Rs 1,360,186.

Each PO line maintains running **Ordered / Delivered / Invoiced** quantities, updated by Challans (§8) and Invoices (§9).

---

## 8. Challans (delivery notes)

When goods are physically delivered to the customer's warehouse, a Challan is generated and printed. **One PO may be delivered across several Challans** over time, so each PO line tracks delivered-so-far versus still-pending.

### Challan format
Real example — Challan **CH #001/Sep**, 8/9/2026, to Universal Retails (Private) Limited:
- Company letterhead at top (selected trade name, §10)
- Challan #, Date, "TO" (customer legal name)
- Table: S.NO | Article (code) | Item Name | UOM | QTY
- Total row (total units)
- Two signature lines at the bottom: the company's signature, and "Vendor Signature" / receiving person's signature

The customer's staff sign the printed copy physically. The app does **not** capture a live signature — it produces the printed Challan, and the **scanned signed copy is uploaded afterwards** and attached as proof of receipt.

**Challan numbering**: sequential with a month suffix, matching the existing `CH #001/Sep` format, per trade name. Auto-generated, overridable.

### Short receipts, rejections and returns
Delivered quantity and **accepted quantity are not always equal**. The customer's own PO terms state that damage and shortages at the time of receiving are the supplier's responsibility, and their portal tracks Ordered versus Received per shipment for exactly this reason. So:

- Each Challan line records **quantity delivered** and **quantity accepted** (defaults to equal; edited when the signed challan comes back short)
- Only the **accepted** quantity counts toward the PO line's Delivered figure and toward what may be invoiced
- Rejected goods either return to inventory or are written off as loss — this must be an **explicit choice recorded on the line**, never an assumption
- A **later return** (goods sent back after acceptance) must also be recordable: it reverses inventory and, if already invoiced, produces a credit adjustment on the customer ledger (§9)

Accepting goods against a Challan **decrements finished goods inventory** (§6).

---

## 9. Invoicing, payments and the customer ledger

### 9.1 GST Sales Tax Invoice — external, record only
A formal Sales Tax Invoice (per-line GST breakdown, typically 18%) is prepared by a **third-party accountant**, not by this system. The system only lets the user **upload and attach the received GST invoice PDF** against the relevant PO or Challan. Do not replicate its calculation or layout.

(Reference: Global Distributors Sales Tax Invoice #143 to Universal Retails, 05-8-2026 — values excluding tax Rs 1,152,700, sales tax Rs 207,486, net Rs 1,360,186.)

### 9.2 Performa Invoice — only for customers flagged "Issues Performa Invoice" = Yes
Once a PO is fully or partly delivered, a Performa Invoice is generated and sent. This replaces both the current Excel→PDF manual process **and the separate "Global Distributors Performa Invoice" tool previously built** — that tool's logic is merged and rebuilt here, not maintained separately.

Format — real example, Invoice **#18**, 17-3-2026, against **PO 10284**:
- Letterhead: trade name, address, NTN number (§10)
- Title: "PERFORMA INVOICE"
- Invoice #, Date, PO Number
- Customer legal name, Address, Telephone, NTN No., Sales Tax Reg #, P.O No./Date, D.C No./Date
- Line items: Description (with item code in parentheses), Rate, Qty, Value Excluding Taxes, GST, Sale Tax, Net Total Amount
- Totals row across Value Excluding Taxes, Sale Tax, Net Total Amount
- **Signature and company stamp images auto-inserted** above "FOR [TRADE NAME]" — never manually pasted (§10)

Real line: `(3302002141) Ball Fiber Cushion Filling 12x18 250 Grams` — Rate 160, Qty 200, Value 32,000, Sale Tax 5,760, Net 37,760. Totals: 341,750 / 61,515 / 403,265.

**Invoice numbering**: sequential per trade name, auto-generated, overridable. Issuing an invoice updates each PO line's Invoiced quantity and posts to the customer ledger.

### 9.3 The customer ledger
Replaces the manual Excel ledger kept per customer. Columns: **Date | Invoice # | PO Number | Description | Debit | Credit | Balance**.

- A billing event posts as a **Credit**, increasing the Balance (what the customer owes)
- A payment received posts as a **Debit**, decreasing the Balance
- **Balance is always a computed running total** — never typed by hand

Real pattern from the Habbitt ledger: `20-9-2025 | Inv 1 | Po-04819 | warehouse | Credit 380,845 | Balance 380,845`, then `18-11-2025 | cheque received warehouse | Debit 58,033.80 | Balance 915,761.20`, and so on.

**Which event creates the Credit** depends on the customer:
- **Performa-Invoice customers (Habbitt)**: the Performa Invoice
- **Non-Performa-Invoice customers (Chaseup, ChaseValue, Kifayat)**: the **accepted Challan / delivery**, since that is when the receivable arises and no invoice exists inside this system

This second case has a build-order consequence — see §13.

### 9.4 Payment (cheque) details
A payment entry is more than an amount. Capture: date received, amount, **cheque number**, **bank name**, and **status** (Received / Cleared / Bounced). A bounced cheque must **reverse** its effect on the balance through a visible entry, never by deleting the original — the ledger must stay an honest audit trail.

### 9.5 Opening balances — required for go-live
The business is **not starting from zero**. Each customer already carries a substantial balance in the existing Excel ledger — Habbitt's shows a running balance of Rs 1,357,688.73 as of 28/8/2026. On go-live, each customer's ledger must continue from its **real existing balance**.

So the ledger must support:
- An **opening balance** entry per customer, dated at the cutover date, from which the running balance continues
- Optionally, **importing historical ledger rows** from the existing Excel files so past history is visible

Without this, balances are wrong from day one and the Excel files cannot be retired. This is a required part of the ledger feature, not an enhancement.

### 9.6 Due dates and ageing
Invoices carry a **due date** derived from invoice date plus the customer's payment terms. The outstanding view separates **overdue** from not-yet-due amounts.

The ledger view needs date-range filtering, the current outstanding balance shown prominently, and **export to PDF/Excel**, since these statements are shared with customers.

---

## 10. Trade names and document settings

A settings area holding the business's own trading identities, because every generated document depends on them.

**The business bills under five trade names.** Each is effectively a separate billing identity with its own letterhead, address, NTN, document number sequences, signature and stamp:

| Trade name | Currently used for |
|---|---|
| Global Distributors | Habbitt |
| IBL Frontier Market | Habbitt (alternate identity) |
| M Zayan Impex | Chaseup |
| Rashid Towel | Kifayat |
| M.A Textile | ChaseValue |

**Habbitt is billed under two different trade names**, so trade name is **chosen manually per PO/document**, defaulting to the customer's primary one. No rule may restrict which trade name is used for which customer or goods — any trade name must remain selectable for any customer. The other customers currently map to one trade name each, but the model must not assume that stays true.

Each trade name record holds:
- Trade name as printed (e.g. "GLOBAL DISTRIBUTORS")
- Full address as printed (e.g. Global Distributors: Plot No 4, Kokan Housing Society, Near Alamgir Road, Haiderali Road, Karachi East)
- **NTN number** (e.g. Global Distributors: A496807-7)
- Sales Tax Registration number, if applicable
- Its own **Challan number sequence** and **Invoice number sequence**
- Its own **signature image** and **company stamp image**

**Signature and stamp** are uploaded once per trade name and **auto-inserted into every generated Challan and Performa Invoice**. This directly replaces the current manual copy-paste of signature and stamp into every document, which is one of the biggest day-to-day time costs in the existing process.

---

## 11. Cross-cutting technical requirements

Settled once here, not re-decided per feature.

**Users and access.** This remains a **single internal team** system — the owner plus possibly one or two staff. Simple email/password auth via Supabase Auth, as already implemented. No multi-tenancy, no customer-facing login, no role hierarchy. Role separation, if ever needed, will be a separate explicit decision.

**File attachments.** Several features store uploaded files: the customer's PO PDF, the scanned signed Challan, the external GST invoice PDF, and signature/stamp images per trade name. This needs real file storage (Supabase Storage is the natural fit alongside the existing stack), with the file reference stored against the record. **This has not been set up yet** — plan for it when the first feature needing it is built, rather than discovering it late.

**Document immutability.** The read-only lock pattern already used in 002 (a lot becomes uneditable once partially consumed) applies consistently: once a Challan is issued or an invoice has posted to the ledger, it must not be freely edited or deleted. Corrections happen through explicit adjustment or reversal entries that leave an audit trail. Financial records that can be rewritten after the fact are worthless as a ledger.

**Costing method for traded goods.** Use **weighted average cost per product**, recalculated on each purchase. This gives every traded product a defensible purchase cost to compare against its selling price, making the margin in §12 computable.

**Consistency with existing features.** Follow the conventions already established in 001 and 002 — Postgres schema with proper foreign keys, Server Actions (no separate REST layer), ILIKE/substring search, active/inactive status rather than hard deletes where history matters, PKR with 2-decimal rounding, RLS enabled on every table.

**Expected data volumes.** Small: roughly 4–10 customers, a handful of contractors, a few hundred POs per year, a few thousand ledger rows per customer over several years. Design for clarity and correctness, **not** for scale — no caching layers, search infrastructure, queues or sharding.

---

## 12. Profit and reports

The final rollup, once the pieces above exist:
- **Per production batch**: raw material cost, labour cost, total cost, revenue from packets sold, profit, wastage
- **Per product**: total produced, total sold, revenue, cost, margin
- **Per customer**: total billed, total received, outstanding balance, overdue amount
- **Per traded item**: weighted-average purchase cost versus selling price, margin
- **Overall business profit** over a selected date range
- **Contractor commission summary** (weekly/monthly)
- **Wastage trend** across batches — a key operational number for the owner

---

## 13. Build order

Each feature goes through the existing spec → plan → tasks → analyze → implement cycle, one at a time. Dependencies drive this order:

1. **003-product-catalog** — foundation; everything references products. Customer-specific item codes, traded vs. manufactured, yield ratios, labour rates, prices.
2. **004-trade-names-and-document-settings** — trade names/letterheads, NTN, signature & stamp upload, document numbering, **and the file-storage setup** both later document features depend on.
3. **005-customers** — directory with legal/display names, addresses, NTN, payment terms, usable trade names, Performa Invoice flag, opening balance field.
4. **006-customer-purchase-orders** — PO intake with line items, Ordered/Delivered/Invoiced tracking, PDF attachment.
5. **007-challans** — delivery challans against POs, printed PDF, accepted-vs-delivered quantities, rejections/returns, signed-copy upload, inventory movement.
6. **008-performa-invoicing** — invoice generation with auto signature/stamp, GST invoice attachment, invoice numbering.
7. **009-customer-ledger** — automatic Debit/Credit/Balance, opening balances, cheque details and bounce handling, ageing, export.
8. **010-production-batches** — lot → packets, wastage reporting, cost absorption, average cost per packet.
9. **011-labour-commission-ledger** — contractor accounts, accrual from batches, payments, weekly/monthly settlement.
10. **012-finished-goods-inventory** — stock per product from production and purchases, moved by challans, with cost value.
11. **013-profit-reports** — the full rollup.

### Two ordering tensions — please address these in the plan rather than ignoring them

**(a) Inventory movement before the inventory feature.** Challans (007) decrement stock, but finished goods inventory is 012. Either build 007 so it *records* stock movements against a minimal stock table that 012 later builds views on top of, or pull 012 earlier. Do not let 007 ship with the stock movement silently missing.

**(b) Ledger postings before the ledger feature.** For Chaseup, ChaseValue and Kifayat the Credit is created by the accepted Challan (007), not by an invoice — but the ledger is 009. Same resolution: 007 and 008 should both write ledger entries to a table that 009 then presents, or 009 moves earlier. The posting logic must not be bolted on afterwards.

Both are deliberate consequences of front-loading the customer-facing side. That ordering is intentional: the manual Excel ledger and manual challan/invoice preparation are the biggest current pain points, and features 003–009 make the system genuinely useful for all four customers before any production work is built.

---

## 14. Open points — resolve with documented defaults, do not block

Please decide each of these, state the decision explicitly in the spec, and flag it for confirmation:

1. **Traded-goods purchasing.** 002-raw-material-purchases records purchases by weight (kg) for fabric. Traded items (Ball Fiber, Channel, Screws) are bought per unit. Extend 002 with a per-unit purchase mode, or add a separate traded-goods purchase record? Preference: extend 002 if it can be done cleanly, so all purchasing lives in one place — but only if it does not compromise the existing weight/lot/lock logic that is already working.
2. **Tax on Performa Invoices.** Real examples show both an 18% sales tax column and a 0% GST column. Make the rate configurable per line or per invoice, defaulting to 18%.
3. **One invoice, multiple POs.** The existing ledger has at least one entry referencing two POs together (`Po-07064 / Po-07279`), so many-to-many between invoices and POs should probably be supported.
4. **One batch, multiple products or multiple lots.** Can a single production batch draw from more than one raw material lot, or produce more than one product? The simplest model is one lot → one product per batch, with multiple batches recorded where needed. Confirm this is workable before assuming it.
5. **Currency and rounding.** PKR only, 2-decimal rounding, consistent with 002.
6. **UOM mismatches.** Customers order in their own units (sets, PAC, PAA, yd, feet, pcs) while stock is held in packets or purchase units. Is a conversion factor needed, or is it always 1:1 with a different display label? Default to same-unit-different-label, and flag if a real conversion is required.
7. **Amount in words.** The customer's own PO prints the net amount in words. Should generated Performa Invoices do the same? Assume yes unless told otherwise — it is cheap to add.

**Already decided — do not re-open or add rules for this:** the trade name on a PO/document is chosen **manually by the user on every PO**, defaulting to the customer's primary or last-used one. In current practice Habbitt's choice between "Global Distributors" and "IBL Frontier Market" happens to depend on the type of goods, but **this must not be encoded as a rule or constraint**. Any trade name stays selectable for any customer and any goods, so the business can change that practice later without a code change.

---

## 15. Explicitly out of scope

Do not build these, and do not design for them:
- Customer-facing portal or login — customers never access this system
- Generating the formal GST Sales Tax Invoice (external accountant's job; we only attach theirs)
- Payroll or per-worker payments for the contractor's home workers — only the contractor's own account is tracked
- E-commerce, online payments, or payment gateway integration
- Barcode scanning or warehouse location management
- Multi-currency (PKR only)
- Accounting integrations (Tally, QuickBooks, FBR filing)
- Mobile apps — responsive web is sufficient

---

## 16. Definition of done for the whole system

The system replaces the current manual process when:
1. Every customer PO is entered once and its delivery, invoicing and payment status is visible without opening Excel
2. Challans and Performa Invoices print with the correct letterhead, signature and stamp **without any manual copy-paste**
3. Each customer's ledger balance in the system matches the real balance, continuing correctly from the opening balance
4. Production batches show kg in, packets out, wastage, and true cost per packet
5. The contractor's weekly/monthly dues are calculated, not hand-tallied
6. The Excel ledger files are retired

---

## 17. What I need right now

Please create **specs only** — no `/sp.plan`, no `/sp.tasks`, no `/sp.implement` yet — for the first feature in the build order, **003-product-catalog**, and update `specs/PRODUCT-OVERVIEW.md` to reflect this master document and the roadmap in §13.

**Before writing that spec**, respond to me with:
- Your view of the build order in §13, especially the two ordering tensions in §13(a) and §13(b)
- How you would resolve each open point in §14
- Anything in this document you find contradictory, under-specified, or technically unwise

I want to agree those points before any spec is written.

---

The user's closing instruction (§17, "What I need right now") asked explicitly for:
1. My view of the build order in §13, especially ordering tensions §13(a) (inventory movement recorded by Challans/007 before the Finished Goods Inventory feature/012 exists) and §13(b) (ledger credit postings written by Challans/007 and Performa Invoicing/008 before the Customer Ledger feature/009 exists).
2. How I would resolve each of the seven open points in §14 (traded-goods purchasing mode, Performa Invoice tax configurability, one-invoice-multiple-POs, one-batch-one-lot-one-product, currency/rounding, UOM mismatches, amount-in-words).
3. Anything in the document I find contradictory, under-specified, or technically unwise.
4. Explicit instruction: create **specs only** for 003-product-catalog and update `specs/PRODUCT-OVERVIEW.md` — but **not yet**. First, respond and reach agreement before writing any spec, plan, tasks, or code.

## Response snapshot

Responded without writing any spec/code, per the user's explicit "before writing that spec" instruction. Grounded the answer by reading `specs/002-raw-material-purchases/data-model.md` (the generated `total_cost` column, the derived consumption lock on `remaining_weight_kg < weight_kg`, the FK-to-suppliers pattern) and the current `specs/PRODUCT-OVERVIEW.md` roadmap, so the recommendations reference the real shipped schema rather than the abstract spec text.

Key positions taken:
- Build order 003→013 endorsed as-is, with one insertion: **003b — extend 002 for per-unit traded-goods purchases** placed immediately after 003, before 004.
- Tension (a) resolved by introducing an insert-only `inventory_movements` ledger table at 003b (its first writer, once traded purchases exist) rather than waiting for 012; 012 becomes a pure read-side aggregation. Flagged a real sequencing gap: manufactured-product Challans (007) ship before Production Batches (010), so manufactured stock could go negative with no recorded source in that window — recommended a manual/opening stock-adjustment movement type on `inventory_movements` from day one as mitigation, rather than reordering features.
- Tension (b) resolved by introducing `ledger_entries` at **005 (customers)**, not 007 — traced from §9.5's requirement that an opening-balance row must exist at customer creation time, which is earlier than any Challan/Invoice can post. 007 and 008 post into the pre-existing table; 009 stays presentation-only (running balance as a computed window-function view, ageing, cheque/payment capture, export). Payments/cheques (§9.4) live entirely in 009 via a `customer_payments` table referenced from ledger_entries rows.
- Surfaced (per CLAUDE.md's ADR-suggestion contract, without auto-creating) the ADR suggestion: "pulling `inventory_movements` and `ledger_entries` forward as shared tables ahead of features 012 and 009" — three-part test (impact/alternatives/cross-cutting) all trip.
- Open point 1 (traded purchasing): extend 002's existing `raw_material_purchases` table with a `purchase_mode` enum and new nullable unit-mode columns (`quantity_units`, `rate_per_unit`, `remaining_units`, mode-keyed generated `total_cost`), rather than overloading the existing weight columns — explicitly to avoid destabilizing the already-shipped lock logic. Unit-mode rows require `product_id`; weight-mode rows don't (fabric lots aren't a catalog product). Flagged this specific decision as ADR-worthy once planned.
- Open points 2, 4, 5, 7: agreed with the document's own preferred defaults as stated, no changes.
- Open point 3 (invoice↔PO): recommended `invoice_lines.po_line_id` per-line references over a separate junction table, deriving the invoice header's PO list rather than storing it — consistent with the project's existing "derive, don't store" convention (`total_cost`, the consumption lock, and the new computed ledger balance).
- Open point 6 (UOM): agreed on same-unit-different-label default, added a `conversion_factor numeric default 1` column on the customer-item-code mapping table now as a cheap hedge against a future real-conversion requirement.
- Flagged three contradictions/underspecified items for the user's awareness (not blocking): (i) §3's customer "usable trade names" list appears to conflict with §10's "no rule may restrict trade name by customer" — resolved by treating the customer list as a non-enforcing default/sort-order hint only; (ii) contractor rate-per-packet has three possible sources (product default, contractor default, batch actual) with no stated precedence between the two defaults — deferred as a clarifying question for the future 010 spec, since the batch's actual entered rate is already established as authoritative; (iii) 002's original lock design assumed Production Batches would arrive as feature "003" and consume `remaining_weight_kg` soon — now feature 010 in the new numbering — confirmed this requires no rework, lots simply stay unconsumed/editable until then.
- Ended by asking the user to confirm the reordering and open-point resolutions before proceeding to `/sp.specify` for 003-product-catalog and rewriting `specs/PRODUCT-OVERVIEW.md`.

## Outcome

- ✅ Impact: Architectural alignment reached (pending user confirmation) on build order, two ordering-tension resolutions, and all seven §14 open points, ahead of any spec/plan/tasks/code work. No files changed except this PHR.
- 🧪 Tests: none (discussion/analysis only, no code).
- 📁 Files: none created or modified except this PHR record.
- 🔁 Next prompts: pending user confirmation — expected next steps are (1) update `specs/PRODUCT-OVERVIEW.md` to match this master document and the revised roadmap, (2) `/sp.specify` for `003-product-catalog`, (3) possibly `/sp.adr` for the shared-ledger/inventory-tables decision and the 002 traded-purchasing-extension schema decision once each reaches its planning stage.
- 🧠 Reflection: User explicitly gated further action on agreement to avoid rework; honored that by responding in chat only, no artifacts, no `/sp.specify` invocation yet.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): not applicable — no automated graders configured for this stage.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
