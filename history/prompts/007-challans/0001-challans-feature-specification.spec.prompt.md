---
id: 0001
title: Challans feature specification
stage: spec
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "challans", "purchase-orders", "inventory", "ledger", "business-sensitive"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/007-challans/spec.md
 - specs/007-challans/checklists/requirements.md
 - history/prompts/007-challans/0001-challans-feature-specification.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

006-customer-purchase-orders is complete and verified. Manual mode is on, so please create
the spec ONLY for 007-challans — no /sp.plan, /sp.tasks, or /sp.implement yet.

Key points to cover, per the master spec's Challans section and our earlier decisions:
1. A Challan is created against an existing customer PO (006), referencing one or more of
its line items, and is issued under a trade name (004) — printed with S.NO | Article |
Item Name | UOM | QTY columns matching the real challan format.
2. Each Challan line records a quantity delivered AND a quantity accepted separately — they
default equal but can be edited down if the signed challan comes back short (a customer's
receiving person may sign for less than what was actually delivered).
3. When accepted quantity is less than delivered quantity, staff must explicitly record what
happens to the shortfall: "return to inventory" or "write off" — never left unspecified.
4. Once a Challan is accepted, its accepted quantities roll up cumulatively into the
corresponding PO line's delivered_quantity column (006 reserved this column for us to
write to).
5. Ledger posting event: per our earlier decision, for Chaseup/ChaseValue/Kifayat, an
ACCEPTED Challan is what creates the ledger credit entry (005's ledger_entries table) —
but Habbitt is different: Habbitt's ledger credit comes from the Performa Invoice (008),
NOT from the Challan. So this feature must NOT post a ledger entry for Habbitt's
customer_id — only for the other three (or more generally, customers where
issuesPerformaInvoice is false).
6. A printed/exportable Challan document is needed (the trade name's printed_name,
printed_address, next_challan_number for numbering) — likely a PDF or printable view,
using the trade name's signature/stamp images from 004's Storage bucket.
7. A Challan cannot reference PO lines that are already fully delivered, and cannot exceed
a PO line's remaining (ordered minus already-delivered) quantity.

Once the spec is ready, stop and show it to me before writing the plan.

## Response snapshot

Confirmed the repo was clean on `006-customer-purchase-orders` before branching. Before
scaffolding, cross-checked the master spec (`specs/PRODUCT-OVERVIEW.md`) and the actual shipped
data models of 004 (`trade_names`: printed_name/printed_address/signature_image_path/
stamp_image_path/next_challan_number), 005 (`ledger_entries` shape and `create_customer`'s
opening-balance posting pattern), and 006 (`customer_po_lines.delivered_quantity`, explicitly
reserved by 006 for this feature to write as a cumulative *accepted* total).

Found a real discrepancy before writing anything: the master roadmap says an insert-only
`inventory_movements` table was supposed to be created back at 003b, with 007 and 010 as later
writers — but 003b never actually built it; it only added a `products.quantity_on_hand` column,
maintained directly (`supabase/migrations/0003_traded_purchases.sql:59`). No `inventory_movements`
table exists anywhere in the migrations. Since 007 needs auditable, reversible stock effects
(accept/return/write-off) and this is a genuine architectural fork with real tradeoffs, raised it
to the user via `AskUserQuestion` rather than deciding silently. User chose to create
`inventory_movements` now, matching the original roadmap intent, with 007 as its real first
writer.

Ran `create-new-feature.ps1 -Number 7 -ShortName "challans"`, which created and checked out
`007-challans` and scaffolded `spec.md`.

Wrote `specs/007-challans/spec.md`: 3 user stories (P1 issue a Challan against a PO and print it;
P1 record acceptance including short-receipt/shortfall-disposition handling — tied for P1 with
issuance since a Challan with no way to ever finalize delivers no value; P2 route the accepted
Challan's ledger effect to the correct place per customer, sequenced after acceptance since it
depends on it), 17 functional requirements, 7 Key Entities (Challan, Challan Line, the new
Inventory Movement record type, plus read/write touchpoints into 006's Customer PO Line, 004's
Trade Name, 005's Customer and Ledger Entry, and Staff User), and an Assumptions section covering:
a three-state lifecycle (Issued/Accepted/Voided) driven by the real-world print-then-signed-copy-
returns sequence; the printed QTY column showing delivered (not accepted) quantity since accepted
isn't known at print time; "remaining quantity" checks always reading the PO line's already-stored
(accepted-only) Delivered figure rather than reserving against other in-flight Challans, as a
deliberate low-volume/manual-entry simplification; the scanned signed copy being optional evidence
that never gates acceptance (mirroring 006's PO-attachment pattern); ledger credit amount computed
from the PO line's own unit price, not a separately entered Challan price; post-acceptance
reversal/adjustment (e.g. a return weeks later) being explicitly out of scope, left to a future
capability; and the `inventory_movements` course-correction itself. No `[NEEDS CLARIFICATION]`
markers were needed — the one real fork was resolved via the user question before drafting, and
every other open question had a defensible default anchored in the master spec or 006's already-
shipped precedent. Wrote the requirements-quality checklist with all items passing on first pass,
noting the resolved architecture question in its Notes section. Stopped after the spec + checklist,
per the user's explicit instruction — no `/sp.plan` run.

## Outcome

- ✅ Impact: `specs/007-challans/spec.md` and its requirements checklist are ready for the user's
  review on the new `007-challans` branch. No `/sp.plan`/`/sp.tasks`/`/sp.implement` run, per
  instruction.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md, checklists/requirements.md (both new); this PHR.
- 🔁 Next prompts: user reviews spec.md, in particular the Assumptions section's Issued/Accepted/
  Voided lifecycle model, the "remaining quantity" simplification, and the `inventory_movements`
  course-correction, then either corrects them or says go for `/sp.plan`.
- 🧠 Reflection: catching the `inventory_movements` vs. `quantity_on_hand` divergence before
  drafting (rather than silently picking one, or worse, silently assuming the table already
  existed and writing FRs that would fail at plan/implement time) was only possible by actually
  reading 003b's shipped migration, not just its spec's prose — the roadmap document and the real
  codebase had quietly diverged. Worth remembering for any future feature that claims a shared
  table "already exists" per the roadmap: verify against migrations, not just `PRODUCT-OVERVIEW.md`.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): spec-quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
