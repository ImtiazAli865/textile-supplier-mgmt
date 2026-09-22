# Contracts: Customer Ledger Server Actions, Reads, and Routes

**Feature**: `009-customer-ledger` | **Date**: 2026-09-23

No public REST/GraphQL API — Server Actions for mutations, Server Components (via direct service
calls) for reads, matching 001-008. This feature additionally introduces this project's first two
Route Handlers, for raw CSV file downloads (research.md), which follow the same auth and
validation rules as every Server Action below.

All actions/handlers:
- Require an authenticated session (valid Supabase Auth session, via `requireCurrentUser()`);
  throw `UnauthenticatedError` (or, for the Route Handlers, redirect/401) otherwise (FR-013).
- Re-validate input server-side with a shared Zod schema regardless of client-side validation.

## `recordCustomerPayment(input: CustomerPaymentInput): Promise<{ id: string }>`

- **Input**: `customerId`, `paymentDate`, `amount` (> 0), `chequeNumber`, `bankName`,
  `referenceType?` (`'customer_po' | 'performa_invoice'`), `referenceId?` — `referenceType` and
  `referenceId` are both present or both absent.
- **Behavior**: Calls `record_customer_payment` (data-model.md) — validates the customer exists
  and, if a reference is given, that it belongs to the same customer, then inserts the payment
  and its ledger debit atomically.
- **Output**: New row ID.
- **Errors**: `ValidationError`; `CustomerNotFoundError`; `ReferenceNotFoundError`;
  `ReferenceWrongCustomerError` ("That invoice/PO does not belong to this customer." — FR-006).

## `updateCustomerPaymentStatus(input: { id: string; newStatus: 'cleared' | 'bounced' }): Promise<void>`

- **Behavior**: Calls `update_customer_payment_status` (data-model.md) — rejects unless the
  payment is currently `received`; on `bounced`, also posts the reversing ledger credit, dated to
  today (FR-007).
