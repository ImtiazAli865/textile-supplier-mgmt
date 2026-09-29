---
id: 0034
title: QA cleanup and concurrency testing
stage: misc
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: 011-labour-commission-ledger
branch: 011-labour-commission-ledger
user: ImtiazAli865
command: none
labels: ["011","qa","cleanup","concurrency","pglite","triggers"]
links:
  spec: specs/011-labour-commission-ledger/spec.md
  ticket: null
  adr: history/adr/0010-contractor-payment-allocation-and-settlement-lock.md
  pr: null
files:
 - none
tests:
 - none
---

## Prompt

Before /sp.tasks — I need the QA-cleanup approach nailed down concretely, since this project 
has relied on "test against live Supabase, then fully delete and verify zero residue" for 
006-010, and the new immutability triggers break that.

My suggestion: a dedicated, tightly-scoped cleanup script that runs SET session_replication_role 
= replica (session-local only — doesn't affect other concurrent connections or disable triggers 
project-wide) inside its own transaction, deletes only QA-tagged rows, then resets. This bypasses 
triggers for that one script's session only, never touches real business logic in production 
use, and matches the discipline already used (QA-tagged rows, delete-count-must-match-created-
count verification).

Please confirm this is workable (or propose an alternative), and also confirm: can genuine 
two-transaction concurrency races (payment vs payment, payment vs settlement) actually be tested 
against PGlite, or does that still require the real Supabase connection like 010's two-tab test 
did? I want to know before we get deep into /sp.implement whether live-DB testing time will be 
needed again, so we can plan the cleanup script for it.

## Response snapshot

Replica mode workable with caveats: use SET LOCAL not SET (pooler leakage / failed reset), needs a privileged SQL-editor/psql session (not RPC), and it also disables FK enforcement triggers so deletes could orphan rows silently. Recommended alternative: ALTER TABLE ... DISABLE TRIGGER <named immutability triggers> inside one transaction — transactional DDL, invisible to other sessions, FKs stay enforced, auto-restored on rollback; cost is a brief ACCESS EXCLUSIVE lock. Scope by QA-011 contractor name prefix; count-match verification; dry run in begin/rollback first. PGlite: single connection, cannot test two-transaction races; needs live Supabase or a local multi-connection Postgres (Supabase CLI/Docker). Asked user to choose.

## Outcome

- Impact: decision pending; no files changed
- Tests: none
- Files: none
- Next prompts: choose cleanup mechanism and test DB, then /sp.tasks
- Reflection: none

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
