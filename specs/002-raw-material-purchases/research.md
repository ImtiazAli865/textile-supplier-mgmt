# Research: Raw Material Purchases

**Feature**: `002-raw-material-purchases` | **Date**: 2026-09-10

Resolves technical unknowns before design. This feature extends the existing app from 001-supplier-directory, so most infrastructure decisions (Server Components/Actions, Admin-SDK-only Firestore access, session-cookie auth, Zod validation shared client/server) already carry over unchanged — see [001's research.md](../001-supplier-directory/research.md). Only decisions specific to purchases are recorded here.

## Decision: Supplier reference is a live lookup by `supplierId`, not a denormalized name snapshot

- **Decision**: A Raw Material Purchase document stores only `supplierId`. Supplier name/status for display is fetched by joining to the `suppliers` collection at read time (list and detail views fetch the referenced supplier alongside the purchase).
- **Rationale**: Supplier company names are editable (001 FR-005) and suppliers are never deleted (only deactivated), so a live join always shows the current name without a denormalization-sync mechanism, while still satisfying the spec's edge case that a purchase remains fully viewable after its supplier is deactivated (the supplier document still exists — just with `status: "inactive"`).
- **Alternatives considered**: Denormalizing `supplierName` onto the purchase at write time — rejected because it would drift silently if a supplier is renamed after the purchase is recorded, and the extra read for a join is negligible at this scale (same pattern budget as SC-004).

## Decision: Money and weight stored as plain rounded numbers (no integer minor-units)

- **Decision**: `weightKg` and `ratePerKg` are stored as JavaScript numbers, rounded to 2 decimal places on every write (`Math.round(x * 100) / 100`); `totalCost` is derived the same way from `weightKg * ratePerKg`.
- **Rationale**: FR-012 only requires 2-decimal rounding, not sub-cent accounting precision; the business's own examples (Rs 6/packet, Rs 120/packet) are whole/simple amounts. Integer minor-units (storing paisa) would add a conversion layer with no requirement driving it — unnecessary complexity for this feature's scale (spec Assumptions: single currency, no multi-currency).
- **Alternatives considered**: Storing amounts as integer paisa (cents) — rejected as premature; revisit only if a future feature (e.g., Invoicing, 007) surfaces real floating-point drift in generated documents.

## Decision: Purchase list totals computed by fetching all filtered documents, not a separate aggregation query

- **Decision**: `listPurchases(filters)` fetches every purchase document matching the `supplierId`/date-range filters (via Firestore query) and computes `{ totalKg, totalCost }` by summing in application code, the same call that renders the list.
- **Rationale**: SC-004 commits to <2s at 1,000 records — trivial to fetch and sum server-side at that scale (same reasoning 001 used for in-memory name search). Firestore's `count()`/`sum()` aggregation queries exist but would be a second query per page load for no measurable benefit at this volume.
- **Alternatives considered**: Firestore aggregation queries (`getCountFromServer`-style sum queries) — rejected as unneeded indirection below ~1,000 records; revisit if Scale/Scope grows by an order of magnitude or totals need to span the *entire* purchase history rather than a filtered page.

## Decision: Consumption lock is derived from `remainingWeightKg < weightKg`, not a separate boolean flag

- **Decision**: A purchase is "locked" for edit/delete (FR-010) whenever `remainingWeightKg` is strictly less than `weightKg`. This is computed wherever needed (Server Action guard, UI disabling), not stored as its own field.
- **Rationale**: `remainingWeightKg` is already the single source of truth this feature introduces for the future Production Batches feature (003) to decrement; a derived comparison can't drift out of sync with it, whereas a separate `isLocked` flag could be forgotten in a future write path.
- **Alternatives considered**: Explicit `isLocked: boolean` field — rejected as redundant state that duplicates what `remainingWeightKg` already encodes, violating the "smallest viable diff" default.

## Decision: Purchase date stored as a Firestore Timestamp (date-only semantics), validated against "not in the future"

- **Decision**: `purchaseDate` is stored as a Firestore `Timestamp` (midnight UTC of the selected calendar date), matching how `createdAt`/`updatedAt` are already stored in 001. The create/edit form uses a native HTML `<input type="date">`, and server-side validation rejects any date later than the current day (spec Edge Cases).
- **Rationale**: Consistent with the existing Timestamp convention in `suppliers`; avoids adding a date-handling library (e.g. `date-fns`) for a single date field when native `Date`/`<input type="date">` fully covers the requirement.
- **Alternatives considered**: Storing as an ISO date string (`"2026-09-10"`) — rejected because it can't be used directly in Firestore range queries (`>=`/`<=`) the way a `Timestamp` can, which FR-005's date-range filter needs.

## Resolved Technical Context

| Item | Value |
|---|---|
| Language/Version | TypeScript 5.x, Node.js 20+ (unchanged from 001) |
| Primary Dependencies | Next.js 16 (App Router), React 19, `firebase-admin`, `firebase` (Auth client only), `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already in the project; no new dependencies |
| Storage | Firestore — new `rawMaterialPurchases` collection, referencing existing `suppliers` collection by `supplierId` |
| Testing | Vitest, Testing Library, Firestore Emulator (same intended stack as 001; not yet wired into `package.json` — no test tasks scaffolded here either, consistent with how 001 was implemented) |
| Target Platform | Web, deployed to Vercel |
| Project Type | Single Next.js app (extends 001, no new service) |
| Performance Goals | Purchase list search/filter + totals render in <2s at 1,000 records (SC-004) |
| Constraints | No client-side Firestore access (Admin SDK only, per 001); only active suppliers selectable at creation (FR-001); locked records reject edit/delete server-side regardless of client state |
| Scale/Scope | Single internal business, up to ~1,000 purchase records for now, no multi-tenancy |
