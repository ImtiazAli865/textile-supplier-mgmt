---
id: 0003
title: Trade names implementation plan
stage: plan
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 004-trade-names-and-document-settings
branch: 004-trade-names-and-document-settings
user: imtiazkind143@gmail.com
command: /sp.plan
labels: ["plan", "trade-names", "supabase-storage"]
links:
  spec: specs/004-trade-names-and-document-settings/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-trade-names-and-document-settings/plan.md
 - specs/004-trade-names-and-document-settings/research.md
 - specs/004-trade-names-and-document-settings/data-model.md
 - specs/004-trade-names-and-document-settings/contracts/server-actions.md
 - specs/004-trade-names-and-document-settings/quickstart.md
 - history/prompts/004-trade-names-and-document-settings/0003-trade-names-implementation-plan.plan.prompt.md
tests:
 - none (planning turn; no code changed)
---

## Prompt

Go ahead with /sp.plan for 004

## Response snapshot

Ran `.specify/scripts/powershell/setup-plan.ps1 -Json` to scaffold `plan.md`, surveyed the
existing codebase (`lib/supabase/admin.ts`, `lib/suppliers/service.ts`, `app/actions/suppliers.ts`,
001/003b's data-model/contracts/quickstart docs) to match established conventions, then wrote all
five Phase 0/1 artifacts. Key design decisions: `trade_names` is a plain single table with
ordinary `supabase-js` CRUD (no Postgres RPC — unlike ADR-0002's pattern, since there's no second
table to keep in sync); this is the project's first feature to use Supabase Storage, so it
provisions one private `trade-name-assets` bucket accessed only through the existing server-only
admin client, with reads served as short-lived signed URLs (extends ADR-0001's server-only trust
boundary to Storage rather than introducing a client-facing credential); signature/stamp uploads
are a deliberate three-step "upload new object → update pointer column → best-effort delete old
object" sequence, chosen because Storage objects sit outside Postgres' transaction boundary, so
the only possible failure leaves a harmless orphaned file rather than a dangling DB reference;
`next_challan_number`/`next_invoice_number` are plain overridable integer columns with no
increment/format/reset logic (deferred to 007/008); `printed_address` is one free-text field,
deliberately diverging from Suppliers' structured address shape since no requirement here filters
or decomposes it. Ran `update-agent-context.ps1 -AgentType claude`; confirmed via `git diff` it
produced no actual change to CLAUDE.md (idempotent no-op against this project's customized file,
consistent with 002/003/003b's history). Surfaced one ADR suggestion in the Constitution Check
section — "storage-access-via-server-only-signed-urls" — for the user's explicit consent, not
auto-created.

## Outcome

- ✅ Impact: Full Phase 0/1 planning artifact set for 004 ready for `/sp.tasks`; one ADR candidate
  surfaced and awaiting user consent.
- 🧪 Tests: none — planning turn only.
- 📁 Files: plan.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md (all
  new); this PHR.
- 🔁 Next prompts: user decides whether to run `/sp.adr storage-access-via-server-only-signed-urls`
  now or defer it; then `/sp.tasks` for 004.
- 🧠 Reflection: treating "does this write touch more than one table" as the litmus test (per
  ADR-0002) made the RPC-vs-plain-CRUD call for `trade_names` fast and unambiguous — a reusable
  question for scoping every future feature's write path.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): n/a — no automated graders configured for planning turns.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
