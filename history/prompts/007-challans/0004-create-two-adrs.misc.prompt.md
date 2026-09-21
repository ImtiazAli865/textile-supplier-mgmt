---
id: 0004
title: Create two ADRs from plan review
stage: misc
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.adr
labels: ["adr", "challans", "inventory", "printed-documents", "correction"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: history/adr/0005-inventory-movements-created-at-007-not-003b.md
  pr: null
files:
 - history/adr/0005-inventory-movements-created-at-007-not-003b.md
 - history/adr/0006-printed-documents-via-server-rendered-print-routes.md
 - history/adr/0004-shared-tables-created-at-first-writer.md
 - history/prompts/007-challans/0004-create-two-adrs.misc.prompt.md
tests:
 - none (documentation turn; no code changed)
---

## Prompt

Yes, please run /sp.adr for both:
1. Correcting ADR-0004's factual claim (that inventory_movements existed before 007)
2. The new printed-document pattern (server-rendered print route, no PDF library) —
   since 008-Performa-Invoicing will follow this same approach

Once both are done, proceed with /sp.tasks.

## Response snapshot

No `create-adr.sh`/`.ps1` script exists in this project (only `adr-template.md`), so followed the
agent-native fallback: ran `check-prerequisites.ps1 -Json` to confirm `specs/007-challans` as the
feature directory, then wrote both ADRs directly, matching the real structure ADR-0001–0004
actually use (not the raw template's placeholder names).

**ADR-0005** (`inventory-movements-created-at-007-not-003b`): documents both the origin
correction (007, not 003b, is the real first writer) and the deeper follow-on decision
(`inventory_movements` becomes the sole source of truth for `products.quantity_on_hand`,
requiring a `CREATE OR REPLACE` of four of 003b's functions via a new migration). Status
"Accepted," explicitly framed as continuing ADR-0004's principle rather than competing with it.

**Amended ADR-0004 itself** rather than only pointing away from it — found that the wrong
"003b already created inventory_movements" claim wasn't confined to one line; it recurred in the
Context paragraph, the "first writer's own scope" bullet, the "later writers" bullet, one
Positive-consequences bullet, and the References section (which cited 003b's own spec/data-model
as `inventory_movements`'s introduction — also wrong). Left ADR-0004's Status as "Accepted" (its
principle is still followed exactly) but added a top-level amendment note plus inline
strikethrough-and-correction at each specific wrong claim, pointing to ADR-0005, rather than
silently rewriting history or leaving a historical record that actively misleads a future reader
past the first paragraph.

**ADR-0006** (`printed-documents-via-server-rendered-print-routes`): documents the standalone
`@media print` Server Component route decision (no PDF library), framed explicitly as the pattern
008-Performa-Invoicing is expected to reuse, with alternatives considered (React-to-PDF library,
headless-browser rendering, imperative PDF libraries, an in-dashboard print route) and consequences
including the print-fidelity/browser-dependency tradeoff and the fact that `challan_lines`' own
snapshot columns (from spec review/planning, not this ADR) already cover the "was a specific
historical printout's content ever provable" concern.

## Outcome

- ✅ Impact: Two new ADRs (`0005`, `0006`) and one corrected existing ADR (`0004`, amended not
  superseded) are recorded. `/sp.tasks` for 007-challans runs next per the user's own instruction
  in this same message.
- 🧪 Tests: none — documentation turn only.
- 📁 Files: `history/adr/0005-*.md`, `history/adr/0006-*.md` (new); `history/adr/0004-*.md`
  (amended in five places); this PHR.
- 🔁 Next prompts: proceeding directly to `/sp.tasks` for 007-challans, as instructed.
- 🧠 Reflection: the user's request named "correcting ADR-0004's factual claim" as if it were a
  single sentence to fix; reading the whole file before writing anything showed the same wrong
  claim had propagated into at least five separate places across Context, Decision bullets,
  Consequences, and References. Treating an ADR-correction request as "read the entire file, not
  just the sentence I remember being wrong" is the generalizable lesson — a wrong premise stated
  once at the top of a document tends to get restated in its own words throughout, and each
  restatement needs its own fix or its own pointer to the correction.

## Evaluation notes (flywheel)

- Failure modes observed: none from the user this round.
- Graders run and results (PASS/FAIL): sp.adr's own significance test (Impact/Alternatives/Scope)
  — PASS for both ADRs (both are cross-cutting, multi-component decisions with documented
  alternatives and tradeoffs, not atomic/trivial choices).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a correction to an existing document is
  requested, grep the whole file for every recurrence of the wrong fact/name/claim before writing
  the correction, rather than only fixing the one instance the request quoted.
