# Data Model: Raw Material Purchases

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10 | **Revised**: 2026-09-16 (Firebase → Supabase, see [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md))

Postgres schema derived from spec Key Entities and Functional Requirements. DDL lives in [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql); this document explains the shape and the FR each part satisfies.

## Table: `raw_material_purchases`

One row per purchase "lot".

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK, default `gen_random_uuid()`) | yes | |
| `supplier_id` | `uuid` → `suppliers(id)` | yes | Must be an existing, active supplier at creation time (FR-001). Real foreign key — replaces Firestore's unenforced string reference. |
| `purchase_date` | `date` | yes | Date-only column (no time-of-day ambiguity, unlike a Firestore Timestamp at midnight UTC). Must not be later than today — enforced in the service layer, not a DB constraint, since "today" depends on the request's timezone (FR-003, spec Edge Cases). |
| `weight_kg` | `numeric(10,2)` check `> 0` | yes | Weight purchased, rounded to 2 decimal places (FR-003, FR-012). |
| `rate_per_kg` | `numeric(10,2)` check `> 0` | yes | Rate per kg, rounded to 2 decimal places (FR-003, FR-012). |
| `total_cost` | `numeric(12,2)`, `generated always as (round(weight_kg * rate_per_kg, 2)) stored` | yes (derived) | Computed **by Postgres itself** on every insert/update — stronger guarantee than the old "service layer always computes it" convention, since it is now structurally impossible to write a mismatched value (FR-002, SC-005). |
| `remaining_weight_kg` | `numeric(10,2)` check `>= 0` | yes (derived) | Set equal to `weight_kg` on create, and reset to equal the new `weight_kg` on edit. This feature never decrements it — reserved for the future Production Batches feature (003) to consume (FR-011). |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` maintained by `trg_purchases_updated_at`. FR-013. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | Supabase Auth user id of the staff member. |

**Validation rules (still enforced in Zod, in the service layer, not as DB constraints)**: `supplier_id` must reference an existing **active** supplier at creation time; `purchase_date` must be ≤ today; the consumption lock (below). The DB layer enforces structural integrity (foreign key exists, numbers positive, `total_cost` arithmetic) but not these time- and status-dependent business rules, same division of responsibility as the Firestore-era plan.

**Consumption lock (derived, not stored)**: a purchase is locked for edit/delete whenever `remaining_weight_kg < weight_kg` (FR-010). Computed at read/action time from the two stored columns, unchanged from the Firestore-era design — moving to Postgres doesn't change this decision, since it's still cheaper and safer than a separate flag that could drift out of sync.

## Relationship: `suppliers` (from 001)

`supplier_id` is now a real foreign key to `suppliers(id)` (`references suppliers (id)`, no `on delete cascade` — a supplier with purchase history cannot be hard-deleted, which matches 001's soft-delete-only design anyway). Only suppliers with `status = 'active'` are offered when creating a new purchase; an existing purchase's referenced supplier is fetched and displayed regardless of that supplier's current status. Listing purchases now uses a single `JOIN` to `suppliers` for the display name, replacing the Firestore-era pattern of fetching each referenced supplier individually in application code.

## Indexes

- `idx_purchases_supplier_date (supplier_id, purchase_date desc)` — supplier filter combined with the default most-recent-first sort (FR-005).
- `idx_purchases_date (purchase_date desc)` — date-range filter and default sort when no supplier filter is applied.

## State / Lifecycle

```
        create
          |
          v
   [ unconsumed ]  (remaining_weight_kg = weight_kg)
     |  edit/delete allowed (FR-008, FR-009)
     |
     v  (future: Production Batches consumes part of remaining_weight_kg)
   [ partially/fully consumed ]  (remaining_weight_kg < weight_kg)
     |  edit/delete blocked (FR-010) — record becomes read-only
```

- No transition back from "consumed" to "unconsumed" exists in this feature or is anticipated — consumption is monotonic (a future feature only ever reduces `remaining_weight_kg`). A future ADR should cover making that decrement transactional (`UPDATE ... SET remaining_weight_kg = remaining_weight_kg - $1 WHERE remaining_weight_kg >= $1`) once Production Batches (003) is designed — one of the concrete benefits of the Postgres move flagged in ADR-0001.
- Deletion (FR-009) is a hard `DELETE`, unlike Supplier's soft-delete pattern — see spec Assumptions: an untouched purchase has no downstream references yet, so nothing else in the data model points to it.

## Derived/computed fields rationale

- `total_cost`: now a Postgres `GENERATED ALWAYS AS` column — cannot diverge from `weight_kg * rate_per_kg` even in principle, tightening the guarantee from "service layer always computes it" (Firestore era) to "the database will not store anything else" (FR-002, SC-005).
- `remaining_weight_kg`: exists purely so the Production Batches feature (003) has a column to consume against; this feature only ever writes it equal to `weight_kg`.
- Consumption lock: intentionally derived rather than a stored flag, so it cannot drift out of sync with `remaining_weight_kg`.
