---
id: 0006
title: Analyze remediation — customer filter and auth gap
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
 - specs/006-customer-purchase-orders/tasks.md
 - specs/006-customer-purchase-orders/quickstart.md
 - history/prompts/006-customer-purchase-orders/0006-analyze-remediation-c1-u1.tasks.prompt.md
tests:
 - none (task-remediation turn; no code changed)
---

## Prompt

yes fix C1 and U1

## Response snapshot

Applied the two HIGH-severity fixes identified by the prior `/sp.analyze` pass, both in
`tasks.md` (plan.md already correctly described the intended behavior for C1 — it was `tasks.md`
that lagged):

- **C1 (FR-012 customer filter)**: extended T006's `listCustomerPOs` description to explicitly
  take `{ status?, customerId? }` and apply the customer filter independently of status; extended
  T011 to add a customer-filter dropdown to `customer-po-list.tsx` (via `listActiveCustomersForSelect`,
  reusing `app/(dashboard)/customers/page.tsx`'s existing `CustomerStatusFilter` searchParams
  pattern) and added T004 as an explicit dependency; extended T012 to read `customerId` from
  `searchParams` and pass it through; extended T028 so its status-filter addition reads `status`
  from the *same* `searchParams` object rather than a separate mechanism, so both filters compose.
  Added a matching quickstart.md check (filtering the PO list down to one customer).
- **U1 (missing auth on `resolveCustomerItemCode`)**: added an explicit `requireCurrentUser()`
  call to T008's description, matching every other action task and contracts/server-actions.md's
  blanket per-action auth rule (FR-018).

Added a Notes entry to `tasks.md` recording both fixes and why, for traceability back to the
`/sp.analyze` report. Did not touch I1/U2 (MEDIUM/LOW) or `plan.md` — plan.md's FR-012 description
was already correct; the gap was entirely in `tasks.md`'s lag behind it.

## Outcome

- ✅ Impact: `tasks.md` (T006, T008, T011, T012, T028, Notes) and `quickstart.md` now correctly
  cover FR-012's customer filter and FR-018's auth requirement for every action, closing both HIGH
  findings from the `/sp.analyze` report.
- 🧪 Tests: none — task-remediation turn only.
- 📁 Files: tasks.md, quickstart.md (both edited); this PHR.
- 🔁 Next prompts: user may address I1/U2 (optional, MEDIUM/LOW) or proceed straight to
  `/sp.implement`.
- 🧠 Reflection: this confirms the value of running `/sp.analyze` before `/sp.implement` on a
  feature with several new Postgres functions and a multi-filter list view — both gaps were the
  kind that's cheap to fix as a one-line task description change now, but would have shipped as
  silent scope loss (no customer filter) or a real security hole (unauthenticated action) if
  caught only during or after implementation.

## Evaluation notes (flywheel)

- Failure modes observed: none this turn — this is itself the correction of two failure modes
  from the original `/sp.tasks` pass.
- Graders run and results (PASS/FAIL): the `/sp.analyze` report itself functioned as the grader;
  both flagged issues verified fixed by inspection.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
