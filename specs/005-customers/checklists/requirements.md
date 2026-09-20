# Specification Quality Checklist: Customers

**Purpose**: Validate specification completeness and quality before proceeding to planning
**Created**: 2026-09-20
**Feature**: [spec.md](../spec.md)

## Content Quality

- [x] No implementation details (languages, frameworks, APIs)
- [x] Focused on user value and business needs
- [x] Written for non-technical stakeholders
- [x] All mandatory sections completed

## Requirement Completeness

- [x] No [NEEDS CLARIFICATION] markers remain
- [x] Requirements are testable and unambiguous
- [x] Success criteria are measurable
- [x] Success criteria are technology-agnostic (no implementation details)
- [x] All acceptance scenarios are defined
- [x] Edge cases are identified
- [x] Scope is clearly bounded
- [x] Dependencies and assumptions identified

## Feature Readiness

- [x] All functional requirements have clear acceptance criteria
- [x] User scenarios cover primary flows
- [x] Feature meets measurable outcomes defined in Success Criteria
- [x] No implementation details leak into specification

## Notes

- All items pass on first validation pass. No spec revisions were required.
- This feature is flagged business-sensitive by the user, so — more than usual — the following
  scope calls are surfaced explicitly for confirmation before `/sp.plan`, rather than treated as
  settled:
  1. ~~Payment terms as a number of days, not free text.~~ **Superseded 2026-09-20**: payment
     terms are now captured as an expected min/max day *range*, not a single fixed integer —
     each customer's actual payment date fluctuates in practice (Habbitt 30-45 days, Chaseup
     90-120 days, ChaseValue/Kifayat ~45 days) and 009-customer-ledger uses the range only for
     ageing/reporting classification, never to block or flag an actual payment.
  2. **Opening balance is write-once.** Modeled as immutable after creation (correct via a new
     adjusting entry, never edit), by analogy with this system's existing "reverse, don't edit"
     ledger principle. Worth confirming this doesn't conflict with how staff actually expect to
     fix a data-entry mistake during the go-live migration window itself.
  3. **A customer-product mapping requires at least one of {item code, selling unit, default
     price}, not all three.** Chosen so a customer needing only a different selling unit (no
     distinct code, no fixed price), or only a fixed price (no code/UOM override), isn't forced to
     invent the others. Widened 2026-09-20 to include default price alongside item code/selling
     unit — see item 5.
  4. **At least one contact is required per customer.** Not stated explicitly in
     `specs/PRODUCT-OVERVIEW.md`'s Customers section (unlike Suppliers, where it is explicit) —
     carried over from 001's precedent as a reasonable default, not a confirmed business rule.
  5. ~~Customer-specific pricing is explicitly excluded from the customer-product mapping.~~
     **Superseded 2026-09-20**: item rates per customer are typically fixed in practice (e.g. Ball
     Fiber to Habbitt is consistently Rs 2600/unit unless renegotiated), so the mapping now
     includes an optional `default_price` — a pre-fill suggestion only. A PO in
     006-customer-purchase-orders still carries and stores its own authoritative price field,
     which staff can override at any time.
