---
id: 0008
title: Analyze remediation — contracts drift and typo
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
 - specs/006-customer-purchase-orders/contracts/server-actions.md
 - specs/006-customer-purchase-orders/research.md
 - history/prompts/006-customer-purchase-orders/0008-analyze-remediation-i2-i3-l1.tasks.prompt.md
tests:
 - none (task-remediation turn; no code changed)
---

## Prompt

yes fix I2, I3, and L1

## Response snapshot

Re-ran `/sp.analyze`'s cross-artifact pass after the two prior remediation rounds and found the
original four findings (C1, U1, I1, U2) all resolved. It surfaced three small new items, all
introduced as side effects of those fixes because `contracts/server-actions.md` wasn't touched
during them:

- **I2**: `getCustomerPO`'s documented Output was missing `createdAt`/`updatedAt`, even though
  data-model.md and tasks.md (T003/T014) now both require them for FR-019. Added them to the
  Output line.
- **I3**: Neither `createCustomerPO` nor `updateCustomerPO`'s contract mentioned the
  blank-`destinationText`-defaults-to-billing-address behavior added to close I1. Added a one-line
  Behavior note to both, citing research.md.
- **L1**: A stray "or," typo in research.md's newest decision entry ("in one place or, testable")
  from the I1 edit — fixed to "in one place, testable".

## Outcome

- ✅ Impact: `contracts/server-actions.md` and `research.md` now fully agree with `data-model.md`
  and `tasks.md`. All seven findings raised across three `/sp.analyze` passes for
  `006-customer-purchase-orders` are now resolved.
- 🧪 Tests: none — task-remediation turn only.
- 📁 Files: contracts/server-actions.md, research.md (both edited); this PHR.
- 🔁 Next prompts: user may re-run `/sp.analyze` once more for a final clean confirmation, or
  proceed to `/sp.implement`.
- 🧠 Reflection: fixing a decision at the "source" documents (data-model.md/research.md/tasks.md)
  without also sweeping `contracts/server-actions.md` — the one document most likely to be read in
  isolation by a future implementer — left it silently out of date twice in a row. Worth treating
  contracts.md as part of the same edit unit as data-model.md/research.md whenever a Postgres
  function's or service function's actual behavior changes, not a separately-remembered follow-up.

## Evaluation notes (flywheel)

- Failure modes observed: two consecutive remediation rounds (I1/U2, then this one) each fixed the
  "core" design docs but didn't propagate the change into contracts.md, requiring a third
  `/sp.analyze` pass to catch. Next time: when a fix touches data-model.md or research.md's
  description of a function's behavior, check contracts/server-actions.md for the same
  function/action in the same edit turn, not as an afterthought.
- Graders run and results (PASS/FAIL): the `/sp.analyze` report served as the grader across all
  three passes; this round confirms all findings closed.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when editing data-model.md/research.md to change a
  documented function's behavior, grep contracts/server-actions.md for that function name in the
  same turn before considering the fix complete.
