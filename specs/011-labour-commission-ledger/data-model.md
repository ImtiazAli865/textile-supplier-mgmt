# Data Model: Labour / Commission Ledger (Contractor Khata)

**Feature**: `011-labour-commission-ledger` | **Date**: 2026-09-29
**Migration**: `supabase/migrations/0011_labour_commission_ledger.sql` (new; 0001–0010 are not
edited)

Four new tables, one helper, six new write functions, four guard triggers, and a redefinition of
010's `complete_production_batch` with the same signature. `contractors` and `production_batches`
(0010) get no new columns. Decisions and alternatives are in [research.md](./research.md); the
architecture is [ADR-0010](../../history/adr/0010-contractor-payment-allocation-and-settlement-lock.md).

## Entity overview

```text
contractors 1 ──< contractor_ledger_entries        (insert-only; balance = Σ signed amount)
            1 ──< contractor_payments 1 ──< contractor_payment_allocations >── 1 production_batches
            1 ──< contractor_settlements           (frozen figures; current or reopened)

production_batches ──(on complete)──> contractor_ledger_entries (credit, source 'production_batch')
contractor_payments ──(on record)───> contractor_ledger_entries (debit,  source 'payment')
                    ──(on reverse)──> contractor_ledger_entries (credit, source 'payment_reversal')
```

Sign convention: **credit = the business owes the contractor more; debit = owes less**. Signed
amount = `+amount` for credit, `−amount` for debit. Balance > 0 is owed to the contractor; < 0 is
an advance.

## Locking rules (apply to every function below)

1. **Global order**: `contractors` row → `contractor_payments` row (reversal only) →
   `production_batches` rows in ascending `id`. No function takes these in any other order.
2. **The contractor row is locked first** (`select … from contractors where id = … for update`)
   by every function that writes a ledger entry, payment, allocation, settlement or reopen:
   `complete_production_batch`, `record_contractor_payment`, `reverse_contractor_payment`,
   `record_contractor_opening_balance`, `record_contractor_adjustment`,
   `settle_contractor_period`, `reopen_contractor_settlement`.
3. **Everything that decides the outcome is read after that lock**, in statements that begin after
   the `for update` returns: `contractor_settled_until(...)`, the settlement's figures, a batch's
   unpaid amount, the existing opening balance, the earliest entry date. (Postgres READ COMMITTED:
   each statement sees everything committed before it starts, so it sees the work of whichever
   transaction held the lock before us.)
4. Therefore, for one contractor:
   - payment vs payment: serialised; the second sees the first's allocations;
   - payment vs settlement: whichever locks first finishes first; if the payment was first, the
     settlement's figures include it; if the settlement was first, the payment re-reads the new
     settled date and is refused when dated on or before it;
   - completion vs settlement: same as payment vs settlement.
5. `update_production_batch` / `void_production_batch` (0010, unchanged) lock only the batch and
   lots, never a contractor, so they cannot deadlock with rule 1.

## `contractor_ledger_entries` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `contractor_id` | uuid not null → `contractors` | |
| `entry_date` | date not null | business date (ADR-0009) |
| `type` | text not null | `in ('credit','debit')` |
| `amount` | numeric(12,2) not null | `> 0` |
| `source_type` | text not null | `in ('production_batch','payment','payment_reversal','opening_balance','adjustment')` |
| `source_id` | uuid null | required for the first three, null for the last two; no FK (polymorphic, as 005) |
| `description` | text null | required, non-blank, for `adjustment` (the reason) |
| `created_at` | timestamptz not null | `now()` |
| `created_by` | uuid not null → `auth.users` | FR-034 |

