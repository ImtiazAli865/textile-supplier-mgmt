# Product Overview: Textile Trading, Production & Sales Management

**Status**: Living document — updated as business scope evolves
**Last Updated**: 2026-09-10

This document captures the overall business context and module roadmap for the system.
Individual features are specified, planned, and implemented one at a time under
`specs/<NNN-feature-name>/`, following the Spec-Driven Development (SDD) cycle
(spec → plan → tasks → implement). This file is the shared context those features draw
from — it is not itself a feature spec, and it does not replace `/sp.specify` for any module.

## Business Model

The business runs three connected revenue streams:

1. **Trading** — Purchase finished/semi-finished items from market suppliers and resell to
   customers (primary customer: Habitt) with a profit margin.
2. **Contract Manufacturing (commission-based)** — Raw material (e.g. fabric/cloth) is
   purchased by weight (kg) from suppliers and handed to a manufacturing contractor who
   converts it into finished packaged products. The contractor is paid a fixed rate per
   packet produced (e.g. Rs 6/packet); the contractor may sub-contract to home workers at a
   lower rate (e.g. Rs 5/packet), keeping the difference as their own commission. The
   business only tracks what it pays the contractor in total and the contractor's
   commission for reference — sub-worker payments are out of scope.
3. **Sales** — Finished packets are sold to customers (Habitt and possibly others) at a
   per-packet price (e.g. Rs 120/packet).

## Key Workflow: Raw Material → Production Batch → Sales

A raw material lot (e.g. 3,000 kg) is purchased for a total cost. From this lot, packets
are produced, but only part of the weight actually converts into sellable packets (e.g.
2,900 kg worth) — the difference (100 kg) is wastage/loss that must be tracked and visible.

Each product type has its own **kg-to-packet yield ratio** (e.g. 1 kg → 8–10 packets,
varies by product). For every production batch, the system must calculate:

- Total packets produced from the raw material used
- Weight difference / wastage (raw material ordered vs. actually converted)
- Total labour/commission cost = packets produced × contractor rate per packet
- Total sales revenue = packets sold × selling price
- **Net profit per batch = Sales Revenue − Raw Material Cost − Labour Cost**

## Product Catalog

Products are data-driven (no code changes to add a new product type). Each product type
has:

- Name (e.g. "6-Pack Washcloth", "4-Pack Washcloth", "10-Pack Roll", "10-Pack Ribbon")
- Weight-to-packet yield ratio (kg → packets)
- Contractor labour rate per packet
- Default selling price per packet

## Documents

- **Challan** — generated when goods are dispatched to a customer, listing products and
  quantities.
- **Invoice** — generated for customer billing (especially Habitt); must include the
  business's signature and stamp image.
- **Signature/stamp automation** — the user uploads signature and stamp images once in a
  Settings page; the system auto-inserts them into every generated Challan/Invoice PDF
  from then on (replacing the current manual paste-per-document process).

## Module Roadmap

Built in this order, each going through the full spec → plan → tasks → implement cycle so
later modules build on an already-reviewed, tested data model:

| # | Feature | Summary | Status |
|---|---------|---------|--------|
| 001 | Supplier Directory | Manage fabric/material suppliers: contacts, materials, payment terms, status | ✅ Implemented |
| 002 | Raw Material Purchases | Purchases by weight (kg) and rate/kg, linked to a supplier, with total cost | 🚧 In progress (this spec) |
| 003 | Production Batches | Raw material used (kg) → product type → packets produced, wastage calc, contractor assignment | Planned |
| 004 | Labour / Commission Ledger | Contractor rate/packet, packets produced per period, amount due, payments, running balance (weekly/monthly settlement, khata-style) | Planned |
| 005 | Finished Goods Inventory | Stock levels per product type (produced − sold = remaining) | Planned |
| 006 | Customers & Sales / Challan | Customer directory (incl. Habitt), sales entries, auto-generated Challan PDF | Planned |
| 007 | Invoicing | Invoice PDF per sale/customer, auto-inserted signature & stamp | Planned |
| 008 | Profit & Reports Dashboard | Per-batch, per-product, and overall profit over a date range | Planned |

## Cross-Cutting Notes for Future Specs

- **Data model continuity**: Production Batches (003) will reference Raw Material
  Purchases (002) by lot/batch; Labour Ledger (004) and Finished Goods Inventory (005)
  will reference Production Batches (003); Sales/Challan (006) will reference Finished
  Goods Inventory (005) and Customers; Invoicing (007) will reference Sales (006);
  Profit & Reports (008) reads across Purchases, Batches, Labour, and Sales.
- **Product type catalog** (name, yield ratio, labour rate, default price) is shared
  reference data needed starting with Production Batches (003) — it does not need to
  exist for 002, but 002's supplier/material linkage should stay compatible with it.
- **Tech stack**: Next.js + Supabase (Postgres + Supabase Auth), deployed on Vercel
  (switched from Firestore/Firebase Auth on 2026-09-16 — see
  [ADR-0001](../history/adr/0001-firebase-to-supabase-backend.md) — after 001 and 002 were
  already implemented; all modules from here on (003+) are planned directly against Postgres).
- **Wastage visibility**: any feature touching raw-material-to-packet conversion must
  surface the weight difference/wastage explicitly, not just the converted amount.
