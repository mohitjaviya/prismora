-- ============================================================================
--  PRISMORA — 087: the Damaged number is locked (Gap 16, owner 2026-10-04)
--
--  inventory.damaged (units that may never be sold: damaged returns since 086,
--  or typed in) changes only through recorded movements:
--    write_off_damaged(batch, qty, reason)           -> kind damaged_write_off
--    return_damaged_to_vendor(batch, vendor, qty,     -> kind damaged_to_vendor
--                             unit cost, reason)          + a purchase return
--  Both: Super Admin / Admin / Warehouse Manager only, reason required, whole
--  quantity above zero and no more than the batch's damaged count, the person
--  stamped on the movement row. The vendor return follows the 075 purchase-
--  return rules (the vendor must have supplied the product, no more back than
--  it delivered, unit cost no higher than it ever charged) and credits the
--  vendor through the existing purchase_returns trigger. Such a return cannot be
--  withdrawn (the goods left as damaged; withdrawing would put them on sale).
--
--  Guard: an app user (current_user authenticated/anon) can no longer change a
--  batch's damaged count directly, nor delete a batch that still holds damaged
--  units. Owner-rights paths (086 sales returns, the two functions) unaffected.
--
--  Opening balances (so Gap 15's Stock check can reconcile old batches): one
--  'opening' row per existing batch (its quantity now) and 'opening_damaged'
--  where damaged > 0, written once by this file. Afterwards a batch typed in on
--  Add Batch gets the same rows when its transaction commits (deferred trigger),
--  unless a movement already explains it (GRN, transfer or return). These rows
--  record the current values; no stock, balance or ledger value changes.
--
--  stock_damaged_locked() lets the screen ask whether 087 is in place.
--  Not included (owner, follow-up): moving damaged units back to sellable.
-- ============================================================================

-- ── 1. New movement kinds ───────────────────────────────────────────────────
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn', 'grn_reversed', 'free_goods',
  'opening', 'opening_damaged', 'damaged_write_off', 'damaged_to_vendor']));

-- ── 2. Guard: damaged changes only through the functions ───────────────────
-- Invoker (072 lesson): current_user is the app's role only in an invoker function.
CREATE OR REPLACE FUNCTION public.inventory_damaged_locked()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public' AS $fn$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  IF TG_OP = 'UPDATE' AND NEW.damaged IS DISTINCT FROM OLD.damaged THEN
    RAISE EXCEPTION 'The damaged count of batch % changes only through Write off damaged or Return damaged to vendor, so every unit is accounted for.',
      coalesce(nullif(OLD."batchNumber", ''), OLD.id) USING ERRCODE = '42501';
  END IF;
  IF TG_OP = 'DELETE' AND coalesce(OLD.damaged, 0) > 0 THEN
    RAISE EXCEPTION 'Batch % still holds % damaged unit(s). Write them off or return them to the vendor before deleting the batch.',
      coalesce(nullif(OLD."batchNumber", ''), OLD.id), OLD.damaged USING ERRCODE = '42501';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;
DROP TRIGGER IF EXISTS inventory_damaged_locked ON public.inventory;
CREATE TRIGGER inventory_damaged_locked BEFORE UPDATE OR DELETE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.inventory_damaged_locked();

-- ── 3. Who may move damaged stock ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.may_move_damaged_stock()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT coalesce(public.my_role_name() IN ('Super Admin', 'Admin', 'Warehouse Manager'), false)
     AND NOT coalesce(public.is_partner(), false);
$fn$;

