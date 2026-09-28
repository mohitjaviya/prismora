-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3, D-20: a partial goods receipt leaves the PO open.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 041.
--
--  WHAT WAS WRONG
--
--  Any GRN set its PO to "GRN Done" (from the browser), and a GRN could only
--  be raised on a Confirmed PO — so after receiving 100 of 200 the other 100
--  could never be received (PO-1). Nothing stopped receiving more than was
--  ordered, or a line that was never on the PO.
--
--  WHAT THIS DOES
--
--  · A receipt against a PO is checked here before it saves: the PO must be
--    Confirmed or Partially Received; every line must be a product on the PO;
--    and what has been received of each product, this receipt included, may
--    not exceed what was ordered. Refused with the ordered / received /
--    outstanding figures.
--  · After it saves, the PO becomes "Partially Received" — or "GRN Done" once
--    every product is received in full. Set here, whoever records it.
--  · "Partially Received" joins the PO statuses (Masters, locked).
--  Products are matched ignoring case and surrounding spaces, as 041 does.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO public.masters (id, list, key, label, sort, active, locked, color, description, "createdAt")
VALUES ('M-pst-6', 'po_status', 'Partially Received', 'Partially Received', 2, true, true, '#f59e0b',
        'Some goods received; the PO stays open for the rest', now())
ON CONFLICT (id) DO NOTHING;

-- What a PO ordered and has received, per product.
CREATE OR REPLACE FUNCTION public.po_receipt_position(p_po_id text, p_exclude_grn text DEFAULT NULL)
RETURNS TABLE (product_key text, product text, ordered numeric, received numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH ordered AS (
    SELECT lower(btrim(l ->> 'product')) AS k, min(btrim(l ->> 'product')) AS product,
           sum(coalesce(nullif(l ->> 'quantity', '')::numeric, 0)) AS qty
    FROM public.purchase_orders po, jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) l
    WHERE po.id = p_po_id AND nullif(btrim(l ->> 'product'), '') IS NOT NULL
    GROUP BY 1
  ), received AS (
    SELECT lower(btrim(l ->> 'product')) AS k,
           sum(coalesce(nullif(l ->> 'receivedQty', '')::numeric, nullif(l ->> 'quantity', '')::numeric, 0)) AS qty
    FROM public.grn g, jsonb_array_elements(coalesce(g.items, '[]'::jsonb)) l
    WHERE g."poId" = p_po_id AND g.id IS DISTINCT FROM p_exclude_grn
    GROUP BY 1
  )
  SELECT o.k, o.product, o.qty, coalesce(r.qty, 0) FROM ordered o LEFT JOIN received r ON r.k = o.k
$$;
REVOKE ALL ON FUNCTION public.po_receipt_position(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.po_receipt_position(text, text) TO authenticated;

-- Before a receipt saves: is it within the PO?
CREATE OR REPLACE FUNCTION public.grn_within_po()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  line jsonb;
  v_key text;
  v_qty numeric;
  v_pos record;
  v_this numeric;
BEGIN
  IF NEW."poId" IS NULL THEN RETURN NEW; END IF;

  SELECT status INTO v_status FROM public.purchase_orders WHERE id = NEW."poId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase order % does not exist.', NEW."poId" USING ERRCODE = '23503';
  END IF;
  IF v_status NOT IN ('Confirmed', 'Partially Received') THEN
    RAISE EXCEPTION 'Purchase order % is %; goods can be received only against a Confirmed or Partially Received PO.', NEW."poId", v_status
      USING ERRCODE = '23514';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb)) LOOP
    v_qty := coalesce(nullif(line ->> 'receivedQty', '')::numeric, nullif(line ->> 'quantity', '')::numeric, 0);
    CONTINUE WHEN v_qty <= 0;
    v_key := lower(btrim(line ->> 'product'));
    SELECT * INTO v_pos FROM public.po_receipt_position(NEW."poId", NEW.id) p WHERE p.product_key = v_key;
    IF NOT FOUND THEN
      RAISE EXCEPTION '"%" is not on purchase order %.', line ->> 'product', NEW."poId" USING ERRCODE = '23514';
    END IF;
    SELECT coalesce(sum(coalesce(nullif(l ->> 'receivedQty', '')::numeric, nullif(l ->> 'quantity', '')::numeric, 0)), 0)
      INTO v_this
      FROM jsonb_array_elements(NEW.items) l WHERE lower(btrim(l ->> 'product')) = v_key;
    IF v_pos.received + v_this > v_pos.ordered THEN
      RAISE EXCEPTION 'Receiving % of "%" would exceed purchase order % (ordered %, already received %, outstanding %).',
        v_this, v_pos.product, NEW."poId", v_pos.ordered, v_pos.received, greatest(v_pos.ordered - v_pos.received, 0)
        USING ERRCODE = '23514';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.grn_within_po() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grn_within_po ON public.grn;
CREATE TRIGGER grn_within_po
  BEFORE INSERT ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_within_po();

-- After a receipt saves: where does the PO stand?
CREATE OR REPLACE FUNCTION public.grn_updates_po_status()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE v_open boolean;
BEGIN
  IF NEW."poId" IS NULL THEN RETURN NULL; END IF;
  SELECT bool_or(received < ordered) INTO v_open FROM public.po_receipt_position(NEW."poId");
  PERFORM set_config('app.via', format('goods receipt %s', NEW.id), true);
  UPDATE public.purchase_orders
     SET status = CASE WHEN coalesce(v_open, false) THEN 'Partially Received' ELSE 'GRN Done' END
   WHERE id = NEW."poId";
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.grn_updates_po_status() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grn_updates_po_status ON public.grn;
CREATE TRIGGER grn_updates_po_status
  AFTER INSERT ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_updates_po_status();

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('051_partial_goods_receipts.sql',
        'D-20: GRNs checked against the PO (status, products, not over what was ordered); PO → Partially Received / GRN Done in the database')
ON CONFLICT (filename) DO NOTHING;
