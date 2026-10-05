select 'items sample' k, (select items::text from orders where jsonb_typeof(items)='array' and jsonb_array_length(items)>0 limit 1) v
union all select 'inventory null qty', count(*)::text from inventory where quantity is null
union all select 'adjust movements', (select string_agg(distinct quantity::text, ',') from (select quantity from stock_movements where kind='adjustment' limit 8) x)
union all select 'orders value null', count(*)::text from orders where value is null
union all select 'is_indian_mobile exists', count(*)::text from pg_proc where proname='is_indian_mobile'
union all select 'migrations ledger', (select string_agg(filename, ',' order by filename) from (select filename from public.schema_migrations order by filename desc limit 3) m);
