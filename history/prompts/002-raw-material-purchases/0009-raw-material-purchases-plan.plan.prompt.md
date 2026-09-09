---
id: 0009
title: Raw material purchases plan
stage: plan
date: 2026-09-10
surface: agent
model: claude-sonnet-5
feature: 002-raw-material-purchases
branch: 002-raw-material-purchases
user: imtiazkind143@gmail.com
command: /sp.plan
labels: [plan, raw-material-purchases, textile-supplier-management]
links:
  spec: specs/002-raw-material-purchases/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/002-raw-material-purchases/plan.md
 - specs/002-raw-material-purchases/research.md
 - specs/002-raw-material-purchases/data-model.md
 - specs/002-raw-material-purchases/contracts/server-actions.md
 - specs/002-raw-material-purchases/quickstart.md
 - CLAUDE.md
tests:
---

## Prompt

(no additional input — /sp.plan run with no arguments against the existing spec.md on branch 002-raw-material-purchases)

## Response snapshot

Ran `setup-plan.ps1` to scaffold `plan.md`. Read the actual 001 implementation (lib/suppliers/schema.ts, service.ts, app/actions/suppliers.ts, (dashboard)/layout.tsx, firestore.rules/indexes.json, package.json) to ground the plan in real, already-established conventions rather than the generic template. Produced: research.md with 5 purchase-specific decisions (live supplier join instead of denormalized name; plain rounded numbers instead of integer minor-units; totals computed via fetch-and-sum instead of aggregation queries; consumption lock derived from remainingWeightKg vs. weightKg instead of a stored flag; purchaseDate as a Firestore Timestamp for range-query support) — everything else (Server Actions/Components split, Admin-SDK-only Firestore access, session-cookie auth, shared Zod validation) explicitly inherited from 001's research.md rather than re-litigated. data-model.md defines the `rawMaterialPurchases` collection (supplierId ref, purchaseDate, weightKg, ratePerKg, derived totalCost, derived-use remainingWeightKg, audit fields), one new composite index, and a one-way unconsumed→consumed lifecycle. contracts/server-actions.md specifies createPurchase/updatePurchase/deletePurchase (all guarding the consumption lock) plus the read-side listPurchases/getPurchase/listActiveSuppliersForSelect contracts. plan.md's Project Structure extends 001's exact three-layer pattern (lib/<feature>/{schema,service}.ts, app/actions/<feature>.ts, components/<feature>/*) with a new `purchases` module and one nav-link addition to the existing dashboard layout — no new projects/services. Constitution Check re-confirmed the unfilled constitution template and re-flagged (without re-raising, since already surfaced at /sp.specify) the standing ADR suggestion for the lot-consumption model. Ran update-agent-context.ps1 — it only added a BOM to CLAUDE.md (same no-op behavior confirmed via git history to have occurred during 001 too, since this project's CLAUDE.md doesn't use the standard spec-kit tech-stack markers the script looks for).

## Outcome

- ✅ Impact: Feature 002's technical design is complete and ready for `/sp.tasks` — no unresolved NEEDS CLARIFICATION, no new infrastructure beyond one Firestore collection and one composite index.
- 🧪 Tests: None (plan stage — no code yet; Vitest/Firestore Emulator stack documented as intended but not wired in, matching 001)
- 📁 Files: specs/002-raw-material-purchases/plan.md (new), research.md (new), data-model.md (new), contracts/server-actions.md (new), quickstart.md (new), CLAUDE.md (BOM added by update-agent-context.ps1, no content change)
- 🔁 Next prompts: `/sp.tasks` to break this plan into dependency-ordered, testable tasks.
- 🧠 Reflection: Deliberately read 001's actual source files (not just its plan.md) before designing 002, so the new `purchases` module reuses real function/file-naming conventions (e.g. `toIsoString`, `*Record` service function suffixes, `ActionResult<T>` action return type) instead of drifting into a slightly different shape.

## Evaluation notes (flywheel)

- Failure modes observed: update-agent-context.ps1 doesn't actually update CLAUDE.md content for this project's custom (non-standard-template) CLAUDE.md format — confirmed via `git log -- CLAUDE.md` that this was already the case in 001, so not a regression introduced here.
- Graders run and results (PASS/FAIL): N/A (no formal grader for plan stage; Constitution Check gate — PASS, no violations).
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): When starting 003-production-batches, decide whether it's worth fixing update-agent-context.ps1 (or CLAUDE.md's structure) so agent-context updates actually land, since two features in a row have now been silent no-ops.
