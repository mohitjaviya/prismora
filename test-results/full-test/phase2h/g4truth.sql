with l as (
  select o.id, coalesce(x->>'name', o.product) name,
         coalesce((x->>'quantity')::numeric, o.quantity) qty,
         coalesce((x->>'total')::numeric, o.value) amt
  from orders o left join lateral jsonb_array_elements(case when jsonb_typeof(o.items)='array' and jsonb_array_length(o.items)>0 then o.items else '[null]'::jsonb end) x on true
  where o.status <> 'Cancelled')
select name, sum(qty) qty, sum(amt) amt from l group by name order by amt desc;
