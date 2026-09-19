---
id: 0001
title: Traded-goods purchasing spec
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003b-traded-goods-purchasing
branch: 003b-traded-goods-purchasing
user: ImtiazAli865
command: /sp.specify
labels: ["spec", "traded-goods-purchasing", "extends-002"]
links:
  spec: specs/003b-traded-goods-purchasing/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003b-traded-goods-purchasing/spec.md
 - specs/003b-traded-goods-purchasing/checklists/requirements.md
tests:
---

## Prompt

Run /sp.specify for 003b traded-goods purchasing

## Response snapshot

`create-new-feature.ps1`'s `-Number` parameter is integer-only, which would have forced this
onto "004" and collided with the roadmap's reserved meaning for that number
(004-trade-names-and-document-settings). Since `specs/PRODUCT-OVERVIEW.md` and
003-product-catalog's own tasks.md both already refer to this step explicitly as "003b" (a
sub-step inserted between 003 and 004 without renumbering the rest of the roadmap), created
the branch and directories manually instead: `git checkout -b 003b-traded-goods-purchasing`
from the current tip, then `specs/003b-traded-goods-purchasing/` and
`history/prompts/003b-traded-goods-purchasing/` seeded the same way the script would have.

Noted but did not act on: `003-product-catalog`'s full implementation (from `/sp.implement`
through the T026/T027 live verification) is still uncommitted in the working tree, and those
changes now carry onto this new branch too (uncommitted changes aren't tied to a branch until
committed). Per this repo's explicit rule (never commit without being asked) this was left
as-is rather than committed — flagged to the user in the response rather than silently
resolved either way.

Wrote `specs/003b-traded-goods-purchasing/spec.md`: three prioritized user stories (P1 record
a per-unit purchase of a traded product, updating that product's weighted-average cost and a
new quantity-on-hand figure; P2 browse the unified purchase list across both per-kg and
per-unit modes with mode-aware totals; P3 edit/delete a per-unit purchase under its own
consumption lock), 6 edge cases, 18 functional requirements, Key Entities (Purchase extended,
Product extended, Supplier reused), Assumptions, and 6 success criteria. Zero
`[NEEDS CLARIFICATION]` markers — every open question had a reasonable default traceable to
`specs/PRODUCT-OVERVIEW.md`'s already-agreed resolutions (extend 002 rather than a separate
table; weighted-average over full history; RLS/auth/rounding conventions unchanged).

Made and documented one real design call while drafting: `specs/PRODUCT-OVERVIEW.md` had
already decided an `inventory_movements` ledger is introduced at 003b as its first writer, but
a ledger nothing displays isn't testable at the spec level. Resolved by adding an
observable **quantity-on-hand** figure directly to the traded product's own detail view
(extending 003's data model), maintained by this feature — keeping the requirement genuinely
testable now while still being the "first writer" the roadmap called for; a full
inventory dashboard stays out of scope for the future Finished Goods Inventory feature (012).
Flagged this in the requirements checklist notes for the user's awareness before planning.

Generated `specs/003b-traded-goods-purchasing/checklists/requirements.md` and validated the
spec against it — all Content Quality, Requirement Completeness, and Feature Readiness items
passed on the first iteration.

## Outcome

- ✅ Impact: `003b-traded-goods-purchasing` spec is complete and passes its quality
  checklist; feature branch and directories created (manually, due to the script's
  integer-only numbering) and consistent with the naming already used in
  `specs/PRODUCT-OVERVIEW.md`. Ready for `/sp.clarify` (optional) or `/sp.plan`.
- 🧪 Tests: none (spec-stage artifact, no code).
- 📁 Files: `specs/003b-traded-goods-purchasing/spec.md` (new),
  `specs/003b-traded-goods-purchasing/checklists/requirements.md` (new). Branch
  `003b-traded-goods-purchasing` created from the tip of `003-product-catalog` (which still
  has 003's full implementation uncommitted).
- 🔁 Next prompts: `/sp.plan` for 003b (recommended next), after the user decides whether to
  commit 003-product-catalog's implementation first. Also worth surfacing once planning
  reaches the data model: whether the quantity-on-hand design call above should be a
  documented ADR, given it operationalizes a roadmap-level architectural decision
  (`inventory_movements` as a shared table) slightly differently than originally sketched.
- 🧠 Reflection: Caught a real tooling limitation (integer-only branch numbering vs. the
  project's own "003b" sub-versioning convention) and resolved it by hand rather than letting
  auto-numbering silently collide with the roadmap's reserved "004" meaning.

## Evaluation notes (flywheel)

- Failure modes observed: `create-new-feature.ps1 -Number` cannot express a non-integer
  sub-version like "003b" — worked around manually; not a spec/content defect.
- Graders run and results (PASS/FAIL): requirements.md checklist — PASS (all items) on first
  iteration.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
