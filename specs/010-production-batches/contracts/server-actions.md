# Contracts: Production Batches Server Actions

**Feature**: `010-production-batches` | **Date**: 2026-09-24

There is no public REST/GraphQL API. Mutations are Server Actions returning `ActionResult`
(`lib/actions/result.ts`); reads are direct service calls from Server Components. This matches
001–009.

All actions:
- Require an authenticated session via `requireCurrentUser()`.
- Re-validate input server-side with the shared Zod schema from
  `lib/production-batches/schema.ts` or `lib/contractors/schema.ts`.
- Map raised `'CODE: …'` Postgres errors to friendly messages in the service layer
  (`toFriendlyBatchError`, the same pattern as `lib/challans/service.ts`).
- Call `revalidatePath` for every list and detail page they affect.

## Contractors (`app/actions/contractors.ts`)

### `createContractor(input: ContractorInput): Promise<ActionResult<{ id: string }>>`

- **Input**: `name` (required, trimmed, 1–120 chars), `phone?` (trimmed, blank → null).
- **Errors**: `ValidationError`; `DuplicateContractorNameError`, from `23505` on
  `idx_contractors_name_unique`: "A contractor with this name already exists." (FR-001).

### `updateContractor(id: string, input: ContractorInput): Promise<ActionResult>`

- **Errors**: as above, plus `NotFoundError`. A name change shows everywhere at once (US6-4), since
  batches only store `contractor_id`.

### `setContractorStatus(id: string, status: 'active' | 'inactive'): Promise<ActionResult>`

- **Behavior**: Plain update. Existing Issued batches are unaffected (FR-002, US6-3).

## Production batches (`app/actions/production-batches.ts`)

### `issueProductionBatch(input: BatchIssueInput): Promise<ActionResult<{ id: string }>>`

- **Input**: `lotId`, `productId`, `contractorId`, `weightIssuedKg` (> 0, rounded to 2 dp),
  `labourRatePerPacket` (> 0, rounded to 2 dp), `issueDate` (not future).
- **Behavior**: Calls `issue_production_batch` (data-model.md).
- **Errors**:
  - `LotInsufficientWeightError`: "Only {remaining} kg remains on this lot." (FR-005, US1-4)
  - `IssueBeforePurchaseError`: "Issue date cannot be before the lot's purchase date ({date})."
  - `ProductNotEligibleError`: "Select an active manufactured product."
  - `ContractorNotActiveError`: "Select an active contractor."
  - `LotNotFoundError` / `LotNotWeightModeError`

### `updateProductionBatch(id: string, input: BatchIssueInput): Promise<ActionResult>`

