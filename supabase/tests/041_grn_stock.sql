-- ════════════════════════════════════════════════════════════════════════
--  Test for 041_grn_adds_stock_in_database.sql. Rolled back; changes nothing.
--  The bug it guards: a Purchase Manager's goods receipt saved but its stock
--  was refused (no Inventory access), so the goods never reached the books.
--  Signs in as the TEST Purchase Manager account.
-- ════════════════════════════════════════════════════════════════════════
begin;
create temp table r (n serial, name text, ok boolean, detail text) on commit drop;
grant insert, select on r to authenticated; grant usage on sequence r_n_seq to authenticated;

select set_config('t.shampoo_before', (select coalesce(sum(quantity), 0)::text from inventory where product = 'TEST Herbal Shampoo 200ml' and "batchNumber" = 'TEST-B2'), true);

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"test.purchase.manager@prismora.test","role":"authenticated"}', true);

insert into grn (id, "vendorName", items, "receivedDate", "receivedBy", "createdAt") values
  ('TEST-GRN-041', 'TEST Herbal Raw Materials Co',
   '[{"product":"TEST Herbal Shampoo 200ml","receivedQty":7,"quantity":7,"batchNumber":" test-b2 ","unitCost":90},
     {"product":"TEST Neem Face Wash 100ml","receivedQty":12,"quantity":12,"batchNumber":"TEST-B041","expiryDate":"2027-12-31T00:00:00Z","unitCost":70},
     {"product":"TEST Herbal Shampoo 200ml","receivedQty":0,"quantity":0,"batchNumber":"TEST-B-ZERO"}]',
   now(), 'U-TEST-PURCHASE-MANAGER', now());

reset role;
insert into r (name, ok, detail) select 'a line joins its existing batch (case and spaces ignored)',
  sum(quantity) = current_setting('t.shampoo_before')::numeric + 7, format('TEST-B2: %s → %s', current_setting('t.shampoo_before'), sum(quantity))
  from inventory where product = 'TEST Herbal Shampoo 200ml' and "batchNumber" = 'TEST-B2';
insert into r (name, ok, detail) select 'a new batch number starts a new batch, with its expiry and cost',
  count(*) = 1 and bool_and(quantity = 12 and "expiryDate" = '2027-12-31T00:00:00Z' and "unitCost" = 70 and warehouse = 'Main Warehouse'),
  format('%s batch(es): %s', count(*), string_agg(quantity || ' units, cost ' || "unitCost", ', '))
  from inventory where "batchNumber" = 'TEST-B041';
insert into r (name, ok, detail) select 'a zero-quantity line adds nothing', count(*) = 0, format('%s rows', count(*))
  from inventory where "batchNumber" = 'TEST-B-ZERO';
insert into r (name, ok, detail) select 'the audit log credits the Purchase Manager, via the receipt',
  count(*) >= 2 and bool_and(actor_id = 'U-TEST-PURCHASE-MANAGER' and via = 'goods receipt TEST-GRN-041'),
  format('%s stock rows logged; actors: %s', count(*), string_agg(distinct coalesce(actor_name, 'System'), ', '))
  from audit_log where table_name = 'inventory' and via = 'goods receipt TEST-GRN-041';

select string_agg(case when coalesce(ok, false) then 'PASS  ' else 'FAIL  ' end || name || ' — ' || detail, E'\n' order by n)
  || E'\n' || case when bool_and(coalesce(ok, false)) then 'ALL PASSED' else 'SOME FAILED' end as result from r;
rollback;