```sql
create table contractor_ledger_entries (
  id            uuid primary key default gen_random_uuid(),
  contractor_id uuid not null references contractors (id),
  entry_date    date not null,
  type          text not null check (type in ('credit', 'debit')),
  amount        numeric(12, 2) not null check (amount > 0),
  source_type   text not null check (source_type in
                  ('production_batch', 'payment', 'payment_reversal', 'opening_balance', 'adjustment')),
  source_id     uuid,
  description   text,
  created_at    timestamptz not null default now(),
  created_by    uuid not null references auth.users (id),
  constraint contractor_ledger_entries_source_id_check check (
    (source_type in ('production_batch', 'payment', 'payment_reversal')) = (source_id is not null)
  ),
  constraint contractor_ledger_entries_adjustment_reason_check check (
    source_type <> 'adjustment' or (description is not null and btrim(description) <> '')
  )
);

-- One earning per batch, one debit and at most one reversal per payment.
create unique index idx_contractor_ledger_entries_source
  on contractor_ledger_entries (source_type, source_id)
  where source_type in ('production_batch', 'payment', 'payment_reversal');
-- One opening balance per contractor (FR-020).
create unique index idx_contractor_ledger_entries_opening
  on contractor_ledger_entries (contractor_id)
  where source_type = 'opening_balance';
create index idx_contractor_ledger_entries_contractor_date
  on contractor_ledger_entries (contractor_id, entry_date, created_at);
```

Immutable: `trg_contractor_ledger_entries_immutable` (`BEFORE UPDATE OR DELETE`, raises
`IMMUTABLE_RECORD`).

## `contractor_payments` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `contractor_id` | uuid not null → `contractors` | |
| `payment_date` | date not null | ≤ today (checked in function) |
| `amount` | numeric(12,2) not null | `> 0` |
| `note` | text null | |
| `status` | text not null default `'active'` | `in ('active','reversed')` |
| `reversal_reason` / `reversed_at` / `reversed_by` | text / timestamptz / uuid → `auth.users` | all null while active; all set (reason non-blank) when reversed |
| `created_at` / `created_by` | | FR-034 |

```sql
create table contractor_payments (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid not null references contractors (id),
  payment_date    date not null,
  amount          numeric(12, 2) not null check (amount > 0),
  note            text,
  status          text not null default 'active' check (status in ('active', 'reversed')),
  reversal_reason text,
  reversed_at     timestamptz,
  reversed_by     uuid references auth.users (id),
  created_at      timestamptz not null default now(),
  created_by      uuid not null references auth.users (id),
  constraint contractor_payments_reversal_fields_check check (
    (status = 'active' and reversal_reason is null and reversed_at is null and reversed_by is null)
    or
    (status = 'reversed' and reversal_reason is not null and btrim(reversal_reason) <> ''
      and reversed_at is not null and reversed_by is not null)
  )
);
create index idx_contractor_payments_contractor_date on contractor_payments (contractor_id, payment_date desc);
```

Guard: `trg_contractor_payments_guard` (`BEFORE UPDATE OR DELETE`): delete raises
`IMMUTABLE_RECORD`; update raises unless `old.status = 'active' and new.status = 'reversed'` and
`id, contractor_id, payment_date, amount, note, created_at, created_by` are all unchanged. This
makes reversal one-way at the database level (ADR-0010 §4).

## `contractor_payment_allocations` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `payment_id` | uuid not null → `contractor_payments` | |
| `batch_id` | uuid not null → `production_batches` | |
| `amount` | numeric(12,2) not null | `> 0` |
| | | `unique (payment_id, batch_id)` |

```sql
create table contractor_payment_allocations (
  id         uuid primary key default gen_random_uuid(),
  payment_id uuid not null references contractor_payments (id),
  batch_id   uuid not null references production_batches (id),
  amount     numeric(12, 2) not null check (amount > 0),
  constraint contractor_payment_allocations_unique unique (payment_id, batch_id)
);
create index idx_contractor_payment_allocations_batch on contractor_payment_allocations (batch_id);
```

Triggers:
- `trg_contractor_payment_allocations_immutable` (`BEFORE DELETE OR UPDATE`, raises
  `IMMUTABLE_RECORD`).
- `trg_contractor_payment_allocations_guard` (`BEFORE INSERT OR UPDATE`) — the over-allocation
  backstop from ADR-0010 §4. It is declared for UPDATE as well so it still protects if the
  immutability trigger is ever removed:

