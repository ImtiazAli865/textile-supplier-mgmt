-- cleanup-qa-011.sql — removes ALL 011 QA data from the live database (research.md, "race tests
-- run on live Supabase"; quickstart.md §9). Run the whole file in the Supabase SQL editor.
--
-- QA scope is found by name prefix only, so nothing needs filling in:
--   contractors  name         like 'QA-011 %'
--   suppliers    company_name like 'QA-011 %'  (a QA lot is any lot of a QA supplier)
--   products     name         like 'QA-011 %'
-- plus everything hanging off them. Rows are counted at run time, before any delete, and every
-- delete must remove exactly the counted rows, or the whole transaction is rolled back.
--
-- Before running: do quickstart §9's untagged-row check. A QA row typed without the prefix is
-- invisible to this script.
--
-- DRY RUN FIRST: the file ends in ROLLBACK. Run it, read the counts, and confirm it reaches the
-- end without error. Only then change the final ROLLBACK to COMMIT and run it again.
-- If it stops with an error (QA_SCOPE_MIXED, QA_COUNT_MISMATCH, a foreign key), nothing was
-- deleted; run `rollback;` on its own to close the transaction, then investigate.
--
-- Triggers: exactly four delete-blocking triggers are disabled, inside this transaction only:
--   trg_contractor_ledger_entries_immutable, trg_contractor_payment_allocations_immutable,
--   trg_contractor_payments_guard, trg_contractor_settlements_guard.
-- The over-allocation guard trg_contractor_payment_allocations_guard is never touched.
-- ALTER TABLE ... DISABLE TRIGGER is transactional: other sessions never see the triggers off,
-- and any error (or the ROLLBACK) restores them.

begin;

create temp table qa_counts (
  step       int primary key,
  table_name text not null,
  expected   bigint not null,
  deleted    bigint
) on commit drop;

do $$
declare
  v_n bigint;
  v_mixed bigint;
begin
  -- -------------------------------------------------------------------------
  -- 1. Scope
  -- -------------------------------------------------------------------------
  create temp table qa_contractors on commit drop as
    select id from contractors where name like 'QA-011 %';
  create temp table qa_suppliers on commit drop as
    select id from suppliers where company_name like 'QA-011 %';
  create temp table qa_lots on commit drop as
    select id from raw_material_purchases where supplier_id in (select id from qa_suppliers);
  create temp table qa_products on commit drop as
    select id from products where name like 'QA-011 %';
  create temp table qa_batches on commit drop as
    select id, product_id from production_batches
    where contractor_id in (select id from qa_contractors)
       or lot_id in (select id from qa_lots)
       or product_id in (select id from qa_products);
  create temp table qa_payments on commit drop as
    select id from contractor_payments where contractor_id in (select id from qa_contractors);

  -- -------------------------------------------------------------------------
  -- 2. Refuse if QA data is mixed with real data (deleting it would corrupt real records)
  -- -------------------------------------------------------------------------
  select count(*) into v_mixed from production_batches b
  where b.id in (select id from qa_batches)
    and (b.contractor_id not in (select id from qa_contractors)
         or b.lot_id not in (select id from qa_lots)
         or b.product_id not in (select id from qa_products));
  if v_mixed > 0 then
    raise exception 'QA_SCOPE_MIXED: % batch(es) mix a QA contractor, lot or product with a real one. Inspect before cleaning up.', v_mixed;
  end if;

  select count(*) into v_mixed from contractor_payment_allocations a
  where (a.payment_id in (select id from qa_payments)) <> (a.batch_id in (select id from qa_batches));
  if v_mixed > 0 then
    raise exception 'QA_SCOPE_MIXED: % payment allocation(s) link QA and real data. Inspect before cleaning up.', v_mixed;
  end if;

  select count(*) into v_mixed from inventory_movements m
  where m.product_id in (select id from qa_products)
    and not (m.source_type = 'production_batch' and m.source_id in (select id from qa_batches));
  if v_mixed > 0 then
    raise exception 'QA_SCOPE_MIXED: % stock movement(s) on a QA product did not come from a QA batch. Inspect before cleaning up.', v_mixed;
  end if;

  -- -------------------------------------------------------------------------
  -- 3. Count at run time, before any delete
  -- -------------------------------------------------------------------------
  insert into qa_counts (step, table_name, expected) values
    (1, 'contractor_payment_allocations',
        (select count(*) from contractor_payment_allocations
         where payment_id in (select id from qa_payments) or batch_id in (select id from qa_batches))),
    (2, 'contractor_ledger_entries',
        (select count(*) from contractor_ledger_entries
         where contractor_id in (select id from qa_contractors)
            or (source_type = 'production_batch' and source_id in (select id from qa_batches)))),
    (3, 'contractor_settlements',
        (select count(*) from contractor_settlements where contractor_id in (select id from qa_contractors))),
    (4, 'contractor_payments', (select count(*) from qa_payments)),
    (5, 'inventory_movements',
        (select count(*) from inventory_movements
         where source_type = 'production_batch' and source_id in (select id from qa_batches))),
    (6, 'production_batches', (select count(*) from qa_batches)),
    (7, 'raw_material_purchases', (select count(*) from qa_lots)),
    (8, 'products', (select count(*) from qa_products)),
    (9, 'suppliers', (select count(*) from qa_suppliers)),
    (10, 'contractors', (select count(*) from qa_contractors));

  for v_n in select step from qa_counts order by step loop
    raise notice 'QA-011 cleanup: % row(s) in %',
      (select expected from qa_counts where step = v_n), (select table_name from qa_counts where step = v_n);
  end loop;

  -- -------------------------------------------------------------------------
  -- 4. Disable exactly the four delete-blocking triggers (this transaction only)
  -- -------------------------------------------------------------------------
  alter table contractor_ledger_entries disable trigger trg_contractor_ledger_entries_immutable;
  alter table contractor_payment_allocations disable trigger trg_contractor_payment_allocations_immutable;
  alter table contractor_payments disable trigger trg_contractor_payments_guard;
  alter table contractor_settlements disable trigger trg_contractor_settlements_guard;

  -- -------------------------------------------------------------------------
  -- 5. Delete children first; each delete must match its count from step 3
  -- -------------------------------------------------------------------------
  delete from contractor_payment_allocations
  where payment_id in (select id from qa_payments) or batch_id in (select id from qa_batches);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 1;

  delete from contractor_ledger_entries
  where contractor_id in (select id from qa_contractors)
     or (source_type = 'production_batch' and source_id in (select id from qa_batches));
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 2;

  delete from contractor_settlements where contractor_id in (select id from qa_contractors);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 3;

  delete from contractor_payments where id in (select id from qa_payments);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 4;

  delete from inventory_movements
  where source_type = 'production_batch' and source_id in (select id from qa_batches);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 5;

  -- Keep products.quantity_on_hand equal to the sum of the movements that remain.
  perform recompute_product_quantity_on_hand(p.product_id)
  from (select distinct product_id from qa_batches) p;

  delete from production_batches where id in (select id from qa_batches);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 6;

  delete from raw_material_purchases where id in (select id from qa_lots);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 7;

  delete from products where id in (select id from qa_products);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 8;

  -- supplier_contacts and supplier_materials go with their supplier (on delete cascade, 0001).
  delete from suppliers where id in (select id from qa_suppliers);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 9;

  delete from contractors where id in (select id from qa_contractors);
  get diagnostics v_n = row_count;
  update qa_counts set deleted = v_n where step = 10;

  if exists (select 1 from qa_counts where deleted is distinct from expected) then
    raise exception 'QA_COUNT_MISMATCH: % (everything rolled back)',
      (select string_agg(table_name || ' expected ' || expected || ' deleted ' || coalesce(deleted::text, 'none'), '; ')
       from qa_counts where deleted is distinct from expected);
  end if;

  -- -------------------------------------------------------------------------
  -- 6. Re-enable the same four triggers
  -- -------------------------------------------------------------------------
  alter table contractor_ledger_entries enable trigger trg_contractor_ledger_entries_immutable;
  alter table contractor_payment_allocations enable trigger trg_contractor_payment_allocations_immutable;
  alter table contractor_payments enable trigger trg_contractor_payments_guard;
  alter table contractor_settlements enable trigger trg_contractor_settlements_guard;
end;
$$;

-- What was counted and deleted (expected = deleted in every row).
select step, table_name, expected, deleted from qa_counts order by step;

-- Zero residue: every count must be 0.
select 'contractors' as scope, count(*) from contractors where name like 'QA-011 %'
union all select 'suppliers', count(*) from suppliers where company_name like 'QA-011 %'
union all select 'products', count(*) from products where name like 'QA-011 %'
union all select 'contractor_ledger_entries (orphans)', count(*) from contractor_ledger_entries e
  where not exists (select 1 from contractors c where c.id = e.contractor_id)
union all select 'production_batches (orphan contractor)', count(*) from production_batches b
  where not exists (select 1 from contractors c where c.id = b.contractor_id);

-- The four triggers are enabled again ('O' = enabled). Expect 4 rows, all 'O'.
select tgname, tgenabled from pg_trigger
where tgname in ('trg_contractor_ledger_entries_immutable', 'trg_contractor_payment_allocations_immutable',
                 'trg_contractor_payments_guard', 'trg_contractor_settlements_guard')
order by tgname;

-- DRY RUN: leave ROLLBACK. Change it to COMMIT only after a dry run has passed.
rollback;
