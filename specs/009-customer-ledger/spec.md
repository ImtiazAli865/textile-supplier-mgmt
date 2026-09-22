# Feature Specification: Customer Ledger

**Feature Branch**: `009-customer-ledger`
**Created**: 2026-09-23
**Status**: Draft
**Input**: User description: "Customer Ledger: present each customer's ledger_entries (opening balance from 005, Challan-acceptance credits from 007, Performa Invoice credits from 008) as a real running-balance view — Date | Invoice #/Description | PO Number | Debit | Credit | Balance, matching the manual Excel ledger's own layout. Add the missing piece: recording actual customer payments (cheques) — date, amount, cheque number, bank name, status (Received/Cleared/Bounced) — which post as Debit entries. A bounced cheque reverses via a new, separately visible Credit entry dated at the bounce-discovery date, never by editing the original entry; the cheque's own status simply changes to Bounced. Payments may optionally reference a specific invoice/PO or be recorded as an untied lump sum against the overall balance. Each customer's stored payment-terms range (from 005) classifies outstanding amounts as within or beyond the expected range for ageing/reporting only — it never blocks, rejects, or flags a payment. Also provide an all-customers summary list and PDF/Excel export. This feature is presentation-plus-payments-capture only: it never re-posts or duplicates a credit that 007 or 008 already posted."

## User Scenarios & Testing *(mandatory)*

<!--
  IMPORTANT: User stories should be PRIORITIZED as user journeys ordered by importance.
  Each user story/journey must be INDEPENDENTLY TESTABLE - meaning if you implement just ONE of them,
  you should still have a viable MVP (Minimum Viable Product) that delivers value.
-->

### User Story 1 - View a customer's running-balance ledger (Priority: P1)

An internal staff member opens a single customer's ledger and sees every posted entry — the
opening balance, every Challan-acceptance or Performa Invoice credit, and every payment debit —
listed chronologically with a running balance, exactly matching the manual Excel ledger's own
Date / Invoice #/Description / PO Number / Debit / Credit / Balance layout, with the current
balance shown prominently.

**Why this priority**: This is the entire reason the feature exists — 005, 007, and 008 have
already been writing to `ledger_entries` independently for three features running, with no way to
see it as a coherent per-customer account. Nothing else in this feature has value without this
view existing first.

**Independent Test**: Can be fully tested by taking a customer with an opening balance (005), at
least one Challan-acceptance or Performa Invoice credit (007/008), opening their ledger view, and
confirming: every entry appears exactly once, in date order, each row correctly labeled Debit or
Credit, the running balance after each row is the correct cumulative sum, and the final balance
equals a manual sum of all that customer's entries.

**Acceptance Scenarios**:

1. **Given** a customer with an opening-balance entry and two later credit entries (one from a
   Challan acceptance, one from a Performa Invoice), **When** the staff member opens that
   customer's ledger, **Then** all three entries appear in date order with correct Debit/Credit
   columns and a running balance that is correct after each row.
2. **Given** a ledger entry whose source is a Challan acceptance, **When** it is displayed,
   **Then** its row shows the Challan's referenced PO number and a description identifying it as
   that Challan.
3. **Given** a ledger entry whose source is a Performa Invoice that itself covers more than one
   purchase order, **When** it is displayed, **Then** its PO Number column shows all of that
   invoice's covered PO numbers together (e.g. "PO-10284 / PO-10291"), derived at display time —
   never a single truncated PO number and never a value stored separately from the invoice's own
   lines.
4. **Given** a customer with no ledger entries at all (no opening balance recorded, nothing
   posted yet), **When** the staff member opens their ledger, **Then** the view shows an empty
   ledger with a zero balance rather than an error.
5. **Given** a customer's ledger view, **When** the staff member applies a date-range filter,
   **Then** only entries within that range are listed, and the balance shown for the filtered
   view is still the customer's correct running balance carried into that range (not reset to
   zero at the filter's start).

---

### User Story 2 - Record a customer payment (cheque) (Priority: P2)