```sql
create or replace function contractor_payment_allocations_guard()
returns trigger language plpgsql as $$
declare
  v_batch production_batches%rowtype;
  v_payment_contractor uuid;
  v_allocated numeric;
begin
  select * into v_batch from production_batches where id = new.batch_id for update;
  select contractor_id into v_payment_contractor from contractor_payments where id = new.payment_id;
  if v_batch.status <> 'completed' then
    raise exception 'BATCH_NOT_COMPLETED:%', v_batch.batch_number;
  end if;
  if v_batch.contractor_id <> v_payment_contractor then
    raise exception 'BATCH_OTHER_CONTRACTOR:%', v_batch.batch_number;
  end if;
  -- Only ACTIVE payments count: a reversed payment frees its batches immediately.
  select coalesce(sum(a.amount), 0) into v_allocated
  from contractor_payment_allocations a
  join contractor_payments p on p.id = a.payment_id
  where a.batch_id = new.batch_id and p.status = 'active' and a.id <> new.id;
  if v_allocated + new.amount > v_batch.labour_cost then
    raise exception 'OVER_ALLOCATED:%', v_batch.batch_number;
  end if;
  return new;
end;
$$;
```

## `contractor_settlements` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `contractor_id` | uuid not null → `contractors` | |
| `period_start` / `period_end` | date not null | `period_end >= period_start` |
| `opening_balance` / `earned` / `paid` / `adjustments` / `closing_balance` | numeric(12,2) not null | `earned >= 0`; `closing = opening + earned − paid + adjustments` |
| `note` | text null | |
| `settled_at` / `settled_by` | timestamptz / uuid | |
| `reopened_at` / `reopened_by` / `reopen_reason` | | all null (current) or all set (reopened) |

```sql
create table contractor_settlements (
  id              uuid primary key default gen_random_uuid(),
  contractor_id   uuid not null references contractors (id),
  period_start    date not null,
  period_end      date not null,
  opening_balance numeric(12, 2) not null,
  earned          numeric(12, 2) not null check (earned >= 0),
  paid            numeric(12, 2) not null,
  adjustments     numeric(12, 2) not null,
  closing_balance numeric(12, 2) not null,
  note            text,
  settled_at      timestamptz not null default now(),
  settled_by      uuid not null references auth.users (id),
  reopened_at     timestamptz,
  reopened_by     uuid references auth.users (id),
  reopen_reason   text,
  constraint contractor_settlements_period_check check (period_end >= period_start),
  constraint contractor_settlements_figures_check check (
    closing_balance = opening_balance + earned - paid + adjustments
  ),
  constraint contractor_settlements_reopen_fields_check check (
    (reopened_at is null and reopened_by is null and reopen_reason is null)
    or
    (reopened_at is not null and reopened_by is not null
      and reopen_reason is not null and btrim(reopen_reason) <> '')
  )
);
-- At most one CURRENT settlement starting on a given day per contractor: no overlaps.
create unique index idx_contractor_settlements_current_start
  on contractor_settlements (contractor_id, period_start) where reopened_at is null;
create index idx_contractor_settlements_contractor_end
  on contractor_settlements (contractor_id, period_end desc);
```

(`paid` can be negative only if a period's reversals exceed its payments — a payment in an earlier
period reversed in this one. That is correct and shown as such.)

Guard: `trg_contractor_settlements_guard` (`BEFORE UPDATE OR DELETE`): delete raises; update
raises unless `old.reopened_at is null`, the three reopen columns are set, and every other column
is unchanged.

## Helper: `contractor_settled_until`

```sql
-- Caller MUST already hold the contractor row lock (see Locking rules).
create or replace function contractor_settled_until(p_contractor_id uuid)
returns date language sql stable as $$
  select max(period_end) from contractor_settlements
  where contractor_id = p_contractor_id and reopened_at is null;
$$;
```

## Functions

Every function raises `'CODE: …'` or `'CODE:<value>'` messages mapped to friendly errors in
`lib/contractor-ledger/service.ts` (contracts/server-actions.md). `p_today` is
`todayInPakistan()` from the service layer (research.md).

### `complete_production_batch` (REDEFINED, signature unchanged from 0010)

Lock order and additions only; every other line is copied verbatim from 0010.