-- ── 4. Write off damaged ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.write_off_damaged(p_inventory_id text, p_quantity numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE b public.inventory; v_reason text := nullif(btrim(p_reason), '');
BEGIN
  IF NOT public.may_move_damaged_stock() THEN
    RAISE EXCEPTION 'Only Admin or Warehouse Manager can write off damaged stock.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason for writing off damaged stock.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % does not exist.', p_inventory_id USING ERRCODE = 'P0001'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Quantity to write off must be a whole number above zero.' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity > coalesce(b.damaged, 0) THEN
    RAISE EXCEPTION 'Batch % holds only % damaged unit(s), so % cannot be written off.',
      coalesce(nullif(b."batchNumber", ''), b.id), coalesce(b.damaged, 0), p_quantity USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.via', format('damaged written off: %s × %s (%s)', p_quantity, b.product, v_reason), true);
  UPDATE public.inventory SET damaged = coalesce(damaged, 0) - p_quantity WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
  VALUES ('damaged_write_off', b.id, b.product, b."batchNumber", p_quantity, v_reason, public.my_user_id());
  RETURN jsonb_build_object('inventoryId', b.id, 'damaged', coalesce(b.damaged, 0) - p_quantity);
END $fn$;

-- ── 5. Return damaged to vendor (075's purchase-return rules) ──────────────
CREATE OR REPLACE FUNCTION public.return_damaged_to_vendor(
  p_inventory_id text, p_vendor_id text, p_quantity numeric, p_unit_cost numeric, p_reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  b public.inventory; v public.vendors;
  v_reason text := nullif(btrim(p_reason), '');
  v_received numeric; v_returned numeric; v_max_cost numeric;
  v_id text; v_value numeric;
BEGIN
  IF NOT public.may_move_damaged_stock() THEN
    RAISE EXCEPTION 'Only Admin or Warehouse Manager can return damaged stock to a vendor.' USING ERRCODE = '42501';
  END IF;
  IF v_reason IS NULL OR length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason for returning damaged stock to the vendor.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Batch % does not exist.', p_inventory_id USING ERRCODE = 'P0001'; END IF;
  SELECT * INTO v FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Choose the vendor the goods go back to.' USING ERRCODE = 'P0001'; END IF;
  IF p_quantity IS NULL OR p_quantity <= 0 OR p_quantity <> trunc(p_quantity) THEN
    RAISE EXCEPTION 'Quantity to return must be a whole number above zero.' USING ERRCODE = 'P0001';
  END IF;
  IF p_unit_cost IS NULL OR p_unit_cost < 0 THEN
    RAISE EXCEPTION 'Enter the unit cost (zero or more).' USING ERRCODE = 'P0001';
  END IF;
  IF p_quantity > coalesce(b.damaged, 0) THEN
    RAISE EXCEPTION 'Batch % holds only % damaged unit(s), so % cannot go back to the vendor.',
      coalesce(nullif(b."batchNumber", ''), b.id), coalesce(b.damaged, 0), p_quantity USING ERRCODE = 'P0001';
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
  PERFORM set_config('app.via', format('damaged returned to vendor: purchase return %s to %s', v_id, v.name), true);

  UPDATE public.inventory SET damaged = coalesce(damaged, 0) - p_quantity WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "returnId", note, "createdBy")
  VALUES ('damaged_to_vendor', b.id, b.product, b."batchNumber", p_quantity, v_id, v_reason, public.my_user_id());

  PERFORM set_config('app.purchase_return', 'on', true);
  INSERT INTO public.purchase_returns (id, "vendorId", "vendorName", reason, items, value, notes, date, "recordedBy", "createdAt")
  VALUES (v_id, p_vendor_id, v.name, 'Damaged goods',
          jsonb_build_array(jsonb_build_object('product', b.product, 'quantity', p_quantity, 'unitCost', p_unit_cost,
            'batchId', b.id, 'batchNumber', b."batchNumber", 'fromDamaged', true)),
          v_value, v_reason, now(), public.my_user_id(), now());
  PERFORM set_config('app.purchase_return', 'off', true);

  RETURN jsonb_build_object('id', v_id, 'value', v_value, 'inventoryId', b.id, 'damaged', coalesce(b.damaged, 0) - p_quantity);
END $fn$;

-- ── 6. A damaged-goods vendor return cannot be withdrawn ───────────────────
-- Live 075 definition, plus the first check after the row is found.
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

-- ── 7. Opening balances ─────────────────────────────────────────────────────
-- A batch added later (Add Batch) gets its opening rows when the transaction
-- commits, unless a movement already accounts for it (GRN, transfer, return).
CREATE OR REPLACE FUNCTION public.inventory_opening_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE b public.inventory;
BEGIN
  SELECT * INTO b FROM public.inventory WHERE id = NEW.id;
  IF NOT FOUND OR EXISTS (SELECT 1 FROM public.stock_movements WHERE "inventoryId" = NEW.id) THEN
    RETURN NULL;
  END IF;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
  VALUES ('opening', b.id, b.product, b."batchNumber", coalesce(b.quantity, 0), 'Opening stock entered with the batch', public.my_user_id());
  IF coalesce(b.damaged, 0) > 0 THEN
    INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
    VALUES ('opening_damaged', b.id, b.product, b."batchNumber", b.damaged, 'Damaged units entered with the batch', public.my_user_id());
  END IF;
  RETURN NULL;
END $fn$;
DROP TRIGGER IF EXISTS inventory_opening_balance ON public.inventory;
CREATE CONSTRAINT TRIGGER inventory_opening_balance AFTER INSERT ON public.inventory
  DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.inventory_opening_balance();

-- Every batch that exists now: its current stock and damaged count, once.
INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note)
SELECT 'opening', i.id, i.product, i."batchNumber", coalesce(i.quantity, 0), 'Opening balance when 087 was applied'
  FROM public.inventory i
 WHERE NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m."inventoryId" = i.id AND m.kind = 'opening');
INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note)
SELECT 'opening_damaged', i.id, i.product, i."batchNumber", i.damaged, 'Opening damaged count when 087 was applied'
  FROM public.inventory i
 WHERE coalesce(i.damaged, 0) > 0
   AND NOT EXISTS (SELECT 1 FROM public.stock_movements m WHERE m."inventoryId" = i.id AND m.kind = 'opening_damaged');

-- ── 8. The screen's question: is 087 in place? ─────────────────────────────
CREATE OR REPLACE FUNCTION public.stock_damaged_locked()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $fn$ SELECT true $fn$;

REVOKE EXECUTE ON FUNCTION public.may_move_damaged_stock() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.write_off_damaged(text, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.return_damaged_to_vendor(text, text, numeric, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.inventory_opening_balance() FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.stock_damaged_locked() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.may_move_damaged_stock() TO authenticated;
GRANT EXECUTE ON FUNCTION public.write_off_damaged(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.return_damaged_to_vendor(text, text, numeric, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.stock_damaged_locked() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('087_damaged_stock_locked.sql',
        'Gap 16: damaged count changes only via write_off_damaged / return_damaged_to_vendor (Admin/Warehouse Manager, reason, movement row); opening balances for every batch')
ON CONFLICT (filename) DO NOTHING;
