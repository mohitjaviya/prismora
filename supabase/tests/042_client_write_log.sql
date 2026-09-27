-- 042: anyone signed in can record their own failed save; only Super Admin,
-- Admin and Director can read the log; nobody can record one as someone else.
begin;
create temp table r (n int, name text, ok boolean, detail text);
grant all on r to authenticated;

set local role authenticated;
select set_config('request.jwt.claims', '{"email":"test.accounts@prismora.test"}', true);
insert into client_write_log (kind, label, error) values ('failed', 'TEST convert invoice', 'test row');
insert into r select 1, 'a staff user can record their own failed save', true, '';
insert into r select 2, 'they cannot read the log back', count(*) = 0, count(*) || ' rows visible' from client_write_log;
do $$ begin
  insert into client_write_log (kind, label, user_id) values ('failed', 'TEST forged', 'U-SOMEONE-ELSE');
  insert into r values (3, 'they cannot record a save as someone else', false, 'insert was allowed');
exception when others then
  insert into r values (3, 'they cannot record a save as someone else', true, sqlerrm);
end $$;

select set_config('request.jwt.claims', '{"email":"test.admin@prismora.test"}', true);
insert into r select 4, 'Admin reads it, credited to the right person', count(*) = 1,
  string_agg(coalesce(user_id, 'null'), ', ') from client_write_log where label = 'TEST convert invoice';
reset role;

select string_agg(case when coalesce(ok,false) then 'PASS  ' else 'FAIL  ' end || name || ' — ' || detail, E'\n' order by n)
  || E'\n' || case when bool_and(coalesce(ok,false)) then 'ALL PASSED' else 'SOME FAILED' end as result from r;
rollback;
