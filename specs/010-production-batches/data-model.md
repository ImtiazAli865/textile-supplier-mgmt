# Data Model: Production Batches

**Feature**: `010-production-batches` | **Date**: 2026-09-24
**Migration**: `supabase/migrations/0010_production_batches.sql` (new; no existing migration is
edited)

Three new tables and six new functions. The feature reuses existing objects without redefining
them: `raw_material_purchases` (0001/0003), `products` (0002/0003), `inventory_movements` and
`recompute_product_quantity_on_hand` (0007). The only change to a shipped feature is a TypeScript
change in `lib/purchases/service.ts` (research.md, "close 002's latent race"); there is no schema
change to 002.

## Entity overview

```text
contractors 1 ──< production_batches >── 1 raw_material_purchases (weight mode = "lot")
                        │  >── 1 products (type = manufactured)
                        └─(on complete)─> inventory_movements (+packets, source_type 'production_batch')

products (manufactured) 1 ── 0..1 manufactured_opening_stock
                        └─(on record / correct)─> inventory_movements (source_type 'opening_balance')
```

## `contractors` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | `gen_random_uuid()` |
| `name` | text not null | `btrim(name) <> ''`; stored trimmed by the service; unique on `lower(btrim(name))` (FR-001) |
| `phone` | text null | optional, free text |
| `status` | text not null default `'active'` | `in ('active','inactive')` |
| `created_at` / `updated_at` | timestamptz | `now()`; `set_updated_at()` trigger (0001) |
| `created_by` / `updated_by` | uuid not null → `auth.users` | FR-027 |

```sql
create table contractors (
  id         uuid primary key default gen_random_uuid(),
  name       text not null check (btrim(name) <> ''),
  phone      text,
  status     text not null default 'active' check (status in ('active', 'inactive')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid not null references auth.users (id),
  updated_by uuid not null references auth.users (id)
);
create unique index idx_contractors_name_unique on contractors (lower(btrim(name)));
create index idx_contractors_status_name on contractors (status, lower(name));
create trigger trg_contractors_updated_at before update on contractors
  for each row execute function set_updated_at();
```

No delete path: contractors are only deactivated, so batch history always resolves a name. 011 will
extend this table (ADR-0004 first-writer rule; ADR-0008 §3).

## `production_batches` (new)

| Column | Type | Rules |
|---|---|---|
| `id` | uuid PK | |
| `batch_number` | varchar(20) not null unique | `PB-NNNN` from `production_batch_number_seq` (FR-009) |
| `status` | text not null default `'issued'` | `in ('issued','completed','voided')` |
| `lot_id` | uuid not null → `raw_material_purchases` | must be `purchase_mode = 'weight'` (enforced in functions); `RESTRICT` |
| `product_id` | uuid not null → `products` | must be `type = 'manufactured'` (functions) |
| `contractor_id` | uuid not null → `contractors` | |
| `weight_issued_kg` | numeric(10,2) not null | `> 0` |
| `labour_rate_per_packet` | numeric(10,2) not null | `> 0`; editable while issued, frozen after (FR-007/FR-020) |
| `issue_date` | date not null | ≥ lot's `purchase_date` (function); not future (Zod) |
| `completion_date` | date null | ≥ `issue_date` (CHECK) |
| `packets_produced` | integer null | `> 0` |
| `returned_weight_kg` | numeric(10,2) null | `> 0` |
| `lot_rate_per_kg` | numeric(10,2) null | snapshot at completion |
| `expected_packets` | integer null | snapshot: `floor(weight_issued_kg × expected_yield_per_kg)` |
| `raw_material_cost` | numeric(12,2) null | `round(weight_issued_kg × lot_rate_per_kg, 2)` |
| `labour_cost` | numeric(12,2) null | `round(packets_produced × labour_rate_per_packet, 2)` |
| `total_cost` | numeric(12,2) null | `raw_material_cost + labour_cost` |
| `avg_cost_per_packet` | numeric(12,2) null | `round(total_cost / packets_produced, 2)` |
| `wastage_kg` | numeric(10,2) null | `weight_issued − returned`, or `0` if exceeded |
| `wastage_value` | numeric(12,2) null | `round(wastage_kg × lot_rate_per_kg, 2)` |
| `wastage_pct` | numeric(6,2) null | `round(wastage_kg / weight_issued_kg × 100, 2)` |
| `returned_weight_exceeded` | boolean null | `returned_weight_kg > weight_issued_kg` (FR-019) |
| `completed_at` / `completed_by` | timestamptz / uuid null | |
| `voided_at` / `voided_by` | timestamptz / uuid null | |
| `created_at` / `updated_at` / `created_by` / `updated_by` | | standard; FR-027 |

