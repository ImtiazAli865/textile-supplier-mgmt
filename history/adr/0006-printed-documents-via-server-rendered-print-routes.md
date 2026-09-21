# ADR-0006: Printed business documents are rendered as standalone Server Component routes with `@media print` CSS, not generated via a PDF library

> **Scope**: Documents how this project produces a formatted, printable/exportable business
> document (a Challan, and later a Performa Invoice) — not a decision specific to Challans alone.

- **Status:** Accepted
- **Date:** 2026-09-21
- **Feature:** 007-challans (first application; 008-performa-invoicing is expected to be the
  second, per `specs/PRODUCT-OVERVIEW.md`'s own description of its printed output requiring the
  same auto-inserted signature/stamp and letterhead treatment as a Challan)
- **Context:** Every feature through 006 has only ever *stored* files — 004 stores staff-uploaded
  signature/stamp images; 006 stores a staff-uploaded PO PDF as an attachment. Neither has ever
  needed to *generate* a formatted document from data the system itself holds. 007-challans is the
  first: `specs/PRODUCT-OVERVIEW.md`'s Challans section requires a printed document with a specific
  letterhead (the chosen trade name's printed name/address), a line table (S.NO/Article/Item
  Name/UOM/QTY), a totals row, the trade name's signature and stamp images auto-inserted with no
  manual copy-paste, and two signature lines — handed to the customer's receiving staff alongside
  the goods. This is squarely the kind of "first real writer of a reusable pattern" decision
  ADR-0003 (Storage access) and ADR-0004/ADR-0005 (shared tables) already exist for in this
  project, and 008-Performa-Invoicing will need essentially the same capability (its own
  letterhead, its own line table, the same auto-inserted signature/stamp, plus a tax line and
  amount-in-words per `specs/PRODUCT-OVERVIEW.md`) — so the approach decided here is expected to be
  reused directly, not re-decided.

## Decision

A printed business document is rendered by a **standalone Next.js Server Component route**,
deliberately placed **outside** the `(dashboard)` route group so it carries none of the dashboard's
navigation chrome (`app/challans/[challanId]/print/page.tsx` for this feature), gated by the same
`getCurrentUser()`/`redirect("/login")` check `(dashboard)/layout.tsx` already uses, duplicated
directly in the route rather than inherited from that layout. The route renders plain HTML/CSS
styled with `@media print` rules (page sizing, hidden non-print chrome) and reads whatever data and
Storage-backed images (via short-lived signed URLs, per ADR-0003) the document needs through the
same service-layer functions the rest of the feature already uses. Staff use the browser's native
Print → Save as PDF to produce an exportable file. **No PDF-generation library or service is
introduced.**

## Consequences

### Positive

- Zero new dependencies and zero new infrastructure: no PDF-library bundle size, no headless-
  browser rendering service, no additional Vercel function cold-start or timeout risk.
- The document's layout is described in real HTML/CSS, reusing this project's existing Tailwind
  setup and component patterns, rather than a second, parallel layout system with its own
  primitives (as a React-to-PDF library would require).
- Directly reusable by 008-Performa-Invoicing without re-deciding the approach — the next feature
  that needs a printed document follows this ADR rather than independently evaluating PDF
  libraries again.
- Keeping the route outside `(dashboard)` means the document's print quality is never at risk of
  regressing because the dashboard layout's own markup changed — the two are fully decoupled.

### Negative

- Output fidelity depends on the staff member's own browser's print-to-PDF implementation rather
  than a server-controlled, byte-identical PDF renderer — acceptable at this project's internal,
  low-volume, single-organization scale, but would not suit a use case needing guaranteed
  pixel-identical output across viewers.
- The print route duplicates `(dashboard)/layout.tsx`'s three-line auth check rather than
  inheriting it, since it intentionally sits outside that layout — a small, deliberate repetition
  rather than a shared abstraction, accepted because the alternative (fighting the dashboard's own
  chrome with `@media print` overrides) is more fragile long-term.
- No server-side record of the exact PDF bytes a customer actually received is kept — only the
  data the document was rendered from. If a specific historical printout's exact pixels ever needed
  to be reproduced or audited, only the live re-render (from current data) is available, not a
  frozen artifact. Mitigated by `challan_lines`' own snapshot columns (product/UOM/price,
  ADR-independent — see `specs/007-challans/research.md`) already fixing everything the print view
  displays as of Challan creation time, so a re-render of an issued-or-accepted Challan reproduces
  the original printout's content even though no PDF file itself is stored.

## Alternatives Considered

**A React-to-PDF library (e.g. `@react-pdf/renderer`)** — Rejected. Introduces a new dependency
and a second, parallel primitive-based layout system (not real HTML/CSS) for a document simple
enough that standard CSS print rules already express correctly, including image placement for the
signature/stamp.

**Server-side headless-browser rendering to PDF (Puppeteer/Playwright)** — Rejected as
materially heavier infrastructure — a large serverless function bundle, meaningful cold-start cost,
and real timeout risk on Vercel's function platform — for no benefit over the browser's own
built-in print-to-PDF, at this business's internal, low-volume usage (a few hundred documents a
year across all customers).

**Imperative PDF-construction libraries (`pdf-lib`, `jsPDF`)** — Rejected as more code and more
fragile than describing the same layout in HTML/CSS, especially for positioning the signature/stamp
images correctly relative to text.

**Render the print view inside `(dashboard)/challans/[challanId]/print/` and hide the dashboard
chrome via `@media print` overrides** — Rejected in favor of a fully standalone route: coupling a
customer-facing printed document's correctness to the dashboard layout's markup staying reliably
print-hideable indefinitely is a worse long-term tradeoff than a small, explicit duplicated auth
check.

## References

- Feature Spec: `specs/007-challans/spec.md` (FR-005, User Story 1)
- Implementation Plan: `specs/007-challans/plan.md` (Constitution Check — where this decision was
  surfaced for consent)
- Research: `specs/007-challans/research.md` (the decision this ADR formalizes, including the
  auth-check duplication rationale)
- Master Spec: `specs/PRODUCT-OVERVIEW.md` § "Challans" and § "Invoicing, Payments & the Customer
  Ledger" (008's own printed-document requirements, expected to reuse this pattern)
- Related ADRs: [ADR-0003](0003-storage-access-via-server-only-signed-urls.md) (the signed-URL
  pattern this route reuses for the trade name's signature/stamp images — this ADR is about how a
  *document* is generated, not how its *images* are stored/read, which ADR-0003 already settled)
