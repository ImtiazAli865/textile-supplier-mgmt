---
id: 0007
title: Analyze remediation — destination default and timestamps
stage: tasks
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.analyze
labels: ["tasks", "purchase-orders", "analyze", "remediation"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/data-model.md
 - specs/006-customer-purchase-orders/research.md
 - specs/006-customer-purchase-orders/tasks.md
 - specs/006-customer-purchase-orders/quickstart.md
 - history/prompts/006-customer-purchase-orders/0007-analyze-remediation-i1-u2.tasks.prompt.md
tests:
 - none (task-remediation turn; no code changed)
---

## Prompt

also fix I1 and U2

## Response snapshot

Applied the remaining two findings from the earlier `/sp.analyze` report:

- **I1 (destination auto-fill undocumented in tasks)**: data-model.md originally said the
  billing-address default was "copied in by the UI" — on closer look this would require a new
  client-callable read (005's `getCustomer` is Server-Component-only, not exposed as an action per
  its own contracts.md), just to pre-fill a fallback value. Changed the mechanism to a
  service-layer default instead: `createCustomerPORecord`/`updateCustomerPORecord` resolve a blank
  `destinationText` to the selected customer's billing address (a plain read against `customers`)
  before calling the RPC, never inside the Postgres function itself. Updated data-model.md's
  column note, added a new research.md Decision entry explaining the mechanism and rejecting the
  client-side-copy alternative, and extended T006/T021 in tasks.md accordingly. Added a matching
  quickstart.md check (leave destination blank, confirm the customer's billing address appears on
  the saved PO).
- **U2 (FR-019 display half implicit)**: extended T003's `CustomerPODetail` type description to
  explicitly include `createdAt`/`updatedAt`, and T014's detail-page task to explicitly render
  them. Added a matching quickstart.md check.

Added a Notes entry to tasks.md recording both fixes for traceability.

## Outcome

- ✅ Impact: all four findings from the `/sp.analyze` report (C1, U1, I1, U2) are now resolved
  across data-model.md, research.md, tasks.md, and quickstart.md — the artifact set for
  `006-customer-purchase-orders` should now re-analyze clean.
- 🧪 Tests: none — task-remediation turn only.
- 📁 Files: data-model.md, research.md, tasks.md, quickstart.md (all edited); this PHR.
- 🔁 Next prompts: user may re-run `/sp.analyze` to confirm a clean report, or proceed straight to
  `/sp.implement`.
- 🧠 Reflection: fixing I1 surfaced a better design than the one originally written — "copied in
  by the UI" was never actually checked against whether the UI *could* do that cheaply (it
  couldn't, without adding a new client-callable read); resolving it server-side is both simpler
  and avoids a wasted round trip. Worth treating "how would the UI actually get this data"
  as a standing question whenever a plan/data-model doc says a value is "shown"/"copied"/"defaulted"
  by the UI, not just naming the mechanism without checking it's actually available at that layer.

## Evaluation notes (flywheel)

- Failure modes observed: the original data-model.md wording (I1's root cause) assumed a
  client-side capability that didn't exist in this project's established contracts — caught only
  by `/sp.analyze`'s cross-artifact pass, not during the original `/sp.plan` write-up.
- Graders run and results (PASS/FAIL): the `/sp.analyze` report served as the grader; both fixes
  verified by inspection against the original findings.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when writing a data-model.md note that says a default
  is "applied by the UI," pause and confirm the UI layer actually has the data/capability to do
  so before finalizing the wording, rather than writing the most natural-sounding phrase.
