---
id: 0003
title: Customer Ledger implementation plan
stage: plan
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "customer-ledger", "customer-payments", "ledger-entries", "fifo-ageing", "csv-export"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/009-customer-ledger/plan.md
 - specs/009-customer-ledger/research.md
 - specs/009-customer-ledger/data-model.md
 - specs/009-customer-ledger/contracts/server-actions.md
 - specs/009-customer-ledger/quickstart.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

go ahead for /sp.plan

## Response snapshot

Ran `setup-plan.ps1 -Json` to scaffold `plan.md` from the template, read `.specify/memory/constitution.md`
(still the unfilled template, same as every prior feature — no gates to check against), then
grounded the plan in the actual shipped schema rather than re-deriving from the spec alone: read
`ledger_entries`'s definition and both existing writers (`accept_challan` 007, `create_performa_invoice`
008), `lib/customers/ledger.ts`'s existing balance query, `customer_pos`/`challans` column names for
the PO-number join, `package.json` (confirmed no PDF/Excel library exists), and ADR-0006's exact
scope text (confirmed it explicitly anticipates reuse beyond Challans/Invoices).

Wrote `research.md` with six decisions: (1) `customer_payments` as one new table with two functions
(`record_customer_payment`, `update_customer_payment_status` — one function for both status
transitions, not two, since they share an identical guard); (2) no `updated_at`/trigger on
`customer_payments` — immutability by omission, matching `ledger_entries`/`performa_invoices`'
precedent; (3) bounce reversal dated to the transaction's own `current_date`, not a staff-entered
field; (4) **FIFO (oldest-credit-first) allocation for ageing/overdue amounts** — a genuine new
mechanism-level decision, since the spec deliberately stayed at business-language altitude
("within/beyond expected range") without prescribing how to classify entries in a running-balance
ledger with no per-invoice payment matching; documented with rationale, alternatives, and an
explicit "flagged for the user" note; (5) PDF export as ADR-0006's third application, Excel export
as CSV via this project's first Route Handler (no new dependency) — also flagged as a reusable
pattern future export features (012/013) would likely reuse; (6) a payment's optional invoice/PO
reference reuses `ledger_entries.source_type`/`source_id`'s existing polymorphic, no-FK shape.

Wrote `data-model.md` (`customer_payments` table + both functions, full column-by-column rationale),
`contracts/server-actions.md` (2 Server Actions, 5 read functions, 2 new Route Handlers for CSV),
`quickstart.md` (manual verification flow mirroring all 5 user stories), and `plan.md` (Technical
Context, Constitution Check, full Project Structure tree, Complexity Tracking). Ran
`update-agent-context.ps1 -AgentType claude` — confirmed via `git diff` that it was a no-op against
this project's custom `CLAUDE.md` (no marker section for it to update), not an unexpected change.

Constitution Check surfaced one explicit ADR suggestion (CSV-via-Route-Handler export, since it's a
reusable pattern with real alternatives and cross-cutting future reuse per the master spec's 012/013)
and one flagged-but-not-ADR-worthy decision (FIFO ageing, feature-scoped business logic, not a
cross-cutting pattern) — both presented to the user in the final report rather than silently decided
or auto-created.

## Outcome

- ✅ Impact: Full Phase 0/1 planning artifacts complete for 009-customer-ledger — `plan.md`,
  `research.md`, `data-model.md`, `contracts/server-actions.md`, `quickstart.md` — ready for
  `/sp.tasks`. Two genuinely new project-wide mechanisms (FIFO ageing, CSV-via-Route-Handler export)
  identified and surfaced explicitly rather than silently introduced.
- 🧪 Tests: none (planning turn).
- 📁 Files: `specs/009-customer-ledger/plan.md`, `research.md`, `data-model.md`,
  `contracts/server-actions.md`, `quickstart.md` (all new).
- 🔁 Next prompts: user decision on the CSV-export ADR suggestion (`/sp.adr
  csv-export-via-route-handler` or decline), then `/sp.tasks 009-customer-ledger`.
- 🧠 Reflection: This feature required one real mechanism-level judgment call the pre-spec discussion
  never touched — how to compute ageing over a running-balance ledger with no per-invoice payment
  matching. Surfacing it explicitly in research.md's own "Note for the user" (rather than treating it
  as settled implementation detail) matches this project's established pattern of flagging
  architecturally-visible decisions even when they don't clear the formal ADR bar.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): n/a.
