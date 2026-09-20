---
id: 0002
title: Customers implementation plan
stage: plan
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 005-customers
branch: 005-customers
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "customers", "ledger", "product-mappings"]
links:
  spec: specs/005-customers/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/005-customers/plan.md
 - specs/005-customers/research.md
 - specs/005-customers/data-model.md
 - specs/005-customers/contracts/server-actions.md
 - specs/005-customers/quickstart.md
 - history/prompts/005-customers/0002-customers-implementation-plan.plan.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

All five confirmed, go ahead with /sp.plan

(This follows the user's five-point confirmation of spec.md's flagged scope decisions —
payment-terms-as-days, opening-balance-immutable, mapping-needs-one-of-code-or-uom,
at-least-one-contact-required, pricing-excluded-from-mapping — recorded in
`0001-customers-spec.spec.prompt.md`'s checklist. Two of those five confirmed decisions were
later corrected by the user during plan review; see
`0003-customers-payment-terms-and-pricing-corrections.misc.prompt.md`.)

## Response snapshot

Ran `setup-plan.ps1 -Json`, read spec.md and the (still-template) constitution. Generated
`research.md` with 8 Decision/Rationale/Alternatives entries: `create_customer`/`update_customer`
as Postgres functions mirroring 001's supplier pattern (ADR-0002, extended with a conditional
opening-balance insert); opening balance captured as `{amount, type}` not a signed number; ledger
balance computed live via `SUM`, never cached (consistent with `specs/PRODUCT-OVERVIEW.md`'s
"design for correctness, not scale" principle); `ledger_entries` has no update/delete path
anywhere in this feature (structural immutability for FR-013); customer-product mappings as plain
single-table CRUD, no RPC (mirrors 004's `trade_names`); a customer's item code enforced unique via
a DB-level partial unique index, not application-only; "usable trade names" as a join table with a
`position` column, not a raw array; billing address as flat columns, ship-to addresses as a
separate 1:N table. Generated `data-model.md`: six new tables (`customers`, `customer_contacts`,
`customer_ship_to_addresses`, `customer_trade_names`, `customer_product_mappings`,
`ledger_entries`), the `create_customer`/`update_customer` function signatures, and a read-only
ledger-balance helper query. Generated `contracts/server-actions.md` (all CRUD + mapping actions)
and `quickstart.md` (manual verification flow for all three user stories). Wrote `plan.md`'s
Technical Context, Project Structure (new `lib/customers/*` module, `app/actions/customers.ts`,
`components/customers/*`, `app/(dashboard)/customers/**`, one-function extensions to
`lib/products/service.ts` and `lib/trade-names/service.ts`, and an extension to the product detail
page to surface mappings). In the Constitution Check, reused ADR-0002 for the fourth time (no new
ADR needed) and surfaced one new architectural decision for consent: `ledger_entries` being
created here, ahead of its own presentation feature (009-customer-ledger), as the first
implementation of `specs/PRODUCT-OVERVIEW.md`'s already-agreed "shared-tables-created-at-first-
writer" pattern (also used by 003b's `inventory_movements`) — surfaced as
`📋 Architectural decision detected: shared-tables-created-at-first-writer`, not yet created,
awaiting explicit user consent per project policy. The final Phase 1 step (running
`update-agent-context.ps1 -AgentType claude` and diffing `CLAUDE.md`) was interrupted by the user
mid-call ("STOP what you are doing and wait for the user to tell you how to proceed") and was not
re-attempted; the user redirected instead to reviewing spec.md for corrections before any further
plan work.

## Outcome

- ✅ Impact: Full Phase 0/Phase 1 planning artifact set produced for 005-customers
  (research.md, data-model.md, contracts/server-actions.md, quickstart.md, plan.md). Two of the
  design decisions this plan built on (`payment_terms_days` as a single integer;
  customer-product mapping excluding pricing) were later corrected by the user — see
  `0003-customers-payment-terms-and-pricing-corrections.misc.prompt.md` for the resulting diffs.
- 🧪 Tests: none — planning turn only.
- 📁 Files: research.md, data-model.md, contracts/server-actions.md, quickstart.md, plan.md (all
  new); this PHR.
- 🔁 Next prompts: the payment-terms/default-price correction cycle, then `/sp.tasks`.
- 🧠 Reflection: the `update-agent-context.ps1` step was left incomplete when the user
  interrupted — worth confirming with the user whether it still needs to run (checking `CLAUDE.md`
  for drift) before `/sp.implement`, since 001-004 all ran it as part of their own plan phase.

## Evaluation notes (flywheel)

- Failure modes observed: none in this turn itself; two of the plan's underlying assumptions were
  later corrected by the user (captured in the next PHR), which is a normal part of the
  "surface decisions explicitly, expect some to be revised" flow this project uses.
- Graders run and results (PASS/FAIL): n/a — no automated graders configured for planning turns.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
