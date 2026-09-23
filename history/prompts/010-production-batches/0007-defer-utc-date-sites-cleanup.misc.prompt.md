---
id: 0007
title: Defer UTC date sites cleanup
stage: misc
date: 2026-09-24
surface: agent
model: claude-opus-5-5
feature: 010-production-batches
branch: 010-production-batches
user: ImtiazAli865
command: (decision, no command)
labels: ["adr-0009","timezone","deferral","tech-debt"]
links:
  spec: specs/010-production-batches/spec.md
  ticket: null
  adr: history/adr/0009-business-today-is-the-pakistan-calendar-date.md
  pr: null
files:
 - history/adr/0009-business-today-is-the-pakistan-calendar-date.md
tests:
 - none
---

## Prompt

Understood, and thank you for the clear confirmation. Let's leave the other 10 UTC-date 
spots untouched for now — they're a narrow edge case (midnight-5am PKT) in already-shipped, 
tested features, and fixing them now would mean reopening 007/009 without a specific need. 
We can address them as a dedicated cleanup later.

## Response snapshot

Acknowledged. Recorded the deferral (user decision, 2026-09-24) in ADR-0009 under the list of
non-conforming sites, noting that new code from 011 onward must follow the convention from the
start. Updated project memory so the deferred sites aren't fixed opportunistically. No code changed.

## Outcome

- ✅ Impact: Decision captured; scope of 010 unchanged.
- 🧪 Tests: none
- 📁 Files: ADR-0009 (one paragraph added)
- 🔁 Next prompts: apply migration 0010 → quickstart → /sp.git.commit_pr
- 🧠 Reflection: n/a

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
