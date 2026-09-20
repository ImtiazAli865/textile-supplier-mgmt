# Data Model: Trade Names & Document Settings

**Feature**: `004-trade-names-and-document-settings` | **Date**: 2026-09-20

Postgres schema (plus one Storage bucket) derived from spec Key Entities and Functional
Requirements. DDL will live in
[`supabase/migrations/0004_trade_names.sql`](../../supabase/migrations/0004_trade_names.sql)
(written at implementation time); this document explains the shape and the FR each part
satisfies, and is the basis for that migration.

## Table: `trade_names` (new)

| Column | Type | Required | Notes |
|---|---|---|---|
| `id` | `uuid` (PK), default `gen_random_uuid()` | yes | |
| `printed_name` | `text` | yes | FR-001, FR-002. |
| `printed_address` | `text` | yes | Free text, may contain embedded newlines — printed verbatim on documents. FR-001, FR-002. See research.md for why this diverges from `suppliers`' structured address. |
| `ntn_number` | `text` | no | `null` if not applicable. FR-001. |
| `sales_tax_registration_number` | `text` | no | `null` if not applicable. FR-001. |
| `signature_image_path` | `text` | no | Storage object path (not a URL) within the `trade-name-assets` bucket; `null` until first uploaded. FR-008. |
| `stamp_image_path` | `text` | no | Same shape as `signature_image_path`, independent value. FR-008. |
| `next_challan_number` | `integer` default `1`, check `> 0` | yes | Plain overridable counter — see research.md for what this feature does and does not do with it. FR-011, FR-012. |
| `next_invoice_number` | `integer` default `1`, check `> 0` | yes | Same shape, independent of `next_challan_number`. FR-011, FR-012. |
| `status` | `text` check `in ('active','inactive')` | yes | Defaults to `'active'`. FR-001, FR-006. |
| `created_at` / `updated_at` | `timestamptz` | yes | `updated_at` maintained by a trigger, mirroring `trg_suppliers_updated_at` from `0001_init.sql`. FR-013. |
| `created_by` / `updated_by` | `uuid` → `auth.users(id)` | yes | Supabase Auth user id of the staff member. |

No child tables — everything about a trade name, including its two image paths and two document
counters, lives on this one row (see research.md for why this doesn't need ADR-0002's
multi-table-write pattern).

**Uniqueness**: no unique constraint on `printed_name` — duplicates are permitted, matching
`suppliers.company_name`'s precedent (spec Edge Cases).

## Storage bucket: `trade-name-assets` (new)

- Created **private** (`public = false`) via `insert into storage.buckets (id, name, public)
  values ('trade-name-assets', 'trade-name-assets', false)` in the same migration.
- No Storage RLS policies are added — the service-role key already bypasses Storage RLS the same
  way it bypasses Postgres RLS (unchanged trust boundary from ADR-0001; see research.md).
- Object path convention: `{trade_name_id}/signature-{unix_timestamp}.{ext}` and
  `{trade_name_id}/stamp-{unix_timestamp}.{ext}`. The timestamp exists only to give each upload a
  fresh, non-colliding key — `trade_names.signature_image_path`/`stamp_image_path` are always the
  single source of truth for which object is current; nothing lists or infers state from the
  bucket's contents.
- Accepted content types: `image/png`, `image/jpeg` (FR-009). Maximum size: 5 MB per file — sized
  generously for a scanned signature/stamp image while still rejecting an accidental wrong-file
  upload (FR-009); enforced server-side in `lib/trade-names/storage.ts` before the upload call,
  not just in the browser file input.

## State / Lifecycle

```
        create (printed_name + printed_address; everything else optional/defaulted)
              |
              v
   [ active ]  <---> [ inactive ]     (FR-006; either direction, any number of times)
     |
     | at any time, independent of status:
     |   - edit any field (FR-005)
     |   - upload/replace signature image (FR-008)
     |   - upload/replace stamp image (FR-008)
     |   - override next_challan_number / next_invoice_number (FR-011)
     v
   (no further states — this feature never deletes a trade name, image, or counter value; FR-007)
```

Simpler than 001/002/003b's lifecycles: there is no "locked once consumed" state, because nothing
in this feature's scope ever consumes a trade name (that only happens once 006-008 reference one
per document, which is out of scope here per the spec's Assumptions).

## Derived/computed fields rationale

- None of `trade_names`' columns are derived/computed — every value is either staff-entered or a
  plain default. Unlike 003b's `total_cost`/`current_purchase_cost`/`quantity_on_hand`, nothing
  here is calculated from other rows, so there's no generated column or recompute function to
  design.

## Row Level Security

Unchanged trust boundary from 001/002/003/003b: all application reads/writes go through Server
Actions using the Supabase service-role key, which bypasses RLS. `trade_names` is created with RLS
enabled and no policies, exactly like every other table in this project's migrations. The
`trade-name-assets` Storage bucket follows the identical rule (see above) rather than introducing
Storage-specific policies.
