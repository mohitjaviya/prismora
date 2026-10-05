with bad as (
 select 'orders' t, id::text id, phone v from orders where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'complaints', id::text, "customerPhone" from complaints where nullif(btrim("customerPhone"),'') is not null and regexp_replace("customerPhone",'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'leads', id::text, phone from leads where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'dealers', id::text, phone from dealers where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'distributors', id::text, phone from distributors where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'retailers', id::text, phone from retailers where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
 union all select 'vendors', id::text, phone from vendors where nullif(btrim(phone),'') is not null and regexp_replace(phone,'[\s-]','','g') !~ '^(\+91|91|0)?[6-9][0-9]{9}$'
), pref as (
 select 'leads(prefixed, to normalise)' t, id::text id, phone v from leads where regexp_replace(phone,'\s','','g') ~ '^(\+91|91|0)[6-9][0-9]{9}$' or phone ~ '[\s-]'
)
select t, id, v, case when regexp_replace(v,'[\s-]','','g') ~ '^0[1-9][0-9]{9}$' then 'LANDLINE' else 'invalid' end kind from bad
union all select t,id,v,'prefixed' from pref order by 1,2;
