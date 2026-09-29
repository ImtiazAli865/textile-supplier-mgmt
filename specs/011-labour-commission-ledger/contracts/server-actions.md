# Contracts: Labour / Commission Ledger Server Actions and Reads

**Feature**: `011-labour-commission-ledger` | **Date**: 2026-09-29

There is no public REST/GraphQL API. Mutations are Server Actions returning `ActionResult`
(`lib/actions/result.ts`); reads are direct service calls from Server Components. This matches
001–010.

All actions:
- Require an authenticated session via `requireCurrentUser()` (FR-035).
- Re-validate input with the shared Zod schema in `lib/contractor-ledger/schema.ts`. Amounts are
  rounded to 2 dp (FR-033); every date is `YYYY-MM-DD` and "not after today" uses
  `isNotAfterTodayInPakistan()` (FR-032).
- Pass `p_today = todayInPakistan()` and `p_user_id` to the RPC.
- Map raised `'CODE…'` messages to friendly errors in `toFriendlyContractorLedgerError`
  (the same pattern as `toFriendlyBatchError`).
- `revalidatePath` for `/contractors`, `/contractors/{id}`, and any batch detail page affected.

## Actions (`app/actions/contractor-ledger.ts`, new)

### `recordContractorPayment(input: ContractorPaymentInput): Promise<ActionResult<{ id: string }>>`

- **Input**: `contractorId`, `paymentDate` (not after today), `amount` (> 0), `note?`,
  `allocations: { batchId, amount (> 0) }[]` (may be empty; no duplicate `batchId`; Σ ≤ `amount`,
  also checked client-side).
- **Behavior**: `record_contractor_payment` (data-model.md). Revalidates the contractor page and
  each linked batch's page.
- **Errors**:
  - `PERIOD_SETTLED:<d>` → "{Contractor} is settled up to {d}. Use a later date."
  - `BATCH_NOT_COMPLETED:<no>` / `BATCH_OTHER_CONTRACTOR:<no>` / `BATCH_NOT_FOUND` → "Batch {no}
    can't be paid on this payment."
  - `BATCH_COMPLETED_AFTER_PAYMENT:<no>` → "Batch {no} was completed after the payment date."
  - `ALLOCATION_EXCEEDS_UNPAID:<no>:<unpaid>` → "Only Rs {unpaid} is unpaid on batch {no}."
    (this is also the loser of a simultaneous payment, US2-6)
  - `ALLOCATIONS_EXCEED_PAYMENT` → "The amounts against batches are more than the payment."
  - `OVER_ALLOCATED:<no>` (trigger backstop; should not be reachable through this action) →
    same wording as `ALLOCATION_EXCEEDS_UNPAID`.
  - `DUPLICATE_BATCH`, `INVALID_AMOUNT`, `INVALID_DATE`, `INVALID_ALLOCATION`,
    `CONTRACTOR_NOT_FOUND`.

### `reverseContractorPayment(input: { paymentId, reason }): Promise<ActionResult>`

- **Behavior**: `reverse_contractor_payment`. Revalidates the contractor page and the payment's
  batches' pages.
- **Errors**: `REASON_REQUIRED`; `PAYMENT_ALREADY_REVERSED` → "This payment has already been
  reversed."; `PAYMENT_IN_SETTLED_PERIOD:<d>` → "This payment is inside a period settled up to
  {d}. Reopen that settlement first."; `PERIOD_SETTLED:<d>` → "{Contractor} is settled up to
  today ({d}). Reverse it tomorrow or reopen the settlement."; `NOT_FOUND`.

### `recordContractorOpeningBalance(input: { contractorId, direction: 'owed' | 'advance', amount, entryDate }): Promise<ActionResult>`

- **Behavior**: `record_contractor_opening_balance`.
- **Errors**: `OPENING_BALANCE_AFTER_SETTLEMENT` → "{Contractor} already has a settlement. Post an
  adjustment instead (e.g. reason 'Opening balance missed at go-live')." (FR-020);
  `OPENING_BALANCE_EXISTS` → "An opening balance is already recorded. Use an adjustment to
  correct it."; `OPENING_BALANCE_AFTER_FIRST_ENTRY:<d>` → "The opening balance must be dated on or
  before {d}, the first entry in this khata."

