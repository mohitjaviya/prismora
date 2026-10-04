-- ============================================================================
--  PRISMORA — 091: expired stock written off or returned to the vendor
--  (Gap 17, owner 2026-10-04). NEEDS 087 (refuses to install otherwise).
--  Apply order: 086 → 087 → 089 → 091 (090 any time).
--
--  Expired units stay in a batch's quantity (never delivered, 052) and until
--  now could leave only through Adjust (a plain adjustment) or a purchase
--  return, which takes stock by product (vendor's batches first, then the
--  oldest), not from the chosen batch. Two batch-specific functions, same shape
--  and rules as 087's damaged ones:
--    write_off_expired(batch, qty, reason)            -> kind expired_write_off
--    return_expired_to_vendor(batch, vendor, qty,     -> kind expired_to_vendor
--                             unit cost, reason)          + a purchase return
--  Both: Super Admin / Admin / Warehouse Manager (087's may_move_damaged_stock),
--  reason required, whole quantity above zero, only on a batch whose expiry
--  date (India time) is before today, no more than quantity − reserved. The
--  vendor return follows 075's rules (vendor supplied the product, no more back
--  than delivered, unit cost no higher than ever charged), is a purchase return
--  with reason "Expired stock" that credits the vendor through the existing
--  trigger, and cannot be withdrawn (withdraw_purchase_return = 087's + check).
--  stock_expired_moves_enabled() lets the screen ask whether 091 is in place.
-- ============================================================================

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '087_damaged_stock_locked.sql') THEN
    RAISE EXCEPTION '091 needs 087 applied first.';
  END IF;
END $chk$;

-- ── 1. New movement kinds (keeps 087 + 089's list) ──────────────────────────
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn', 'grn_reversed', 'free_goods',
  'opening', 'opening_damaged', 'damaged_write_off', 'damaged_to_vendor', 'return_reclassified',
  'expired_write_off', 'expired_to_vendor']));

