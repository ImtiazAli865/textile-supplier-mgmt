---
id: 0016
title: Product catalog implementation plan
stage: plan
date: 2026-09-20
surface: agent
model: claude-sonnet-5
feature: 003-product-catalog
branch: 003-product-catalog
user: ImtiazAli865
command: /sp.plan
labels: ["plan", "product-catalog"]
links:
  spec: specs/003-product-catalog/spec.md
  ticket: null
  adr: null
  pr: null
files:
 - specs/003-product-catalog/plan.md
 - specs/003-product-catalog/research.md
 - specs/003-product-catalog/data-model.md
 - specs/003-product-catalog/contracts/server-actions.md
 - specs/003-product-catalog/quickstart.md
 - CLAUDE.md
tests:
---

## Prompt

Run /sp.plan for 003-product-catalog

## Response snapshot

Ran `.specify/scripts/powershell/setup-plan.ps1 -Json` to scaffold `plan.md`, then read the
current app structure (`app/(dashboard)/{suppliers,purchases}`, `lib/{supabase,suppliers,
purchases}`, `components/{suppliers,purchases}`, `package.json` deps, `supabase/migrations/
0001_init.sql`) and 002's plan/research/data-model/contracts/quickstart to keep 003 consistent
with established conventions, plus the still-unfilled `.specify/memory/constitution.md`
template (no ratified gates to check against, same as 001/002).

Produced all Phase 0/1 artifacts:
- **plan.md**: Technical Context (unchanged stack: TypeScript/Next.js 16/Supabase, no new
  dependencies), Constitution Check (no gates defined; the customer-item-code deferral decided
  during spec drafting is a scope boundary, not an ADR-worthy structural decision — explicitly
  reasoned through the three-part test and found not to qualify), Project Structure (new
  `app/(dashboard)/products/` route group, `app/actions/products.ts`, `lib/products/{schema,
  service}.ts`, `components/products/*`, `supabase/migrations/0002_products.sql` — no new
  services/layers, zero foreign keys in or out of the new table).
- **research.md**: five decisions — single `products` table with nullable type-conditional
  columns + a type-conditional CHECK constraint (not per-type tables); type immutability
  enforced in the service layer, not a DB trigger (single writer via service-role key); weighted-
  average purchase cost added now as a nullable, unwritten-by-this-feature column (so the future
  purchasing feature only needs an UPDATE, not a backfill migration); yield ratio as a single
  average figure, not a min–max range; internal code as a plain non-unique text column.
- **data-model.md**: `products` table schema (all FR-linked columns), the
  `products_type_fields_check` constraint enforcing manufactured-required/traded-forbidden
  fields, three indexes (status+type+name composite, two trigram indexes for name/code search),
  status lifecycle (freely reversible active↔inactive, unlike 002's one-way consumption lock),
  and the RLS/service-role trust boundary matching 001/002.
- **contracts/server-actions.md**: `createProduct`, `updateProduct` (deliberately excludes
  `type` from its input shape entirely, not just as a no-op field), `setProductStatus`,
  `listProducts`, `getProduct` — each with input/behavior/output/errors, explicitly noting
  `currentPurchaseCost` has no write path in any action.
- **quickstart.md**: manual verification flow mapped to the spec's three acceptance-scenario
  groups (create/view both types, search/filter, edit/deactivate/reactivate + type-immutability
  check).

Ran `update-agent-context.ps1 -AgentType claude`, which appended this feature's tech stack to
`CLAUDE.md`'s agent-context section (Next.js/Supabase/products table) — a deliberate,
script-driven update per the plan workflow, not a manual edit.

No `research.md` unknowns were left unresolved (no `[NEEDS CLARIFICATION]` markers existed in
Technical Context to begin with, since the stack is unchanged from 001/002). No ADR was
proposed — the one scope decision from the spec stage was reasoned through the constitution's
three-part test in plan.md and found not to meet the bar (not cross-cutting, contained to one
table's nullable-column design).

## Outcome

- ✅ Impact: `003-product-catalog` planning phase (Phase 0 + Phase 1) complete — plan.md,
  research.md, data-model.md, contracts/server-actions.md, quickstart.md all written and
  internally consistent; Constitution Check passed both pre- and post-design with no violations
  to justify.
- 🧪 Tests: none (planning-stage artifacts only, no code or migrations written yet).
- 📁 Files: `specs/003-product-catalog/{plan.md, research.md, data-model.md, quickstart.md,
  contracts/server-actions.md}` (all new); `CLAUDE.md` (agent-context section appended by the
  update script).
- 🔁 Next prompts: `/sp.tasks` for 003-product-catalog to generate the dependency-ordered task
  list (including writing `supabase/migrations/0002_products.sql`, which was deliberately not
  created during planning — only documented in data-model.md).
- 🧠 Reflection: Kept the schema design decisions (single table vs. per-type tables; where the
  weighted-average cost column lives) fully reasoned in research.md rather than asserted, since
  they set precedent for how future type-conditional or not-yet-populated columns should be
  modeled in later features (customers' Performa-Invoice flag, contractors' rate fields, etc.).

## Evaluation notes (flywheel)

- Failure modes observed: none.
- Graders run and results (PASS/FAIL): Constitution Check gate — PASS (no gates defined, no
  violations introduced), re-checked post-Phase-1 — PASS.
- Prompt variant (if applicable): none.
- Next experiment (smallest change to try): none.