- **Behavior**: Calls `update_production_batch`.
- **Errors**: as for issue, plus `NotFoundError` and `BatchNotEditableError` ("This batch has
  already been {completed|voided} and is read-only." — FR-013). The eligibility errors fire only for
  a changed product or contractor.

### `voidProductionBatch(id: string): Promise<ActionResult>`

- **Behavior**: Calls `void_production_batch`. The UI asks for confirmation first (FR-012).
- **Errors**: `NotFoundError`; `BatchNotVoidableError`.

### `completeProductionBatch(id: string, input: BatchCompleteInput): Promise<ActionResult>`

- **Input**:
  - `packetsProduced`: integer ≥ 1
  - `returnedWeightKg`: > 0, rounded to 2 dp
  - `completionDate`: not future
  - `confirmReturnedWeightExceeded`: boolean, default false
- **Behavior**: Calls `complete_production_batch`. The form shows a confirm step when
  `returnedWeightKg > weightIssuedKg`, and only then sends `confirmReturnedWeightExceeded: true`
  (FR-019).
- **Errors**:
  - `NotFoundError`
  - `BatchNotIssuedError`
  - `CompletionBeforeIssueError`
  - `ReturnedWeightUnconfirmedError`: "Returned weight exceeds the weight issued. Confirm to
    continue." The UI re-shows the confirm step.
- **Revalidates**: `/production-batches`, `/production-batches/{id}`, `/products/{productId}`
  (stock history).

## Opening stock (`app/actions/production-batches.ts`)

### `recordManufacturedOpeningStock(input: OpeningStockInput): Promise<ActionResult>`

- **Input**: `productId`, `quantity` (integer ≥ 1), `entryDate` (not future), `costPerPacket?`
  (> 0, 2 dp).
- **Behavior**: Calls `record_manufactured_opening_stock`.
- **Errors**: `OpeningStockExistsError` ("Opening stock has already been recorded for this
  product."); `ProductNotManufacturedError`; `NotFoundError`.

### `recordManufacturedOpeningStockCorrection(input: OpeningStockCorrectionInput): Promise<ActionResult>`

- **Input**: `productId`, `correctionQty` (non-zero integer), `reason` (required, trimmed),
  `correctionDate` (not future).
- **Behavior**: Calls `record_manufactured_opening_stock_correction`.
- **Errors**:
  - `OpeningStockNotFoundError`
  - `CorrectionExistsError`: "This product's opening stock has already been corrected once."
  - `StockAlreadyShippedError`: "Stock of this product has already gone out on an accepted
    Challan, so the opening balance can no longer be corrected."
  - `CorrectionBeforeEntryError`
  - `CorrectionBelowZeroError`: "This correction would take stock below zero."

## Reads (service functions, not Server Actions)

### `listContractors(filters: { status?: 'active' | 'inactive' }): Promise<ContractorListItem[]>`

- `lib/contractors/service.ts`. Returns `{ id, name, phone, status }[]` ordered by name.

### `listActiveContractorsForSelect(): Promise<{ id: string; name: string }[]>`

- Thin wrapper over `listContractors({ status: 'active' })`.

### `getContractor(id: string): Promise<Contractor | null>`

### `listAvailableLotsForBatch(opts?: { includeBatchId?: string }): Promise<LotOption[]>`

- `lib/production-batches/service.ts`. Returns weight-mode lots with `remaining_weight_kg > 0`,
  joined to `suppliers(name)`, oldest first:
  `{ id, supplierName, purchaseDate, weightKg, remainingWeightKg, ratePerKg }` (FR-004, US1-6).
- With `includeBatchId` (the edit form), the batch's own lot is always included, and its
  `remainingWeightKg` has the batch's own weight added back.

### `listActiveManufacturedProductsForSelect(): Promise<{ id; name; stockUom; defaultLabourRatePerPacket; expectedYieldPerKg }[]>`

- Added to `lib/products/service.ts` as a thin wrapper over `listProducts({ type: 'manufactured',
  status: 'active' })`. Supplies the rate pre-fill (FR-007) and the expected-packets suggestion
  (FR-008).

### `listProductionBatches(filters: { status?; contractorId?; productId?; issueDateFrom?; issueDateTo?; batchNumber? }): Promise<{ items: BatchListItem[]; issuedTotals: { weightKg: number; valueRs: number } }>`

- Joins `contractors(name)`, `products(name)` and `raw_material_purchases(rate_per_kg)`. Ordered by
  `issue_date desc, batch_number desc` (FR-021). `batchNumber` is a case-insensitive substring
  match.
- Each item: `{ id, batchNumber, status, contractorName, productName, weightIssuedKg, issueDate,
  fabricValue (= round(weight × lot rate, 2)), daysOutstanding (issued only), packetsProduced?,
  avgCostPerPacket? }`.
- `issuedTotals` is summed in TypeScript over the filtered Issued items (FR-022, SC-005).

### `getProductionBatch(id: string): Promise<BatchDetail | null>`

- Returns all entered fields and joined names, plus the lot (supplier, purchase date, rate). While
  Issued, it also returns a live `expectedPacketsSuggestion`. Once Completed, it returns all stored
  cost, wastage and variance figures:
  - `yieldVariance = packetsProduced − expectedPackets`
  - `yieldVariancePct = round(variance / expectedPackets × 100, 2)` (FR-018)
  - `returnedWeightExceeded`
  - audit fields (FR-023, FR-027)

### `listManufacturedOpeningStockStatus(): Promise<OpeningStockRow[]>`

- Lists every manufactured product (active and inactive) left-joined to
  `manufactured_opening_stock`:
  - `{ productId, productName, quantityOnHand, opening?: { quantity, entryDate, costPerPacket,
    correction?: { qty, reason, date } } }`
  - `canCorrect`: opening exists, no correction yet, and no Challan outflow

### `listProductStockMovements(productId: string): Promise<StockMovementRow[]>`

- Added to `lib/products/service.ts`. Returns `inventory_movements` for the product ordered by
  `movement_date desc, created_at desc`: `{ movementDate, reason, qtyDelta, sourceType, sourceId }`.
  The product detail page renders these, linking `production_batch` rows to their batch.

## Reused, unchanged

- `requireCurrentUser()`, `fail()` / `ActionResult`, `getSupabaseAdmin()`.
- `listProducts` (003), `recompute_product_quantity_on_hand` (007).
- 002's purchases pages show the lot lock automatically through the existing `isLocked` flag.