An internal staff member records a payment received from a customer — date, amount, cheque
number, bank name, and status (defaulting to Received) — optionally noting which invoice or
purchase order it relates to, or leaving it as an untied lump-sum payment against the customer's
overall balance. Recording it immediately posts a Debit entry to that customer's ledger and
reduces their balance.

**Why this priority**: This is the concrete missing piece the manual Excel ledger already tracked
(Credit = delivery/invoice, Debit = cheque received) that no prior feature captures — without it,
User Story 1's ledger is permanently incomplete on the Debit side.

**Independent Test**: Can be fully tested by taking a customer with an existing balance, recording
a payment against them with a cheque number, bank, and amount, and confirming: the payment record
saves with status Received, exactly one new Debit ledger entry equal to the payment amount
appears for that customer, and the customer's running balance decreases by that amount.

**Acceptance Scenarios**:

1. **Given** a customer with an outstanding balance, **When** the staff member records a payment
   with a date, amount, cheque number, and bank name, **Then** the payment saves with status
   Received and exactly one Debit ledger entry equal to the payment amount is posted, dated to
   the payment's entered date.
2. **Given** the payment-recording form, **When** the staff member leaves the invoice/PO
   reference blank, **Then** the payment still saves successfully as an untied lump-sum payment
   against the customer's overall balance.
3. **Given** the payment-recording form, **When** the staff member selects a specific invoice or
   PO to associate the payment with, **Then** that reference is stored and shown alongside the
   payment for informational purposes only — it never validates the amount against that
   document's own total or blocks the payment if it doesn't match.
4. **Given** the payment-recording form, **When** the staff member submits without a customer, a
   date, or a positive amount, **Then** the system rejects the submission with a clear validation
   error.
5. **Given** a payment amount larger than the customer's current outstanding balance, **When**
   the staff member submits it, **Then** the system accepts it without warning or blocking — the
   resulting balance may go into the customer's favor.
6. **Given** a customer whose stored payment-terms range would classify this payment's timing as
   "beyond the expected range," **When** the staff member records the payment, **Then** it is
   accepted exactly the same as any other payment — the classification affects ageing/reporting
   only and never blocks or flags the payment itself.

---

### User Story 3 - Reverse a bounced cheque (Priority: P3)

When a customer's cheque bounces after being recorded as Received, an internal staff member
marks that payment's status as Bounced. The system immediately posts a new, separately visible
Credit entry equal to the original payment amount, dated to the day the bounce was discovered —
restoring the customer's balance to what it was before the payment, without ever editing or
deleting the original Debit entry.

**Why this priority**: Depends on User Story 2 existing (there must be a Received payment to
bounce), and is less frequent than recording payments themselves, but is essential for the
ledger to stay an honest audit trail rather than silently wrong once any cheque bounces.

**Independent Test**: Can be fully tested by taking a payment already recorded with status
Received, marking it Bounced, and confirming: the payment's status is now Bounced, a new Credit
ledger entry equal to the original payment amount appears (dated to today, not backdated to the
original payment date), the original Debit entry is unchanged, and the customer's running balance
is restored to its pre-payment level.

**Acceptance Scenarios**:

1. **Given** a payment recorded with status Received, **When** the staff member marks it
   Bounced, **Then** its status updates to Bounced and exactly one new Credit ledger entry equal
   to the original payment's amount is posted, dated to the date the status was changed.
2. **Given** a payment that has just been marked Bounced, **When** the staff member views the
   customer's ledger, **Then** both the original Debit entry and the new reversing Credit entry
   are visible as separate rows — the original entry is never edited, hidden, or removed.
3. **Given** a payment already marked Bounced, **When** the staff member attempts to change its
   status again, **Then** the system rejects the change — Bounced is a final state for that
   payment.
4. **Given** a payment marked Cleared, **When** the staff member views it, **Then** no ledger
   entry beyond the original Debit was ever posted for it — Cleared has no ledger effect, since
   the Debit already posted the moment the payment was recorded as Received.
5. **Given** a payment already marked Cleared, **When** the staff member attempts to mark it
   Bounced, **Then** the system rejects the change — Cleared is also a final state.

---

### User Story 4 - See ageing and overdue status across a customer's balance (Priority: P4)

