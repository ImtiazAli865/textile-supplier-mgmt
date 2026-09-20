---
id: 0001
title: Customer purchase orders feature specification
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "purchase-orders", "customers", "business-sensitive"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/spec.md
 - specs/006-customer-purchase-orders/checklists/requirements.md
 - history/prompts/006-customer-purchase-orders/0001-customer-purchase-orders-spec.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

005-customers is complete and verified. Manual mode is on, so please create the spec
ONLY for 006-customer-purchase-orders — no /sp.plan, /sp.tasks, or /sp.implement yet.

Key points to cover:
1. Capturing an incoming customer PO — PO number, order date, line items, quantities, agreed price per line, and how it resolves each line's customer-specific item code to a product via 005's customer_product_mappings (pre-filling price from default_price when available, but always storing the PO's own entered price as authoritative).
2. Different customers submit POs differently — Habbitt sends a PDF PO document; Chaseup issues POs through their own Oracle iSupplier portal (their PO numbers look like "111202110000440639" and descriptions embed both PO and Challan numbers, e.g. "M ZAYAN IMPEX (FAROOQ SONS) 01 SEP 2026 Challan 54 PO 440639"). The system doesn't need to integrate with Chaseup's portal — staff will manually enter what's on the PO once it's received, but the PO number field should accommodate long portal-style numbers as well as simpler PDF-based ones like Habbitt's "P14337".
3. This feature only captures/records the PO — it does not generate challans, invoices, or post to the ledger (those are 007/008/009).

Once the spec is ready, stop and show it to me before writing the plan.

## Response snapshot

Confirmed the repo was clean on `005-customers` before branching. Ran
`create-new-feature.ps1 -Number 6 -ShortName "customer-purchase-orders"`, which created and
checked out `006-customer-purchase-orders` and scaffolded `spec.md`.

Read `specs/005-customers/spec.md` and `data-model.md` (for the exact `customer_product_mappings`
shape: `customer_item_code`/`selling_uom`/`default_price`/`conversion_factor`, partial unique
index enforcing one-product-per-code) and `specs/PRODUCT-OVERVIEW.md`'s Customer Purchase Orders
section and Module Roadmap row for 006, to ground every requirement in already-agreed business
decisions (header fields — purchaser, delivery date, destination, trade name it bills under;
Ordered/Delivered/Invoiced per-line tracking; PDF attachment) rather than only the user's three
summarized points.

Wrote `specs/006-customer-purchase-orders/spec.md`: 3 user stories (P1 record/view a PO including
item-code-to-product resolution with fallback to manual product pick; P2 accommodating both
Habbitt's PDF-based and Chaseup's portal-based intake, including long numeric PO numbers and
verbatim embedded-Challan-reference descriptions; P3 edit/cancel with a forward-looking lock once
delivered/invoiced quantity exists), 19 functional requirements, 4 Key Entities (PO, PO Line Item,
a read-only reference to 005's Customer-Product Mapping, Staff User), and an Assumptions section
covering PO-number uniqueness scope (per-customer, not global), no PO-level tax field (GST invoice
handling stays external per the master spec), payment/ageing status deferred entirely to
009-Customer-Ledger, and introducing delivered/invoiced-quantity columns now (mirroring how 005
introduced `ledger_entries` ahead of its own later writers) without this feature ever writing
nonzero values into them. No `[NEEDS CLARIFICATION]` markers were needed — every open question had
a defensible default anchored in the master spec or 005's precedent, documented in Assumptions.
Wrote the requirements-quality checklist with all items passing on first pass. Stopped after the
spec + checklist, per the user's explicit instruction — no `/sp.plan` run.

## Outcome

- ✅ Impact: `specs/006-customer-purchase-orders/spec.md` and its requirements checklist are ready
  for the user's review on the new `006-customer-purchase-orders` branch. No
  `/sp.plan`/`/sp.tasks`/`/sp.implement` run, per instruction.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md, checklists/requirements.md (both new); this PHR.
- 🔁 Next prompts: user reviews spec.md, in particular the Assumptions section's four documented
  defaults (PO-number uniqueness scope, no PO-level tax field, payment-status deferred to 009, and
  the delivered/invoiced-quantity lock), then either corrects them or says go for `/sp.plan`.
- 🧠 Reflection: the user's three "key points" were a curated subset, not the full scope — cross-
  checking `PRODUCT-OVERVIEW.md`'s existing 006 roadmap entry (Ordered/Delivered/Invoiced
  tracking, PDF attachment, header fields like trade name/purchaser/destination) before writing
  caught requirements the prompt didn't restate but the master spec already committed to; treating
  the master spec as the scope ceiling and the user's prompt as emphasis/clarification, not a
  scope replacement, matches the 005 precedent and this repo's memory note that PRODUCT-OVERVIEW.md
  is the authoritative full spec.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): spec-quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
