# ADR-0009: "Today" for every business date is the Pakistan calendar date (Asia/Karachi), computed in TypeScript via `lib/dates.ts`

> **Scope**: A cross-cutting convention for how every feature decides "today": form defaults,
> "not in the future" validation, days-outstanding and ageing. 011 (Labour/Commission Ledger:
> weekly/monthly settlement windows), 012 (inventory "as of") and 013 (date-range reports) all
> depend on it. It introduces the shared helper, fixes the one place where the old behaviour
> rejected valid input (002), and lists the remaining non-conforming sites instead of changing
> them silently.

- **Status:** Accepted
- **Date:** 2026-09-24
- **Feature:** 010-production-batches (found there; fix applied to 002 at the user's request)
- **Context:** The business operates in Pakistan (PKT, UTC+5, no daylight saving). The app runs
  on Vercel (UTC) against Supabase Postgres (UTC `current_date`), and browser clocks are local.
  Until now, "today" was computed three different ways:
  1. `new Date().toISOString().slice(0, 10)`, the **UTC** date, used for form defaults in 7 places;
  2. 002's purchase validation, which compared against the **end of the current UTC day**
     (`endOfTodayUtc`);
  3. Postgres `current_date` (**UTC**) inside 4 SQL functions.

  Between 00:00 and 05:00 PKT, UTC is still on the previous calendar day. In that window (2) was
  a real bug: it **rejected today's Pakistan date as "in the future"** (reproduced 2026-09-24 with a
  mocked clock at 20:30Z, where purchase date 2026-09-25 was rejected). (1) and (3) silently
  produce **yesterday's** date. Business dates here are ledger-relevant (purchase dates, issue and
  completion dates, cheque dates, bounce reversals, ageing), so the calendar they belong to has to
  be one explicit, shared rule.

## Decision

1. **"Today" is the Pakistan calendar date** (`Asia/Karachi`), as a `YYYY-MM-DD` string, for
   every business date: defaults, "not in the future" checks, days outstanding, ageing "as of", and
   settlement periods.
2. **One helper, `lib/dates.ts`**, safe on both server and client (pure `Intl`, no server-only
   imports):
   - `todayInPakistan(): string`
   - `isNotAfterTodayInPakistan(value): boolean`, which compares `YYYY-MM-DD` strings
     lexicographically, with no timezone arithmetic on `Date` objects.
3. **The clock-dependent check lives in TypeScript (Zod), not SQL.** SQL functions enforce only
   rules that don't depend on the clock (e.g. issue ≥ purchase date, completion ≥ issue). A SQL
   function that must *stamp* a date should take it as a parameter from the app, computed with
   `todayInPakistan()`, rather than use `current_date`.
4. **Applied now:**
   - 010 (`lib/production-batches/*`, its forms);
   - 002's purchase validation (`lib/purchases/schema.ts`, replacing `endOfTodayUtc`) and the
     purchase form's default and `max` (`components/purchases/purchase-form.tsx`).
5. **Known non-conforming sites, not changed** (each is a small, separate fix; left for explicit
   approval because they touch shipped features 005–009 or require new migrations):

   | Site | Current | Effect during 00:00–05:00 PKT |
   |---|---|---|
   | `components/challans/challan-form.tsx:41` | UTC default | Challan date defaults to yesterday |
   | `components/customer-payments/customer-payment-form.tsx:21` | UTC default | Payment date defaults to yesterday |
   | `components/customer-pos/customer-po-form.tsx:43` | UTC default | PO date defaults to yesterday |
   | `components/customers/customer-form.tsx:256` | UTC default | Opening-balance date defaults to yesterday |
   | `components/performa-invoices/performa-invoice-form.tsx:40` | UTC default | Invoice date defaults to yesterday |
   | `lib/customer-ledger/ageing.ts:7` | UTC "as of" | Ageing buckets computed one day early |
   | `0007` `delete_unit_purchase` | `current_date` | Reversal movement dated yesterday |
   | `0007` `accept_challan` shortfall return | `current_date` | Return movement dated yesterday |
   | `0009` bounce reversal | `current_date` | Reversal credit dated yesterday |
   | `0007` one-time traded backfill | `current_date` | Historical, already applied; no action |

   None of these rejects valid input: the defaults are editable, and the SQL stamps are off by one
   day only in that 5-hour window. That's why they're listed rather than fixed here.

   **Deferred by user decision (2026-09-24):** these stay untouched for now and will be handled
   together in a dedicated cleanup. They're a narrow edge case in shipped, tested features, and
   fixing them now would reopen 007/009 without a specific need. New code (011 onward) must
   follow this ADR from the start.

## Consequences

### Positive

- One definition of "today" across the codebase. 011/012/013 import `lib/dates.ts` instead of
  re-deriving it, so settlement weeks, "as of" dates and report ranges use the same calendar.
- The 002 bug is gone: staff entering a purchase shortly after midnight are no longer told
  today's date is in the future.
- String comparison of `YYYY-MM-DD` avoids the whole class of `new Date("YYYY-MM-DD")`
  (UTC-midnight) parsing errors.

### Negative

- Hard-codes a single business time zone. If the business ever operates across time zones, this
  helper becomes the single place to change, but every stored date would need a revisit.
- The listed non-conforming sites remain until fixed, so for now the rule is "convention plus
  known exceptions", not "enforced everywhere".
- Moving SQL date stamps to app-supplied parameters requires new migrations for 0007/0009's
  functions (`CREATE OR REPLACE`, per ADR-0005's precedent of never editing an applied migration).

## Alternatives Considered

**Keep UTC everywhere** — Rejected. Business dates would be wrong for 5 hours every night, and
002's validation actively rejects valid input.

**Set the Postgres session or database timezone to Asia/Karachi** (`alter database … set timezone`)
— Rejected as the primary mechanism. It would fix `current_date` in SQL, but not the TypeScript
defaults or validation. It changes behaviour globally for a shared Supabase project, and it's
easy to lose on a project reset. It remains a possible complement for the SQL sites.

**Let the browser's local date decide** — Rejected. Server-side validation must agree with the
client, and the server runs in UTC. A single explicit zone is deterministic on both sides.

**A date library (date-fns-tz / Temporal polyfill)** — Rejected for now. `Intl.DateTimeFormat`
with `timeZone` covers the need with no new dependency.

## References

- `lib/dates.ts` (the helper)
- `lib/purchases/schema.ts`, `components/purchases/purchase-form.tsx` (002 fix)
- `lib/production-batches/schema.ts` (first consumer)
- `specs/010-production-batches/research.md` ("not in the future" decision, including the
  correction of an earlier wrong claim about 002's rule)
- Related ADRs: [ADR-0005](0005-inventory-movements-created-at-007-not-003b.md) (new migrations
  rather than edits, relevant when fixing the SQL sites), [ADR-0008](0008-production-batch-lifecycle-and-stock-split.md)
