-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3: a delivered order is never cancelled; goods come back
--  through a sales return (D-19, D-22 remainder).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 039, 046, 052.
--
--  WHAT WAS WRONG
--
--  · D-19: an administrator could set a Delivered order to Cancelled (or back
--    to any other status, or delete it) and nothing was reversed — the stock
--    stayed out, the invoice stood, the partner still owed.
--  · D-22: a "Sales Return" credit note gave money back and put no stock
--    back. Nothing limited a return to what had been delivered.
--
--  WHAT THIS DOES
--
--  1. Once an order has been delivered (fulfilled, or any units delivered),
--     its status cannot move away from Delivered / Partially Delivered, and it
--     cannot be deleted — for every role. The message says to record a sales
--     return or a credit note instead.
--  2. Deliveries now record which batches they took (stock_movements), so a
--     return can go back to the batch the goods came from.
--  3. record_sales_return(order, lines, note) — Accounts (Accounting full),
--     the warehouse (Inventory full) and administrators. In one transaction:
--       · each line is a product on the order, quantity above zero, and the
--         order's returns of that product — this one included — never exceed
--         what was delivered; where the delivery's batches are known, a batch
--         never takes back more than it gave;
--       · the units go back into that batch (or, for a delivery made before
--         batches were recorded, the batch chosen — joined by batch number,
--         or started);
--       · a credit note is raised for the value billed (unit price, plus GST
--         where the invoice is a GST invoice), which moves the partner's
--         balance once (046);
--       · the return is kept in sales_returns. Everything is audited to the
--         person who recorded it.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Delivered is final ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_delivered_is_final()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  delivered boolean := OLD."fulfilledAt" IS NOT NULL OR coalesce(OLD."deliveredQty", 0) > 0
                       OR OLD.status IN ('Delivered', 'Partially Delivered');
BEGIN
  -- Every app user, whatever their role. Database maintenance run by the
  -- owner (the TEST-data clean-up script) is not an app action and passes.
  IF NOT delivered OR current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Order % has been delivered, so it cannot be deleted. Record a sales return (Orders → Sales return) or issue a credit note instead.', OLD.id
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status
     AND NOT (OLD.status = 'Partially Delivered' AND NEW.status IN ('Partially Delivered', 'Delivered')) THEN
    RAISE EXCEPTION 'Order % has been delivered, so it cannot be %. Record a sales return (Orders → Sales return) or issue a credit note instead.',
      OLD.id, CASE WHEN NEW.status = 'Cancelled' THEN 'cancelled' ELSE format('moved back to %s', NEW.status) END
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_delivered_is_final ON public.orders;
CREATE TRIGGER order_delivered_is_final
  BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_delivered_is_final();


-- ── 2. Which batches a delivery took ────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.stock_movements (
  id            bigserial PRIMARY KEY,
  at            timestamptz NOT NULL DEFAULT now(),
  kind          text NOT NULL CHECK (kind IN ('delivery', 'return')),
  "orderId"     text REFERENCES public.orders(id) ON DELETE SET NULL,
  "inventoryId" text,
  product       text NOT NULL,
  "batchNumber" text,
  quantity      numeric NOT NULL,
  "returnId"    text
);
CREATE INDEX IF NOT EXISTS stock_movements_order ON public.stock_movements ("orderId");
ALTER TABLE public.stock_movements ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS stock_movements_select ON public.stock_movements;
CREATE POLICY stock_movements_select ON public.stock_movements FOR SELECT TO authenticated
  USING ((public.can_view('inventory') OR public.can_view('accounting') OR public.can_view('orders')) AND NOT public.is_partner());
REVOKE INSERT, UPDATE, DELETE ON public.stock_movements FROM anon, authenticated;

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
  PERFORM 1 FROM public.inventory
  WHERE product IN (SELECT n ->> 'name' FROM jsonb_array_elements(p_needs) n)
  FOR UPDATE;

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
      SELECT id, quantity, "batchNumber" FROM public.inventory
      WHERE product = need.name AND quantity > 0 AND public.batch_is_sellable("expiryDate")
      ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC, id
    LOOP
      EXIT WHEN remaining <= 0;
      taken := least(remaining, batch.quantity);
      UPDATE public.inventory SET quantity = quantity - taken WHERE id = batch.id;
      INSERT INTO public.stock_movements (kind, "orderId", "inventoryId", product, "batchNumber", quantity)
      VALUES ('delivery', p_order_id, batch.id, need.name, batch."batchNumber", taken);
      remaining := remaining - taken;
    END LOOP;
  END LOOP;
END $function$;


