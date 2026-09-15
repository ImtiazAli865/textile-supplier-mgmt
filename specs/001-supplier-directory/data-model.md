# Data Model: Supplier Directory

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06 | **Revised**: 2026-09-16 (Firebase → Supabase, see [ADR-0001](../../history/adr/0001-firebase-to-supabase-backend.md))

Postgres schema derived from spec Key Entities and Functional Requirements. DDL lives in [`supabase/migrations/0001_init.sql`](../../supabase/migrations/0001_init.sql); this document explains the shape and the FR each part satisfies.

## Table: `suppliers`

One row per Supplier.

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK, default `gen_random_uuid()`) | yes | |
| `company_name` | `text` | yes | FR-001, FR-002. Display name. |
| `address_line1` | `text` | yes | FR-001. |
| `address_line2` | `text` | no | |
| `address_city` | `text` | yes | |
| `address_state` | `text` | no | |
| `address_postal_code` | `text` | no | |
| `address_country` | `text` | yes | |
| `payment_terms` | `text` | yes | Free text, e.g. "Net 30". FR-001. |
| `status` | `text` check `in ('active','inactive')` | yes | Defaults to `'active'`. FR-006, FR-007, FR-011. |
| `notes` | `text` | no | Defaults to `''`. FR-012. |
| `rating` | `smallint` check `1–5` | no | `null` if not set. FR-012. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` maintained by `trg_suppliers_updated_at`. FR-015. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | Supabase Auth user id of the staff member. |

The address is stored as flat columns (not a nested JSON column) since it has a fixed, non-repeating shape — a normal relational fit. The application-level TypeScript `Address` type still exposes it as a nested object; the service layer maps between the two shapes, so no UI/form code needed to change for this migration.

There is no `company_name_lower` column: Postgres does case-insensitive search directly (`ILIKE`, or `lower(company_name) = lower($1)` for exact match), backed by the trigram index below, so the Firestore-only workaround column is dropped entirely.

### Table: `supplier_contacts` (1:N)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK) | yes | |
| `supplier_id` | `uuid` → `suppliers(id)` `on delete cascade` | yes | |
| `position` | `smallint` default `0` | yes | Preserves the order contacts were entered in the form. |
| `name` | `text` | yes | FR-013. |
| `phone` | `text` | conditionally | Required if `email` is null. FR-002, FR-013. |
| `email` | `text` | conditionally | Required if `phone` is null. FR-002, FR-013. |
| `role` | `text` | no | Optional title, e.g. "Sales Manager". FR-013. |

DB check constraint `supplier_contacts_phone_or_email` enforces phone-or-email at the row level (previously Zod-only); the "at least one contact per supplier" rule (FR-002) stays in the service layer, transactionally enforced on write (a supplier and its contacts are written together).

### Table: `supplier_materials` (1:N tags)

| Column | Type | Required | Notes |
|---|---|---|---|
| `supplier_id` | `uuid` → `suppliers(id)` `on delete cascade` | yes | Composite PK with `material`. |
| `material` | `text` | yes | Free-text tag, stored lowercased (same normalization the Firestore version applied). FR-001, FR-002, FR-010. |

Replaces Firestore's embedded `materials: string[]` field with a proper join table — this also gives a straightforward `SELECT DISTINCT material FROM supplier_materials` query for the "suggestions from previously used values" behavior (spec Assumptions), which required scanning documents in the old model.

## Indexes

- `idx_suppliers_status_name (status, lower(company_name))` — default list view: active suppliers sorted by name (FR-011).
- `idx_suppliers_name_trgm` (GIN, `pg_trgm`) on `lower(company_name)` — case-insensitive substring search (FR-009) and exact-match duplicate detection, both now done as real SQL (`ILIKE '%term%'` / `lower(company_name) = lower($1)`) instead of Firestore's fetch-then-filter-in-memory workaround.
- `idx_supplier_contacts_supplier (supplier_id, position)` — fetch a supplier's contacts in entry order.
- `idx_supplier_materials_material (material)` — filter by material/fabric type (FR-010) and suggestion lookups.

## State Transitions

```
        create
          |
          v
     [ active ] <----> [ inactive ]
          ^  deactivate   |
          |_______________|
             reactivate
```

- `active -> inactive`: staff deactivation action (FR-006). No-op if already inactive (edge case in spec).
- `inactive -> active`: staff reactivation action (FR-007). No-op if already active.
- No other states; no deletion transition exists (FR-008) — rows are never `DELETE`d by this feature, only their `status` column changes.

## Derived/computed fields rationale

- Case-insensitive search/compare: native SQL (`ILIKE`, `lower()`) replaces the Firestore `companyNameLower` derived column entirely — one less field to keep in sync on every write.
- `supplier_materials.material` stored lowercased: keeps filter equality checks consistent regardless of how a value was originally typed, same rationale as the Firestore version.
