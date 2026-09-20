---
id: 0004
title: Customer purchase orders implementation plan
stage: plan
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "purchase-orders", "postgres-functions", "storage"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/plan.md
 - specs/006-customer-purchase-orders/research.md
 - specs/006-customer-purchase-orders/data-model.md
 - specs/006-customer-purchase-orders/contracts/server-actions.md
 - specs/006-customer-purchase-orders/quickstart.md
 - history/prompts/006-customer-purchase-orders/0004-customer-purchase-orders-plan.plan.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

yes im ready for /sp.plan

## Response snapshot

Ran `.specify/scripts/powershell/setup-plan.ps1 -Json` to scaffold `plan.md`. Read
`.specify/memory/constitution.md` (still the unfilled template, same as 001-005), and re-read
005's `plan.md`/`research.md`/`data-model.md`/`contracts/server-actions.md`/`quickstart.md` plus
`lib/customers/product-mappings.ts` and `lib/trade-names/storage.ts` to ground every design
choice in this project's already-established conventions (ADR-0002 atomic Postgres functions,
ADR-0003 signed-URL storage, ADR-0004 forward-declared shared tables) rather than inventing new
ones.

Wrote `plan.md`: `create_customer_po`/`update_customer_po` reuse ADR-0002's pattern, but
`update_customer_po` uses a **per-line upsert with a lock check** instead of 001/005's
delete-then-reinsert shape, because FR-014's edit lock is scoped per-line, not per-PO — documented
as an extension of ADR-0002's existing principle, not a new ADR-worthy decision.
`delivered_quantity`/`invoiced_quantity` columns are forward-declared on `customer_po_lines`,
citing ADR-0004 as the already-ratified precedent (005 did the same for the whole `ledger_entries`
table). Flagged and resolved one real risk found during planning, not carried from the spec: a
"destination/ship-to" field cannot safely be a live FK to 005's `customer_ship_to_addresses`,
because `update_customer`'s delete-then-reinsert shape invalidates those rows' ids on every
customer edit — resolved by capturing destination as a free-text snapshot instead (research.md),
which is also more correct for a historical document like a PO.

Wrote `research.md` (9 decisions, including the per-line-upsert design, the destination-as-text
fix, `set_customer_po_status`'s atomic lock-check, TS-side total summing instead of a DB
aggregate, attachments as a follow-up upload step, and a deliberate no-attachment-removal scope
cut), `data-model.md` (three new tables — `customer_pos`, `customer_po_lines`,
`customer_po_attachments` — three Postgres functions, one new Storage bucket), and
`contracts/server-actions.md` (8 actions/reads, including the `listActiveCustomersForSelect`
addition 005's own contracts had already deferred to this feature). Wrote `quickstart.md` with a
manual verification flow matching the spec's three user stories. Ran
`update-agent-context.ps1 -AgentType claude`; confirmed via `git diff`/`git status` that it made
no actual change to `CLAUDE.md` (a no-op, consistent with 005 not touching it either). No new ADR
suggested — every non-trivial decision was framed and justified as an application of an
already-ratified ADR (0002, 0003, 0004), not a new one.

## Outcome

- ✅ Impact: `plan.md`, `research.md`, `data-model.md`, `contracts/server-actions.md`, and
  `quickstart.md` are all written for `006-customer-purchase-orders`, ready for `/sp.tasks`.
- 🧪 Tests: none — planning turn only.
- 📁 Files: plan.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md (all
  new); this PHR. `CLAUDE.md` touched by the agent-context script but ended up unchanged.
- 🔁 Next prompts: user reviews the plan (especially the destination-as-text finding and the
  per-line-upsert design), then `/sp.tasks` when ready.
- 🧠 Reflection: reviewing 005's actual `update_customer` implementation before designing 006's
  data model (rather than only reading 006's own spec) surfaced a real latent bug class — a
  plausible-looking FK to `customer_ship_to_addresses` that 005's own child-row-replacement
  pattern would have silently broken. Cross-feature review at plan time, not just spec time, is
  worth keeping as a standing habit whenever a new feature references another feature's mutable
  child rows.

## Evaluation notes (flywheel)

- Failure modes observed: none this turn.
- Graders run and results (PASS/FAIL): n/a (no formal grader for planning turns).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
