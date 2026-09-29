---
id: 0021
title: Project status report
stage: general
date: 2026-09-29
surface: agent
model: claude-opus-5-5
feature: none
branch: 010-production-batches
user: ImtiazAli865
command: none
labels: ["status","git","supabase","migrations"]
links:
  spec: null
  ticket: null
  adr: null
  pr: null
files:
 - history/prompts/general/0021-project-status-report.general.prompt.md
tests:
 - live Supabase read-only select probe for tables/columns of migrations 0001-0010 (all HTTP 200)
---

## Prompt

Give me a full status report on this project:
1. Which feature branches exist, and what is each one's status (merged to master, or still 
   on its own branch)?
2. Which features (001 through however many exist) have a completed migration that's been 
   applied to the live Supabase database?
3. What is the current branch I'm on right now?
4. List all files under specs/ (just the feature folder names) so I can see what's been 
   specified so far.

## Response snapshot

11 feature branches (001-010 incl. 003b), stacked linearly; none merged to master (master = initial Specify commit; no `main`; no remote). All 10 migrations (0001-0010) verified applied on live Supabase via real GET selects. Current branch: 010-production-batches. specs/ has 11 feature folders plus PRODUCT-OVERVIEW.md.

## Outcome

- Impact: read-only status report; no code changes
- Tests: live DB probe passed for all migrations
- Files: this PHR only
- Next prompts: merge stacked branches into master; set up a remote
- Reflection: git suggested `main` but the repo's base branch is `master`

## Evaluation notes (flywheel)

- Failure modes observed: none
- Graders run and results (PASS/FAIL): n/a
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
