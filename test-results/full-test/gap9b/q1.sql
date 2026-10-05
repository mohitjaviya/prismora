select 'scheme_check' k, conname, pg_get_constraintdef(oid) d from pg_constraint where conrelid='public.schemes'::regclass and contype='c'
union all select 'phone_constraints', conname, pg_get_constraintdef(oid) from pg_constraint where conname like '%phone%' or conname like '%email_format' or conname like '%not_negative'
union all select 'triggers', tgname, tgrelid::regclass::text from pg_trigger where not tgisinternal and tgname like '%contact%';