```sql
create sequence production_batch_number_seq;

create table production_batches (
  id                       uuid primary key default gen_random_uuid(),
  batch_number             varchar(20) not null unique,
  status                   text not null default 'issued' check (status in ('issued', 'completed', 'voided')),
  lot_id                   uuid not null references raw_material_purchases (id),
  product_id               uuid not null references products (id),
  contractor_id            uuid not null references contractors (id),
  weight_issued_kg         numeric(10, 2) not null check (weight_issued_kg > 0),
  labour_rate_per_packet   numeric(10, 2) not null check (labour_rate_per_packet > 0),
  issue_date               date not null,
  completion_date          date,
  packets_produced         integer check (packets_produced > 0),
  returned_weight_kg       numeric(10, 2) check (returned_weight_kg > 0),
  lot_rate_per_kg          numeric(10, 2),
  expected_packets         integer,
  raw_material_cost        numeric(12, 2),
  labour_cost              numeric(12, 2),
  total_cost               numeric(12, 2),
  avg_cost_per_packet      numeric(12, 2),
  wastage_kg               numeric(10, 2),
  wastage_value            numeric(12, 2),
  wastage_pct              numeric(6, 2),
  returned_weight_exceeded boolean,
  completed_at             timestamptz,
  completed_by             uuid references auth.users (id),
  voided_at                timestamptz,
  voided_by                uuid references auth.users (id),
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  created_by               uuid not null references auth.users (id),
  updated_by               uuid not null references auth.users (id),
  -- Completion fields are all set exactly when status = 'completed', never otherwise.
  constraint production_batches_completion_fields_check check (
    (status = 'completed'
      and completion_date is not null and packets_produced is not null and returned_weight_kg is not null
      and lot_rate_per_kg is not null and expected_packets is not null
      and raw_material_cost is not null and labour_cost is not null and total_cost is not null
      and avg_cost_per_packet is not null and wastage_kg is not null and wastage_value is not null
      and wastage_pct is not null and returned_weight_exceeded is not null
      and completed_at is not null and completed_by is not null)
    or
    (status <> 'completed'
      and completion_date is null and packets_produced is null and returned_weight_kg is null
      and lot_rate_per_kg is null and expected_packets is null
      and raw_material_cost is null and labour_cost is null and total_cost is null
      and avg_cost_per_packet is null and wastage_kg is null and wastage_value is null
      and wastage_pct is null and returned_weight_exceeded is null
      and completed_at is null and completed_by is null)
  ),
  constraint production_batches_void_fields_check check (
    (status = 'voided') = (voided_at is not null and voided_by is not null)
  ),
  constraint production_batches_completion_after_issue check (
    completion_date is null or completion_date >= issue_date
  )
);

create index idx_production_batches_status_issue_date on production_batches (status, issue_date desc);
create index idx_production_batches_contractor on production_batches (contractor_id);
create index idx_production_batches_product on production_batches (product_id);
create index idx_production_batches_lot on production_batches (lot_id);
create trigger trg_production_batches_updated_at before update on production_batches
  for each row execute function set_updated_at();
```

### State transitions

```text
          issue_production_batch
                  │
                  ▼
   ┌──────── issued ────────┐   update_production_batch (issued → issued)
   │                        │
void_production_batch   complete_production_batch
   │                        │
   ▼                        ▼
 voided (terminal)     completed (terminal)
```

| Transition | Lot `remaining_weight_kg` | `inventory_movements` |
|---|---|---|
| issue | `-= weight_issued_kg` | none (FR-010) |
| update | `+= old weight` on the old lot, then `-= new weight` on the new lot (same lot → net delta) | none |
| void | `+= weight_issued_kg` | none |
| complete | unchanged | `+packets_produced`, `'production_batch'`, `source_id = batch id`, dated `completion_date` |

## `manufactured_opening_stock` (new)

| Column | Type | Rules |
|---|---|---|
| `product_id` | uuid PK → `products` | one per product (FR-024/FR-025); product must be `manufactured` (function) |
| `quantity` | integer not null | `>= 1` |
| `entry_date` | date not null | not future (Zod) |
| `cost_per_packet` | numeric(10,2) null | `> 0` when present (Q3) |
| `correction_qty` | integer null | `<> 0` |
| `correction_reason` | text null | non-blank when set |
| `correction_date` | date null | `>= entry_date` |
| `corrected_at` / `corrected_by` | timestamptz / uuid null | |
| `created_at` / `created_by` | timestamptz / uuid not null | FR-027 |

