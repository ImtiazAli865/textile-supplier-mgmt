# Implementation Plan: Production Batches

**Branch**: `010-production-batches` | **Date**: 2026-09-24 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/010-production-batches/spec.md`

## Summary

Staff record each hand-over of fabric to an external contractor as a **production batch**:
- one weight-mode fabric lot (002), one manufactured product (003), one contractor;
- a labour rate pre-filled from the product;
- an issue date.

Issuing deducts the weight from the lot straight away, which engages 002's existing "used lot" lock.
When the packets come back, staff **complete** the batch with the packet count (authoritative) and
the weighed packet weight (a cross-check only). Completion then, in one transaction:
- adds the packets to the product's stock through `inventory_movements`;
- freezes raw material cost (always on the weight **issued**), labour cost, total cost and average
  cost per packet;
- records wastage (kg / Rs / %) and yield variance.

Issued batches can be edited or voided; completed and voided batches are read-only. The feature
also adds a minimal `contractors` table (extended by 011) and a one-time **opening stock** entry for
manufactured products, with one optional correction and an optional cost per packet. Together these
resolve 007's documented limitation that Challans for manufactured products couldn't be accepted.

The architecture was agreed before the spec and recorded in
[ADR-0008](../../history/adr/0008-production-batch-lifecycle-and-stock-split.md). Implementation
decisions are in [research.md](./research.md), the schema and function logic in
[data-model.md](./data-model.md), and the action and read signatures in
[contracts/server-actions.md](./contracts/server-actions.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001–009)
**Primary Dependencies**: Next.js 16.3.4 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS. All are already
installed; there are no new dependencies. Next.js APIs not already used in this codebase must be
checked against `node_modules/next/dist/docs/` before use (CLAUDE.md).
**Storage**: Supabase Postgres.
- New tables: `contractors`, `production_batches`, `manufactured_opening_stock`.
- New sequence: `production_batch_number_seq`.
- New functions: `issue_production_batch`, `update_production_batch`, `void_production_batch`,
  `complete_production_batch`, `record_manufactured_opening_stock`,
  `record_manufactured_opening_stock_correction`.
- Reused unchanged: `inventory_movements` and `recompute_product_quantity_on_hand` (0007).

No Storage buckets.
**Testing**: Manual [quickstart.md](./quickstart.md). Vitest is still not wired into
`package.json`, the same as 001–009.
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app. Adds two new modules (`contractors`, `production-batches`)
and small extensions to `products` and `purchases`.
**Performance Goals**: Trivial at this scale (a handful of contractors, tens to low hundreds of
batches a year). List totals are summed in TypeScript over the already-fetched rows, as with 006's
and 007's totals.
**Constraints**:
- Every batch transition and opening-stock write is a single atomic Postgres function (ADR-0002,
  FR-028).
- Lot rows are locked `FOR UPDATE` so a lot never goes below 0, even under parallel issues (FR-005,
  SC-003).
- `products.quantity_on_hand` is written only through `recompute_product_quantity_on_hand`
  (ADR-0005).
- Completion figures are stored once and never recomputed (FR-020, SC-007).
- Fabric never enters `inventory_movements` (ADR-0008).
- The service-role key is used server-side only.

**Scale/Scope**: Single internal business, no multi-tenancy (spec Assumptions).

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template, so there are no ratified
principles to gate against, the same as 001–009. This plan follows the project's default
guardrails from CLAUDE.md: smallest viable diff, no invented contracts, and increments that can be
tested per user story.

**Decisions already agreed with the user, restated for completeness:**
- **ADR-0008**: fabric is tracked on the lot and packets through `inventory_movements`; the
  Issued → Completed / Voided lifecycle; the labour rate is pre-filled from the product only and
  frozen at completion; a minimal `contractors` table created at 010; one-time manufactured opening
  stock.
- **Spec clarifications (Q1–Q3)**: returned weight above the weight issued gives a soft warning;
  opening stock allows one correction; opening stock carries an optional cost.

**Found during planning and surfaced to the user rather than silently decided:**

1. **A latent race in 002 that becomes real once 010 ships** (research.md). 002's weight-lot edit
   checks "unconsumed" in TypeScript and then resets `remaining_weight_kg`. A batch issued in that
   gap would be silently undone. Fix: condition 002's `UPDATE`/`DELETE` on the lot still being
   unconsumed, within the same statement. That's two lines per function in
   `lib/purchases/service.ts`, with no schema or UI change. It's a required correctness fix, not an
   unrelated refactor.
2. **Deleting a lot after its batch is voided** (research.md). **Resolved 2026-09-24, Option A.**
   The lot becomes editable again but stays undeletable while any batch, voided included,
   references it (FK `RESTRICT`; `23503` maps to `PurchaseLockedError`). The spec's US4-5 and
   FR-012 have been narrowed to match.

**No new ADR is warranted.** Every function follows ADR-0002, the stock path follows ADR-0005, and
the lifecycle, split and contractors table are ADR-0008. The 002 race fix and the lot-delete rule
are narrow correctness decisions inside a single feature, recorded in research.md.

*Re-checked after Phase 1 design (data-model.md, contracts/): no further issues. The two
all-or-nothing check constraints (completion fields on `production_batches`, correction fields on
`manufactured_opening_stock`) enforce FR-013/FR-020/FR-025 at the database level. They're not a new
pattern; this is the same technique as `products_type_fields_check` (0002) and the purchase-mode
check (0003).*

## Project Structure

### Documentation (this feature)

```text
specs/010-production-batches/
├── plan.md               # This file
├── research.md           # Phase 0 output
├── data-model.md         # Phase 1 output
├── quickstart.md         # Phase 1 output
├── contracts/
│   └── server-actions.md # Phase 1 output
├── checklists/
│   └── requirements.md   # From /sp.specify
└── tasks.md              # Phase 2 output (/sp.tasks — NOT created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                    # EXTENDED — add "Production" and "Contractors" nav links
│   ├── products/[productId]/page.tsx # EXTENDED — read-only "Stock history" section
│   │                                  # (listProductStockMovements; batch rows link to the batch)
│   ├── contractors/
│   │   ├── page.tsx                  # NEW — list with status filter + activate/deactivate
│   │   ├── loading.tsx               # NEW
│   │   ├── new/page.tsx              # NEW
│   │   └── [contractorId]/edit/page.tsx # NEW
│   └── production-batches/
│       ├── page.tsx                  # NEW — list: status/contractor/product/date filters, batch
│       │                              # number search, Issued totals (WIP view, FR-021/022);
│       │                              # header link to Opening Stock
│       ├── loading.tsx               # NEW
│       ├── new/page.tsx              # NEW — issue form
│       ├── opening-stock/page.tsx    # NEW — manufactured products' opening status, record and
│       │                              # correct forms (US3)
│       └── [batchId]/
│           ├── page.tsx              # NEW — detail; while Issued: complete form + edit link + void
│           ├── loading.tsx           # NEW
│           └── edit/page.tsx         # NEW — issue form in edit mode (Issued only)
└── actions/
    ├── contractors.ts                # NEW — createContractor/updateContractor/setContractorStatus
    └── production-batches.ts         # NEW — issue/update/void/complete ProductionBatch,
                                       # recordManufacturedOpeningStock(+Correction)