An internal staff member views a customer's outstanding entries classified by whether they fall
within or beyond that customer's expected payment-terms range, so overdue amounts are visible at
a glance without manually comparing dates.

**Why this priority**: Valuable for collections follow-up, but depends on User Stories 1-3
already producing a correct, complete ledger to classify — it adds a lens on top rather than new
data.

**Independent Test**: Can be fully tested by taking a customer with a known payment-terms range
and an outstanding credit entry older than that range's maximum, opening the ageing view, and
confirming that entry is shown as beyond the expected range while a more recent one is shown as
within it.

**Acceptance Scenarios**:

1. **Given** a customer with a stored payment-terms range and an unpaid credit entry older than
   that range's maximum days, **When** the staff member views that customer's ageing breakdown,
   **Then** that entry is classified as beyond the expected range.
2. **Given** the same customer with a more recent unpaid credit entry still within the range,
   **When** viewed, **Then** that entry is classified as within the expected range.
3. **Given** a customer's ageing view, **When** the staff member reads it, **Then** it is
   presented as informational classification only — no action is blocked, no payment is rejected,
   and no visual "error" state is implied by a beyond-range entry.

---

### User Story 5 - View and export a summary across all customers (Priority: P5)

An internal staff member opens a single list showing every customer's current balance and
overdue amount side by side, without opening each customer's ledger individually, and exports
either that summary or an individual customer's ledger to PDF or Excel.

**Why this priority**: A convenience and reporting layer on top of the per-customer ledger — real
business value, but the last piece needed since every other story already works customer-by-
customer.

**Independent Test**: Can be fully tested by taking several customers with different balances,
opening the all-customers summary list, confirming each shows the correct current balance, and
exporting it to confirm the exported file matches what's on screen.

**Acceptance Scenarios**:

1. **Given** multiple customers each with their own ledger history, **When** the staff member
   opens the all-customers summary, **Then** each customer's current balance and overdue amount
   are shown correctly, matching what their individual ledger views would show.
2. **Given** a customer's individual ledger view or the all-customers summary, **When** the staff
   member exports it, **Then** a PDF or Excel file is produced matching the currently displayed
   data (including any active filters).

---

### Edge Cases

- What happens when a payment is recorded without referencing any invoice, PO, or Challan? Allowed
  — it posts as an untied lump-sum Debit against the customer's overall balance (User Story 2,
  Acceptance Scenario 2), matching how the business's real Habbitt ledger already works.
- What happens if a staff member tries to reference an invoice or PO belonging to a *different*
  customer than the payment's own customer when recording a payment? Rejected — a payment's
  optional reference must belong to the same customer the payment is being recorded against.
- What happens when a payment's amount exceeds the customer's current outstanding balance? Allowed
  without warning or blocking (User Story 2, Acceptance Scenario 5) — the balance may go into the
  customer's favor; this feature makes no judgment about that.
- What happens when a cheque already marked Cleared or Bounced needs its status changed again
  (e.g. a rare bank-side reversal after clearing)? Out of scope — both Cleared and Bounced are
  final states for a recorded payment (User Story 3, Acceptance Scenarios 3 and 5); a genuine
  correction in that rare case would need a future capability, not a status change here.
- What happens to the reversing Credit entry's date when a cheque bounces? It is dated to the day
  the bounce is discovered/recorded, never backdated to the original payment's date — the original
  Debit was correct at the time it was posted; the reversal documents a new, later event.
- What happens when a customer has no payment-terms range set (both min and max at their default
  of 0 days)? Every outstanding entry is classified as beyond the expected range immediately,
  consistent with a 0-day expectation — this is a display classification only and changes nothing
  about the entry itself.
- What happens when the all-customers summary is opened for a business with customers that have
  zero ledger activity at all? Those customers show a zero balance, not an error or omission.
- What happens when a staff member tries to edit or delete an already-recorded payment's amount,
  date, cheque number, or bank name? Rejected — once created, only a payment's status may change
  (Received to Cleared or Bounced), and only once; every other field is permanently fixed, the
  same immutability principle already applied to ledger entries themselves and to opening balances
  (005).
