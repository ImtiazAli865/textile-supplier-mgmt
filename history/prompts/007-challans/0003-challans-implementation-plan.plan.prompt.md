---
id: 0003
title: Challans implementation plan
stage: plan
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "challans", "inventory", "postgres-functions", "adr-candidate", "business-sensitive"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/007-challans/plan.md
 - specs/007-challans/research.md
 - specs/007-challans/data-model.md
 - specs/007-challans/contracts/server-actions.md
 - specs/007-challans/quickstart.md
 - CLAUDE.md
 - history/prompts/007-challans/0003-challans-implementation-plan.plan.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

Go ahead and run /sp.plan

## Response snapshot

Ran `setup-plan.ps1 -Json` to scaffold `plan.md` on the already-checked-out `007-challans`
branch. Read the (still-unfilled template) constitution, and — before writing anything —
grounded every design decision in the actual shipped code of every feature this one touches:
006's `customer_po_lines`/`customer_pos` DDL and its `create_customer_po`/`update_customer_po`
shape, 005's `ledger_entries`/`customers.issues_performa_invoice`, 004's `trade_names`
columns, 003's `products` DDL, and — critically — 003b's `recompute_product_purchase_stats`
and its three callers (`record_unit_purchase`/`update_unit_purchase`/`delete_unit_purchase`) in
`0003_traded_purchases.sql`, plus ADR-0004 itself, which turned out to already assert (wrongly,
written during 005's plan) that 003b had created `inventory_movements`.

Wrote `research.md` (7 decisions): the `inventory_movements` shape and correction of ADR-0004's
factual claim; splitting `quantity_on_hand` maintenance from `current_purchase_cost` maintenance
and redefining (via a new migration, `CREATE OR REPLACE`, never editing 0003's file) 003b's four
functions so purchases write net-delta movements instead of overwriting the column; a new design
catch made during planning (not previously in spec.md) — `challan_lines` must snapshot
`product_id`/`uom`/`unit_price` from the PO line at creation, because 006's lock only engages once
`delivered_quantity` is nonzero, which doesn't happen until Challan *acceptance*, leaving an
editable window on the PO line while a Challan sits "Issued" that could otherwise silently
invalidate an already-printed document's price/product/UOM; `update_challan`'s full
delete-then-reinsert of lines (no per-line lock exists within an Issued Challan, unlike 006's PO
lines); the single atomic `accept_challan` function covering FR-009 through FR-012, including
movement-dating (challan_date for the accepted-quantity leaving movement, current_date for a
return) and explicitly not re-validating the remaining-quantity rule at accept time (matching
spec.md's own documented edge case); the printed-document approach (a standalone `@media print`
Server Component route, no new PDF dependency — surfaced as an ADR candidate, the first feature to
*generate* rather than store a document); the 0-or-1 signed-copy columns directly on `challans`
(not a child table, unlike 006's 0-or-many PO attachments); and an explicit, documented
acknowledgment that manufactured-product Challans may not be acceptable until 010-production-
batches ships (the master roadmap's own known, accepted tradeoff for this build order — not a new
gap, and not something built here).

Wrote `data-model.md` (inventory_movements + its one-time backfill; the redefined 003b functions;
`challans`/`challan_lines` DDL including the snapshot columns; `create_challan`/`update_challan`/
`void_challan`/`accept_challan` full behavior), `contracts/server-actions.md` (8 actions/reads
matching 006's contract-doc format, including `getChallanForPrint` for the print route and
`getOpenPOLinesForChallan` reusing 006's already-exported `getCustomerPO` rather than adding a new
006 export), and `quickstart.md` (7-step manual verification flow covering every user story plus
an explicit quantity-on-hand-consistency check for SC-007). Filled `plan.md`'s Summary, Technical
Context, Project Structure (full file tree — one new `lib/challans`/`components/challans`/
`app/(dashboard)/challans` module, one small extension to 006's PO detail page, one standalone
`app/challans/[challanId]/print` route outside the dashboard group), and Complexity Tracking (two
justified violations: redefining 003b's functions, and the standalone print route's duplicated
3-line auth check). Constitution Check surfaces two ADR candidates per project policy (not
auto-created): correcting ADR-0004's `inventory_movements`-origin claim while keeping its
underlying principle intact, and the new printed-document pattern — both stated but left for the
user's explicit `/sp.adr` consent. Ran `update-agent-context.ps1 -AgentType claude`; its own
report said it updated `CLAUDE.md`, but a `git diff` afterward showed no actual change — this
project's `CLAUDE.md` is a customized (non-template) file without the script's expected insertion
markers, so the update appears to have silently no-opped; not investigated further as non-blocking
for this plan.

## Outcome

- ✅ Impact: `specs/007-challans/{plan.md,research.md,data-model.md,contracts/server-actions.md,
  quickstart.md}` are complete and ready for `/sp.tasks`. Two ADR suggestions are pending explicit
  user consent (not created). Per the command's own workflow, this stops after Phase 2 planning —
  no `/sp.tasks`/`/sp.implement` run.
- 🧪 Tests: none — planning turn only.
- 📁 Files: plan.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md (all
  new); this PHR. `CLAUDE.md` was touched by the agent-context script but shows no net diff.
- 🔁 Next prompts: user reviews the plan, decides whether to run `/sp.adr
  inventory-movements-created-at-007-not-003b` and/or `/sp.adr
  printed-documents-via-server-rendered-print-routes`, then either corrects the plan or says go
  for `/sp.tasks`.
- 🧠 Reflection: the `challan_lines` snapshot decision (product_id/uom/unit_price) wasn't in
  spec.md at all — it surfaced only by tracing 006's actual lock condition
  (`delivered_quantity > 0`) against this feature's own two-step Issued→Accepted lifecycle and
  noticing the gap between them. Same category of bug as the `quantity_on_hand` collision the user
  caught in spec review, just found one level earlier this time, during planning rather than after
  the fact — worth treating "when does an earlier feature's lock actually engage, versus when does
  this feature's own document get finalized" as a standing question for every future feature that
  references another feature's not-yet-locked row across a multi-step lifecycle.

## Evaluation notes (flywheel)

- Failure modes observed: none from the user this round (self-caught issue, not a correction).
- Graders run and results (PASS/FAIL): n/a — no checklist gate defined for `/sp.plan` in this
  project's workflow, unlike `/sp.specify`'s requirements checklist.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when planning any feature that reads another feature's
  row across a multi-step lifecycle (issued→accepted, draft→final, etc.), explicitly write out
  *when* the referenced feature's own lock condition engages versus *when* the new feature's first
  externally-visible artifact (a printed document, a sent notification) is produced, and check for
  a gap between the two before finalizing data-model.md — this is what caught the snapshot-columns
  need here and should be a repeatable step, not a one-off catch.
