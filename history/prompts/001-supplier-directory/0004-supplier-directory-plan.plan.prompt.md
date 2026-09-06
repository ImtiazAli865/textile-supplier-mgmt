---
id: 0004
title: Supplier directory technical plan
stage: plan
date: 2026-09-06
surface: agent
model: claude-sonnet-5
feature: 001-supplier-directory
branch: 001-supplier-directory
user: imtiazkind143@gmail.com
command: /sp.plan
labels: [plan, supplier-directory, nextjs, firestore, firebase-auth]
links:
  spec: specs/001-supplier-directory/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-supplier-directory/plan.md
 - specs/001-supplier-directory/research.md
 - specs/001-supplier-directory/data-model.md
 - specs/001-supplier-directory/contracts/server-actions.md
 - specs/001-supplier-directory/quickstart.md
tests:
---

## Prompt

Use Next.js (App Router, TypeScript) + Firestore for data + Firebase Auth for authentication, deployed on Vercel — consistent with the user's existing Worker Ledger and Ledger App projects.

## Response snapshot

Ran `setup-plan.ps1` to scaffold plan.md (no issues this time). Filled Technical Context with the resolved stack. Constitution Check noted the project's constitution.md is still an unfilled template, so no formal gates exist yet — proceeded under standard SDD guardrails and flagged an ADR suggestion for the two structurally significant decisions (Server Actions + Firestore Admin SDK instead of a public API; in-memory search instead of a search index) rather than blocking.

Phase 0 (research.md): resolved 7 decisions — Server Components/Actions over a REST API, Admin-SDK-only Firestore access (no client SDK), Firebase Auth session cookies for server-side auth checks, fetch-and-filter in-memory search instead of a search index (justified by the 500-record scale in SC-004), embedded contacts array instead of a subcollection, soft-delete via `status` field only, and shared Zod validation between client forms and Server Actions.

Phase 1: data-model.md (single `suppliers` Firestore collection with embedded `Contact[]`, composite indexes for status+name and status+material, state diagram for active/inactive), contracts/server-actions.md (function contracts for createSupplier, updateSupplier, setSupplierStatus, listSuppliers, getSupplier — standing in for OpenAPI since there's no public API), and quickstart.md (env vars, emulator setup, manual verification steps mapped to each user story's acceptance scenarios).

Ran update-agent-context.ps1 -AgentType claude; it only added a BOM to CLAUDE.md with no real content (template lacks the marker it expects), so that no-op change was discarded.

## Outcome

- ✅ Impact: Full technical design ready for /sp.tasks — architecture, data model, and action contracts all documented and traceable to spec FRs/SCs.
- 🧪 Tests: None yet (design stage); test strategy documented (Vitest + Testing Library + Firestore Emulator).
- 📁 Files: plan.md, research.md, data-model.md, contracts/server-actions.md, quickstart.md (all new)
- 🔁 Next prompts: `/sp.tasks` to break this into dependency-ordered, testable tasks; optionally `/sp.adr` first if the user wants the Server Actions/Firestore-access decision formally recorded.
- 🧠 Reflection: update-agent-context.ps1 is a no-op against this project's CLAUDE.md template since it lacks the expected insertion marker — worth fixing in the template if agent-context auto-sync is wanted later, but not blocking.

## Evaluation notes (flywheel)

- Failure modes observed: update-agent-context.ps1 silently no-ops (only adds a BOM) rather than erroring when its expected marker is missing from CLAUDE.md — could mask a real update failure in the future; not fixed here since it isn't blocking.
- Graders run and results (PASS/FAIL): Constitution Check gate — PASS (no gates defined; flagged for optional ADR/constitution follow-up).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): N/A