```sql
  -- (input guards unchanged)
  select contractor_id into v_contractor_id from production_batches where id = p_id;   -- no lock
  if not found then raise exception 'NOT_FOUND: batch % does not exist', p_id; end if;
  perform 1 from contractors where id = v_contractor_id for update;                    -- 1. contractor
  select * into v_batch from production_batches where id = p_id for update;             -- 2. batch
  if v_batch.contractor_id <> v_contractor_id then
    raise exception 'BATCH_CONTRACTOR_CHANGED: the batch contractor changed; try again';
  end if;
  -- (status / completion-date / returned-weight checks unchanged)
  v_settled_until := contractor_settled_until(v_batch.contractor_id);                   -- after lock
  if v_settled_until is not null and p_completion_date <= v_settled_until then
    raise exception 'PERIOD_SETTLED:%', v_settled_until;
  end if;
  -- (cost computation, inventory_movements insert, recompute, update production_batches unchanged)
  insert into contractor_ledger_entries
    (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
  values
    (v_batch.contractor_id, p_completion_date, 'credit', v_labour, 'production_batch', p_id,
     'Batch ' || v_batch.batch_number, p_user_id);
```

Backfill in the same migration (no-op on the live DB, which had 0 batches on 2026-09-29):

```sql
insert into contractor_ledger_entries
  (contractor_id, entry_date, type, amount, source_type, source_id, description, created_by)
select b.contractor_id, b.completion_date, 'credit', b.labour_cost, 'production_batch', b.id,
       'Batch ' || b.batch_number, b.completed_by
from production_batches b
where b.status = 'completed'
  and not exists (select 1 from contractor_ledger_entries e
                  where e.source_type = 'production_batch' and e.source_id = b.id);
```

### `record_contractor_payment(p_contractor_id, p_payment_date, p_amount, p_note, p_allocations jsonb, p_today, p_user_id) returns uuid`

1. Guards: amount > 0 (`INVALID_AMOUNT`); date not null and ≤ `p_today` (`INVALID_DATE`);
   `p_allocations` is a JSON array; every element has a `batch_id` and an `amount` > 0
   (`INVALID_ALLOCATION`); no duplicate `batch_id` (`DUPLICATE_BATCH`).
2. **Lock** `contractors` row (`CONTRACTOR_NOT_FOUND` if missing). Inactive is allowed (US2-8).
3. `contractor_settled_until` → `PERIOD_SETTLED:<date>` if `p_payment_date <= it`.
4. **Lock** the distinct batch rows: `select … from production_batches where id = any(v_ids)
   order by id for update`.
5. Per allocation, in batch-id order: `BATCH_NOT_FOUND`, `BATCH_NOT_COMPLETED:<no>`,
   `BATCH_OTHER_CONTRACTOR:<no>`, `BATCH_COMPLETED_AFTER_PAYMENT:<no>` (completion_date >
   payment_date), then unpaid = `labour_cost` − Σ active allocations (read now, under the locks) →
   `ALLOCATION_EXCEEDS_UNPAID:<no>:<unpaid>`.
6. Σ allocations > `p_amount` → `ALLOCATIONS_EXCEED_PAYMENT`.
7. Insert the payment (`status 'active'`), then the allocations (the guard trigger re-checks each),
   then one debit ledger entry (`source 'payment'`, amount = full payment, date = payment date,
   description `'Cash payment'` or the note). Return the payment id.

### `reverse_contractor_payment(p_payment_id, p_reason, p_today, p_user_id) returns void`

1. Guard: reason non-blank (`REASON_REQUIRED`).
2. Read the payment's `contractor_id` without a lock (`NOT_FOUND`).
3. **Lock** contractor → **lock** the payment row → **lock** its allocated batches ordered by id.
4. `status <> 'active'` → `PAYMENT_ALREADY_REVERSED`.
5. `v := contractor_settled_until(...)`: `payment_date <= v` → `PAYMENT_IN_SETTLED_PERIOD:<v>`;
   `p_today <= v` → `PERIOD_SETTLED:<v>` (FR-019).
6. Update the payment to `reversed` (reason, `now()`, user); insert a credit entry
   (`source 'payment_reversal'`, `source_id` = payment id, amount = payment amount, date =
   `p_today`, description `'Reversal: ' || reason`).

### `record_contractor_opening_balance(p_contractor_id, p_direction, p_amount, p_entry_date, p_today, p_user_id) returns void`

