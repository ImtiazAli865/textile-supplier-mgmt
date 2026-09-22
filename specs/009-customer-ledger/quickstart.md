# Quickstart: Customer Ledger

**Feature**: `009-customer-ledger` | **Date**: 2026-09-23

Extends the app already scaffolded for 001-008 — no new environment variables. Uses the same
Supabase project (Postgres + Auth). The new table and functions are added in
[`supabase/migrations/0009_customer_ledger.sql`](../../supabase/migrations/0009_customer_ledger.sql).

## Prerequisites

- Everything from [008's quickstart.md](../008-performa-invoicing/quickstart.md) (Node.js 20+, a
  Supabase project with `0001_init.sql` through `0008_performa_invoicing.sql` applied, a staff
  user in Supabase Auth) already set up.
- `0009_customer_ledger.sql` applied to the same Supabase project before testing this feature.
- A customer with an opening balance (005) and at least one Challan-acceptance credit (007) or
  Performa Invoice credit (008) already posted, so their ledger has more than one row to view.
- Ideally, one customer whose stored `payment_terms_max_days` is small (e.g. 15) and whose oldest
  unpaid credit is already older than that, to see the ageing view's "beyond expected range"
  classification without waiting.

## Local development

```bash
npm install
npm run dev
```

## Manual verification flow (matches spec acceptance scenarios)

1. Sign in with a staff user.
2. **View a customer's running-balance ledger** (User Story 1): Open a customer with an opening
   balance and at least one Challan or Performa Invoice credit → confirm every entry appears in
   date order with correct Debit/Credit columns and a running balance that's correct after each
   row, matching a manual sum. Open a customer with a Performa Invoice that spans two POs →
   confirm that row's PO Number column shows both POs joined (e.g. "PO-10284 / PO-10291"). Open a
   brand-new customer with no ledger activity → confirm an empty ledger with a zero balance, not
   an error. Apply a date-range filter → confirm only rows in range are listed but the running
   balance still carries forward correctly from before the filter's start.
3. **Record a customer payment** (User Story 2): From a customer's ledger, record a payment with a
   date, amount, cheque number, and bank name, leaving the invoice/PO reference blank → confirm it
   saves with status Received, exactly one new Debit ledger entry equal to the amount appears, and
   the balance decreases accordingly. Record a second payment, this time selecting a specific
   invoice/PO reference → confirm it saves and displays that reference. Try submitting with no
   amount or no customer → confirm a validation error. Record a payment larger than the current
   balance → confirm it's accepted without blocking.
4. **Reverse a bounced cheque** (User Story 3): Take a payment just recorded with status Received,
   mark it Bounced → confirm its status updates, a new Credit ledger entry equal to the original
   amount appears (dated today, not the original payment date), the original Debit entry is
   unchanged, and the balance is restored. Try changing that same payment's status again → confirm
   it's rejected. Mark a different Received payment Cleared → confirm no new ledger entry appears
   for it. Try marking that Cleared payment Bounced afterward → confirm it's rejected.
5. **Ageing and overdue status** (User Story 4): Open the ageing view for a customer with an old
   unpaid credit beyond their payment-terms maximum → confirm it's classified "beyond expected
   range," while a recent one is classified "within." Confirm nothing about recording a payment or
   viewing the ledger is blocked or altered by this classification.
6. **All-customers summary and export** (User Story 5): Open the all-customers summary → confirm
   each customer's current balance and overdue amount match what their individual ledger/ageing
   views show. Export a customer's ledger and the all-customers summary (PDF via the print route,
   CSV via the download) → confirm both match what's on screen, including any active date filter
   on the per-customer export.
7. **Immutability**: Confirm there is no way to edit or delete a ledger entry or a payment's
   amount/date/cheque number/bank name anywhere in the UI — only a payment's status can change,
   and only once.

## Tests

```bash
npm run test          # Vitest unit tests (schema + service functions, incl. FIFO ageing) — once wired in
npm run test:integration  # Server Actions against a real (test) Supabase project or `supabase start`'s local Postgres
```
