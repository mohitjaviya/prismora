-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 054 follow-up: a sales return's own row is audited as the return.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 054, 055.
--
--  record_sales_return raises its credit note before saving the return, and
--  the credit note's balance trigger (046) relabels app.via, so the
--  sales_returns audit row read "credit note CN-SR-…" instead of "sales return
--  SR-… for order O…". The person was always right; the label now is too.
--  Otherwise identical to 054.
-- ════════════════════════════════════════════════════════════════════════

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

  -- The credit note's own trigger relabels the change; this row is the return.
  PERFORM set_config('app.via', format('sales return %s for order %s', v_return_id, p_order_id), true);
  INSERT INTO public.sales_returns (id, "orderId", "invoiceId", "creditNoteId", "distributorId", "dealerId", "retailerId",
                                    lines, value, note, "createdBy", "createdAt")
  VALUES (v_return_id, p_order_id, inv.id, v_cn_id, o."distributorId", o."dealerId", o."retailerId",
          v_lines, v_value, nullif(btrim(p_note), ''), public.my_user_id(), now());

  RETURN jsonb_build_object('returnId', v_return_id, 'creditNoteId', v_cn_id, 'value', v_value, 'lines', v_lines);
END $$;
REVOKE ALL ON FUNCTION public.record_sales_return(text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_sales_return(text, jsonb, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations (filename, note)
VALUES ('056_sales_return_audit_label.sql', 'record_sales_return: the sales_returns row is audited via the return, not its credit note')
ON CONFLICT (filename) DO NOTHING;
