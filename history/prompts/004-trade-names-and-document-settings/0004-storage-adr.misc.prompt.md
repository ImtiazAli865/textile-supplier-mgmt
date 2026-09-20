---
id: 0004
title: Create storage access ADR
stage: misc
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 004-trade-names-and-document-settings
branch: 004-trade-names-and-document-settings
user: imtiazkind143@gmail.com
command: /sp.adr
labels: ["adr", "supabase-storage", "security"]
links:
  spec: specs/004-trade-names-and-document-settings/spec.md
  ticket: null
  adr: history/adr/0003-storage-access-via-server-only-signed-urls.md
  pr: null
files:
 - history/adr/0003-storage-access-via-server-only-signed-urls.md
 - history/prompts/004-trade-names-and-document-settings/0004-storage-adr.misc.prompt.md
tests:
 - none (documentation turn; no code changed)
---

## Prompt

Create the ADR now, then run /sp.tasks for 004

## Response snapshot

Created `history/adr/0003-storage-access-via-server-only-signed-urls.md` per the ADR suggestion
surfaced during 004's plan turn. Documents the decision to extend ADR-0001's server-only trust
boundary to Supabase Storage: every bucket private, all writes through the existing service-role
admin client, all browser-facing reads as short-lived signed URLs generated at request time, no
Storage RLS policies (service-role bypasses them the same way it bypasses Postgres RLS).
Alternatives recorded and rejected: a public bucket with plain URLs (violates FR-010 outright),
client-side direct-to-Storage upload via the anon key + Storage RLS policies (would introduce a
second trust model this project has deliberately avoided since ADR-0001), and
security-through-obscurity via an unguessable path alone (not a real protection once a path
appears in a response/log). Cross-referenced as the Storage-side counterpart to ADR-0002
(multi-table Postgres write atomicity) — together the two ADRs now cover this project's two
"how do we write safely to Supabase" patterns. Proceeding next to `/sp.tasks` for 004.

## Outcome

- ✅ Impact: ADR-0003 created and accepted, closing out the one architectural decision flagged
  during 004's plan phase; no outstanding ADR suggestions remain for this feature.
- 🧪 Tests: none — documentation turn only.
- 📁 Files: history/adr/0003-storage-access-via-server-only-signed-urls.md (new); this PHR.
- 🔁 Next prompts: `/sp.tasks` for 004-trade-names-and-document-settings.
- 🧠 Reflection: naming this ADR as the explicit "Storage-side counterpart" to ADR-0002 in its
  References section keeps the ADR set self-organizing — a future reader scanning `history/adr/`
  can see the project has exactly two Supabase write-safety patterns (multi-table atomicity;
  file-storage access) rather than treating each ADR as an isolated one-off.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
