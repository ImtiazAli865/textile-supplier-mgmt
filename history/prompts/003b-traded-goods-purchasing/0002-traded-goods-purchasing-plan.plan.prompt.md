---
id: 0002
title: Traded-goods purchasing implementation plan
stage: plan
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003b-traded-goods-purchasing
branch: 003b-traded-goods-purchasing
user: ImtiazAli865
command: /sp.plan
labels: ["plan", "traded-goods-purchasing", "extends-002", "extends-003"]
links:
  spec: specs/003b-traded-goods-purchasing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003b-traded-goods-purchasing/plan.md
 - specs/003b-traded-goods-purchasing/research.md
 - specs/003b-traded-goods-purchasing/data-model.md
 - specs/003b-traded-goods-purchasing/contracts/server-actions.md
 - specs/003b-traded-goods-purchasing/quickstart.md
 - CLAUDE.md
tests:
---

## Prompt

Commit 003-product-catalog first,and compact then run /sp.plan for 003b

## Response snapshot

First handled the git/commit request: switched to `003-product-catalog` (uncommitted 003 work
was sitting on `003b-traded-goods-purchasing`, created from a dirty tree in the prior turn),
split the pending changes into two logical commits — (1) "Adopt MA Textile master
specification and revised module roadmap" (`specs/PRODUCT-OVERVIEW.md` +
`history/prompts/general/0013`/`0014`, which predated 003's own spec work), and (2) "Implement
Product Catalog feature (003)" (all of 003's code, migration, and spec/plan/tasks/history
files) — then switched back to `003b-traded-goods-purchasing` and fast-forward-merged
`003-product-catalog` onto it, cleanly bringing both commits over while leaving 003b's own
uncommitted spec files untouched. Noted that "compact" is a CLI-level command not exposed as a
tool, so it can't be triggered from here.

Then ran `/sp.plan` for 003b. Read 003b's spec.md plus 002's and 003's plan/research/
data-model/contracts as precedent, and the current `lib/purchases/*`, `app/actions/
purchases.ts`, `lib/products/service.ts` files to ground the extension in what's actually
shipped.

Produced all Phase 0/1 artifacts:
- **plan.md**: Technical Context (unchanged stack), Constitution Check — surfaced and
  explicitly proposed (not created) an ADR: unit-mode purchase writes need one Postgres
  function per write path (`record_unit_purchase`/`update_unit_purchase`/
  `delete_unit_purchase`) so the purchase row and the referenced product's recalculated cost/
  quantity can never go out of sync — the same multi-table-write pattern 001 already
  established (`create_supplier`/`update_supplier`), now needed for the first time since 002/
  003 shipped, and expected to recur for every later feature that touches two tables in one
  action (Challans, Production Batches). Project Structure shows purchases/products
  modules extended in place — no new route groups or services.
- **research.md**: four decisions — Postgres functions over sequential client calls for the
  atomic write; full recompute (not incremental delta) for weighted-average cost and quantity
  on hand, to avoid drift after repeated edits; extending `raw_material_purchases` in place
  (nullable weight columns + mode-conditional CHECK + a dropped-and-recreated generated
  `total_cost`, since Postgres can't alter a generated expression in place) rather than a
  sibling table or JSONB column; reusing 003's `listProducts` filter for the traded-product
  picker rather than a new query.
- **data-model.md**: the altered `raw_material_purchases` columns (new `purchase_mode`,
  `product_id`, `quantity_units`, `rate_per_unit`, `remaining_units`; three existing columns
  become nullable), the mode-conditional CHECK mirroring 003's type-conditional pattern, the
  re-created `total_cost` generated expression, the new `products.quantity_on_hand` column, and
  full signatures/behavior for the three Postgres functions.
- **contracts/server-actions.md**: extended `createPurchase`/`updatePurchase`/`deletePurchase`/
  `listPurchases`/`getPurchase` for the discriminated-union input and mode-aware output shapes
  (including `PurchaseTotals` returning `null`, not zero, for a mode absent from the current
  filter), plus new `listActiveTradedProductsForSelect`.
- **quickstart.md**: manual verification flow covering all three user stories plus an explicit
  regression check that 002's existing per-kg workflow is untouched (SC-006).

Ran `update-agent-context.ps1 -AgentType claude`, which appended this feature's tech context to
`CLAUDE.md` (script-driven, not a manual edit).

## Outcome

- ✅ Impact: `003-product-catalog` is now committed (2 commits) and `003b-traded-goods-
  purchasing` carries that history forward via fast-forward merge. 003b's planning phase
  (Phase 0 + Phase 1) is complete — all five design documents written and internally
  consistent; Constitution Check passed with one ADR explicitly proposed and awaiting consent.
- 🧪 Tests: none (planning-stage artifacts only; no migration SQL or code written yet).
- 📁 Files: two commits on `003-product-catalog` (fast-forwarded onto `003b-traded-goods-
  purchasing`); `specs/003b-traded-goods-purchasing/{plan.md, research.md, data-model.md,
  quickstart.md, contracts/server-actions.md}` (new, uncommitted); `CLAUDE.md` (agent-context
  section appended by the update script).
- 🔁 Next prompts: the user may want `/sp.adr atomic-multi-table-writes-via-postgres-functions`
  before `/sp.tasks`, since this plan explicitly flagged it as project-wide-pattern-setting
  and it's cheap to document now while the reasoning is fresh. Otherwise, `/sp.tasks` for 003b
  next.
- 🧠 Reflection: Treated "commit 003-product-catalog" as two logical commits rather than one
  omnibus commit, splitting out the master-spec adoption (which chronologically and logically
  predates 003's own spec work) — matches this repo's existing convention of one commit per
  coherent unit of work rather than batching unrelated changes just because they happened to
  be uncommitted at the same time.

## Evaluation notes (flywheel)

- Failure modes observed: none. The manual branch-then-merge sequence (checkout 003, commit
  twice, checkout 003b, fast-forward merge) worked cleanly with zero conflicts, as expected
  since 003b had no divergent commits of its own yet.
- Graders run and results (PASS/FAIL): Constitution Check gate — PASS (no gates defined; one
  ADR candidate surfaced and left for user consent, not a violation).
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