- What happens when two payments are recorded for the same customer on the same day? Both are
  recorded and displayed as separate rows — there is no dedication or merging of same-day entries.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST display a per-customer ledger view listing every one of that customer's
  ledger entries (opening balance, Challan-acceptance credits, Performa Invoice credits, payment
  debits, and bounce-reversal credits) in chronological order, each row showing its date,
  invoice number/description, associated PO number(s) where applicable, Debit amount, Credit
  amount, and the running balance after that row.
- **FR-002**: System MUST derive the PO Number and Invoice #/Description columns for each ledger
  row from that entry's recorded source at display time — never stored redundantly on the ledger
  entry itself — and MUST show every purchase order covered by a Performa Invoice entry that
  spans multiple POs, not just one.
- **FR-003**: System MUST show a customer's current balance, computed live as the sum of all their
  ledger entries, prominently on that customer's ledger view.
- **FR-004**: System MUST allow a staff member to record a customer payment with a date, a
  positive amount, a cheque number, a bank name, and a status defaulting to Received, and MUST
  immediately post exactly one Debit ledger entry equal to the payment amount, dated to the
  payment's entered date.
- **FR-005**: System MUST allow a recorded payment to optionally reference a specific invoice or
  purchase order belonging to the same customer, for display purposes only, and MUST allow a
  payment to be recorded with no such reference at all (an untied lump-sum payment).
- **FR-006**: System MUST reject a payment whose optional invoice/PO reference belongs to a
  customer other than the payment's own customer.
- **FR-007**: System MUST allow a staff member to change a Received payment's status to Cleared
  (posting no ledger entry) or to Bounced (posting exactly one new Credit ledger entry equal to
  the original payment's amount, dated to the date of that status change), and MUST prevent any
  further status change once a payment is Cleared or Bounced.
- **FR-008**: System MUST NOT provide any way to edit or delete a ledger entry, or a payment's
  amount, date, cheque number, or bank name, once created — every correction happens only through
  a new, separately visible ledger entry.
- **FR-009**: System MUST classify each customer's outstanding ledger entries as "within expected
  payment-terms range" or "beyond expected payment-terms range" — a binary classification driven
  solely by that customer's stored maximum payment-terms days (an entry is "beyond" once its age
  exceeds that maximum) — for ageing/reporting display only; this classification MUST NOT block,
  reject, warn against, or otherwise alter any payment or ledger entry. The customer's stored
  minimum payment-terms days MUST also be shown alongside each open entry as context (e.g. "Expected
  within X-Y days"), but plays no role in the within/beyond determination itself.
- **FR-010**: System MUST allow a staff member to filter a customer's ledger view by date range,
  and MUST keep the running balance shown correct for the filtered view (carried forward from
  entries before the filter's start, not reset to zero).
- **FR-011**: System MUST display an all-customers summary list showing, for every customer, their
  current balance and overdue amount, without requiring the staff member to open each customer's
  individual ledger.
- **FR-012**: System MUST allow exporting a customer's ledger view or the all-customers summary to
  PDF and to Excel, matching what is currently displayed on screen, including any active filters.
- **FR-013**: System MUST require staff to be authenticated before viewing any ledger, recording
  any payment, or changing any payment's status.
- **FR-014**: System MUST record and display when each payment was recorded, by whom, and when its
  status was last changed, by whom.
- **FR-015**: System MUST NOT re-post or duplicate a ledger credit that 007 (Challan acceptance)
  or 008 (Performa Invoice creation) has already posted — this feature only ever reads those
  entries and adds new ones for payments and bounce reversals.

### Key Entities

- **Ledger Entry** (from 005; read by this feature for display, written by this feature only for
  payment Debits and bounce-reversal Credits): The append-only per-customer posting this feature
  presents as a running-balance view. This feature never edits or deletes an existing row.
- **Customer Payment** (new): One recorded cheque/payment against a customer. Attributes:
  customer (reference), payment date, amount, cheque number, bank name, status
  (Received/Cleared/Bounced, starting at Received and final once Cleared or Bounced), an optional
  reference to a specific invoice or PO (display-only, same customer required), created timestamp
  and staff user, and the timestamp/staff user of its last status change. Its Received status
  posts one Ledger Entry Debit; its transition to Bounced posts one additional Ledger Entry
  Credit; its transition to Cleared posts nothing further.
- **Customer** (from 005; read-only in this feature): Supplies the legal/display name shown per
  ledger; the payment-terms maximum days, which alone drives the within/beyond classification of
  outstanding entries; and the payment-terms minimum days, shown alongside each open entry as
  context only (FR-009).
- **Challan** (from 007; read-only in this feature): Supplies the PO number and description shown
  on a ledger row whose source is a Challan-acceptance credit.
- **Performa Invoice** (from 008; read-only in this feature): Supplies the invoice number,
  description, and the full set of covered PO numbers (derived from its own lines, which may span
  multiple purchase orders) shown on a ledger row whose source is a Performa Invoice credit.
- **Staff User**: An authenticated internal user who views ledgers, records payments, and changes
  payment statuses. This feature introduces no distinct roles/permission levels, consistent with
  every prior feature in this project.

## Assumptions

- A customer payment is a new kind of record this feature introduces, separate from the shared
  ledger entries table — recording one posts into that shared ledger the same way a Challan
  acceptance (007) or a Performa Invoice (008) already does, rather than adding payment-specific
  fields onto the ledger entries themselves.
- Bounce reversal is dated to the day the bounce is discovered/recorded, not backdated to the
  original payment's date — the original Debit was correct when posted; the reversal documents a
  separate, later event, matching this project's established "never edit, always post a new
  visible correcting entry" principle (already applied to opening balances in 005).
- A recorded payment's status has exactly one allowed transition path (Received to Cleared, or
  Received to Bounced), and both Cleared and Bounced are final. This is a deliberate, narrow
  exception to this project's usual full immutability of posted records (Challans and Performa
  Invoices have no update path at all) — justified because a cheque's real-world status genuinely
  changes after it's first recorded, unlike a completed delivery or invoice.
