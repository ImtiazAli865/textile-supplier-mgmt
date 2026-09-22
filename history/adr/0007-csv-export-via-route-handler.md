# ADR-0007: Tabular data export is CSV served by a Next.js Route Handler, not a spreadsheet library or client-side blob construction

> **Scope**: Documents how this project produces a downloadable, "Excel-compatible" export of
> flat tabular data (a customer's ledger, an all-customers summary) — not a decision specific to
> the Customer Ledger alone.

- **Status:** Accepted
- **Date:** 2026-09-23
- **Feature:** 009-customer-ledger (first application; 012-finished-goods-inventory and
  013-profit-reports are expected to be later applications, per `specs/PRODUCT-OVERVIEW.md`'s own
  "export to PDF/Excel" requirement appearing across multiple roadmap rows)
- **Context:** Every feature through 008 has only ever produced two output shapes: on-screen React
  views (Server Components) and, since ADR-0006, printable HTML documents rendered by a standalone
  print route (browser Print → Save as PDF). No feature so far has needed to serve a raw file
  download with its own content type and filename — Server Actions in this project return
  RSC-serializable data, not byte streams. 009-customer-ledger's spec (FR-012, SC-007) requires an
  "Excel" export of a customer's ledger and the all-customers summary, matching exactly what's
  shown on screen, including active filters. `specs/PRODUCT-OVERVIEW.md`'s own "Due dates &
  ageing" line and its Module Roadmap both name "export to PDF/Excel" again for 012
  (Finished Goods Inventory) and 013 (Profit & Reports) — this is not a one-off need.

## Decision

- **Format**: `text/csv`, not a generated `.xlsx` file. CSV opens natively and losslessly in
  Excel for flat, unformatted tabular data — nothing this feature (or 012/013, as currently
  scoped) needs requires merged cells, formulas, multiple sheets, or cell-level formatting.
- **Delivery mechanism**: a Next.js Route Handler (`app/api/customer-ledger/route.ts`,
  `app/api/customer-ledger/[customerId]/route.ts`) returning the CSV text with
  `Content-Type: text/csv` and `Content-Disposition: attachment; filename="..."` — this
  project's first Route Handler, alongside its already-established Server Actions (mutations)
  and Server Components (reads).
- **Data path**: the Route Handler calls the exact same read functions the on-screen views
  already use (`getCustomerLedger`, `listCustomerLedgerSummaries`), rendering their output as CSV
  rows in a small, dedicated `lib/customer-ledger/csv.ts` module — never a separate query path
  that could diverge from what's displayed.
- **No new npm dependency** is introduced for either CSV rendering (a small local string-join
  utility, not a library) or file serving (Route Handlers are a built-in Next.js primitive).
- Each Route Handler requires the same authenticated session every Server Action already
  requires, duplicating the check rather than depending on dashboard-layout-level protection
  (mirroring ADR-0006's own accepted auth-check duplication for print routes).

## Consequences

### Positive

- Zero new dependency, consistent with ADR-0006's own precedent of rejecting a PDF library for
  the same category of reason, and with this project's general dependency-minimalism.
- The exported file can never structurally diverge from the on-screen table, since both read
  from the same service functions — no separate reporting/export data path to keep in sync.
- Establishes an already-decided, reusable pattern for 012's and 013's own export requirements —
  those features can reuse this ADR directly rather than re-evaluating spreadsheet libraries vs.
  CSV from scratch, the same way ADR-0006 let 008 reuse 007's printed-document decision without
  re-deciding it.
- A Route Handler is the correct, idiomatic Next.js primitive for a raw file download with custom
  headers — a Server Action would need to ship JSON-serialized data to the client and construct a
  `Blob`/`<a download>` there, more plumbing for an identical outcome.

### Negative

- CSV cannot represent multiple sheets, cell formatting/styling, formulas, or frozen headers — if
  a future export genuinely needs any of those (for example, a formatted profit-and-loss workbook
  for 013), this decision would need to be revisited for that specific export, possibly
  introducing a spreadsheet-generation library at that point.
- Route Handlers are a new surface in this project (alongside Server Actions and Server
  Components), each requiring its own duplicated auth check rather than inheriting
  dashboard-layout-level protection — a small, deliberate repetition rather than shared
  middleware, the same tradeoff ADR-0006 already accepted for print routes.
- A `.csv` download is a marginally less "native Excel" experience than a generated `.xlsx` (no
  automatic column-width or number-format hints on open) — acceptable at this project's internal,
  low-volume usage, but a real, minor fidelity gap versus a purpose-built workbook.

## Alternatives Considered

**A spreadsheet-generation library (`exceljs`, `xlsx`/SheetJS) producing a real `.xlsx` file** —
Rejected for now as the first dependency this project would add purely for export formatting, for
a requirement CSV already satisfies losslessly given the data's flat shape. Revisit if a future
export genuinely needs multi-sheet, formatted, or formula output (013's profit rollup is the most
likely candidate).

**A Server Action returning CSV text, with client-side `Blob` construction and a manufactured
`<a download>` click** — Rejected as more client-side plumbing than a Route Handler for an
identical outcome, and would be the first Server Action in this project returning something other
than plain JSON-serializable data.

**PDF export only, no separate "Excel" format** — Rejected outright; explicitly required by
FR-012/SC-007 and `specs/PRODUCT-OVERVIEW.md`'s own "export to PDF/Excel" line, and a PDF's
per-page layout is a poor fit for a staff member who actually wants to re-sort, filter, or paste
ledger rows into their own spreadsheet.

## References

- Feature Spec: `specs/009-customer-ledger/spec.md` (FR-012, SC-007)
- Implementation Plan: `specs/009-customer-ledger/plan.md` (Constitution Check — where this
  decision was surfaced for consent)
- Research: `specs/009-customer-ledger/research.md` ("Decision: PDF export reuses ADR-0006's
  server-rendered print-route pattern... Excel export is a CSV Route Handler")
- Data Model: `specs/009-customer-ledger/data-model.md` ("CSV export rows" — read-only
  computation reusing the same service functions as the on-screen view)
- Master Spec: `specs/PRODUCT-OVERVIEW.md` § "Cross-Cutting Technical Requirements" and § "Module
  Roadmap" (012-finished-goods-inventory, 013-profit-reports — both also expected to need export)
- Related ADRs: [ADR-0006](0006-printed-documents-via-server-rendered-print-routes.md) (the
  sibling pattern this ADR's PDF half directly reuses without modification, and whose
  auth-check-duplication precedent this ADR's Route Handlers follow for the same reason)
