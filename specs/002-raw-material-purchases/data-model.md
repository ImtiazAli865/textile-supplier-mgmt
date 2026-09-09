# Data Model: Raw Material Purchases

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10

Firestore collection layout derived from spec Key Entities and Functional Requirements. See [research.md](./research.md) for the live-join, rounding, and derived-lock decisions.

## Collection: `rawMaterialPurchases`

One document per purchase "lot". Path: `rawMaterialPurchases/{purchaseId}` (auto-generated ID).

| Field | Type | Required | Notes |
|---|---|---|---|
| `supplierId` | string (ref) | yes | References `suppliers/{supplierId}` (001). Must be an existing, active supplier at creation time (FR-001). |
| `purchaseDate` | Timestamp | yes | Date-only semantics (midnight UTC of selected date). Must not be later than today (FR-003, spec Edge Cases). |
| `weightKg` | number | yes, > 0 | Weight purchased, rounded to 2 decimal places on write (FR-003, FR-012). |
| `ratePerKg` | number | yes, > 0 | Rate per kg, rounded to 2 decimal places on write (FR-003, FR-012). |
| `totalCost` | number | yes (derived) | `weightKg * ratePerKg`, rounded to 2 decimal places. Always server-computed; never accepted from client input (FR-002). |
| `remainingWeightKg` | number | yes (derived) | Set equal to `weightKg` on create, and reset to equal the new `weightKg` on edit. This feature never decrements it — reserved for the future Production Batches feature (003) to consume (FR-011). |
| `createdAt` | Timestamp | yes | Set once on create (server timestamp). FR-013. |
| `updatedAt` | Timestamp | yes | Set on every write (server timestamp). FR-013. |
| `createdBy` | string | yes | Firebase Auth `uid` of the creating staff user. |
| `updatedBy` | string | yes | Firebase Auth `uid` of the last staff user to write. |

**Validation rules (enforced in Zod, not Firestore)**: `supplierId` must reference an existing supplier; `purchaseDate` must be ≤ today; `weightKg > 0`; `ratePerKg > 0`. `totalCost` and `remainingWeightKg` are never part of the input schema — they are always computed/set by the service layer.

**Consumption lock (derived, not stored)**: a purchase is locked for edit/delete whenever `remainingWeightKg < weightKg` (FR-010). Computed at read/action time from the two stored fields — see research.md.

## Relationship: `Supplier` (from 001)

Referenced by `supplierId`, never embedded or denormalized (see research.md's live-join decision). Only suppliers with `status: "active"` are offered when creating a new purchase; an existing purchase's referenced supplier is fetched and displayed regardless of that supplier's current status.

## Indexes

Firestore composite index needed to satisfy FR-005 (filter by supplier + date range together, sorted most-recent-first):

- `supplierId` (ASC) + `purchaseDate` (DESC) — supplier filter combined with the default most-recent-first sort.

No composite index is needed for a date-range filter alone (Firestore auto-indexes single-field range + orderBy on the same field, `purchaseDate`).

## State / Lifecycle

```
        create
          |
          v
   [ unconsumed ]  (remainingWeightKg == weightKg)
     |  edit/delete allowed (FR-008, FR-009)
     |
     v  (future: Production Batches consumes part of remainingWeightKg)
   [ partially/fully consumed ]  (remainingWeightKg < weightKg)
     |  edit/delete blocked (FR-010) — record becomes read-only
```

- No transition back from "consumed" to "unconsumed" exists in this feature or is anticipated — consumption is monotonic (a future feature only ever reduces `remainingWeightKg`).
- Deletion (FR-009) is a hard delete, unlike Supplier's soft-delete pattern — see spec Assumptions: an untouched purchase has no downstream references yet, so nothing else in the data model points to it.

## Derived/computed fields rationale

- `totalCost`: always `weightKg * ratePerKg`, computed server-side on every write so it can never diverge from the two inputs it depends on (FR-002, SC-005).
- `remainingWeightKg`: exists purely so the Production Batches feature (003) has a field to consume against; this feature only ever writes it equal to `weightKg` (see research.md).
- Consumption lock: intentionally derived rather than a stored flag, so it cannot drift out of sync with `remainingWeightKg` (see research.md).
