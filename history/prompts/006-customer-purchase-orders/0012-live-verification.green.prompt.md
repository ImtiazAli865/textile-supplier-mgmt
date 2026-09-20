---
id: 0012
title: Customer purchase orders live verification
stage: green
date: 2026-09-21
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: manual verification (T030-T033) after migration applied
labels: ["verification", "purchase-orders", "bugfix"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - lib/customer-pos/schema.ts
 - components/customer-pos/customer-po-form.tsx
 - specs/006-customer-purchase-orders/tasks.md
 - history/prompts/006-customer-purchase-orders/0012-live-verification.green.prompt.md
tests:
 - 27 throwaway-script checks against the live Supabase project (all PASS)
 - Full browser walkthrough via npm run dev + browser automation (all scenarios PASS after fixes)
 - npx tsc --noEmit, npm run lint, npm run build (all pass, before and after fixes)
---

## Prompt

Migration 0006_customer_purchase_orders.sql applied successfully. Please now run the
remaining verification tasks (T030-T033):
1. FR-004: duplicate PO number rejected per-customer, but same number allowed across
   different customers
2. FR-003: both PO-number formats (short like "P14337" and long like
   "111202110000440639") stored verbatim
3. FR-006/FR-007: price override authority (entered price always wins over mapping
   default), and manual-pick fallback when item code doesn't match any mapping
4. The locked-line partial-field behavior we just fixed — confirm a locked line rejects
   changes to quantity/uom/price/product but accepts changes to description/customerItemCode
5. Full quickstart.md walkthrough

Show me the results of all of these, and confirm any throwaway test data is cleaned up
afterward.

## Response snapshot

Seeded throwaway QA data (two customers, two products, one trade name, one mapping) via a
service-role Node script. Ran 20 checks covering FR-004/FR-003/FR-006/FR-007 and the full
locked-line partial-field matrix — all passed on the first script run, confirming the migration
(including the just-corrected `update_customer_po`) behaves exactly as designed.

Then attempted the full quickstart.md walkthrough via `npm run dev` + browser automation. Hit
repeated "Save Changes"/"Add Customer PO" clicks that appeared to do nothing. Root-caused two
distinct issues rather than assuming a tooling problem: (1) some of my own click+type sequences
were racing ahead of page hydration, causing native (non-JS-intercepted) form submissions —
a genuine automation-timing artifact, not an app bug; but (2) the dev server's request log showed
`resolveCustomerItemCode` POSTs firing normally while `createCustomerPO` never fired at all even
after ruling out timing — a real bug: `tradeNameId: z.string().uuid().optional()` rejects the
empty string the trade-name `<select>`'s blank option submits, and `CustomerPoForm` had no
`onInvalid` handler, so react-hook-form silently refocused the field instead of ever calling the
submit handler or showing an error. Fixed the schema with the `.optional().or(z.literal(""))`
pattern already established elsewhere in this codebase (customers'/suppliers' optional email
field), and added a defensive `onInvalid` handler to the form. Re-ran `tsc`/`lint`/`build` clean,
then re-verified in the live browser: created a Habbitt PO (mapped line auto-resolved, price
overridden and persisted) and a Chaseup PO (18-digit portal number, embedded-Challan description,
trade name AND destination both left blank — destination correctly defaulted to Chaseup's billing
address), edited an unlocked PO's quantity/price (persisted, total recalculated), uploaded a real
file via the detail page (resolved to a genuine Supabase signed URL), and confirmed the corrected
locked-line UI (quantity/UOM/price/product disabled, item code/description still editable, and an
edit to the locked PO's unrelated fields saved successfully). Ran a final script for FR-010
(zero/negative rejected) and the cancel→reactivate happy path — all passed.

Cleaned up: deleted all seeded customer_pos (cascading to lines/attachments), the uploaded Storage
object, customer_product_mappings, products, trade_names, and customers rows, verified each table
now returns empty for the QA ids, deleted all five throwaway `.verify-*.cjs`/`.txt` scripts from
the repo, confirmed via `git status` only real feature files remain, and stopped the dev server.

## Outcome

- ✅ Impact: T030–T033 are complete. 27 automated checks plus a full manual browser walkthrough
  all pass. Two real bugs found and fixed in this session: the locked-line full-freeze issue
  (already in progress per the user's prior message) and a previously-undiscovered `tradeNameId`
  validation bug that would have silently blocked saving any PO with no trade name selected.
- 🧪 Tests: 27 script-based checks (PASS), full browser walkthrough (PASS after fixes),
  `tsc`/`lint`/`build` (PASS, before and after).
- 📁 Files: `lib/customer-pos/schema.ts`, `components/customer-pos/customer-po-form.tsx` (both
  edited); `tasks.md` updated with full verification notes; all throwaway scripts and DB/Storage
  rows removed; this PHR.
- 🔁 Next prompts: feature is fully implemented, verified against the live database, and ready to
  commit/PR when the user is ready.
- 🧠 Reflection: when browser automation "does nothing," the instinct is to blame the tooling —
  the actual discipline that paid off here was checking the dev server's own request log for
  ground truth (did the expected POST fire at all?) before accepting either "it's a tooling quirk"
  or "it's an app bug" as the explanation. That log line (`resolveCustomerItemCode` firing,
  `createCustomerPO` never firing) was the single piece of evidence that separated a real
  validation bug from an automation-timing artifact that looked identical from the screenshot
  alone.

## Evaluation notes (flywheel)

- Failure modes observed: `tradeNameId`'s `.optional()`-without-empty-string-handling bug was
  written during `/sp.implement` and passed `tsc`/`lint`/`build` cleanly (types checked out fine —
  the bug is a runtime validation-value mismatch, not a type error), and would not have been
  caught without an actual browser-driven submission attempt with the field left blank.
- Graders run and results (PASS/FAIL): 27/27 script checks PASS; full browser walkthrough PASS
  after the two fixes; `tsc`/`lint`/`build` PASS throughout.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): for any form field backed by an optional uuid/enum
  whose source is a `<select>` with a blank option, default to the
  `.optional().or(z.literal(""))` pattern from the start rather than plain `.optional()` — this
  project now has three instances of the same fix (customers' email, suppliers' email, this
  feature's tradeNameId), suggesting it's worth a standing convention note rather than
  rediscovering it per feature.
