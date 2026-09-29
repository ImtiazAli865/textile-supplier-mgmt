# Implementation Plan: Labour / Commission Ledger (Contractor Khata)

**Branch**: `011-labour-commission-ledger` | **Date**: 2026-09-29 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/011-labour-commission-ledger/spec.md`

## Summary

Each contractor gets a **khata**: a record of what the business owes them, kept separately from
the customer ledger.
- **Earnings post themselves.** Completing a production batch (010) adds a credit for the batch's
  frozen labour cost, dated on its completion date, in the same transaction.
- **Cash payments** add a debit. One payment can be linked to several completed batches, with an
  amount against each, and a batch can be paid across several payments. Any part of a payment not
  linked to a batch counts as an advance.
- **Other entries**: payment reversals (with a reason), a one-time opening balance, and manual
  adjustments.
- **Settlement.** Staff settle a period up to a chosen date. This freezes the period's opening,
  earned, paid, adjustments and closing figures, and locks the contractor's ledger up to that
  date, including 010's batch completion. The settlement can be printed as a statement. Only the
  most recent settlement can be reopened.

The architecture was agreed before the spec and recorded in
[ADR-0010](../../history/adr/0010-contractor-payment-allocation-and-settlement-lock.md).
Implementation decisions are in [research.md](./research.md), the schema, lock order and function
logic in [data-model.md](./data-model.md), and the action and read signatures in
[contracts/server-actions.md](./contracts/server-actions.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001–010)
**Primary Dependencies**: Next.js 16.3.4 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS. All are already
installed; there are no new dependencies. Next.js APIs not already used in this codebase must be
checked against `node_modules/next/dist/docs/` before use (CLAUDE.md).
**Storage**: Supabase Postgres.
- New tables: `contractor_ledger_entries`, `contractor_payments`,
  `contractor_payment_allocations`, `contractor_settlements`.
- New functions: `contractor_settled_until`, `record_contractor_payment`,
  `reverse_contractor_payment`, `record_contractor_opening_balance`,
  `record_contractor_adjustment`, `settle_contractor_period`, `reopen_contractor_settlement`.
- New triggers (five): four that block deletes and unwanted updates
  (`trg_contractor_ledger_entries_immutable`, `trg_contractor_payment_allocations_immutable`,
  `trg_contractor_payments_guard`, `trg_contractor_settlements_guard`), and one over-allocation
  guard on insert/update (`trg_contractor_payment_allocations_guard`).
- Redefined, same signature: `complete_production_batch` (0010).

No Storage buckets.
**Testing**: Manual [quickstart.md](./quickstart.md), plus a scratchpad concurrency script.
Vitest is still not wired in, the same as 001–010.
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app. Adds one new module (`contractor-ledger`) and small
extensions to `contractors` and `production-batches`.
**Performance Goals**: Trivial at this scale (a handful of contractors, a few hundred batches and
payments a year). Balances and running totals are computed in TypeScript over fetched rows, as in
009.
**Constraints**:
- Every write is one atomic Postgres function (ADR-0002).
- The contractor row is locked first and everything that decides an outcome is read after it
  (data-model.md, "Locking rules"). Batches are locked in ascending id order.
- Ledger entries and allocations are insert-only. Payments can only move from active to reversed,
  and settlements can only be reopened. All of this is enforced by triggers.
- The business date comes from `lib/dates.ts`, never `current_date` (ADR-0009).
- The service-role key is used server-side only.

**Scale/Scope**: Single internal business, no multi-tenancy.

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template, so there are no ratified
principles to gate against, the same as 001–010. This plan follows CLAUDE.md's default
guardrails: smallest viable diff, no invented contracts, and increments that can be tested per user
story. **PASS.**

**Decisions already agreed with the user, restated for completeness:**
- **ADR-0010**: a separate payables ledger posted at the source event; a payment↔batch join table
  with amounts; settlements that freeze figures and lock dates, including batch completion; the
  lock order; the over-allocation trigger counting active payments only.
- **Spec clarifications**: cash only; warn and allow on deactivation; no rate table; sub-contract
  margin out of scope; an opening balance is refused once a current settlement exists (FR-020).
- **Settlement takes the contractor lock** before computing its figures (confirmed 2026-09-29).

**Decided during planning, recorded in research.md, not new ADRs:**
1. **`p_today` passed in from `lib/dates.ts`**. Applies ADR-0009; 010 never needed "today" inside
   SQL.
2. **Immutability triggers** on the four new tables. This is a small step past 005/009's "no update
   path" convention, justified because a signed settlement depends on it. It also affects QA
   cleanup (see Risks).
3. **Closed `source_type` set plus partial unique indexes**: one earning per batch, one opening
   balance per contractor.
4. **Settlement figure definitions**: the go-live opening entry counts in "opening"; "paid" is net
   of reversals; closing is enforced by a table check.

**No new ADR is warranted.** Each of these is a narrow implementation choice inside ADR-0010's
decision.

*Re-checked after Phase 1 design: PASS. One touch to shipped behaviour, `complete_production_batch`,
is the change ADR-0010 already agreed; its signature is unchanged, so no 010 TypeScript call site
changes.*

## Project Structure

### Documentation (this feature)

```text
specs/011-labour-commission-ledger/
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
│   ├── contractors/
│   │   ├── page.tsx                      # EXTENDED — Balance column; name links to the khata
│   │   └── [contractorId]/
│   │       ├── page.tsx                  # NEW — khata: summary, actions, ledger (date filter +
│   │       │                             # brought forward), batches with paid status,
│   │       │                             # payments (reverse), settlements (reopen, print)
│   │       ├── loading.tsx               # NEW
│   │       ├── payments/new/page.tsx     # NEW — record payment (tick batches, remainder)
│   │       ├── adjustments/new/page.tsx  # NEW
│   │       ├── opening-balance/page.tsx  # NEW
│   │       └── settlements/new/page.tsx  # NEW — period preview + non-zero confirm
│   └── production-batches/[batchId]/page.tsx  # EXTENDED — "Labour payment" section (completed)
├── contractors/[contractorId]/settlements/[settlementId]/print/page.tsx
│                                         # NEW — ADR-0006 print route, own auth check
└── actions/
    ├── contractor-ledger.ts              # NEW — the six actions (contracts/)
    └── production-batches.ts             # EXTENDED — completion also revalidates contractor pages

