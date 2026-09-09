---
id: 0008
title: Raw material purchases spec
stage: spec
date: 2026-09-10
surface: agent
model: claude-sonnet-5
feature: 002-raw-material-purchases
branch: 002-raw-material-purchases
user: imtiazkind143@gmail.com
command: /sp.specify
labels: [spec, raw-material-purchases, textile-supplier-management]
links:
  spec: specs/002-raw-material-purchases/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/PRODUCT-OVERVIEW.md
 - specs/002-raw-material-purchases/spec.md
 - specs/002-raw-material-purchases/checklists/requirements.md
tests:
---

## Prompt

Here's the extended business scope for this project — please review it and update the general project context/spec accordingly:

[# Extended Business Scope — Textile Trading, Production & Sales Management

## Business Model Overview

This system manages a textile trading and small-scale contract-manufacturing business with three connected revenue streams:

1. **Trading**: Purchase finished/semi-finished items from market suppliers and resell to customers (primary customer: Habitt) with a profit margin.
2. **Contract Manufacturing (commission-based)**: Raw material (e.g. fabric/cloth) is purchased by weight (kg) from suppliers. This raw material is handed to a manufacturing contractor who converts it into finished packaged products. The contractor is paid a fixed rate per packet produced (e.g. Rs 6/packet). The contractor may sub-contract to home workers at a lower rate (e.g. Rs 5/packet), keeping the difference (Rs 1/packet) as their own commission. The business only needs to track what it pays the contractor in total and the contractor's commission for reference — not the sub-worker payments.
3. **Sales**: Finished packets are sold to customers (Habitt and possibly others) at a per-packet price (e.g. Rs 120/packet).

## Key Workflow: Raw Material → Production Batch → Sales

Example: A 3,000 kg raw material lot is purchased for a given total cost. From this lot, packets are produced — but only part of the weight actually converts into sellable packets (e.g. 2,900 kg worth), and the difference (100 kg) is wastage/loss that must be tracked and visible.

Each product type has its own **kg-to-packet yield ratio** (e.g. 1 kg → 8 to 10 packets, varies by product). For every production batch, the system must calculate:

- Total packets produced from the raw material used
- Weight difference / wastage (raw material ordered vs. raw material actually converted)
- Total labour/commission cost = packets produced × contractor rate per packet
- Total sales revenue = packets sold × selling price
- **Net profit per batch = Sales Revenue − Raw Material Cost − Labour Cost**

## Product Types (catalog)

Each product needs these attributes:
- Name (e.g. "6-Pack Washcloth", "4-Pack Washcloth", "10-Pack Roll", "10-Pack Ribbon")
- Weight-to-packet yield ratio (kg → packets)
- Contractor labour rate per packet
- Default selling price per packet

More product types will be added over time — the system should make adding a new product type easy without code changes (data-driven, not hardcoded).

## Documents Needed

- **Challan**: Generated when goods are dispatched to a customer, listing products and quantities.
- **Invoice**: Generated for customers (especially Habitt) for billing. Must include the business's signature and stamp image.
- **Automation requirement**: Currently the signature and stamp images are manually pasted onto every challan/invoice by hand. The system should let the user upload the signature and stamp image ONCE in a Settings page, and automatically insert them into every generated Challan/Invoice PDF from then on.

## New Modules Needed (in addition to the already-built Supplier Directory)

1. **Raw Material Purchases** — extends supplier data; records purchases by weight (kg) and rate per kg, linked to a supplier, with total cost.
2. **Production Batches** — records: raw material batch used (kg), product type, packets produced, wastage/weight-difference calculation, date, assigned contractor.
3. **Labour / Commission Ledger** — tracks contractor: rate per packet, packets produced per period, total amount due, payments made, running balance, with weekly and monthly settlement views (similar in spirit to a khata/ledger).
4. **Finished Goods Inventory** — stock levels per product type (produced − sold = remaining).
5. **Customers & Sales / Challan** — customer directory (including Habitt), sales entries per product/quantity/price, auto-generates a Challan PDF.
6. **Invoicing** — generates an Invoice PDF for a sale/customer with the stored signature & stamp auto-inserted.
7. **Profit & Reports Dashboard** — shows per-batch profit, per-product profit, and overall business profit over a selected date range.

## Suggested Build Order (Spec-Driven Development, one feature at a time)

002-raw-material-purchases → 003-production-batches → 004-labour-commission-ledger → 005-finished-goods-inventory → 006-customers-sales-challan → 007-invoicing → 008-profit-reports

Each feature should go through the same spec → plan → tasks → implement cycle already used for 001-supplier-directory, so that later modules build on a data model that's already been reviewed and tested.]

Now let's create the spec for 002-raw-material-purchases first, following the same spec-driven cycle as 001-supplier-directory.

## Response snapshot

Created `specs/PRODUCT-OVERVIEW.md` as the general project context document (this SDD setup had no prior project-level overview beyond an unfilled constitution template) capturing the three revenue streams, the raw-material→batch→sales profit workflow, the data-driven product catalog, document/signature automation needs, and the full 002→008 module roadmap with cross-cutting data-continuity notes, for future specs to reference. Then ran `create-new-feature.ps1 -Number 2 -ShortName raw-material-purchases` to create branch `002-raw-material-purchases` and scaffold the spec. Wrote the full spec with 3 prioritized, independently-testable user stories (P1: record & view a purchase; P2: search/filter by supplier & date range with running totals; P3: edit/delete with lot-consumption locking), 14 functional requirements, 2 key entities (Raw Material Purchase, Supplier — referencing 001), and an Assumptions section resolving ambiguities (single currency, 2-decimal rounding, remaining-weight field reserved for the future Production Batches feature to consume, read-only lock once any weight is consumed, no future-dated purchases, hard delete since untouched purchases have no downstream references yet) instead of [NEEDS CLARIFICATION] markers. Created and validated the spec quality checklist — all items pass on first iteration.

## Outcome

- ✅ Impact: Project-level business context is now documented and feature 002's spec is complete and ready for planning; no open clarification markers block progress.
- 🧪 Tests: None (spec stage — no code yet)
- 📁 Files: specs/PRODUCT-OVERVIEW.md (new), specs/002-raw-material-purchases/spec.md (new), specs/002-raw-material-purchases/checklists/requirements.md (new)
- 🔁 Next prompts: `/sp.plan` to design the technical approach for raw material purchases (extending the existing Next.js + Firestore + Firebase Auth stack), or `/sp.clarify` if the user wants to challenge any documented assumption first.
- 🧠 Reflection: Because 002 is the first module in a multi-feature chain (002→008) that all reference each other's data, the spec deliberately scoped "remaining weight" as a field-only placeholder (no consumption UI/logic) so 003 has something concrete to build against without 002 overreaching into 003's responsibility.

## Evaluation notes (flywheel)

- Failure modes observed: None — script ran cleanly on the first attempt (no repeat of the 001 Join-Path PS 5.1 issue, which was already fixed).
- Graders run and results (PASS/FAIL): Spec quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): When starting 003-production-batches, confirm the "remaining weight" field and locking rule introduced here are sufficient for that feature's consumption logic before designing new fields.