- Clearing a payment (status Received to Cleared) has no ledger effect of its own — the Debit
  already posted the moment the payment was recorded as Received; Cleared is purely a status label
  confirming the bank has honored it.
- Opening-balance capture itself remains entirely 005's responsibility (recorded at customer
  creation) — this feature only needs to surface that already-posted entry as the first
  chronological row in a customer's ledger; it introduces no new opening-balance entry mechanism
  of its own.
- A payment's optional invoice/PO reference is informational only — it is never validated against
  that document's own outstanding amount, matching how this project already treats each
  customer's stored payment-terms range as classification-only, never enforcement (005).
- Payment-terms-range classification (within/beyond expected range) applies only to unpaid
  (outstanding) portions of a customer's balance for ageing/reporting purposes — it has no effect
  on whether a payment can be recorded, matching the business context's explicit instruction that
  this must never block or flag a payment as wrong.
- Currency, rounding, and authentication conventions are unchanged from prior features (PKR,
  2-decimal rounding, Supabase Auth session required).

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A customer's displayed running balance matches the sum of all their ledger entries
  with zero discrepancy, 100% of the time.
- **SC-002**: A staff member can record a customer payment (cheque) in under 1 minute.
- **SC-003**: Marking a payment Bounced fully reflects the reversal — updated payment status and
  restored balance — within that same action, with no separate step required, 100% of the time.
- **SC-004**: 100% of ageing classifications (within/beyond expected payment-terms range) are
  computed automatically from each customer's stored range, with zero manual flagging required.
- **SC-005**: A staff member can see every customer's current balance and overdue amount from a
  single all-customers view, without opening any individual customer's ledger.
- **SC-006**: Zero ledger entries or payment records are ever edited or deleted after creation —
  every correction, including every bounced-cheque reversal, appears as a new, separately visible
  entry, 100% of the time.
- **SC-007**: An exported ledger or summary (PDF or Excel) matches the on-screen data, including
  active filters, 100% of the time.
- **SC-008**: The manual Excel customer ledger process is fully retired for day-to-day balance
  and payment tracking once this feature is in use.