lib/
├── contractor-ledger/
│   ├── schema.ts                         # NEW — Zod input schemas + types
│   └── service.ts                        # NEW — RPC wrappers, toFriendlyContractorLedgerError,
│                                         # reads (contracts/ table)
└── production-batches/service.ts         # EXTENDED — PERIOD_SETTLED, BATCH_CONTRACTOR_CHANGED

components/
├── contractors/contractor-list.tsx       # EXTENDED — Balance column; balance in deactivate confirm
└── contractor-ledger/
    ├── khata-table.tsx                   # NEW
    ├── batch-payment-status-table.tsx    # NEW — also reused on the batch detail page
    ├── payment-form.tsx                  # NEW — batch checklist, pre-fill, live totals/unlinked
    ├── payment-list.tsx                  # NEW — with reverse-with-reason control
    ├── opening-balance-form.tsx          # NEW
    ├── adjustment-form.tsx               # NEW
    ├── settle-form.tsx                   # NEW — preview + non-zero confirm step
    ├── settlement-list.tsx               # NEW — reopen-with-reason control, print link
    └── settlement-print-view.tsx         # NEW

supabase/migrations/
└── 0011_labour_commission_ledger.sql     # NEW — see data-model.md (0001–0010 unchanged)
```

**Structure Decision**: The same single Next.js app shape as 001–010. The khata lives under the
existing `/contractors/[contractorId]`, so there's no new nav entry. The print route sits outside
`(dashboard)`, per ADR-0006. The existing contractor create/edit pages are unchanged.

## Complexity Tracking

No constitution gates are defined, so this lists only touches to already-shipped features and why
each is needed:

| Change to shipped code | Why Needed | Simpler Alternative Rejected Because |
|---|---|---|
| `complete_production_batch` redefined (0011): contractor lock first, settlement check, earning insert | FR-001 (earning in the same step), FR-003 (settlement lock), ADR-0010 lock order | A trigger on `production_batches` can't take the contractor lock first and hides a money write (research.md) |
| `lib/production-batches/service.ts`: two new error mappings | Completion can now be refused for a settled period | A raw Postgres message is not acceptable UI |
| `/contractors` list and `contractor-list.tsx`: Balance column; balance in the deactivate confirm | FR-007, FR-031 | A separate balances page duplicates the list |
| Batch detail page: a read-only "Labour payment" section | FR-006 asks for status on the batch's own detail view | Showing it on the khata alone fails FR-006 |

## Risks

- **QA data on the only database.** The immutability triggers stop the usual "delete QA rows
  afterwards" cleanup used in 006–010. **Resolved (user, 2026-09-29):** QA and race tests run on
  live Supabase. Cleanup is a scoped SQL script that disables only the four named triggers inside
  one transaction, dry-run first (research.md; quickstart §9).
- **Redefining 010's function**: `complete_production_batch` in 0011 must be a faithful copy plus
  the three additions. Mitigation: diff the function body against 0010 during review; quickstart
  §1 and §5 re-exercise completion.
- **Trigger logic is code, not a declarative check** (ADR-0010 Negative). Mitigation: quickstart §4
  (re-link after reversal) and §7 (backstop and concurrency).
