# Data Model: Supplier Directory

**Feature**: `001-supplier-directory` | **Date**: 2026-09-06

Firestore collection layout derived from spec Key Entities and Functional Requirements. See [research.md](./research.md) for the embedding/soft-delete decisions.

## Collection: `suppliers`

One document per Supplier. Path: `suppliers/{supplierId}` (auto-generated ID).

| Field | Type | Required | Notes |
|---|---|---|---|
| `companyName` | string | yes | FR-001, FR-002. Display name. |
| `companyNameLower` | string | yes (derived) | Lowercased copy of `companyName`, maintained on write, used for case-insensitive search (FR-009). |
| `address` | map | yes | `{ line1: string, line2?: string, city: string, state?: string, postalCode?: string, country: string }`. FR-001. |
| `materials` | string[] | yes, min 1 | Free-text material/fabric tags, stored lowercased for consistent filtering (FR-001, FR-002, FR-010). |
| `paymentTerms` | string | yes | Free text, e.g. "Net 30". FR-001. |
| `status` | `"active" \| "inactive"` | yes | Defaults to `"active"` on create. FR-006, FR-007, FR-011. |
| `notes` | string | no | Internal free text. Defaults to `""`. FR-012. |
| `rating` | number (1–5) | no | Omitted field if not set (not `null`, to keep queries simple). FR-012. |
| `contacts` | Contact[] | yes, min 1 | Embedded array — see Contact shape below. FR-001, FR-002, FR-013. |
| `createdAt` | Timestamp | yes | Set once on create (server timestamp). FR-015. |
| `updatedAt` | Timestamp | yes | Set on every write (server timestamp). FR-015. |
| `createdBy` | string | yes | Firebase Auth `uid` of the creating staff user. |
| `updatedBy` | string | yes | Firebase Auth `uid` of the last staff user to write. |

### Embedded type: `Contact`

| Field | Type | Required | Notes |
|---|---|---|---|
| `name` | string | yes | FR-013. |
| `phone` | string | conditionally | Required if `email` absent. FR-002, FR-013. |
| `email` | string | conditionally | Required if `phone` absent. FR-002, FR-013. |
| `role` | string | no | Optional title, e.g. "Sales Manager". FR-013. |

**Validation rule (enforced in Zod, not Firestore)**: every Contact must have `phone` and/or `email`; a Supplier must have `materials.length >= 1` and `contacts.length >= 1`.

## Indexes

Firestore composite indexes needed to satisfy FR-010/FR-011 (filter by status + material together):

- `status` (ASC) + `companyNameLower` (ASC) — default list view, active suppliers sorted by name.
- `status` (ASC) + `materials` (ARRAY_CONTAINS) — status + single material filter combination (Firestore auto-suggests/creates this on first query if not predefined; declared explicitly in `firestore.indexes.json` to avoid a runtime error on first use in production).

No index needed for the name-search itself — that's done in-memory per the research.md decision (Firestore can't index for substring search).

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
- No other states; no deletion transition exists (FR-008).

## Derived/computed fields rationale

- `companyNameLower`: Firestore has no case-insensitive comparison operator; storing a lowercased copy lets the default sort and any future prefix-based lookups stay consistent, while the FR-009 substring search itself is done in-memory over already-fetched documents (see research.md).
- `materials` stored lowercased: keeps the material filter dropdown's equality checks (`array-contains`) consistent regardless of how a value was originally typed.