```sql
create table manufactured_opening_stock (
  product_id        uuid primary key references products (id),
  quantity          integer not null check (quantity >= 1),
  entry_date        date not null,
  cost_per_packet   numeric(10, 2) check (cost_per_packet is null or cost_per_packet > 0),
  correction_qty    integer check (correction_qty is null or correction_qty <> 0),
  correction_reason text,
  correction_date   date,
  corrected_at      timestamptz,
  corrected_by      uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  created_by        uuid not null references auth.users (id),
  -- The correction is all-or-nothing and, once set, is the row's only ever change.
  constraint manufactured_opening_stock_correction_check check (
    (correction_qty is null and correction_reason is null and correction_date is null
      and corrected_at is null and corrected_by is null)
    or
    (correction_qty is not null and correction_reason is not null and btrim(correction_reason) <> ''
      and correction_date is not null and correction_date >= entry_date
      and corrected_at is not null and corrected_by is not null)
  )
);
```

## Functions (all `language plpgsql`, errors raised as `'CODE: message'`, mapped in TypeScript)

**Input guards (every function, before any lock or write):** invalid numeric or date parameters
raise `INVALID_WEIGHT`, `INVALID_LABOUR_RATE`, `INVALID_PACKETS` (null or < 1),
`INVALID_RETURNED_WEIGHT`, `INVALID_QUANTITY`, `INVALID_COST`, `INVALID_CORRECTION`,
`REASON_REQUIRED` or `INVALID_DATE`. The app's Zod schemas enforce the same rules first. These
guards make each function safe on its own. In particular, `packets_produced >= 1` is checked
explicitly, so `avg_cost_per_packet = total / packets` can never divide by zero; it no longer relies
on statement order or column checks. `wastage_pct` divides by `weight_issued_kg`, which its column
check keeps > 0.

### `issue_production_batch(p_lot_id, p_product_id, p_contractor_id, p_weight_issued_kg, p_labour_rate_per_packet, p_issue_date, p_user_id) returns uuid`

1. `select … from raw_material_purchases where id = p_lot_id for update`. If missing, raise
   `LOT_NOT_FOUND`. If `purchase_mode <> 'weight'`, raise `LOT_NOT_WEIGHT_MODE`.
2. If `p_issue_date < purchase_date`, raise `ISSUE_BEFORE_PURCHASE:<purchase_date>`.
3. If `p_weight_issued_kg > remaining_weight_kg`, raise `LOT_INSUFFICIENT_WEIGHT:<remaining>` (FR-005).
4. The product must exist, be `type = 'manufactured'` and `status = 'active'`, otherwise raise
   `PRODUCT_NOT_ELIGIBLE`. The contractor must be active, otherwise raise `CONTRACTOR_NOT_ACTIVE`.
