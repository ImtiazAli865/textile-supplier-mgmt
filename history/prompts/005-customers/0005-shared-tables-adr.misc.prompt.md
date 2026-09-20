---
id: 0005
title: Shared tables first writer ADR
stage: misc
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 005-customers
branch: 005-customers
user: imtiazkind143@gmail.com
command: /sp.adr shared-tables-created-at-first-writer
labels: ["adr", "customers", "ledger-entries", "inventory-movements", "shared-tables"]
links:
  spec: specs/005-customers/spec.md
  ticket: null
  adr: history/adr/0004-shared-tables-created-at-first-writer.md
  pr: null
files:
 - history/adr/0004-shared-tables-created-at-first-writer.md
 - specs/005-customers/plan.md
 - history/prompts/005-customers/0005-shared-tables-adr.misc.prompt.md
tests:
 - none (documentation-only turn; no code changed)
---

## Prompt

Run /sp.adr shared-tables-created-at-first-writer

## Response snapshot

Ran `check-prerequisites.ps1 -Json`, confirming `plan.md` exists for 005-customers. Searched for
a `create-adr.sh`/`create-adr.ps1` script under `.specify/` and repo-wide — none exists, so the
ADR was authored directly with agent-native file tools against `.specify/templates/adr-template.md`
and ADR-0003's established formatting (Status/Date/Feature/Context header, Decision,
Consequences split Positive/Negative, Alternatives Considered with explicit rejection rationale,
References). Wrote `history/adr/0004-shared-tables-created-at-first-writer.md`, documenting the
pattern surfaced in 005's own Constitution Check: a shared, insert-only aggregate table
(`ledger_entries`, `inventory_movements`) is created at whichever feature is its first real
writer, not deferred to its dedicated presentation feature (009-customer-ledger,
012-finished-goods-inventory) — already agreed at the master-spec level in
`specs/PRODUCT-OVERVIEW.md` § "Shared-table decisions" and now formally recorded as this ADR,
citing both 003b's `inventory_movements` (first application) and 005's `ledger_entries` (second
application, the trigger for this ADR). Considered and rejected three alternatives: deferring the
shared table until its presentation feature ships (would have blocked recording real business
data at go-live); each early writer creating its own private table later migrated into the shared
one (defers real complexity to whichever feature ships last); and having the presentation feature
"own" the table as a dependency every writer must sit behind (invents an artificial
feature-ordering dependency unrelated to the actual schema need). Updated
`specs/005-customers/plan.md`'s Constitution Check in two places to replace "not created
automatically; waiting for user consent" / "has not yet been recorded as a formal ADR" with links
to the now-created ADR-0004.

## Outcome

- ✅ Impact: `history/adr/0004-shared-tables-created-at-first-writer.md` created and linked from
  `plan.md`; the ADR-suggestion loop opened during 005's `/sp.plan` (Constitution Check) is now
  closed with explicit user consent, per project policy of never auto-creating ADRs.
- 🧪 Tests: none — documentation-only turn.
- 📁 Files: history/adr/0004-shared-tables-created-at-first-writer.md (new); specs/005-customers/plan.md (modified, 2 spots); this PHR.
- 🔁 Next prompts: `/sp.implement` for 005-customers (not yet requested).
- 🧠 Reflection: no `create-adr.sh`/`.ps1` script exists in this repo despite the `/sp.adr` skill's
  instructions referencing one — same gap as ADR-0002/0003's creation earlier in this feature's
  history. Worth flagging to the user at some point whether the script should be added, or whether
  direct agent-native ADR authoring (matching the existing template and prior ADRs' formatting) is
  the accepted permanent workflow.

## Evaluation notes (flywheel)

- Failure modes observed: none. Applied the Analyze→Measure checklist from the skill: the
  decision clusters multiple components (both `ledger_entries` and `inventory_movements`, and
  every future writer of either), lists three alternatives with explicit rejection rationale, and
  gives both positive and negative consequences — passes the grader checklist as specified.
- Graders run and results (PASS/FAIL): manual self-check against the skill's checklist — PASS
  (decision is clustered not atomic; at least one alternative with rationale — three were given;
  clear pros/cons for chosen approach and alternatives; concise but detailed enough for future
  reference).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
