-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3, D-18: expired stock is never delivered. And PO-1
--  reopened (owner request).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 039 (deduct_stock), 051.
--
--  D-18  deduct_stock took the earliest expiry first but never skipped an
--        expired batch, and its shortage check counted expired units as
--        stock. Aloevera Skin Gel had 365 of 690 units past expiry — they
--        would have gone out first. Now:
--          · a batch is sellable through its expiry day (India time), and
--            expired from the next day — batch_is_sellable();
--          · the shortage check counts sellable stock only, and a refusal
--            gives ordered, available (not expired) and expired quantities;
--          · batches are taken earliest-expiry first among sellable ones.
--        Expired batches stay on record (real goods, to return or write off).
--
--  PO-1  Manually set Closed while 100 of its 200 were still outstanding,
--        because the app could not receive the rest (D-20, fixed in 051).
--        Reopened as Partially Received so the remaining 100 can come in.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── PO-1 reopened ───────────────────────────────────────────────────────
DO $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = 'PO-1';
  IF v_status = 'Closed' THEN
    PERFORM set_config('app.via', 'migration 052: PO-1 reopened as Partially Received — closed by hand with 100 of 200 outstanding, because the app could not receive the rest before D-20 (owner request 2026-09-28)', true);
    UPDATE public.purchase_orders SET status = 'Partially Received' WHERE id = 'PO-1';
  END IF;
END $$;

-- ── D-18 ────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.batch_is_sellable(p_expiry timestamptz)
RETURNS boolean LANGUAGE sql STABLE
AS $$
  SELECT p_expiry IS NULL
      OR (p_expiry AT TIME ZONE 'Asia/Kolkata')::date >= (now() AT TIME ZONE 'Asia/Kolkata')::date
$$;

CREATE OR REPLACE FUNCTION public.deduct_stock(p_order_id text, p_needs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  need record;
  batch record;
  remaining numeric;
  taken numeric;
  short text;
BEGIN
  -- Lock the batches involved so two deliveries cannot both spend the same units.
  PERFORM 1 FROM public.inventory
  WHERE product IN (SELECT n ->> 'name' FROM jsonb_array_elements(p_needs) n)
  FOR UPDATE;

  -- Only sellable stock counts. Expired units are named, so the refusal says
  -- why there is stock on the shelf that cannot go.
  SELECT string_agg(
           format('%s: ordered %s, available %s (not expired)%s', w.name, w.qty, w.have,
                  CASE WHEN w.expired > 0 THEN format(', expired %s — expired stock is never delivered', w.expired) ELSE '' END),
           '; ')
  INTO short
  FROM (
    SELECT n.name, n.qty,
           coalesce((SELECT sum(quantity) FROM public.inventory i
                     WHERE i.product = n.name AND i.quantity > 0 AND public.batch_is_sellable(i."expiryDate")), 0) AS have,
           coalesce((SELECT sum(quantity) FROM public.inventory i
                     WHERE i.product = n.name AND i.quantity > 0 AND NOT public.batch_is_sellable(i."expiryDate")), 0) AS expired
    FROM (
      SELECT n ->> 'name' AS name, sum((n ->> 'quantity')::numeric) AS qty
      FROM jsonb_array_elements(p_needs) n
      WHERE nullif(n ->> 'name', '') IS NOT NULL AND (n ->> 'quantity')::numeric > 0
      GROUP BY 1
    ) n
  ) w
  WHERE w.have < w.qty;

  IF short IS NOT NULL THEN
    RAISE EXCEPTION 'Not enough stock to deliver order %. %.', p_order_id, short USING ERRCODE = 'P0001';
  END IF;

  FOR need IN
    SELECT n ->> 'name' AS name, sum((n ->> 'quantity')::numeric) AS qty
    FROM jsonb_array_elements(p_needs) n
    WHERE nullif(n ->> 'name', '') IS NOT NULL AND (n ->> 'quantity')::numeric > 0
    GROUP BY 1
  LOOP
    remaining := need.qty;
    FOR batch IN
      SELECT id, quantity FROM public.inventory
      WHERE product = need.name AND quantity > 0 AND public.batch_is_sellable("expiryDate")
      ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC, id
    LOOP
      EXIT WHEN remaining <= 0;
      taken := least(remaining, batch.quantity);
      UPDATE public.inventory SET quantity = quantity - taken WHERE id = batch.id;
      remaining := remaining - taken;
    END LOOP;
  END LOOP;
END $function$;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('052_expired_stock_never_delivered.sql',
        'D-18: deduct_stock counts and takes sellable (unexpired) batches only, refusal names expired units; PO-1 reopened as Partially Received')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
