---
id: 0019
title: Data model customer deferral note
stage: misc
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003-product-catalog
branch: 003-product-catalog
user: ImtiazAli865
command: none
labels: ["docs", "product-catalog", "traceability"]
links:
  spec: specs/003-product-catalog/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-product-catalog/data-model.md
tests:
---

## Prompt

Yes, add the note to data-model.md

## Response snapshot

Follow-up to the user's prior question ("does 003-product-catalog's spec/data-model.md
explicitly defer customer-specific item codes and per-customer selling UOM to
005-customers?"), which I verified by grepping the actual files rather than recalling from
memory: spec.md and plan.md both explicitly document the deferral (Edge Cases, Key Entities,
Assumptions in spec.md; the Constitution Check reasoning in plan.md), but data-model.md had
zero mention of it — the fields were simply absent with no cross-reference, a real
documentation gap distinguishable from "forgotten."

Added a new callout paragraph to `specs/003-product-catalog/data-model.md`, right after the
existing "No foreign keys, in or out" paragraph (the natural place a reader would wonder about
customer-facing fields): explicitly states that customer-specific item codes and per-customer
selling UOM are deliberately excluded (not an oversight), why (both require the not-yet-built
Customer entity), a pointer to spec.md's Edge Cases/Assumptions for the full reasoning, and
which future feature (005-customers or 006-customer-purchase-orders) will own that mapping.

## Outcome

- ✅ Impact: `data-model.md` is now self-consistent with spec.md/plan.md on this point — a
  reader of any one of the three documents can now find the same deferral decision.
- 🧪 Tests: none (documentation-only change, no code touched).
- 📁 Files: `specs/003-product-catalog/data-model.md` (one paragraph added).
- 🔁 Next prompts: none required by this change; still pending from prior work is applying
  `supabase/migrations/0002_products.sql` to the live Supabase project and completing
  T026/T027 in tasks.md.
- 🧠 Reflection: The user's question was itself a useful check — verifying against the actual
  file content (via Grep) rather than trusting my own prior summary caught a real, if minor,
  cross-document inconsistency.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): not applicable.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