5. `update raw_material_purchases set remaining_weight_kg = remaining_weight_kg - p_weight_issued_kg`
   (FR-006; this is what engages 002's lock).
6. `insert into production_batches (…, batch_number = 'PB-' || lpad(nextval('production_batch_number_seq')::text, 4, '0'), …)`,
   returning `id`. `nextval` runs only after all validation passes (research.md).

### `update_production_batch(p_id, p_lot_id, p_product_id, p_contractor_id, p_weight_issued_kg, p_labour_rate_per_packet, p_issue_date, p_user_id) returns void`

1. Lock the batch row. If missing, raise `NOT_FOUND`. If `status <> 'issued'`, raise
   `BATCH_NOT_EDITABLE:<status>` (FR-013).
2. Lock the old and new lot rows **in ascending id order** (deadlock avoidance). The new lot must be
   weight mode.
3. Restore `old weight` to the old lot. Then check `p_weight_issued_kg <= new lot remaining`,
   otherwise raise `LOT_INSUFFICIENT_WEIGHT:<remaining incl. own weight>`. Then deduct. A raise rolls
   back the restore, so nothing changes on failure (FR-011, US4-2).
4. Re-check eligibility only when the value changed: product (`PRODUCT_NOT_ELIGIBLE`) and contractor
   (`CONTRACTOR_NOT_ACTIVE`). Check the issue date against the (new) lot's purchase date.
5. Update the batch's issue fields and `updated_by`.

### `void_production_batch(p_id, p_user_id) returns void`

1. Lock the batch. If missing, raise `NOT_FOUND`. If `status <> 'issued'`, raise
   `BATCH_NOT_VOIDABLE:<status>`.
2. Lock the lot, then `remaining_weight_kg += weight_issued_kg` (FR-012).
3. `status = 'voided', voided_at = now(), voided_by = p_user_id`.

### `complete_production_batch(p_id, p_packets_produced, p_returned_weight_kg, p_completion_date, p_confirm_returned_weight_exceeded, p_user_id) returns void`

1. Lock the batch. If missing, raise `NOT_FOUND`. If `status <> 'issued'`, raise
   `BATCH_NOT_ISSUED:<status>`.
2. If `p_completion_date < issue_date`, raise `COMPLETION_BEFORE_ISSUE`.
3. `v_exceeded := p_returned_weight_kg > weight_issued_kg`. If `v_exceeded and not
   p_confirm_returned_weight_exceeded`, raise `RETURNED_WEIGHT_UNCONFIRMED` (FR-019).
4. Read `rate_per_kg` from the lot and `expected_yield_per_kg` from the product. Compute every
   stored figure per the table above, with `wastage_kg = case when v_exceeded then 0 else
   weight_issued_kg - p_returned_weight_kg end`.
5. `insert into inventory_movements (product_id, qty_delta, reason, source_type, source_id,
   movement_date, created_by) values (product_id, p_packets_produced, 'Production batch completed',
   'production_batch', p_id, p_completion_date, p_user_id)`, then
   `perform recompute_product_quantity_on_hand(product_id)` (FR-015).
6. Update the batch with `status = 'completed'`, all completion fields, and `completed_at/by`.

### `record_manufactured_opening_stock(p_product_id, p_quantity, p_entry_date, p_cost_per_packet, p_user_id) returns void`

1. `select … from products where id = p_product_id for update`. If missing, raise `NOT_FOUND`. If
   `type <> 'manufactured'`, raise `PRODUCT_NOT_MANUFACTURED` (FR-026). The product may be
   inactive, since physical stock can exist regardless.
2. If a row already exists, raise `OPENING_STOCK_EXISTS` (the PK is the backstop; FR-025).
3. Insert the row. Insert the movement `(+p_quantity, 'Opening balance', 'opening_balance',
   p_product_id, p_entry_date)`. Recompute.

### `record_manufactured_opening_stock_correction(p_product_id, p_correction_qty, p_reason, p_correction_date, p_user_id) returns void`

1. Lock the `products` row, then the `manufactured_opening_stock` row. If the row is missing, raise
   `OPENING_STOCK_NOT_FOUND`. If `correction_qty` is already set, raise `CORRECTION_EXISTS`.
2. If `exists (select 1 from inventory_movements where product_id = p_product_id and source_type =
   'challan_line' and qty_delta < 0)`, raise `STOCK_ALREADY_SHIPPED` (FR-025, research.md).
3. If `p_correction_date < entry_date`, raise `CORRECTION_BEFORE_ENTRY`. If `quantity_on_hand +
   p_correction_qty < 0`, raise `CORRECTION_BELOW_ZERO`.
4. Update the correction columns (null → value, the row's only change). Insert the movement
   `(p_correction_qty, 'Opening balance correction', 'opening_balance', p_product_id,
   p_correction_date)`. Recompute.

## Row Level Security

`alter table … enable row level security` on all three new tables, with no policies. This is the
same trust boundary as 001–009: service-role key, server-side only.

## Comments recorded in the migration

- `inventory_movements.reason` / `source_type`: the new values are `'production_batch'` ("Production
  batch completed") and, for manufactured products, `'opening_balance'` ("Opening balance" /
  "Opening balance correction", `source_id = product_id`). No constraint change is needed, because
  `reason` and `source_type` are deliberately free text (0007 comment).
- `raw_material_purchases.remaining_weight_kg`: update the 0001 comment ("consumed by the future
  Production Batches feature (003)") to name `production_batches` (010) as its consumer.

## Change to shipped code (not schema)

`lib/purchases/service.ts`, weight branch of `updatePurchaseRecord` and `deletePurchaseRecord`:

```ts
// update: condition the write on the lot still being unconsumed, atomically
const { data: updated, error } = await getSupabaseAdmin()
  .from(PURCHASES_TABLE)
  .update({ /* unchanged fields */ })
  .eq("id", id)
  .eq("weight_kg", existing.weightKg!)
  .eq("remaining_weight_kg", existing.weightKg!)
  .select("id");
if (error) throw error;
if (!updated || updated.length === 0) {
  throw new PurchaseLockedError("This lot has already been used in production and can no longer be edited");
}
```

`deletePurchaseRecord` gets the same `.eq(...)` pair plus `.select("id")` and zero-rows check.
Error `23503` (a batch, voided included, references the lot) maps to `PurchaseLockedError`: "This
lot is referenced by a production batch (voided batches included) and cannot be deleted." The user
confirmed this rule on 2026-09-24 (spec US4-5, FR-012).
