---
id: 0002
title: FR-013 wording and inventory source-of-truth fix
stage: spec
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 007-challans
branch: 007-challans
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "challans", "inventory", "correctness-review", "business-sensitive"]
links:
  spec: specs/007-challans/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/007-challans/spec.md
 - specs/007-challans/checklists/requirements.md
 - C:/Users/IDC/.claude/projects/D--PIAIC-Batch-86-textile-supllier-managment/memory/inventory_movements_table_correction.md
 - history/prompts/007-challans/0002-fr013-wording-and-inventory-source-of-truth-fix.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

Two issues before /sp.plan:

1. FR-013 contradicts FR-012 and the Edge Cases section. FR-013 currently says the system
"MUST allow voiding an already-accepted Challan" — but FR-012 says accepted Challans are
fully read-only, and Edge Cases explicitly says voiding an accepted Challan is "Rejected."
This looks like a missing "NOT" — please confirm and fix FR-013 to say the system MUST NOT
allow voiding an already-accepted Challan.

2. There's a real architectural conflict with products.quantity_on_hand. 003b's
recompute_product_purchase_stats() computes it purely as the SUM of purchased quantity_units
(never decremented for sales). Now this spec says quantity-on-hand should be "the running
total of its [inventory] movements." How do these two reconcile?

Specifically:
- Will 007 introduce an opening inventory_movement (equal to each traded product's current
  purchase-based quantity_on_hand) at migration time, so movements become the single source
  of truth going forward?
- Or will quantity_on_hand remain purchase-driven, with inventory_movements tracked
  separately for audit only (not the actual quantity-on-hand source)?
- Or will quantity_on_hand become computed as (purchase total) + (movements net), combining
  both formulas?

Please clarify which approach this spec intends, and make it explicit in the spec/data-model
before we proceed, since getting this wrong would silently corrupt real stock quantities.

Show me both corrections before /sp.plan.

## Response snapshot

Re-read FR-013 byte-for-byte from the file: it already said "MUST NOT allow voiding an
already-accepted Challan" — no missing NOT, no actual contradiction with FR-012/Edge Cases.
Reported this precisely rather than assuming the user was right, then reworded it into two
separate sentences anyway (single "MUST X... and MUST NOT Y" sentence was genuinely easy to
misread at a skim) so it can't be misread again.

For the second issue, read the actual body of `recompute_product_purchase_stats()`
(`supabase/migrations/0003_traded_purchases.sql:75-94`) rather than trusting the column
comment: confirmed it fully overwrites `quantity_on_hand = round(SUM(quantity_units), 2)` on
every unit-mode purchase create/edit/delete — a real, guaranteed collision the first time a
product has both purchase and Challan activity, exactly the corruption risk the user named.
Evaluated the user's three named options against that fact: B doesn't fix the bug (003b's
function still clobbers the column regardless of what inventory_movements records); C avoids a
backfill but still requires editing 003b's function and leaves two formulas that must always be
summed correctly; A removes the collision entirely and matches the roadmap's original intent
that purchases would be `inventory_movements`' first writer. Presented this analysis and used
`AskUserQuestion` (matching the pattern from the first 007 question) rather than picking
silently, given the stated stakes ("getting this wrong would silently corrupt real stock").
User chose Option A.

Rewrote the spec accordingly: FR-010 now explicitly names "Inventory Movement" records; new
FR-011 states movements are the sole source of truth for quantity-on-hand, requires a one-time
opening-movement backfill per existing traded product, and requires 003b's purchase-recompute
function to be redefined (new migration, not an edit to 003b's own file) to write/adjust
movements instead of overwriting the column — renumbering FR-011 through FR-017 to FR-012
through FR-018. Expanded Key Entities (Inventory Movement's reason examples, a new Product
entity note), added two Edge Cases (the cutover backfill, and a purchase edit/delete after
Challan activity exists), expanded Assumptions with the full reconciliation rationale and the
"redefine via new migration, never edit 003b's applied file" constraint, and added SC-007
(quantity-on-hand always equals the sum of its movements). Updated the requirements checklist's
Notes to record both resolved architectural questions. Wrote a persistent project memory
(`inventory_movements_table_correction.md`) documenting the full conflict and resolution, since
010-production-batches will be the next writer of this same table and must follow the same
pattern.

## Outcome

- ✅ Impact: `specs/007-challans/spec.md` now has an internally consistent FR-013 and an
  explicit, correctness-preserving reconciliation between `inventory_movements` and 003b's
  existing `quantity_on_hand` maintenance (FR-011), removing a real data-corruption risk before
  any planning/implementation work begins.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md (FR-010 revised, FR-011 new, FR-012–018 renumbered, Key Entities/Edge
  Cases/Assumptions/Success Criteria expanded), checklists/requirements.md (Notes updated),
  memory file `inventory_movements_table_correction.md` (updated with the reconciliation);
  this PHR.
- 🔁 Next prompts: user reviews the updated spec, in particular FR-011 and its Assumptions/Edge
  Cases entries, then either corrects them or says go for `/sp.plan`.
- 🧠 Reflection: the user's second question caught something my first draft's Assumptions
  section stated confidently but had not actually verified — "quantity-on-hand always reflects
  the net effect of these movements" was true of the movements themselves but silently ignored
  that 003b's own code writes the same column a different way. A column comment
  ("Maintained by traded-goods purchasing... for traded products") described intent, not
  mechanism; only reading the function body surfaced the real overwrite behavior. Worth carrying
  forward: when a new feature's data-model claim touches a column or table an earlier feature
  already writes to, verify the earlier feature's actual write logic (function body), not its
  comment or its spec's prose, before asserting how the two will coexist.

## Evaluation notes (flywheel)

- Failure modes observed: the first 007 draft asserted a "quantity-on-hand always reflects
  movements" guarantee without verifying it against 003b's actual write path — an
  overconfidence/under-verification gap in Assumptions-writing, caught by the user rather than
  by self-review. Worth a self-check step in future specs: for every "MUST always reflect X"
  claim about a shared column, grep the migrations for every existing writer of that column
  first.
- Graders run and results (PASS/FAIL): spec-quality checklist — PASS (all items) after this
  round's edits.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): before finalizing a spec's Assumptions section,
  explicitly grep `supabase/migrations/*.sql` for every existing writer of any column/table the
  new feature claims to read, write, or reconcile, and state what each writer actually does —
  not just what its comment says.
