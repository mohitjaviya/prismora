-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — fix for 054: order_returnable could not run.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 054.
--
--  order_returnable's output column "product" shares its name with the
--  stock_movements column it reads, and PL/pgSQL refused the query as
--  ambiguous ("column reference \"product\" is ambiguous") — so no sales return
--  could be recorded. Found by the first test run. The function is the same
--  otherwise; "#variable_conflict use_column" makes those names the columns.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.order_returnable(p_order_id text)
RETURNS TABLE (product text, delivered numeric, returned numeric, returnable numeric, batches jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
#variable_conflict use_column
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id;
  IF NOT FOUND THEN RETURN; END IF;
  RETURN QUERY
  WITH lines AS (
    SELECT l ->> 'name' AS name, (l ->> 'quantity')::numeric AS qty FROM jsonb_array_elements(public.order_lines(o)) l
  ), delivered AS (
    SELECT name,
      CASE
        WHEN jsonb_typeof(o.items) = 'array' AND jsonb_array_length(o.items) > 0 THEN CASE WHEN o."fulfilledAt" IS NOT NULL THEN sum(qty) ELSE 0 END
        WHEN o."fulfilledAt" IS NOT NULL THEN greatest(sum(qty), coalesce(o."deliveredQty", 0))
        ELSE coalesce(o."deliveredQty", 0)
      END AS qty
    FROM lines GROUP BY name
  ), returned AS (
    SELECT l ->> 'product' AS name, sum((l ->> 'quantity')::numeric) AS qty
    FROM public.sales_returns r, jsonb_array_elements(r.lines) l WHERE r."orderId" = p_order_id GROUP BY 1
  ), per_batch AS (
    SELECT m.product AS name,
           jsonb_agg(jsonb_build_object('inventoryId', m."inventoryId", 'batchNumber', m."batchNumber",
                     'delivered', m.given, 'returned', coalesce(rb.back, 0), 'returnable', m.given - coalesce(rb.back, 0))) AS b
    FROM (SELECT product, "inventoryId", "batchNumber", sum(quantity) AS given FROM public.stock_movements
          WHERE "orderId" = p_order_id AND kind = 'delivery' GROUP BY 1, 2, 3) m
    LEFT JOIN (SELECT "inventoryId", sum(quantity) AS back FROM public.stock_movements
               WHERE "orderId" = p_order_id AND kind = 'return' GROUP BY 1) rb ON rb."inventoryId" = m."inventoryId"
    GROUP BY m.product
  )
  SELECT d.name, d.qty, coalesce(r.qty, 0), greatest(d.qty - coalesce(r.qty, 0), 0), pb.b
  FROM delivered d LEFT JOIN returned r ON r.name = d.name LEFT JOIN per_batch pb ON pb.name = d.name;
END $$;
REVOKE ALL ON FUNCTION public.order_returnable(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_returnable(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (filename, note)
VALUES ('055_order_returnable_fix.sql', 'order_returnable: #variable_conflict use_column (054 could not run)')
ON CONFLICT (filename) DO NOTHING;
