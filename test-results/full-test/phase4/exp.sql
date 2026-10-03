-- RISK-EXP: expired batches and the DB rules that keep them out of deliveries (read-only)
SELECT 'expired_batches' k, (SELECT json_agg(x)::text FROM (
  SELECT id, product, "batchNumber", "expiryDate"::date exp, quantity, warehouse FROM inventory
  WHERE quantity > 0 AND NOT public.batch_is_sellable("expiryDate") ORDER BY product) x) v
UNION ALL SELECT 'products_with_expired_and_sellable', (SELECT json_agg(x)::text FROM (
  SELECT product, sum(quantity) FILTER (WHERE public.batch_is_sellable("expiryDate")) sellable,
         sum(quantity) FILTER (WHERE NOT public.batch_is_sellable("expiryDate")) expired
  FROM inventory WHERE quantity > 0 GROUP BY product
  HAVING sum(quantity) FILTER (WHERE NOT public.batch_is_sellable("expiryDate")) > 0) x)
UNION ALL SELECT 'fns_using_sellable', (SELECT string_agg(p.proname, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc ILIKE '%batch_is_sellable%')
UNION ALL SELECT 'fns_touching_inventory_qty', (SELECT string_agg(p.proname, ',') FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname='public' AND p.prosrc ILIKE '%update public.inventory%' OR (n.nspname='public' AND p.prosrc ILIKE '%update inventory%'))
UNION ALL SELECT 'delivered_from_expired', (SELECT json_agg(x)::text FROM (
  SELECT m.at::date d, m.kind, m."orderId", m."inventoryId", m.quantity, i."expiryDate"::date exp
  FROM stock_movements m JOIN inventory i ON i.id = m."inventoryId"
  WHERE m.kind ILIKE '%deliver%' AND i."expiryDate" IS NOT NULL
    AND (i."expiryDate" AT TIME ZONE 'Asia/Kolkata')::date < (m.at AT TIME ZONE 'Asia/Kolkata')::date) x)
UNION ALL SELECT 'sm_cols', (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='stock_movements');