### `recordContractorAdjustment(input: { contractorId, type: 'credit' | 'debit', amount, entryDate, reason }): Promise<ActionResult>`

- **UI wording**: `credit` = "Increase amount owed", `debit` = "Decrease amount owed (deduction)".
- **Errors**: `PERIOD_SETTLED:<d>`; `REASON_REQUIRED`; `INVALID_AMOUNT`; `INVALID_DATE`.

### `settleContractorPeriod(input: { contractorId, periodEnd, note?, confirmNonZero: boolean }): Promise<ActionResult<{ id: string }>>`

- **Behavior**: `settle_contractor_period`. The form first submits with `confirmNonZero: false`;
  on `SettlementBalanceNotZeroError` it shows the closing balance and a confirm button that
  resubmits with `true` (the 010 returned-weight pattern).
- **Errors**: `NOTHING_TO_SETTLE` → "There is nothing to settle for this contractor.";
  `SETTLE_DATE_FUTURE` → "The settlement date cannot be after today.";
  `SETTLE_BEFORE_PERIOD_START:<d>` → "The period starts on {d}; choose that date or later.";
  `SETTLEMENT_BALANCE_NOT_ZERO:<amount>` → `SettlementBalanceNotZeroError` carrying the amount.

### `reopenContractorSettlement(input: { settlementId, reason }): Promise<ActionResult>`

- **Errors**: `REASON_REQUIRED`; `SETTLEMENT_ALREADY_REOPENED`; `NOT_LATEST_SETTLEMENT` → "Only the
  most recent settlement can be reopened."; `NOT_FOUND`.

## Changed actions

### `completeProductionBatch` (`app/actions/production-batches.ts`, extended)

- **Behavior**: unchanged call; additionally revalidates `/contractors` and
  `/contractors/{contractorId}`.
- **New errors** (added to `toFriendlyBatchError`):
  - `PERIOD_SETTLED:<d>` → `ContractorPeriodSettledError`: "{Contractor} is settled up to {d}.
    Use a completion date after {d}, or reopen that settlement." (FR-003, US5-4)
  - `BATCH_CONTRACTOR_CHANGED` → "This batch's contractor was just changed. Reload and try again."

### `setContractorStatus` (`app/actions/contractors.ts`)

- **Behavior**: unchanged. The balance warning (FR-031) is only in the confirmation text in
  `components/contractors/contractor-list.tsx`.

## Reads (`lib/contractor-ledger/service.ts`, new; all `server-only`)

| Function | Returns | Used by |
|---|---|---|
| `listContractorBalances()` | `Map<contractorId, number>` from one query over all entries | `/contractors` list (FR-007, FR-031) |
| `getContractorKhata(contractorId, { from?, to? })` | contractor, current balance, brought-forward, rows (date, description, source, credit, debit, running balance) | khata page (FR-004/005/008) |
| `listContractorBatchesWithPaymentStatus(contractorId)` | completed batches: number, completion date, labour cost, paid, unpaid, status | khata page (FR-006) |
| `listPayableBatches(contractorId)` | completed batches with unpaid > 0, incl. completion date (the form hides those after the chosen payment date) | payment form (FR-011) |
| `listContractorPayments(contractorId)` | payments with allocations (batch numbers, amounts), unlinked amount, status, reversal details | khata page (FR-013, US4) |
| `getBatchPaymentStatus(batchId)` | labour cost, paid, unpaid, status, and the payments linked | batch detail page (FR-006) |
| `listContractorSettlements(contractorId)` | all settlements, current and reopened, newest first | khata page (FR-029) |
| `getSettlementPreview(contractorId, periodEnd)` | period start, the five figures, and whether settling is possible | settle form |
| `getSettlementStatement(settlementId)` | settlement, contractor, period rows with running balance, recomputed totals and a `matchesFrozen` flag | print route (FR-030) |