`p_direction in ('owed','advance')` → credit / debit.
1. Guards: direction, amount > 0, date ≤ `p_today`.
2. **Lock** contractor.
3. A current settlement exists (`contractor_settled_until` not null) →
   `OPENING_BALANCE_AFTER_SETTLEMENT` (FR-020; message tells staff to post an adjustment).
4. An opening entry exists → `OPENING_BALANCE_EXISTS`.
5. `min(entry_date)` of the contractor's entries < `p_entry_date` →
   `OPENING_BALANCE_AFTER_FIRST_ENTRY:<earliest>`.
6. Insert (`source 'opening_balance'`, description `'Opening balance'` / `'Opening advance'`).

### `record_contractor_adjustment(p_contractor_id, p_type, p_amount, p_entry_date, p_reason, p_today, p_user_id) returns void`

1. Guards: `p_type in ('credit','debit')`, amount > 0, date ≤ `p_today`, reason non-blank.
2. **Lock** contractor.
3. `p_entry_date <= contractor_settled_until` → `PERIOD_SETTLED:<date>`.
4. Insert (`source 'adjustment'`, description = trimmed reason). No batch is touched (FR-022).

### `settle_contractor_period(p_contractor_id, p_period_end, p_note, p_confirm_nonzero, p_today, p_user_id) returns uuid`

1. **Lock** contractor.
2. `v_until := contractor_settled_until(...)`; `v_start := v_until + 1`, or if null
   `min(entry_date)` of the contractor's entries; if that is null → `NOTHING_TO_SETTLE`.
3. `p_period_end > p_today` → `SETTLE_DATE_FUTURE`; `p_period_end < v_start` →
   `SETTLE_BEFORE_PERIOD_START:<v_start>`.
4. Figures, all in statements after the lock (research.md, "settlement figures"):

```sql
select
  coalesce(sum(case when entry_date < v_start or source_type = 'opening_balance'
                    then signed end), 0),
  coalesce(sum(case when source_type = 'production_batch' and entry_date >= v_start
                    then amount end), 0),
  coalesce(sum(case when entry_date >= v_start and source_type = 'payment' then amount
                    when entry_date >= v_start and source_type = 'payment_reversal' then -amount end), 0),
  coalesce(sum(case when entry_date >= v_start and source_type = 'adjustment' then signed end), 0)
into v_opening, v_earned, v_paid, v_adjustments
from (select *, case when type = 'credit' then amount else -amount end as signed
      from contractor_ledger_entries
      where contractor_id = p_contractor_id and entry_date <= p_period_end) e;
v_closing := v_opening + v_earned - v_paid + v_adjustments;
```

5. `v_closing <> 0 and not coalesce(p_confirm_nonzero, false)` →
   `SETTLEMENT_BALANCE_NOT_ZERO:<v_closing>` (FR-026).
6. Insert the settlement; return its id.

### `reopen_contractor_settlement(p_settlement_id, p_reason, p_user_id) returns void`

1. Guard: reason non-blank.
2. Read the settlement's `contractor_id` without a lock (`NOT_FOUND`); **lock** contractor.
3. `reopened_at is not null` → `SETTLEMENT_ALREADY_REOPENED`.
4. It is not the current settlement with the latest `period_end` → `NOT_LATEST_SETTLEMENT`.
5. Update the three reopen columns.

## Row Level Security

`alter table … enable row level security` on all four new tables, with no policies — the same
trust boundary as 0001–0010 (server-only service-role access).

## Derived values (TypeScript, not stored)

| Value | Definition |
|---|---|
| Contractor balance | Σ signed amount over all the contractor's entries (FR-005) |
| Running balance | cumulative Σ in `entry_date, created_at` order |
| Brought forward (date filter) | Σ signed amount of entries before `from` (FR-008) |
| Batch paid | Σ allocation amounts from `active` payments |
| Batch unpaid | `labour_cost − paid` |
| Batch status | paid = 0 → Unpaid; 0 < paid < labour_cost → Part-paid; paid = labour_cost → Paid |
| Payment unlinked amount | payment amount − Σ its allocations (FR-013) |
| Settlement preview | same formula as step 4 above, computed from fetched rows for the settle form; the stored figures come from SQL |