-- ── 3. Sales returns ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.sales_returns (
  id              text PRIMARY KEY,
  "orderId"       text NOT NULL REFERENCES public.orders(id),
  "invoiceId"     text,
  "creditNoteId"  text,
  "distributorId" text, "dealerId" text, "retailerId" text,
  lines           jsonb NOT NULL,
  value           numeric NOT NULL,
  note            text,
  "createdBy"     text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  "updatedBy"     text,
  "updatedAt"     timestamptz
);
ALTER TABLE public.sales_returns ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS sales_returns_select ON public.sales_returns;
CREATE POLICY sales_returns_select ON public.sales_returns FOR SELECT TO authenticated
  USING (public.can_view('accounting') OR public.can_view('inventory') OR public.can_view('orders') AND NOT public.is_partner()
         OR (public.is_partner() AND public.owns_party_row("distributorId", "dealerId", "retailerId")));
REVOKE INSERT, UPDATE, DELETE ON public.sales_returns FROM anon, authenticated;
DROP TRIGGER IF EXISTS stamp_modified ON public.sales_returns;
CREATE TRIGGER stamp_modified BEFORE INSERT OR UPDATE ON public.sales_returns FOR EACH ROW EXECUTE FUNCTION public.stamp_modified();
DROP TRIGGER IF EXISTS audit_row ON public.sales_returns;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.sales_returns FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- What an order delivered, returned, and can still take back — per product,
-- and per batch where the delivery's batches are known.
CREATE OR REPLACE FUNCTION public.order_returnable(p_order_id text)
RETURNS TABLE (product text, delivered numeric, returned numeric, returnable numeric, batches jsonb)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
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