-- ── 2. The batch must be expired and hold the units ─────────────────────────
CREATE OR REPLACE FUNCTION public.expired_batch_for_move(p_inventory_id text, p_quantity numeric)
RETURNS public.inventory LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE b public.inventory;
BEGIN
  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % does not exist.', p_inventory_id USING ERRCODE = 'P0001'; END IF;
  IF b."expiryDate" IS NULL OR (b."expiryDate" AT TIME ZONE 'Asia/Kolkata')::date >= (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'Batch % of % has not expired, so it cannot be written off or returned as expired stock (use Adjust, or a purchase return).',
      coalesce(nullif(b."batchNumber", ''), b.id), b.product USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Quantity must be a whole number above zero.' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity > coalesce(b.quantity, 0) - coalesce(b.reserved, 0) THEN
    RAISE EXCEPTION 'Batch % holds only % expired unit(s) not reserved, so % cannot be moved.',
      coalesce(nullif(b."batchNumber", ''), b.id), greatest(coalesce(b.quantity, 0) - coalesce(b.reserved, 0), 0), p_quantity USING ERRCODE = 'P0001';
  END IF;
  RETURN b;
END $fn$;

-- ── 3. Write off expired ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_off_expired(p_inventory_id text, p_quantity numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE b public.inventory; v_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF NOT public.may_move_damaged_stock() THEN
    RAISE EXCEPTION 'Only Admin or Warehouse Manager can write off expired stock.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason for writing off expired stock.' USING ERRCODE = 'P0001';
  END IF;
  b := public.expired_batch_for_move(p_inventory_id, p_quantity);
  PERFORM set_config('app.via', format('expired written off: %s × %s (%s)', p_quantity, b.product, v_reason), true);
  UPDATE public.inventory SET quantity = coalesce(quantity, 0) - p_quantity WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
  VALUES ('expired_write_off', b.id, b.product, b."batchNumber", p_quantity, v_reason, public.my_user_id());
  RETURN jsonb_build_object('inventoryId', b.id, 'quantity', coalesce(b.quantity, 0) - p_quantity);
END $fn$;

-- ── 4. Return expired to vendor (075's purchase-return rules) ──────────────
CREATE OR REPLACE FUNCTION public.return_expired_to_vendor(
  p_inventory_id text, p_vendor_id text, p_quantity numeric, p_unit_cost numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  b public.inventory; v public.vendors;
  v_reason text := nullif(btrim(p_reason), '');
  v_received numeric; v_returned numeric; v_max_cost numeric;
  v_id text; v_value numeric;
BEGIN
  IF NOT public.may_move_damaged_stock() THEN
    RAISE EXCEPTION 'Only Admin or Warehouse Manager can return expired stock to a vendor.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason for returning expired stock to the vendor.' USING ERRCODE = 'P0001';
  END IF;
  b := public.expired_batch_for_move(p_inventory_id, p_quantity);
  SELECT * INTO v FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose the vendor the goods go back to.' USING ERRCODE = 'P0001'; END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Enter the unit cost (zero or more).' USING ERRCODE = 'P0001';
  END IF;

  SELECT coalesce(sum(coalesce(public.json_num(l ->> 'receivedQty'), public.json_num(l ->> 'quantity'), 0)), 0),
         max(public.json_num(l ->> 'unitCost'))
    INTO v_received, v_max_cost
    FROM public.grn g, jsonb_array_elements(coalesce(g.items, '[]'::jsonb)) l
   WHERE public.grn_vendor(g."poId", g."vendorName") = p_vendor_id AND lower(btrim(l ->> 'product')) = lower(btrim(b.product));
  SELECT greatest(v_max_cost, max(public.json_num(l ->> 'unitCost'))) INTO v_max_cost
    FROM public.purchase_orders po, jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) l
   WHERE po."vendorId" = p_vendor_id AND lower(btrim(l ->> 'product')) = lower(btrim(b.product));
  SELECT coalesce(sum(public.json_num(l ->> 'quantity')), 0) INTO v_returned
    FROM public.purchase_returns r, jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) l
   WHERE r."vendorId" = p_vendor_id AND lower(btrim(l ->> 'product')) = lower(btrim(b.product));
  IF v_received <= 0 THEN
    RAISE EXCEPTION '% has never delivered "%" (no goods receipt), so it cannot be returned to them.', v.name, b.product USING ERRCODE = 'P0001';
  END IF;
  IF v_returned + p_quantity > v_received THEN
    RAISE EXCEPTION 'Returning % of "%" is more than % supplied: received %, already returned %, so at most % can go back.',
      p_quantity, b.product, v.name, v_received, v_returned, greatest(v_received - v_returned, 0) USING ERRCODE = 'P0001';
  END IF;
  IF p_unit_cost > coalesce(v_max_cost, 0) THEN
    RAISE EXCEPTION 'Unit cost ₹% for "%" is above the most % ever charged for it (₹%).', p_unit_cost, b.product, v.name, coalesce(v_max_cost, 0)
      USING ERRCODE = 'P0001';
  END IF;

  v_id := 'PR-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM public.purchase_returns WHERE id = v_id) LOOP v_id := v_id || 'x'; END LOOP;
  v_value := round(p_quantity * p_unit_cost, 2);
  PERFORM set_config('app.via', format('expired returned to vendor: purchase return %s to %s', v_id, v.name), true);

  UPDATE public.inventory SET quantity = coalesce(quantity, 0) - p_quantity WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "returnId", note, "createdBy")
  VALUES ('expired_to_vendor', b.id, b.product, b."batchNumber", p_quantity, v_id, v_reason, public.my_user_id());

  PERFORM set_config('app.purchase_return', 'on', true);
  INSERT INTO public.purchase_returns (id, "vendorId", "vendorName", reason, items, value, notes, date, "recordedBy", "createdAt")
  VALUES (v_id, p_vendor_id, v.name, 'Expired stock',
          jsonb_build_array(jsonb_build_object('product', b.product, 'quantity', p_quantity, 'unitCost', p_unit_cost,
            'batchId', b.id, 'batchNumber', b."batchNumber", 'fromExpired', true)),
          v_value, v_reason, now(), public.my_user_id(), now());
  PERFORM set_config('app.purchase_return', 'off', true);

  RETURN jsonb_build_object('id', v_id, 'value', v_value, 'inventoryId', b.id, 'quantity', coalesce(b.quantity, 0) - p_quantity);
END $fn$;

-- ── 5. An expired-goods vendor return cannot be withdrawn ───────────────────
-- 087's definition, plus the expired check.
CREATE OR REPLACE FUNCTION public.withdraw_purchase_return(p_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  r public.purchase_returns;
  m record;
  v_units numeric := 0;
BEGIN
  IF NOT public.can_edit('purchases') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Withdrawing a purchase return needs full Purchases access.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.purchase_returns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % no longer exists.', p_id USING ERRCODE = 'P0001';
  END IF;
  -- 087: damaged goods sent back cannot come back onto the shelf this way.
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'damaged_to_vendor') THEN
    RAISE EXCEPTION 'Return % sent damaged goods back to the vendor, so it cannot be withdrawn (that would put damaged goods on sale). Ask the vendor for a correction instead.', p_id
      USING ERRCODE = 'P0001';
  END IF;
  -- 091: nor can expired goods sent back.
  IF EXISTS (SELECT 1 FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'expired_to_vendor') THEN
    RAISE EXCEPTION 'Return % sent expired goods back to the vendor, so it cannot be withdrawn (that would put expired goods back in stock). Ask the vendor for a correction instead.', p_id
      USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.via', format('purchase return %s withdrawn', p_id), true);

  IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'purchase_return')
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) l WHERE coalesce(public.json_num(l ->> 'quantity'), 0) > 0) THEN
    RAISE EXCEPTION 'Return % was recorded before stock moves were tracked, so the database cannot tell what stock it took. It cannot be withdrawn; correct the stock with a Cycle Count instead.', p_id
      USING ERRCODE = 'P0001';
  END IF;

  FOR m IN SELECT * FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'purchase_return' ORDER BY id LOOP
    UPDATE public.inventory SET quantity = coalesce(quantity, 0) + m.quantity WHERE id = m."inventoryId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % of "%" that return % took stock from no longer exists, so the stock cannot be put back.', coalesce(m."batchNumber", '(none)'), m.product, p_id
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "returnId")
    VALUES ('purchase_return_withdrawn', m."inventoryId", m.product, m."batchNumber", m.quantity, p_id);
    v_units := v_units + m.quantity;
  END LOOP;

  PERFORM set_config('app.purchase_return', 'on', true);
  DELETE FROM public.purchase_returns WHERE id = p_id;
  PERFORM set_config('app.purchase_return', 'off', true);
  RETURN jsonb_build_object('id', p_id, 'value', r.value, 'units', v_units);
END $function$;

-- ── 6. The screen's question: is 091 in place? ─────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_expired_moves_enabled()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$ SELECT true $fn$;

REVOKE EXECUTE ON FUNCTION public.expired_batch_for_move(text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.write_off_expired(text, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.return_expired_to_vendor(text, text, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stock_expired_moves_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_expired(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_expired_to_vendor(text, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_expired_moves_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('091_expired_stock_moves.sql',
        'Gap 17: write_off_expired / return_expired_to_vendor on an expired batch (Admin/Warehouse Manager, reason, movement row); expired vendor return cannot be withdrawn')
ON CONFLICT (filename) DO NOTHING;
