---
id: 0011
title: Locked-line partial-field scope fix
stage: green
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: manual review before applying migration
labels: ["implementation", "purchase-orders", "correction", "postgres-functions"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - supabase/migrations/0006_customer_purchase_orders.sql
 - specs/006-customer-purchase-orders/data-model.md
 - specs/006-customer-purchase-orders/research.md
 - specs/006-customer-purchase-orders/contracts/server-actions.md
 - lib/customer-pos/service.ts
 - components/customer-pos/customer-po-line-row.tsx
 - history/prompts/006-customer-purchase-orders/0011-locked-line-partial-field-fix.green.prompt.md
tests:
 - npx tsc --noEmit (pass)
 - npm run lint (pass)
 - npm run build (pass)
---

## Prompt

Before I apply this migration — one clarification on update_customer_po's lock behavior:

FR-014 specifies that once a line has delivered/invoiced quantity, only its quantity, UOM,
price, and product resolution become locked — implying description and customerItemCode
could still be edited on that line. But the current implementation rejects the ENTIRE line
update (raising LOCKED_LINE) if delivered/invoiced > 0, regardless of which fields changed.

Was this an intentional simplification (treat a locked line as fully frozen), or should the
function allow updating only description/customerItemCode on a locked line while still
rejecting changes to quantity/uom/price/product? Please confirm which behavior is correct
before I apply the migration.

[Follow-up, after I confirmed this was an unflagged simplification and recommended the partial
lock:] Agreed — go ahead with the partial lock (Option 1), matching FR-014 exactly. ... Update
update_customer_po, data-model.md, and research.md accordingly, then show me the corrected
function and migration before I apply it.

## Response snapshot

Confirmed by re-reading spec.md:203-206 that FR-014 literally names only four fields (quantity,
UOM, price, product resolution) as locked — the implementation's "reject the whole line" behavior
was an unflagged simplification made while writing data-model.md during `/sp.plan`, not a
deliberately confirmed scope call; `/sp.analyze`'s cross-artifact passes don't diff SQL logic
against FR wording closely enough to have caught it.

Rewrote `update_customer_po` in the migration: for a submitted line matching a locked existing
line, it now fetches the current row (`v_current customer_po_lines%rowtype`) and raises
`LOCKED_LINE` only if `product_id`/`quantity_ordered`/`uom`/`unit_price` actually differ from the
submitted values; otherwise it updates only `customer_item_code`/`description`/`position`,
leaving the four locked fields untouched. Updated the raised exception's message text to name the
four locked fields explicitly.

Found and fixed the same "full freeze" mistake mirrored in three other places, none of which the
user explicitly asked about but all of which would have gone stale/wrong otherwise:
- `data-model.md`'s `update_customer_po` description (replaced "full stop" wording with the
  per-field distinction).
- `research.md`'s Decision/Alternatives-considered entries (added the field-level dimension to
  the rationale, and explicitly logged the "first version implemented, then corrected" note for
  traceability).
- `contracts/server-actions.md`'s `LockedLineError` description and quoted message text.
- `lib/customer-pos/service.ts`'s `toFriendlyPOError` — the app's actual friendly-error text for
  `LOCKED_LINE` still said "can no longer be edited here" (implying the whole line), which would
  have shown users an inaccurate message even though the backend now permits editing item
  code/description.
- `components/customer-pos/customer-po-line-row.tsx` — the UI itself `disabled={locked}` on
  *every* field including `customerItemCode`/`description`, contradicting the corrected backend.
  Removed `disabled` from those two, guarded the item-code auto-resolve `onBlur` handler to skip
  entirely when `locked` (resolving could try to change the locked product/UOM/price), and
  reworded the on-screen "Locked" label to state which fields are actually locked.

Re-ran `npx tsc --noEmit`, `npm run lint`, and `npm run build` after Prettier-formatting the
touched files — all clean. Pasted the full corrected migration file back to the user for review
before they apply it, per their explicit request.

## Outcome

- ✅ Impact: `update_customer_po`'s lock now implements FR-014 exactly as written (per-line AND
  per-field), consistently across the migration, both design docs, the contract doc, the service
  layer's error text, and the UI's disabled/lock-label logic — no remaining "full freeze" language
  anywhere in the feature's artifacts.
- 🧪 Tests: `npx tsc --noEmit`, `npm run lint`, `npm run build` — all pass. Still no live-DB
  verification possible in this environment (migration not yet applied).
- 📁 Files: migration, data-model.md, research.md, contracts/server-actions.md, service.ts,
  customer-po-line-row.tsx — all edited; this PHR.
- 🔁 Next prompts: user reviews the corrected migration (pasted in chat) and applies it via the
  Supabase SQL editor, then T030–T033's live verification.
- 🧠 Reflection: the user's question surfaced a defect that existed simultaneously in five files
  (SQL, two spec docs, one contract doc, one service function, one UI component) because the
  original oversimplification was made once, early (in data-model.md during `/sp.plan`), and every
  downstream artifact — including code — faithfully propagated it without anyone re-checking it
  against FR-014's exact wording. This argues for literally diffing a Postgres function's business
  logic against its governing FR's precise wording (not just its general intent) as a discrete
  review step, since `/sp.analyze`'s cross-artifact pass operates at too coarse a granularity to
  catch a four-fields-vs-whole-line distinction.

## Evaluation notes (flywheel)

- Failure modes observed: an unflagged simplification made at plan-time propagated silently into
  the implementation (SQL function, service-layer error text, and UI disabled-state logic) across
  three separate `/sp.analyze` passes without being caught, because none of those passes compared
  SQL/UI logic word-for-word against the FR's literal field list.
- Graders run and results (PASS/FAIL): user's own review (not an automated grader) caught this;
  `tsc`/`lint`/`build` all PASS after the fix.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a plan-time design doc paraphrases or simplifies
  a spec's exact list of locked/restricted fields (or any other enumerated scope), flag that
  paraphrase explicitly as a scope decision in the Constitution Check or an Assumptions-style note
  requiring confirmation, rather than asserting it as settled fact.