- **Output**: None.
- **Errors**: `ValidationError`; `PaymentNotFoundError`; `PaymentStatusFinalError` ("This payment
  is already Cleared/Bounced." — FR-007); `InvalidStatusError` — a defense-in-depth error from
  `update_customer_payment_status`'s own `p_new_status in ('cleared', 'bounced')` guard
  (data-model.md); unreachable through this Server Action since `updateCustomerPaymentStatusInputSchema`
  already restricts `newStatus` to the same two values, but present so a direct RPC misuse fails
  loudly rather than silently (resolved from `/sp.analyze` finding U1).

## `getCustomerLedger(customerId: string, filters?: { from?: string; to?: string }): Promise<CustomerLedgerView | null>`

- **Behavior**: Fetches the customer, then every one of their `ledger_entries` rows (unfiltered,
  for the running-balance computation), resolves each row's PO Number/Debit/Credit/running
  balance (data-model.md), then narrows the *returned* rows to the requested date range if any —
  the balance carried into a filtered view still reflects everything before it (FR-010).
- **Output**: `{ customer: { id, displayName, legalName, paymentTermsMinDays,
  paymentTermsMaxDays }, currentBalance: number, rows: { id, entryDate, type: 'debit' | 'credit',
  amount, runningBalance, description, poNumbers: string[], sourceType, sourceId, paymentStatus?:
  'received' | 'cleared' | 'bounced', createdAt?: string, createdBy?: string, statusChangedAt?:
  string, statusChangedBy?: string }[] }`, or `null` if the customer doesn't exist. `paymentStatus`,
  `createdAt`, and `createdBy` are present only on rows where `sourceType === 'payment'` (resolved
  from the same batched `customer_payments` join used for cheque number/bank); `statusChangedAt`/
  `statusChangedBy` are additionally present once that payment's status has changed at least once.
  `paymentStatus` drives whether the ledger table renders Mark Cleared/Bounced actions on that row
  (User Story 3); `createdAt`/`createdBy`/`statusChangedAt`/`statusChangedBy` satisfy FR-014's
  "record and display" requirement (resolved from `/sp.analyze` finding G1 — these four fields were
  previously stored but never returned). All absent on every other `sourceType`. Not a Server
  Action.

## `getCustomerAgeing(customerId: string): Promise<CustomerAgeingView>`

- **Behavior**: Runs the FIFO allocation (research.md, data-model.md) over the same customer's
  ledger entries, classified against that customer's `paymentTermsMaxDays` **only**. Purely
  informational — FR-009. `paymentTermsMinDays` plays no role here; it is rendered by the caller
  (already available from `getCustomerLedger`'s `customer` object) as a separate context label
  next to each open entry, not consumed by this function (resolved from `/sp.analyze` finding A1).
- **Output**: `{ openEntries: { entryDate: string; remainingAmount: number; withinRange: boolean
  }[], overdueAmount: number }`. Not a Server Action.

## `listCustomerLedgerSummaries(): Promise<CustomerLedgerSummary[]>`

- **Behavior**: For every customer (all statuses, matching how 005's own list includes
  inactive-but-viewable customers), computes `balance` and `overdueAmount` (FR-011).
- **Output**: `{ id, displayName, balance, overdueAmount }[]`, sorted by display name. Not a
  Server Action.

## `getCustomerLedgerForPrint(customerId: string, filters?: { from?: string; to?: string }): Promise<CustomerLedgerPrintView | null>`

- **Behavior**: Same underlying fetch as `getCustomerLedger`, shaped for the print route (ADR-0006
  pattern) — no signature/stamp images (this is a report, not a business document issued to the
  customer), just the customer's name and the filtered row table. Used only by
  `app/customers/[customerId]/ledger/print/page.tsx`.
- **Output**: `{ customerDisplayName, customerLegalName, generatedAt, fromDate?, toDate?, rows:
  (same shape as `getCustomerLedger`'s `rows`), currentBalance }`. Not a Server Action.

## `getCustomerLedgerSummaryForPrint(): Promise<CustomerLedgerSummaryPrintView>`

- **Behavior**: Same underlying data as `listCustomerLedgerSummaries`, shaped for
  `app/customer-ledger/print/page.tsx` (ADR-0006 pattern). Not a Server Action.
- **Output**: `{ generatedAt, rows: CustomerLedgerSummary[] }`.

## `GET /api/customer-ledger/[customerId]?from=&to=` (new Route Handler)

- **Behavior**: Requires an authenticated session (same as every Server Action); calls
  `getCustomerLedger` with the given `customerId` and optional `from`/`to` query params; renders
  the same rows as `text/csv` (`lib/customer-ledger/csv.ts`) with columns Date, Description, PO
  Number, Debit, Credit, Balance — matching the on-screen table exactly (FR-012, SC-007).
- **Output**: `text/csv` response, `Content-Disposition: attachment;
  filename="<sanitized-customer-display-name>-ledger.csv"` — the display name is sanitized (any
  character outside `[A-Za-z0-9-_ ]` stripped/replaced) before interpolation into the header, since
  `customers.display_name` (005) has no format restriction (resolved from `/sp.analyze` finding U2).
  404 if the customer doesn't exist.

## `GET /api/customer-ledger` (new Route Handler)

- **Behavior**: Same auth/shape as above, calling `listCustomerLedgerSummaries` and rendering
  columns Customer, Current Balance, Overdue Amount (FR-012).
- **Output**: `text/csv` response, `Content-Disposition: attachment;
  filename="customer-ledger-summary.csv"`.

## Reused, unchanged

- `getCustomerLedgerBalance(customerId)` (`lib/customers/ledger.ts`, 005) — still used as-is by
  the existing customer detail page's "Running ledger balance" display; this feature's own
  `getCustomerLedger` computes its own per-row running balance from the same underlying rows
  rather than replacing this function.
- `getCustomer(id)` (`lib/customers/service.ts`, 005) — supplies `paymentTermsMinDays`/
  `paymentTermsMaxDays` and display/legal name, reused by `getCustomerLedger`.
- `listActiveCustomersForSelect()` / `listCustomers()` (`lib/customers/service.ts`, 005) —
  `listCustomerLedgerSummaries` iterates the same customer set `listCustomers()` already exposes.
