---
id: 0003
title: Supplier directory spec
stage: spec
date: 2026-09-06
surface: agent
model: claude-sonnet-5
feature: 001-supplier-directory
branch: 001-supplier-directory
user: imtiazkind143@gmail.com
command: /sp.specify
labels: [spec, supplier-directory, textile-supplier-management]
links:
  spec: specs/001-supplier-directory/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/001-supplier-directory/spec.md
 - specs/001-supplier-directory/checklists/requirements.md
 - .specify/scripts/powershell/create-new-feature.ps1
tests:
---

## Prompt

Supplier Directory: a textile business needs to manage its fabric/material suppliers. Users (internal staff) can create, view, edit, and deactivate supplier records. Each supplier has: company name, contact person(s) with phone/email, address, the materials/fabric types they supply, payment terms, status (active/inactive), and internal notes/rating. Staff can search and filter suppliers by name, material type, or status. This is the first feature of a larger textile supplier management system (built with Next.js + Firestore + Firebase Auth, deployed on Vercel) that will later include purchase orders, inventory tracking, and invoicing -- but this spec covers only the supplier directory.

## Response snapshot

Ran `create-new-feature.ps1` to create branch `001-supplier-directory` and the spec scaffold; hit and fixed a PowerShell 5.1 incompatibility (`Join-Path` only accepts 2 positional args in Windows PowerShell 5.1, script used 3). Wrote the full spec with 3 prioritized, independently-testable user stories (P1: create & view, P2: search & filter, P3: edit & deactivate), 15 functional requirements, 3 key entities (Supplier, Contact, Staff User), an Assumptions section resolving ambiguous points with documented defaults (free-text material tags, 1-5 optional rating, no RBAC, soft-delete only, duplicate names allowed) instead of [NEEDS CLARIFICATION] markers, and 5 measurable, tech-agnostic success criteria. Created and validated the spec quality checklist — all items pass.

## Outcome

- ✅ Impact: Feature 001 spec is complete and ready for planning; no open clarification markers block progress.
- 🧪 Tests: None (spec stage — no code yet)
- 📁 Files: specs/001-supplier-directory/spec.md (new), specs/001-supplier-directory/checklists/requirements.md (new), .specify/scripts/powershell/create-new-feature.ps1 (bugfix to Join-Path call)
- 🔁 Next prompts: `/sp.plan` to design the technical approach (Next.js + Firestore + Firebase Auth), or `/sp.clarify` if the user wants to challenge any documented assumption first.
- 🧠 Reflection: The create-new-feature.ps1 script's prompts-directory step used a pwsh-7-only Join-Path overload; fixed by nesting Join-Path calls for Windows PowerShell 5.1 compatibility.

## Evaluation notes (flywheel)

- Failure modes observed: create-new-feature.ps1 threw "A positional parameter cannot be found that accepts argument 'prompts'" on Windows PowerShell 5.1 due to `Join-Path $repoRoot 'history' 'prompts' $branchName` (3-arg form is PS7+ only).
- Graders run and results (PASS/FAIL): Spec quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): N/A
- Next experiment (smallest change to try): Verify setup-plan.ps1 and check-prerequisites.ps1 don't have the same multi-arg Join-Path pattern before running /sp.plan (already checked — none found).
