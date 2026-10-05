select 'orders value<=0' k, count(*) n from orders where coalesce(value,0)<=0
union all select 'orders qty>1e5', count(*) from orders where quantity>100000
union all select 'orders value>1e8', count(*) from orders where value>100000000
union all select 'order items qty>1e5 or non-int', count(*) from orders o, jsonb_array_elements(case when jsonb_typeof(o.items)='array' then o.items else '[]'::jsonb end) i where (i->>'quantity') ~ '^[0-9.]+$' and ((i->>'quantity')::numeric>100000 or (i->>'quantity')::numeric<>trunc((i->>'quantity')::numeric))
union all select 'leads dealValue>1e8', count(*) from leads where "dealValue">100000000
union all select 'payments>1e8', count(*) from distributor_payments where amount>100000000
union all select 'expenses>1e8', count(*) from expenses where amount>100000000
union all select 'inventory any>1e5', count(*) from inventory where quantity>100000 or reserved>100000 or transit>100000 or damaged>100000 or "reorderLevel">100000 or "unitCost">100000000
union all select 'inventory neg', count(*) from inventory where reserved<0 or transit<0 or damaged<0 or "reorderLevel"<0
union all select 'products price>1e8', count(*) from products where mrp>100000000 or "distributorPrice">100000000 or "dealerPrice">100000000 or "retailerPrice">100000000
union all select 'po total>1e8', count(*) from purchase_orders where total>100000000
union all select 'sales_returns nonint', count(*) from sales_returns r, jsonb_array_elements(case when jsonb_typeof(r.lines)='array' then r.lines else '[]'::jsonb end) l where (l->>'quantity') ~ '^[0-9.]+$' and (l->>'quantity')::numeric<>trunc((l->>'quantity')::numeric)
union all select 'dealers/retailers/dist email bad', (select count(*) from dealers where email is not null and btrim(email)<>'' and btrim(email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')+(select count(*) from retailers where email is not null and btrim(email)<>'' and btrim(email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')+(select count(*) from distributors where email is not null and btrim(email)<>'' and btrim(email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$')
union all select 'orders email bad', count(*) from orders where email is not null and btrim(email)<>'' and btrim(email) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$'
union all select 'visit outletContact', count(*) from visit_reports where "outletContact" is not null and btrim("outletContact")<>'';
