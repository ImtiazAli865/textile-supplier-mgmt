---
id: 0002
title: Trade names document settings spec
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 004-trade-names-and-document-settings
branch: 004-trade-names-and-document-settings
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "trade-names", "document-settings"]
links:
  spec: specs/004-trade-names-and-document-settings/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/004-trade-names-and-document-settings/spec.md
 - specs/004-trade-names-and-document-settings/checklists/requirements.md
 - history/prompts/004-trade-names-and-document-settings/0002-trade-names-document-settings-spec.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

004-trade-names-and-document-settings: Trade name records (printed name/address, NTN, Sales Tax Registration number, per-trade-name Challan and Invoice number sequences, signature image + company stamp image upload) and the Supabase Storage setup that backs the image/attachment uploads. Source: specs/PRODUCT-OVERVIEW.md § "Trade Names & Document Settings" and § "Cross-Cutting Technical Requirements". Five trade names exist today (Global Distributors, IBL Frontier Market, M Zayan Impex, Rashid Towel, M.A Textile) but the set must be manageable, not hardcoded. Trade name selection itself is a per-document concern used by later features (006-008), not part of this feature's own scope beyond the trade name record and its assets.

## Response snapshot

Created branch `004-trade-names-and-document-settings` (via `.specify/scripts/powershell/create-new-feature.ps1 -Number 4 -ShortName "trade-names-and-document-settings"`) and wrote `specs/004-trade-names-and-document-settings/spec.md`: four prioritized user stories (P1 create/view trade name records; P2 upload signature+stamp images; P2 configure per-trade-name Challan/Invoice number-sequence overrides; P3 edit/deactivate, mirroring 001's supplier pattern), 14 functional requirements, Key Entities (Trade Name, Signature/Stamp Image, Staff User), an Assumptions section, and 5 measurable success criteria. No [NEEDS CLARIFICATION] markers were needed — all ambiguities had clear precedent in this repo (001's active/inactive + duplicate-name handling) or a defensible default documented as an assumption. Deliberately scoped the "next Challan/Invoice number" fields as a plain overridable value only, deferring increment/format/reset logic to the future Challans (007) and Performa Invoicing (008) features, and made signature/stamp images optional at creation to allow phased migration of the five existing trade names. Generated and self-validated `specs/004-trade-names-and-document-settings/checklists/requirements.md` — all items pass on first pass; two scope decisions flagged in its Notes section for the user to confirm before `/sp.plan`.

## Outcome

- ✅ Impact: `specs/004-trade-names-and-document-settings/spec.md` ready for `/sp.plan`; requirements checklist passes with no outstanding clarifications.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md, checklists/requirements.md (both new); this PHR.
- 🔁 Next prompts: user reviews the two flagged scope decisions (sequence-field scope, optional images at creation), then `/sp.plan` for 004.
- 🧠 Reflection: reused 001-supplier-directory's spec as the structural/style template (active/inactive pattern, duplicate-name handling, assumptions section) since 004 is the same "small manageable master-data directory" shape — kept spec-writing fast and consistent rather than re-deriving conventions.

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): spec-quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
