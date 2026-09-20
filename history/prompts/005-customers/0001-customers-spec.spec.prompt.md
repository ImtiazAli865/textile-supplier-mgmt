---
id: 0001
title: Customers feature specification
stage: spec
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 005-customers
branch: 005-customers
user: imtiazkind143@gmail.com
command: /sp.specify
labels: ["spec", "customers", "ledger", "business-sensitive"]
links:
  spec: specs/005-customers/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/005-customers/spec.md
 - specs/005-customers/checklists/requirements.md
 - history/prompts/005-customers/0001-customers-spec.spec.prompt.md
tests:
 - none (spec authoring turn; no code changed)
---

## Prompt

Migrations 0003 and 0004 are now applied and verified on the live Supabase project. Manual mode is on, so please create the spec ONLY for 005-customers — no /sp.plan, /sp.tasks, or /sp.implement yet.

This feature is business-sensitive, so pay special attention to:
1. Customers table: at minimum Habbitt (legal entity Universal Retail (PVT) LTD / UNIVERSAL RETAIL (PRIVATE) LIMITED, NTN A029996-8), Chaseup, ChaseValue, Kifayat.
2. Per last session's §14 point 3 resolution: customer-specific item codes and per-customer selling UOM (deferred from 003-product-catalog) belong here now — a many-to-many mapping between customers and products.
3. Trade names must remain fully unconstrained per customer — no rule may restrict which trade_names row a customer's documents use, even though a customer may have a "usual" one (e.g. Habbitt sometimes uses Global Distributors, sometimes IBL Frontier Market). This was explicitly resolved as a non-enforcing default/hint only.
4. Legal name (for tax documents) vs. display name (used day-to-day) — Habbitt is the example of this distinction.

Once the spec is ready, stop and show it to me before writing the plan.

## Response snapshot

Before branching, found the current `004-trade-names-and-document-settings` branch had 34 files
of completed-but-uncommitted work; asked the user how to handle it (AskUserQuestion) rather than
silently carrying it onto a new branch — they chose to commit 004 first. Committed it (34 files),
then ran `create-new-feature.ps1 -Number 5 -ShortName "customers"` to create `005-customers` and
scaffold `spec.md`.

Cross-referenced `specs/PRODUCT-OVERVIEW.md`'s Customers/Trade Names/Module Roadmap/Shared-table
sections and 003-product-catalog's spec/data-model/research (which explicitly deferred
customer-specific item codes and selling UOM to "005-customers or 006," whichever needs it first)
to ground every requirement in already-agreed business decisions rather than invent new ones.
Wrote `specs/005-customers/spec.md`: 3 user stories (P1 create/view including opening-balance
posting at creation — since the master spec requires it postable "at customer-creation time";
P2 customer-product item-code/selling-UOM mapping; P3 edit/deactivate), 20 functional
requirements, 5 Key Entities including the new shared `ledger_entries` table (this feature's
first writer, per the Module Roadmap's "Shared-table decisions"), and an Assumptions section
covering five real scope calls. No `[NEEDS CLARIFICATION]` markers used — instead, per the
user's "business-sensitive, pay special attention" framing, flagged five specific scope
decisions explicitly in the checklist's Notes for the user to confirm or correct before
`/sp.plan`: payment-terms-as-days (not free text), opening-balance write-once/immutable,
mapping requiring only one of {item code, selling unit}, at-least-one-contact-required (not
explicitly stated in the master spec, carried from 001's precedent), and customer-specific
pricing being explicitly excluded from the mapping. Stopped after the spec + checklist, per the
user's explicit instruction — no `/sp.plan` run.

## Outcome

- ✅ Impact: `specs/005-customers/spec.md` and its requirements checklist are ready for the
  user's review; 004's implementation is now committed and isolated on its own branch before 005
  branched off. No `/sp.plan`/`/sp.tasks`/`/sp.implement` run, per instruction.
- 🧪 Tests: none — spec authoring turn only.
- 📁 Files: spec.md, checklists/requirements.md (both new); this PHR. Also: one commit on
  `004-trade-names-and-document-settings` (34 files).
- 🔁 Next prompts: user reviews spec.md and the five flagged scope decisions, then either
  corrects them or says go for `/sp.plan`.
- 🧠 Reflection: the user exited auto mode in the same message stack that framed this feature as
  business-sensitive — treated that as a signal to surface scope calls explicitly in the
  checklist rather than silently deciding and moving on, which is the right calibration for a
  spec the user explicitly asked to review before any further command runs.

## Evaluation notes (flywheel)

- Failure modes observed: none. One process check caught early: uncommitted 004 work would have
  been silently carried onto the new 005 branch if I hadn't asked first.
- Graders run and results (PASS/FAIL): spec-quality checklist — PASS (all items) on first pass.
- Prompt variant (if applicable): n/a
- Next experiment (smallest change to try): n/a
