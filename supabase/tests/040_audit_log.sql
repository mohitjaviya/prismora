-- ════════════════════════════════════════════════════════════════════════
--  Tests for 040_audit_log_and_last_modified.sql. RUN ON STAGING, after 040.
--  Everything happens inside one transaction that is rolled back.
--
--  Proves:
--    1. Each of the six roles whose actions used to be silently dropped from
--       the log — Sales, Sales Executive, Dispatch Team, Warehouse Manager,
--       Purchase Manager, Customer Support — is logged with their own name
--       and role, and "updatedBy" names them.
--    2. A signed-in user cannot forge "updatedBy".
--    3. A service-key request (our server functions) is credited to the
--       person it names; with nobody named it is "System" (actor NULL).
--    4. A save that changes nothing writes no audit row.
--
--  Uses one existing account (the Sales Manager test user by default),
--  switching its role inside the transaction for each case.
--  Prints one line per check and ends with ALL PASSED, or stops at the first
--  failure with its reason.
-- ════════════════════════════════════════════════════════════════════════
begin;

-- The account every case signs in as. Change the email if staging differs.
select set_config('t.email', 'salesmanager@prismora.com', true);
select set_config('t.uid', (select id from users where lower(email) = current_setting('t.email')), true);
select set_config('t.uname', (select name from users where id = current_setting('t.uid')), true);

-- Somewhere for each role to write.
insert into orders (id, "customerName", product, quantity, value, status, "createdAt")
  values ('O-AUDIT-TEST', 'Audit Test', 'Test product', 1, 1, 'Shipped', now());
insert into inventory (id, product, quantity, "createdAt") values ('INV-AUDIT-TEST', 'Audit Test Product', 10, now());

create temp table audit_results (n serial, check_name text, ok boolean, detail text) on commit drop;
grant insert, select on audit_results to authenticated;
grant usage on sequence audit_results_n_seq to authenticated;

-- Sign in as the test account holding `p_role`, run `p_sql`, and check the
-- newest audit row for `p_table`/`p_row` names them.
create or replace function pg_temp.as_role_check(p_role text, p_sql text, p_table text, p_row text)
returns void language plpgsql as $$
declare
  a record;
  stamped text;
begin
  reset role;
  update users set role = p_role where id = current_setting('t.uid');
  perform set_config('request.jwt.claims',
    json_build_object('email', current_setting('t.email'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  execute p_sql;
  reset role;
  select * into a from audit_log where table_name = p_table and row_id = p_row order by id desc limit 1;
  execute format('select "updatedBy" from %I where id = %L', p_table, p_row) into stamped;
  insert into audit_results (check_name, ok, detail) values (
    p_role || ' is logged by name',
    a.actor_id = current_setting('t.uid') and a.actor_name = current_setting('t.uname')
      and a.actor_role = p_role and stamped = current_setting('t.uid'),
    format('audit: %s (%s) %s %s/%s, updatedBy=%s', a.actor_name, a.actor_role, a.action, p_table, p_row, stamped));
end $$;

-- 1. The six roles.
select pg_temp.as_role_check('Sales',
  $q$insert into leads (id, name, status, "assignedTo", "createdAt") values ('L-AUDIT-1', 'Audit lead 1', 'New', current_setting('t.uid'), now())$q$,
  'leads', 'L-AUDIT-1');
select pg_temp.as_role_check('Sales Executive',
  $q$insert into leads (id, name, status, "assignedTo", "createdAt") values ('L-AUDIT-2', 'Audit lead 2', 'New', current_setting('t.uid'), now())$q$,
  'leads', 'L-AUDIT-2');
select pg_temp.as_role_check('Dispatch Team',
  $q$update orders set status = 'Cancelled' where id = 'O-AUDIT-TEST'$q$,
  'orders', 'O-AUDIT-TEST');
select pg_temp.as_role_check('Warehouse Manager',
  $q$update inventory set quantity = 9 where id = 'INV-AUDIT-TEST'$q$,
  'inventory', 'INV-AUDIT-TEST');
select pg_temp.as_role_check('Purchase Manager',
  $q$insert into complaints (id, "customerName", "complaintType", status, "createdAt") values ('CMP-AUDIT-1', 'Audit', 'Product Quality', 'Open', now())$q$,
  'complaints', 'CMP-AUDIT-1');
select pg_temp.as_role_check('Customer Support',
  $q$insert into complaints (id, "customerName", "complaintType", status, "createdAt") values ('CMP-AUDIT-2', 'Audit', 'Product Quality', 'Open', now())$q$,
  'complaints', 'CMP-AUDIT-2');

-- 2. A signed-in user sends someone else's id: ignored.
do $$
declare stamped text; a record;
begin
  update users set role = 'Warehouse Manager' where id = current_setting('t.uid');
  perform set_config('request.jwt.claims',
    json_build_object('email', current_setting('t.email'), 'role', 'authenticated')::text, true);
  set local role authenticated;
  update inventory set quantity = 8, "updatedBy" = 'U-SOMEONE-ELSE' where id = 'INV-AUDIT-TEST';
  reset role;
  select "updatedBy" into stamped from inventory where id = 'INV-AUDIT-TEST';
  select * into a from audit_log where row_id = 'INV-AUDIT-TEST' order by id desc limit 1;
  insert into audit_results (check_name, ok, detail) values ('a signed-in user cannot forge updatedBy',
    stamped = current_setting('t.uid') and a.actor_id = current_setting('t.uid'),
    format('updatedBy=%s, audit actor=%s', stamped, a.actor_id));
end $$;

-- 3. Service-key requests: named person credited; nobody named is System.
do $$
declare a record;
begin
  perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
  update inventory set quantity = 7, "updatedBy" = current_setting('t.uid') where id = 'INV-AUDIT-TEST';
  select * into a from audit_log where row_id = 'INV-AUDIT-TEST' order by id desc limit 1;
  insert into audit_results (check_name, ok, detail) values ('a server function is credited to the person it names',
    a.actor_id = current_setting('t.uid') and a.actor_name = current_setting('t.uname'),
    format('audit actor=%s (%s)', a.actor_id, a.actor_name));

  update inventory set quantity = 6, "updatedBy" = null where id = 'INV-AUDIT-TEST';
  select * into a from audit_log where row_id = 'INV-AUDIT-TEST' order by id desc limit 1;
  insert into audit_results (check_name, ok, detail) values ('a server function naming nobody is System',
    a.actor_id is null, format('audit actor=%s', coalesce(a.actor_id, 'NULL (System)')));
end $$;

-- 4. A save that changes nothing leaves no row.
do $$
declare before_n bigint; after_n bigint;
begin
  select count(*) into before_n from audit_log where row_id = 'INV-AUDIT-TEST';
  update inventory set quantity = quantity where id = 'INV-AUDIT-TEST';
  select count(*) into after_n from audit_log where row_id = 'INV-AUDIT-TEST';
  insert into audit_results (check_name, ok, detail) values ('an unchanged save writes no audit row',
    before_n = after_n, format('%s rows before, %s after', before_n, after_n));
end $$;

reset role;
select string_agg(case when ok then 'PASS  ' else 'FAIL  ' end || check_name || ' — ' || detail, E'\n' order by n)
       || E'\n' || case when bool_and(ok) then 'ALL PASSED' else 'SOME FAILED' end as result
from audit_results;

rollback;
