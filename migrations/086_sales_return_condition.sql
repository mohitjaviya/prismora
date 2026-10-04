-- ============================================================================
--  PRISMORA — 086: condition of returned goods (Gap 11 G, owner 2026-10-04)
--
--  Every returned line carries a condition: Good, Damaged or Expired.
--    Good            -> back into the batch's quantity (sellable), as before.
--    Damaged/Expired -> into the batch's "damaged" counter instead. Sellable is
--                       quantity − reserved, so these units can never be sold
--                       or delivered. Expired shares the counter (owner); the
--                       per-line condition tells the two apart in reports.
--  The credit note is unchanged: the partner is credited whatever the condition.
--
--  New columns (nullable; nothing old is rewritten):
--    sales_returns.condition     Good / Damaged / Expired / Mixed (summary)
--    stock_movements.condition   Good / Damaged / Expired (on kind 'return')
--  The 14 returns recorded before 086 keep condition NULL ("not recorded"):
--  their units went back into sellable stock and stay there. No stock, credit
--  note, balance or ledger value changes.
--
--  A line sent WITHOUT a condition is taken as Good: that is exactly what the
--  screen did before 086, so a page still running the old code keeps working
--  between applying this file and deploying the new screen. Any other value is
--  refused.
--
--  record_sales_return is otherwise the live definition (054 + 056), unchanged.
--  Moving damaged units back to sellable is NOT part of this (owner: follow-up).
-- ============================================================================

ALTER TABLE public.sales_returns ADD COLUMN IF NOT EXISTS condition text;
ALTER TABLE public.sales_returns DROP CONSTRAINT IF EXISTS sales_returns_condition_check;
ALTER TABLE public.sales_returns ADD CONSTRAINT sales_returns_condition_check
  CHECK (condition IS NULL OR condition IN ('Good', 'Damaged', 'Expired', 'Mixed'));

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS condition text;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_condition_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_condition_check
  CHECK (condition IS NULL OR condition IN ('Good', 'Damaged', 'Expired'));

CREATE OR REPLACE FUNCTION public.record_sales_return(p_order_id text, p_lines jsonb, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  inv public.invoices;
  line jsonb;
  pos record;
  batch_pos jsonb;
  v_product text; v_qty numeric; v_batch text; v_inv_id text; v_reason text;
  v_cond_in text; v_cond text; v_conds text[];
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

    -- 086: the goods' condition. None sent = Good (the screen before 086).
    v_cond_in := nullif(btrim(line ->> 'condition'), '');
    v_cond := CASE lower(coalesce(v_cond_in, 'good'))
                WHEN 'good' THEN 'Good' WHEN 'damaged' THEN 'Damaged' WHEN 'expired' THEN 'Expired' END;
    IF v_cond IS NULL THEN
      RAISE EXCEPTION 'Condition of the returned "%" must be Good, Damaged or Expired (got "%").', v_product, v_cond_in
        USING ERRCODE = 'P0001';
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

    -- 086: Good goes back on sale; Damaged/Expired into the non-sellable counter.
    IF v_target.id IS NOT NULL THEN
      IF v_cond = 'Good' THEN
        UPDATE public.inventory SET quantity = coalesce(quantity, 0) + v_qty WHERE id = v_target.id;
      ELSE
        UPDATE public.inventory SET damaged = coalesce(damaged, 0) + v_qty WHERE id = v_target.id;
      END IF;
    ELSE
      INSERT INTO public.inventory (id, product, "batchNumber", quantity, "unitCost", warehouse, "reorderLevel", reserved, transit, damaged, "createdAt")
      VALUES ('INV-ITEM-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4),
              v_product, v_batch, CASE WHEN v_cond = 'Good' THEN v_qty ELSE 0 END, 0, 'Main Warehouse', 0, 0, 0,
              CASE WHEN v_cond = 'Good' THEN 0 ELSE v_qty END, now())
      RETURNING * INTO v_target;
    END IF;
    INSERT INTO public.stock_movements (kind, "orderId", "inventoryId", product, "batchNumber", quantity, "returnId", condition)
    VALUES ('return', p_order_id, v_target.id, v_product, v_target."batchNumber", v_qty, v_return_id, v_cond);
    v_conds := array_append(v_conds, v_cond);

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
      'batchNumber', v_target."batchNumber", 'reason', v_reason, 'condition', v_cond,
      'unitPrice', v_unit, 'gstPct', v_gst, 'value', v_line_value);
  END LOOP;

  -- The credit note moves the partner's balance, once (046).
  v_cn_id := 'CN-' || v_return_id;
  INSERT INTO public.credit_notes (id, "invoiceId", "customerName", amount, reason, "recordedBy", "createdAt",
                                   "distributorId", "dealerId", "retailerId")
  VALUES (v_cn_id, inv.id, coalesce(inv."customerName", o."customerName"), v_value,
          'Sales Return — ' || (SELECT string_agg(DISTINCT l ->> 'reason', ', ') FROM jsonb_array_elements(v_lines) l),
          public.my_user_id(), now(), o."distributorId", o."dealerId", o."retailerId");

  -- The credit note's own trigger relabels the change; this row is the return.
  PERFORM set_config('app.via', format('sales return %s for order %s', v_return_id, p_order_id), true);
  INSERT INTO public.sales_returns (id, "orderId", "invoiceId", "creditNoteId", "distributorId", "dealerId", "retailerId",
                                    lines, value, note, "createdBy", "createdAt", condition)
  VALUES (v_return_id, p_order_id, inv.id, v_cn_id, o."distributorId", o."dealerId", o."retailerId",
          v_lines, v_value, nullif(btrim(p_note), ''), public.my_user_id(), now(),
          CASE WHEN (SELECT count(DISTINCT c) FROM unnest(v_conds) c) = 1 THEN v_conds[1] ELSE 'Mixed' END);

  RETURN jsonb_build_object('returnId', v_return_id, 'creditNoteId', v_cn_id, 'value', v_value, 'lines', v_lines);
END $function$;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('086_sales_return_condition.sql', 'Gap 11 G: returned goods condition Good/Damaged/Expired; Damaged/Expired to inventory.damaged (not sellable)')
ON CONFLICT (filename) DO NOTHING;
