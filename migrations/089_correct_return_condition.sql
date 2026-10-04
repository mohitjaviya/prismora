-- ============================================================================
--  PRISMORA — 089: correct the condition of an earlier sales return
--  (owner 2026-10-04, after O319/O320: returns recorded before 086 put damaged
--  goods back into sellable stock). 088 is reserved for Gap 5.
--
--  REQUIRES 086 and 087 (refuses to install without them).
--
--  correct_return_condition(return id, product, batch id, quantity, condition,
--  reason) moves units of one returned line from the batch's sellable quantity
--  into its damaged count:
--    - Super Admin / Admin / Warehouse Manager only (087's may_move_damaged_stock);
--    - condition Damaged or Expired; reason required (3+ characters);
--    - only lines that went back on sale: condition NULL (before 086) or Good;
--      no more than the line's quantity less what was already corrected;
--    - refused if those units are no longer sellable in that batch (sold,
--      delivered, reserved or moved since): quantity − reserved must cover it;
--    - one movement row, kind return_reclassified (stock −q, damaged +q), with
--      the return, order, person and reason;
--    - the line in sales_returns.lines gets "corrections": [{quantity,
--      condition, reason, at, by}] so the order's Returns list can show it.
--  Credit note, invoice, partner balance and ledger are NOT touched: the
--  partner was credited for the goods either way; only where they sit changes.
--
--  stock_return_correction_enabled() lets the screen ask whether 089 is in.
-- ============================================================================

DO $chk$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '086_sales_return_condition.sql')
     OR NOT EXISTS (SELECT 1 FROM public.schema_migrations WHERE filename = '087_damaged_stock_locked.sql') THEN
    RAISE EXCEPTION '089 needs 086 and 087 applied first.';
  END IF;
END $chk$;

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn', 'grn_reversed', 'free_goods',
  'opening', 'opening_damaged', 'damaged_write_off', 'damaged_to_vendor', 'return_reclassified']));

CREATE OR REPLACE FUNCTION public.correct_return_condition(
  p_return_id text, p_product text, p_inventory_id text, p_quantity numeric, p_condition text, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  r public.sales_returns;
  b public.inventory;
  v_reason text := nullif(btrim(p_reason), '');
  v_cond text := CASE lower(btrim(coalesce(p_condition, ''))) WHEN 'damaged' THEN 'Damaged' WHEN 'expired' THEN 'Expired' END;
  v_idx int; v_line jsonb; v_line_qty numeric; v_done numeric; v_sellable numeric;
BEGIN
  IF NOT public.may_move_damaged_stock() THEN
    RAISE EXCEPTION 'Only Admin or Warehouse Manager can correct the condition of a return.' USING ERRCODE = '42501';
  END IF;
  IF v_cond IS NULL THEN
    RAISE EXCEPTION 'The corrected condition must be Damaged or Expired.' USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason for correcting this return.' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Quantity to correct must be a whole number above zero.' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO r FROM public.sales_returns WHERE id = p_return_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Return % does not exist.', p_return_id USING ERRCODE = 'P0001'; END IF;

  SELECT ord - 1, l INTO v_idx, v_line
    FROM jsonb_array_elements(r.lines) WITH ORDINALITY AS t(l, ord)
   WHERE l ->> 'product' = p_product AND l ->> 'inventoryId' = p_inventory_id
   ORDER BY ord LIMIT 1;
  IF v_line IS NULL THEN
    RAISE EXCEPTION 'Return % has no line of "%" into that batch.', p_return_id, p_product USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(v_line ->> 'condition', 'Good') <> 'Good' THEN
    RAISE EXCEPTION 'That line of return % was already recorded as %; its units are not in sellable stock.', p_return_id, v_line ->> 'condition'
      USING ERRCODE = 'P0001';
  END IF;
  v_line_qty := coalesce((v_line ->> 'quantity')::numeric, 0);
  SELECT coalesce(sum(quantity), 0) INTO v_done FROM public.stock_movements
   WHERE kind = 'return_reclassified' AND "returnId" = p_return_id AND "inventoryId" = p_inventory_id AND product = p_product;
  IF v_done + p_quantity > v_line_qty THEN
    RAISE EXCEPTION 'Return % brought back % of "%"; % already corrected, so at most % more can be.',
      p_return_id, v_line_qty, p_product, v_done, greatest(v_line_qty - v_done, 0) USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'The batch return % went into no longer exists.', p_return_id USING ERRCODE = 'P0001';
  END IF;
  v_sellable := greatest(coalesce(b.quantity, 0) - coalesce(b.reserved, 0), 0);
  IF p_quantity > v_sellable THEN
    RAISE EXCEPTION 'Only % unit(s) of batch % are still in sellable stock (the rest were sold, delivered, reserved or moved), so % cannot be moved to damaged. Count the batch and adjust instead.',
      v_sellable, coalesce(nullif(b."batchNumber", ''), b.id), p_quantity USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.via', format('return %s corrected: %s × %s to %s (%s)', p_return_id, p_quantity, p_product, v_cond, v_reason), true);
  UPDATE public.inventory SET quantity = coalesce(quantity, 0) - p_quantity, damaged = coalesce(damaged, 0) + p_quantity WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "orderId", "inventoryId", product, "batchNumber", quantity, "returnId", condition, note, "createdBy")
  VALUES ('return_reclassified', r."orderId", b.id, b.product, b."batchNumber", p_quantity, p_return_id, v_cond, v_reason, public.my_user_id());
  UPDATE public.sales_returns
     SET lines = jsonb_set(lines, ARRAY[v_idx::text, 'corrections'],
           coalesce(v_line -> 'corrections', '[]'::jsonb) || jsonb_build_array(jsonb_build_object(
             'quantity', p_quantity, 'condition', v_cond, 'reason', v_reason, 'at', now(), 'by', public.my_user_id())))
   WHERE id = p_return_id;

  RETURN jsonb_build_object('returnId', p_return_id, 'inventoryId', b.id, 'quantity', p_quantity, 'condition', v_cond,
    'stock', coalesce(b.quantity, 0) - p_quantity, 'damaged', coalesce(b.damaged, 0) + p_quantity);
END $fn$;

CREATE OR REPLACE FUNCTION public.stock_return_correction_enabled()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$ SELECT true $fn$;

REVOKE EXECUTE ON FUNCTION public.correct_return_condition(text, text, text, numeric, text, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.stock_return_correction_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_return_condition(text, text, text, numeric, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_return_correction_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('089_correct_return_condition.sql',
        'Correct the condition of an earlier sales return: sellable -> damaged (return_reclassified), Admin/Warehouse Manager, reason; credit notes unchanged')
ON CONFLICT (filename) DO NOTHING;
