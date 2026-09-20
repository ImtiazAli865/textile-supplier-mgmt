---
id: 0002
title: Short-receipt/rejection scope clarification
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "purchase-orders", "scope-clarification"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/spec.md
 - history/prompts/006-customer-purchase-orders/0002-short-receipt-rejection-scope-clarification.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

Before I review in detail, please paste the full spec.md content here in the chat — I need
to see the exact wording of all 19 FRs, not just the summary.

Also confirm: where does short-receipt/rejection handling (delivered quantity vs originally
accepted quantity, per the master spec) live — is it explicitly out of scope for 006 and
deferred to 007-Challans? If so, please make that explicit in this spec's Assumptions,
since it wasn't mentioned in the summary.

## Response snapshot

Re-read `specs/PRODUCT-OVERVIEW.md`'s Challans section to confirm the exact mechanics: "delivered
≠ accepted" — each Challan line records quantity delivered and quantity accepted separately
(defaulting equal, edited down if the signed challan comes back short), only the *accepted*
quantity rolls up into the PO line's Delivered figure, and rejected goods are explicitly recorded
as "return to inventory" or "write off," never assumed. Confirmed this entire distinction is a
007-Challans-line-level concept with no counterpart in 006.

Updated `specs/006-customer-purchase-orders/spec.md`:
- FR-017 now states explicitly that the delivered-quantity value 007 writes represents cumulative
  *accepted* quantity across that line's Challans, and that the delivered-vs-accepted split and
  short-receipt/rejection handling are Challan-line-level concepts entirely owned by 007.
- The PO Line Item key entity's `quantity delivered` attribute now cross-references this.
- Added a new Assumptions bullet spelling out that this feature has no concept of a
  delivered-vs-accepted split, short receipts, rejections, returns, or write-offs on a PO line —
  it only ever sees the single rolled-up accepted total once 007 starts writing it.

Then pasted the full, updated `spec.md` verbatim in chat per the user's request.

## Outcome

- ✅ Impact: `specs/006-customer-purchase-orders/spec.md` now explicitly scopes short-receipt/
  rejection handling out to 007-Challans, closing a gap the initial summary didn't surface. Full
  spec text shared with the user for detailed line-by-line review.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md (edited); this PHR.
- 🔁 Next prompts: user reviews the full FR list and the short-receipt/rejection assumption, then
  either requests further corrections or says go for `/sp.plan`.
- 🧠 Reflection: the user caught a real gap — the initial spec's FR-017 said 007 "updates" the
  delivered-quantity column but didn't say *what* that column means (raw delivered vs. accepted),
  which matters because the master spec explicitly distinguishes the two. Pasting only a summary
  after the first pass, rather than the full spec, is likely what let this slip past a first
  read — worth defaulting to sharing full spec text (not just a summary) after future spec-writing
  turns, especially on a business-sensitive feature the user said they'd review in detail.
- 📋 ADR check: no new architecturally significant decision here — this is an application of the
  precedent already recorded in `history/adr/0004-shared-tables-created-at-first-writer.md`, not a
  new decision requiring its own ADR.

## Evaluation notes (flywheel)

- Failure modes observed: initial spec summary omitted a scope boundary (delivered-vs-accepted)
  that was in the master spec but not in the user's three "key points" — caught by user review,
  not self-review. Next time: proactively cross-check every master-spec sub-section named in the
  feature's roadmap row before finalizing, not just the ones the user's prompt restates.
- Graders run and results (PASS/FAIL): n/a (no formal grader for this pass; user review pending).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when summarizing a freshly written spec back to the
  user instead of pasting it in full, explicitly list which master-spec sub-sections were
  cross-checked, so gaps like this are visible before the user has to ask.