lib/
├── products/service.ts               # EXTENDED — listActiveManufacturedProductsForSelect,
│                                      # listProductStockMovements
├── purchases/service.ts              # EXTENDED — atomic unconsumed-condition on weight-lot
│                                      # update/delete; 23503 → PurchaseLockedError (research.md)
├── contractors/
│   ├── schema.ts                     # NEW — contractorInputSchema + types
│   └── service.ts                    # NEW — CRUD, listActiveContractorsForSelect
└── production-batches/
    ├── schema.ts                     # NEW — batchIssueInputSchema, batchCompleteInputSchema,
    │                                  # openingStockInputSchema, openingStockCorrectionInputSchema,
    │                                  # all TS types ("not future" = today's Pakistan date, research.md)
    └── service.ts                    # NEW — RPC wrappers + toFriendlyBatchError,
                                       # listAvailableLotsForBatch, listProductionBatches,
                                       # getProductionBatch, listManufacturedOpeningStockStatus

components/
├── contractors/
│   ├── contractor-form.tsx           # NEW
│   └── contractor-list.tsx           # NEW
└── production-batches/
    ├── batch-issue-form.tsx          # NEW — lot/product/contractor pickers, rate pre-fill,
    │                                  # live expected-packets suggestion; create + edit modes
    ├── batch-complete-form.tsx       # NEW — packets / returned weight / date; confirm step when
    │                                  # returned > issued; live wastage + variance preview
    ├── batch-status-controls.tsx     # NEW — void (with confirm) and edit link, Issued only
    ├── batch-list.tsx                # NEW — table + Issued totals row
    ├── batch-cost-summary.tsx        # NEW — frozen cost/wastage/variance breakdown
    └── opening-stock-table.tsx       # NEW — per-product status + record/correct inline forms

supabase/migrations/
└── 0010_production_batches.sql       # NEW — see data-model.md (0001–0009 unchanged)
```

**Structure Decision**: The same single Next.js app shape as 001–009. Two new modules follow the
`lib/<module>/{schema,service}.ts` + `app/actions/<module>.ts` + `components/<module>/*` +
`app/(dashboard)/<module>/**` convention. Opening stock is nested under `production-batches/`
rather than given its own nav entry, because it's a one-time go-live screen. Existing features get
only three small extensions (a products read helper and stock-history section, the 002 race fix, and
nav links).

## Complexity Tracking

No constitution gates are defined, so this lists only touches to already-shipped features and why
each is needed:

| Change to shipped code | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `lib/purchases/service.ts`: weight-lot update/delete become conditional on "still unconsumed" within the same statement | 010 adds the first concurrent writer of `remaining_weight_kg`. Without this, a batch issued between 002's check and its write is silently undone (lot reset to full), breaking SC-003 | Leaving 002 as is means accepting silent stock corruption. Moving 002 into Postgres functions is a larger diff for the same guarantee |
| `products/[productId]/page.tsx`: read-only stock history section | The spec's US3-1, FR-015 and stock-history edge case assume a visible stock history, and none exists yet | Deferring all visibility to 012 would leave US3-1 and FR-015 untestable in this feature |

## Resolved items

- **Lot deletion after a void**: the user chose Option A on 2026-09-24. The lot is editable, and
  undeletable while referenced by any batch. Spec US4-5 and FR-012 are updated.
