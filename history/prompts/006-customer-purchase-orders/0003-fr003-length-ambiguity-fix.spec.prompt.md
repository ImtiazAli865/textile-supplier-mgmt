---
id: 0003
title: FR-003 length ambiguity fix
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 006-customer-purchase-orders
branch: 006-customer-purchase-orders
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "purchase-orders", "correction"]
links:
  spec: specs/006-customer-purchase-orders/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/006-customer-purchase-orders/spec.md
 - history/prompts/006-customer-purchase-orders/0003-fr003-length-ambiguity-fix.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

Before /sp.plan, please fix an ambiguity in FR-003:

"System MUST accept a PO number as free-form text of at least 30 characters" is unclear —
does this mean the FIELD/COLUMN must support up to at least 30 characters (correct intent),
or that every PO number entered must itself be at least 30 characters long (wrong, and would
reject Habbitt's "P14337" which is only 6 characters)?

Please rewrite FR-003 to unambiguously say the column/field capacity is at least 30
characters (e.g. varchar(30) or higher, no minimum length on the actual value), with no
lower bound on how short a real PO number can be. Also double-check the "19+ characters"
figure in User Story 2's Acceptance Scenario 1 against the actual example
"111202110000440639" (which is 18 characters) and correct whichever is wrong.

Show me the corrected FR-003 and Acceptance Scenario text before we proceed.

## Response snapshot

Confirmed by counting: "111202110000440639" is 18 characters, not 19. Found three places in
`spec.md` carrying the wrong/ambiguous figure: FR-003 itself, User Story 2's Acceptance Scenario
1, and SC-002. Rewrote FR-003 to state field *capacity* (>= 30 chars) with explicitly no minimum
length and no format requirement on the entered value, using both real examples (Habbitt's
"P14337" = 6 chars, Chaseup's = 18 chars) to remove any capacity-vs-minimum ambiguity. Corrected
"19+" to "18+" in both the Acceptance Scenario and SC-002. Verified no other "19+"/"19 characters"
occurrences remained. Did not run `/sp.plan` — held per the user's "before /sp.plan" framing,
awaiting their go-ahead.

## Outcome

- ✅ Impact: FR-003 now unambiguously describes field capacity, not a minimum PO-number length;
  the 18-vs-19-character discrepancy is corrected everywhere it appeared.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md (edited, 3 locations); this PHR.
- 🔁 Next prompts: user confirms the corrected wording, then `/sp.plan`.
- 🧠 Reflection: a numeric example should always be counted, not eyeballed, before it's used in a
  requirement — this is the second review-round catch (after the short-receipt/rejection scope
  gap) on this spec, both from the user's line-by-line read rather than my own drafting pass.
  Worth literally counting characters/digits in any quoted example before writing a requirement
  around it, rather than estimating.

## Evaluation notes (flywheel)

- Failure modes observed: wrote "at least 30 characters" for FR-003 without distinguishing
  capacity from minimum length, and miscounted "111202110000440639" as 19 characters instead of
  18 — both caught by user review.
- Graders run and results (PASS/FAIL): n/a (no formal grader for this pass).
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): when a requirement quotes a specific numeric example
  (a length, a count, a limit), verify it by direct count before writing the sentence, not after.
