# Quickstart: Trade Names & Document Settings

**Feature**: `004-trade-names-and-document-settings` | **Date**: 2026-09-20

Extends the app already scaffolded for 001/002/003/003b — no new environment variables. Uses the
same Supabase project (Postgres + Auth) plus, for the first time, **Supabase Storage**. The new
table and the new private bucket are added in
[`supabase/migrations/0004_trade_names.sql`](../../supabase/migrations/0004_trade_names.sql).

## Prerequisites

- Everything from [003b's quickstart.md](../003b-traded-goods-purchasing/quickstart.md) (Node.js
  20+, Supabase project with `0001_init.sql` through `0003_traded_purchases.sql` applied, a staff
  user in Supabase Auth) already set up.
- `0004_trade_names.sql` applied to the same Supabase project before testing this feature — this
  is the migration that both creates `trade_names` **and** provisions the `trade-name-assets`
  Storage bucket, so Storage uploads will fail with a "bucket not found" error until it's run.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **Create and view a trade name record** (User Story 1): Go to "Add Trade Name", enter a printed
   name and printed address (NTN/Sales Tax Registration number optional) → confirm it saves as
   active and appears in the trade name list. Open its detail view → confirm every entered field
   displays correctly. Try submitting with no printed name or no address → confirm a validation
   error and nothing saved.
3. **Upload signature and stamp images** (User Story 2): Open an existing trade name with no
   images, upload a PNG or JPEG as its signature → confirm it appears on the detail view. Upload a
   different image as its stamp → confirm both images are shown independently. Replace the
   signature with a new image → confirm the new one displays and the old file no longer resolves
   (spot-check in the Supabase Storage dashboard that the old object was removed). Try uploading a
   non-image file (e.g. a `.pdf` or `.txt`) → confirm a clear rejection and the existing image (if
   any) unchanged. Try uploading an oversized image (> 5 MB) → confirm a clear rejection naming the
   size limit.
4. **Configure document number sequences** (User Story 3): Open a newly created trade name →
   confirm `next_challan_number` and `next_invoice_number` both default to `1`. Override one to a
   specific value (e.g. `247`, simulating a mid-migration cutover) and save → confirm the new
   value persists and is shown on subsequent visits. Confirm changing one trade name's sequence
   values has no effect on any other trade name's values.
5. **Edit and deactivate a trade name** (User Story 4): Edit an existing trade name's address or
   tax numbers, save → confirm the change persists and is reflected immediately. Deactivate an
   active trade name → confirm it disappears from the default (active) list but its record,
   images, and sequence settings remain intact and viewable via the inactive filter; reactivate it
   → confirm it reappears in the default list.
6. **Confirm images are never publicly retrievable** (FR-010): Copy a trade name's rendered
   signature image URL from the browser's network tab or page source, wait past its signed-URL
   expiry (a few minutes), then try loading that exact URL directly in a private/incognito window
   with no session → confirm it no longer resolves.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
