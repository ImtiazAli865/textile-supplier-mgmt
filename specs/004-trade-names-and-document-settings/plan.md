# Implementation Plan: Trade Names & Document Settings

**Branch**: `004-trade-names-and-document-settings` | **Date**: 2026-09-20 | **Spec**: [spec.md](./spec.md)
**Input**: Feature specification from `/specs/004-trade-names-and-document-settings/spec.md`

## Summary

Internal staff need a manageable directory of the business's billing identities ("trade names")
— replacing the hardcoded set of five names with real records — so that later features (Customer
Purchase Orders' trade-name choice, Challans, Performa Invoicing) have something real to
reference. Built as a new single table, `trade_names`, following the same active/inactive
directory pattern already established by Suppliers (001): plain CRUD through Server Actions, no
Postgres RPC function needed since — unlike 003b — there is no second table whose derived state
must stay in sync with it. The one genuinely new piece of infrastructure is Supabase Storage: this
is the first feature in the roadmap to store a file (signature/company-stamp images), so this plan
also stands up a private storage bucket, accessed exclusively through the existing server-only
Supabase admin client, with reads served as short-lived signed URLs rather than public URLs. See
[data-model.md](./data-model.md) and [research.md](./research.md).

## Technical Context

**Language/Version**: TypeScript 5.x, Node.js 20+ (unchanged from 001/002/003/003b)
**Primary Dependencies**: Next.js 16 (App Router), React 19, `@supabase/supabase-js`,
`@supabase/ssr`, `zod`, `react-hook-form`, `@hookform/resolvers`, Tailwind CSS — all already
installed, no new dependencies needed for this feature
**Storage**: Supabase Postgres — new `trade_names` table (see [data-model.md](./data-model.md));
Supabase Storage — new private bucket for signature/stamp images (first use of Storage in this
project, per `specs/PRODUCT-OVERVIEW.md` § "Cross-Cutting Technical Requirements")
**Testing**: Vitest + Testing Library (unit/integration) — not yet wired into `package.json`,
same as 001/002/003/003b
**Target Platform**: Web, deployed to Vercel
**Project Type**: Single Next.js app — extends the existing app with one new module
(`lib/trade-names/*`, `app/actions/trade-names.ts`, `components/trade-names/*`,
`app/(dashboard)/trade-names/*`), no new service or deployable
**Performance Goals**: Trade name list (at most a few dozen records — five today) renders
instantly; no pagination/search-latency budget is meaningful at this scale, unlike Suppliers'
500-row target (SC-003)
**Constraints**: No client-side Postgres or Storage access — all reads/writes go through the
server using the Supabase service-role key, matching 001/002/003/003b; uploaded signature/stamp
images MUST NOT be retrievable via a public or guessable URL (FR-010); only standard image types
and a bounded file size are accepted for uploads (FR-009)
**Scale/Scope**: Single internal business, a handful of trade names (five today, no hard cap), no
multi-tenancy, no role hierarchy (spec Assumptions)

## Constitution Check

*GATE: Must pass before Phase 0 research. Re-check after Phase 1 design.*

`.specify/memory/constitution.md` is still the unfilled template — no ratified principles exist
yet to gate against, same situation as 001/002/003/003b. Proceeding under the project's default
guardrails (smallest viable diff, no speculative abstraction, testable increments per user story).

**Architecturally significant decision surfaced by this feature**: this is the first feature to
store a file rather than only structured rows, and the master spec (`specs/PRODUCT-OVERVIEW.md` §
"Cross-Cutting Technical Requirements") already flags that every later document-attachment need
(PO PDFs in 006, scanned signed Challans in 007, GST invoice PDFs in 008) will reuse whatever
Storage access pattern this feature establishes. This plan resolves it by treating Supabase
Storage exactly like Supabase Postgres has been treated since ADR-0001: one private bucket,
written and read only by the server-side service-role client, with reads exposed to the browser
as short-lived signed URLs — never a public bucket, never a client-side upload using the anon key.
See [research.md](./research.md) for the alternatives considered.

📋 **Architectural decision detected**: private-bucket-only Supabase Storage access via the
server-side service-role client (no public buckets, no client-side uploads), established as the
project-wide pattern for every future feature that stores a file — Document reasoning and
tradeoffs? Run `/sp.adr storage-access-via-server-only-signed-urls`. Not created automatically;
waiting for user consent per project policy.

*Re-checked after Phase 1 design (data-model.md, contracts/server-actions.md): no further
violations introduced. `trade_names` is a plain single table with no child tables and no derived
cross-table state, so — unlike 001's supplier writes or 003b's unit-purchase writes — it does not
need ADR-0002's Postgres-function pattern; ordinary `supabase-js` `.insert()`/`.update()` calls
from the Server Action are the correct, smaller-diff choice, exactly as 002/003 already do for
their own single-table writes.*

## Project Structure

### Documentation (this feature)

```text
specs/004-trade-names-and-document-settings/
├── plan.md              # This file
├── research.md          # Phase 0 output (/sp.plan command)
├── data-model.md         # Phase 1 output (/sp.plan command)
├── quickstart.md         # Phase 1 output (/sp.plan command)
├── contracts/
│   └── server-actions.md # Phase 1 output
└── tasks.md               # Phase 2 output (/sp.tasks command - NOT created by /sp.plan)
```

### Source Code (repository root)

```text
app/
├── (dashboard)/
│   ├── layout.tsx                  # EXTENDED — add "Trade Names" nav link
│   ├── suppliers/                  # EXISTING — unchanged
│   ├── products/                   # EXISTING — unchanged
│   ├── purchases/                  # EXISTING — unchanged
│   └── trade-names/
│       ├── page.tsx                # NEW — list view
│       ├── loading.tsx             # NEW
│       ├── new/
│       │   └── page.tsx            # NEW — create form
│       └── [tradeNameId]/
│           ├── page.tsx            # NEW — detail view (fields, images, sequence settings)
│           ├── loading.tsx         # NEW
│           └── edit/
│               └── page.tsx        # NEW — edit form
└── actions/
    ├── auth.ts                     # EXISTING — unchanged
    ├── suppliers.ts                 # EXISTING — unchanged
    ├── products.ts                  # EXISTING — unchanged
    ├── purchases.ts                 # EXISTING — unchanged
    └── trade-names.ts                # NEW — createTradeName/updateTradeName/setTradeNameStatus/
                                       # uploadTradeNameSignature/uploadTradeNameStamp

lib/
├── supabase/
│   ├── server.ts                   # EXISTING — unchanged
│   └── admin.ts                    # EXISTING — reused for both Postgres and Storage access
├── auth/                           # EXISTING — unchanged
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
└── trade-names/
    ├── schema.ts                    # NEW — tradeNameInputSchema (Zod), TradeName/
    │                                 # TradeNameListItem types
    ├── service.ts                   # NEW — CRUD against `trade_names` (plain supabase-js,
    │                                 # no RPC — see Constitution Check), status set
    └── storage.ts                    # NEW — uploadTradeNameAsset/getSignedAssetUrl, isolates
                                       # all `supabase.storage` calls behind a small module so
                                       # service.ts and the Server Action stay storage-agnostic

components/
├── suppliers/                      # EXISTING — unchanged
├── products/                       # EXISTING — unchanged
├── purchases/                      # EXISTING — unchanged
└── trade-names/
    ├── trade-name-form.tsx          # NEW — printed name/address/NTN/STRN + sequence fields
    ├── trade-name-list.tsx          # NEW
    ├── trade-name-asset-upload.tsx  # NEW — signature/stamp file input + preview, client
    │                                 # component (needs FormData + file input state)
    └── deactivate-reactivate-control.tsx # NEW — same shape as suppliers' control

supabase/migrations/
├── 0001_init.sql                   # EXISTING — unchanged
├── 0002_products.sql               # EXISTING — unchanged
├── 0003_traded_purchases.sql       # EXISTING — unchanged
└── 0004_trade_names.sql            # NEW — `trade_names` table + the private Storage bucket
                                     # (see data-model.md)
```

**Testing note**: No `tests/` tree is scaffolded by tasks.md for this feature either (unchanged
from 001/002/003/003b's approach).

**Structure Decision**: Single Next.js application (same shape as 001/002/003/003b) — unchanged.
This feature adds one new module (`lib/trade-names/*`, `app/actions/trade-names.ts`,
`components/trade-names/*`, `app/(dashboard)/trade-names/*`) — no new route groups beyond one
sibling to the existing three, no new services. `lib/trade-names/storage.ts` is a new kind of
file for this codebase (the first module wrapping `supabase.storage` rather than
`supabase.from(...)`), called out explicitly in the tree above since it's the one structurally new
piece.

## Complexity Tracking

No constitution gates are defined yet (template unfilled), so there is nothing to justify a
deviation against. The one piece of added complexity — a Storage-backed asset pipeline
(`lib/trade-names/storage.ts`, a new private bucket) — is not a violation of anything; it is the
direct consequence of this being the first feature in the roadmap that must persist a file rather
than only structured rows, and is called out above as an ADR candidate precisely because it is a
real, reusable pattern decision (every later PDF/scan attachment feature will follow it), not an
accident of implementation.
