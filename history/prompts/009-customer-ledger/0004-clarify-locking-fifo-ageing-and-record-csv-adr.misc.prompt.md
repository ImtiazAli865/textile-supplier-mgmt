---
id: 0004
title: Clarify locking, FIFO ageing, and record CSV ADR
stage: misc
date: 2026-09-23
surface: agent
model: claude-sonnet-5
feature: 009-customer-ledger
branch: 009-customer-ledger
user: imtiazkind143@gmail.com
command: /sp.adr
labels: ["clarification", "fifo-ageing", "concurrency", "adr", "csv-export", "customer-ledger"]
links:
  spec: specs/009-customer-ledger/spec.md
  ticket: null
  adr: history/adr/0007-csv-export-via-route-handler.md
  pr: null
files:
 - specs/009-customer-ledger/research.md
 - specs/009-customer-ledger/plan.md
 - history/adr/0007-csv-export-via-route-handler.md
tests:
 - none (clarification and ADR-authoring turn; no application code changed)
---

## Prompt

Before /sp.tasks, three things:

1. I previously asked: does update_customer_payment_status use row-level locking (for update) on
   the customer_payments row, so two concurrent status-change attempts on the same payment can't
   both succeed? This wasn't addressed in your summary — please confirm.

2. Please explain the FIFO ageing mechanism in full — specifically: how does it walk
   chronologically, does it correctly handle a payment that's later reversed (Bounced), and does
   it re-allocate correctly if an untied lump-sum payment is smaller than the oldest outstanding
   credit (partial allocation)? Show me the actual logic from research.md.

3. Yes, please run /sp.adr csv-export-via-route-handler.

Then proceed to /sp.tasks.

## Response snapshot

1. Confirmed and quoted the exact existing text: `data-model.md`'s `update_customer_payment_status`
   step 1 already reads with `for update`, and lines 77-80 already state the concurrency guarantee
   explicitly (blocks a second concurrent status-change call until the first transaction ends, then
   re-reads the now-terminal status and correctly rejects) — this was in the artifact from the plan
   turn but not surfaced directly in the prior summary, which was the actual gap.

2. Rewrote the FIFO ageing decision in `research.md` to include literal pseudocode (previously prose
   only) and two new explicit sub-sections answering exactly what was asked: (a) bounced-payment
   handling — the original debit's FIFO consumption is never replayed or undone; a bounce only
   appends a new credit dated at the status-change moment, so the total is correctly restored but its
   *age* resets to the bounce date rather than inheriting the original delivery's age, called out as
   a direct, intended consequence of the already-agreed "reversal is a new event" decision, not a
   bug; (b) partial allocation — a debit smaller than the oldest open credit reduces that entry's
   `remainingAmount` in place without resetting its `entryDate` or removing it from the queue, and a
   debit larger than one entry correctly spans multiple entries via the loop's `while` condition.
   Quoted the full pseudocode block back to the user in chat alongside direct prose answers to all
   three sub-questions.

3. Ran `check-prerequisites.ps1 -Json` to confirm `FEATURE_DIR`; found no `create-adr.sh`/`.ps1`
   script exists in this project's `.specify/scripts/`, so created the ADR agent-natively: read
   `.specify/templates/adr-template.md` and matched the richer style already established by
   ADR-0004/ADR-0006 (Scope blockquote, Status/Date/Feature/Context header, Decision, Consequences
   Positive/Negative, Alternatives Considered, References). Wrote
   `history/adr/0007-csv-export-via-route-handler.md` — Status Accepted, documenting the CSV-via-
   Route-Handler decision as a reusable pattern (first application: 009; expected later
   applications: 012, 013, both of which the master spec also lists as needing export), three
   alternatives considered (an `xlsx` library, client-side Blob construction from a Server Action, PDF-only),
   and cross-references to ADR-0006 (the sibling pattern this ADR's PDF half reuses unmodified).
   Updated `plan.md`'s Constitution Check to reference the now-accepted ADR-0007 in place of the
   prior "offered, not yet created" suggestion text.

## Outcome

- ✅ Impact: All three pre-`/sp.tasks` blockers resolved — concurrency guarantee reconfirmed with
  exact citation, FIFO ageing mechanism now has literal pseudocode with explicit bounce/partial-
  allocation handling documented in `research.md`, and ADR-0007 is written, accepted, and
  cross-linked from `plan.md`. Feature is unblocked for `/sp.tasks`.
- 🧪 Tests: none (clarification and documentation turn).
- 📁 Files: `specs/009-customer-ledger/research.md` (FIFO section rewritten with pseudocode),
  `specs/009-customer-ledger/plan.md` (Constitution Check updated), `history/adr/0007-csv-export-via-route-handler.md`
  (new).
- 🔁 Next prompts: `/sp.tasks 009-customer-ledger`.
- 🧠 Reflection: The locking-confirmation gap happened because the plan-stage summary described
  decisions in prose rather than quoting the artifact's own guarantee language directly — worth
  quoting exact data-model.md/research.md text in future summaries for anything touching
  concurrency or correctness guarantees, not just describing it, so nothing requires a follow-up
  "you didn't actually confirm X" round-trip.

## Evaluation notes (flywheel)

- Failure modes observed: the initial plan-turn summary omitted an explicit confirmation of a
  guarantee that was already fully documented in the artifact — a presentation gap, not a design
  gap, caught by the user's follow-up.
- Graders run and results (PASS/FAIL): n/a (no automated grader for planning/ADR turns).
- Prompt variant (if applicable): n/a.
- Next experiment (smallest change to try): when summarizing a plan/data-model turn, quote the
  artifact's own concurrency/immutability guarantee sentences verbatim rather than paraphrasing,
  for anything the user is likely to specifically check.