CREATE OR REPLACE FUNCTION public.record_sales_return(p_order_id text, p_lines jsonb, p_note text DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  inv public.invoices;
  line jsonb;
  pos record;
  batch_pos jsonb;
  v_product text; v_qty numeric; v_batch text; v_inv_id text; v_reason text;
  v_unit numeric; v_gst numeric; v_line_value numeric;
  v_value numeric := 0;
  v_lines jsonb := '[]'::jsonb;
  v_return_id text; v_cn_id text;
  v_target public.inventory;
  v_this numeric;
BEGIN
  IF NOT (public.can_edit('accounting') OR public.can_edit('inventory')) OR public.is_partner() THEN
    RAISE EXCEPTION 'Recording a sales return needs full Accounting or Inventory access.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order % does not exist.', p_order_id USING ERRCODE = 'P0001'; END IF;
  IF o."fulfilledAt" IS NULL AND coalesce(o."deliveredQty", 0) <= 0 THEN
    RAISE EXCEPTION 'Order % has not been delivered, so nothing can be returned. Cancel it instead.', p_order_id USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_lines) IS DISTINCT FROM 'array' OR jsonb_array_length(p_lines) = 0 THEN
    RAISE EXCEPTION 'A return needs at least one line.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO inv FROM public.invoices WHERE "orderId" = p_order_id LIMIT 1;

  v_return_id := 'SR-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  PERFORM set_config('app.via', format('sales return %s for order %s', v_return_id, p_order_id), true);

  FOR line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    v_product := btrim(line ->> 'product');
    v_qty := nullif(line ->> 'quantity', '')::numeric;
    v_inv_id := nullif(line ->> 'inventoryId', '');
    v_batch := nullif(btrim(line ->> 'batchNumber'), '');
    v_reason := coalesce(nullif(btrim(line ->> 'reason'), ''), 'Returned');
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'Quantity to return for "%" must be a whole number above zero.', v_product USING ERRCODE = 'P0001';
    END IF;

    SELECT * INTO pos FROM public.order_returnable(p_order_id) r WHERE r.product = v_product;
    IF NOT FOUND THEN
      RAISE EXCEPTION '"%" is not on order %.', v_product, p_order_id USING ERRCODE = 'P0001';
    END IF;
    -- This return's earlier lines of the same product count too.
    SELECT coalesce(sum((l ->> 'quantity')::numeric), 0) INTO v_this FROM jsonb_array_elements(v_lines) l WHERE l ->> 'product' = v_product;
    IF v_this + v_qty > pos.returnable THEN
      RAISE EXCEPTION 'Returning % of "%" is more than can come back on order % (delivered %, already returned %, returnable %).',
        v_this + v_qty, v_product, p_order_id, pos.delivered, pos.returned, pos.returnable - v_this USING ERRCODE = 'P0001';
    END IF;

    -- Which batch it goes back to.
    IF pos.batches IS NOT NULL THEN
      SELECT b INTO batch_pos FROM jsonb_array_elements(pos.batches) b WHERE b ->> 'inventoryId' = v_inv_id;
      IF batch_pos IS NULL THEN
        RAISE EXCEPTION 'Order % did not deliver "%" from that batch. Choose one of the batches it was delivered from.', p_order_id, v_product
          USING ERRCODE = 'P0001';
      END IF;
      SELECT coalesce(sum((l ->> 'quantity')::numeric), 0) INTO v_this FROM jsonb_array_elements(v_lines) l WHERE l ->> 'inventoryId' = v_inv_id;
      IF v_this + v_qty > (batch_pos ->> 'returnable')::numeric THEN
        RAISE EXCEPTION 'Batch % of "%" gave % to order % and % has come back; % more is too many.',
          coalesce(batch_pos ->> 'batchNumber', '(no batch number)'), v_product, batch_pos ->> 'delivered', p_order_id,
          batch_pos ->> 'returned', v_this + v_qty USING ERRCODE = 'P0001';
      END IF;
      SELECT * INTO v_target FROM public.inventory WHERE id = v_inv_id FOR UPDATE;
    ELSE
      -- Delivered before batches were recorded: the batch chosen, by id or number.
      IF v_inv_id IS NOT NULL THEN
        SELECT * INTO v_target FROM public.inventory WHERE id = v_inv_id AND product = v_product FOR UPDATE;
      ELSIF v_batch IS NOT NULL THEN
        SELECT * INTO v_target FROM public.inventory
        WHERE lower(btrim(product)) = lower(v_product) AND lower(btrim(coalesce("batchNumber", ''))) = lower(v_batch)
        ORDER BY "createdAt" NULLS LAST, id LIMIT 1 FOR UPDATE;
      ELSE
        RAISE EXCEPTION 'Choose the batch the returned "%" goes back to.', v_product USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF v_target.id IS NOT NULL THEN
      UPDATE public.inventory SET quantity = coalesce(quantity, 0) + v_qty WHERE id = v_target.id;
    ELSE
      INSERT INTO public.inventory (id, product, "batchNumber", quantity, "unitCost", warehouse, "reorderLevel", reserved, transit, damaged, "createdAt")
      VALUES ('INV-ITEM-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4),
              v_product, v_batch, v_qty, 0, 'Main Warehouse', 0, 0, 0, 0, now())
      RETURNING * INTO v_target;
    END IF;
    INSERT INTO public.stock_movements (kind, "orderId", "inventoryId", product, "batchNumber", quantity, "returnId")
    VALUES ('return', p_order_id, v_target.id, v_product, v_target."batchNumber", v_qty, v_return_id);

    -- Credited at what was billed: the invoice's line price, plus its GST on a
    -- GST invoice; the order's price where there is no invoice line.
    SELECT (l ->> 'unitPrice')::numeric, CASE WHEN inv."invoiceType" = 'tax_invoice' THEN coalesce((l ->> 'gstPct')::numeric, 0) ELSE 0 END
      INTO v_unit, v_gst
      FROM jsonb_array_elements(coalesce(inv.lines, '[]'::jsonb)) l WHERE l ->> 'name' = v_product LIMIT 1;
    IF v_unit IS NULL THEN
      SELECT (l ->> 'unitPrice')::numeric INTO v_unit FROM jsonb_array_elements(public.order_lines(o)) l WHERE l ->> 'name' = v_product LIMIT 1;
      v_gst := 0;
    END IF;
    v_line_value := round(v_qty * coalesce(v_unit, 0) * (1 + coalesce(v_gst, 0) / 100), 2);
    v_value := v_value + v_line_value;

    v_lines := v_lines || jsonb_build_object('product', v_product, 'quantity', v_qty, 'inventoryId', v_target.id,
      'batchNumber', v_target."batchNumber", 'reason', v_reason, 'unitPrice', v_unit, 'gstPct', v_gst, 'value', v_line_value);
  END LOOP;

  -- The credit note moves the partner's balance, once (046).
  v_cn_id := 'CN-' || v_return_id;
  INSERT INTO public.credit_notes (id, "invoiceId", "customerName", amount, reason, "recordedBy", "createdAt",
                                   "distributorId", "dealerId", "retailerId")
  VALUES (v_cn_id, inv.id, coalesce(inv."customerName", o."customerName"), v_value,
          'Sales Return — ' || (SELECT string_agg(DISTINCT l ->> 'reason', ', ') FROM jsonb_array_elements(v_lines) l),
          public.my_user_id(), now(), o."distributorId", o."dealerId", o."retailerId");

  INSERT INTO public.sales_returns (id, "orderId", "invoiceId", "creditNoteId", "distributorId", "dealerId", "retailerId",
                                    lines, value, note, "createdBy", "createdAt")
  VALUES (v_return_id, p_order_id, inv.id, v_cn_id, o."distributorId", o."dealerId", o."retailerId",
          v_lines, v_value, nullif(btrim(p_note), ''), public.my_user_id(), now());

  RETURN jsonb_build_object('returnId', v_return_id, 'creditNoteId', v_cn_id, 'value', v_value, 'lines', v_lines);
END $$;
REVOKE ALL ON FUNCTION public.record_sales_return(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sales_return(text, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('054_sales_returns_and_no_undelivering.sql',
        'D-19: a delivered order cannot be cancelled, moved back or deleted; deliveries record their batches; record_sales_return puts stock back, raises the credit note (balance once), never more than delivered')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
