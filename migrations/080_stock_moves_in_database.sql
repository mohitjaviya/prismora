-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 080: fix batch 15, stock moves in the database
--  (Phase 4 P4-F5 and P4-F2, Phase 3 G5 "absolute stock writes").
-- ════════════════════════════════════════════════════════════════════════
--
--  1. An expired batch stays expired. Moving its expiry date later, or
--     clearing it (no expiry = sellable), made expired stock deliverable
--     again (P4-F5). Shortening an expiry is still allowed. Applies to every
--     app user; database maintenance (no signed-in user) can still correct.
--
--  2. Adjust, Cycle Count and Transfer are database operations, each one
--     transaction with its movement recorded in stock_movements:
--       adjust_stock(batch, change, reason)          kind 'adjustment' (signed)
--       count_stock(batch, counted, expected)         kind 'cycle_count' (signed)
--       transfer_stock(batch, to_warehouse, qty, notes) 'transfer_out' + 'transfer_in'
--     The browser used to write absolute quantities it had worked out itself:
--     two people adjusting one batch overwrote each other, an adjustment
--     below zero was clamped to 0 without a word, and a transfer was two
--     writes (units could leave one warehouse without arriving).
--     stock_movements gains "note" (the reason) and "createdBy" (who).
--
--  3. Quantities move only in the database (owner's decision 2026-10-03,
--     same idea as balances). An app user can no longer change a batch's
--     quantity with a direct write; Add Batch still sets the opening
--     quantity. Goods receipts, deliveries, returns and the three operations
--     above run with owner rights and are unaffected.
--
--  4. Option lists (masters) and warehouses are audited (P4-F2).
--
--  Proof before applying: test-results/full-test/fix-batch-15/dryrun.mjs.
-- ════════════════════════════════════════════════════════════════════════

-- ── Movement log: reason and person ─────────────────────────────────────
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS note text;
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS "createdBy" text;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in']));

-- ── 1 + 3. Guard on inventory (invoker: current_user tells a direct app
--    write from one made inside an owner-rights stock function) ──────────
CREATE OR REPLACE FUNCTION public.inventory_stock_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF public.current_app_email() IS NOT NULL
     AND NOT public.batch_is_sellable(OLD."expiryDate")
     AND public.batch_is_sellable(NEW."expiryDate") THEN
    RAISE EXCEPTION 'Batch % of % expired on %, so its expiry date cannot be moved later or cleared. Expired stock stays expired; if the date was typed wrongly, ask an administrator for a database correction.',
      coalesce(nullif(OLD."batchNumber", ''), OLD.id), OLD.product,
      to_char(OLD."expiryDate" AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY')
      USING ERRCODE = '42501';
  END IF;

  IF current_user IN ('authenticated', 'anon')
     AND NEW.quantity IS DISTINCT FROM OLD.quantity THEN
    RAISE EXCEPTION 'Stock in batch % changes only through Adjust, Cycle Count or Transfer (or goods receipts, deliveries and returns), so every movement is recorded.',
      coalesce(nullif(OLD."batchNumber", ''), OLD.id)
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_stock_guard ON public.inventory;
CREATE TRIGGER inventory_stock_guard BEFORE UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.inventory_stock_guard();

-- ── 2. The three operations ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.adjust_stock(p_inventory_id text, p_change numeric, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.inventory;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_new numeric;
BEGIN
  IF NOT public.can_edit('inventory') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Adjusting stock needs full Inventory access.' USING ERRCODE = '42501';
  END IF;
  IF p_change IS NULL OR p_change = 0 OR p_change <> trunc(p_change) THEN
    RAISE EXCEPTION 'Enter a whole number of units to adjust by (not zero).' USING ERRCODE = 'P0001';
  END IF;
  IF v_reason IS NULL THEN
    RAISE EXCEPTION 'Give a reason for the adjustment.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stock batch no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  v_new := coalesce(b.quantity, 0) + p_change;
  IF v_new < 0 THEN
    RAISE EXCEPTION 'Batch % holds % units, so it cannot go down by %.',
      coalesce(nullif(b."batchNumber", ''), b.id), coalesce(b.quantity, 0), -p_change USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.via', format('stock adjustment %s on batch %s: %s', p_change, coalesce(nullif(b."batchNumber", ''), b.id), v_reason), true);
  UPDATE public.inventory SET quantity = v_new WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
  VALUES ('adjustment', b.id, b.product, b."batchNumber", p_change, v_reason, public.my_user_id());
  PERFORM set_config('app.via', '', true);
  RETURN jsonb_build_object('id', b.id, 'quantity', v_new);
END $$;

CREATE OR REPLACE FUNCTION public.count_stock(p_inventory_id text, p_counted numeric, p_expected numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  b public.inventory;
  v_had numeric;
  v_note text;
BEGIN
  IF NOT public.can_edit('inventory') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'A cycle count needs full Inventory access.' USING ERRCODE = '42501';
  END IF;
  IF p_counted IS NULL OR p_counted < 0 OR p_counted <> trunc(p_counted) THEN
    RAISE EXCEPTION 'Enter the counted quantity as a whole number (zero or more).' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO b FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stock batch no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  v_had := coalesce(b.quantity, 0);
  -- Someone else moved this batch while the count form was open: the
  -- variance worked out on screen would be wrong.
  IF p_expected IS NOT NULL AND p_expected <> v_had THEN
    RAISE EXCEPTION 'Batch % now holds % units (it held % when the count was opened). Open the count again and recount.',
      coalesce(nullif(b."batchNumber", ''), b.id), v_had, p_expected USING ERRCODE = 'P0001';
  END IF;
  IF p_counted = v_had THEN
    RETURN jsonb_build_object('id', b.id, 'quantity', v_had, 'changed', false);
  END IF;

  v_note := format('cycle count: system %s, counted %s', v_had, p_counted);
  PERFORM set_config('app.via', format('%s on batch %s', v_note, coalesce(nullif(b."batchNumber", ''), b.id)), true);
  UPDATE public.inventory SET quantity = p_counted WHERE id = b.id;
  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy")
  VALUES ('cycle_count', b.id, b.product, b."batchNumber", p_counted - v_had, v_note, public.my_user_id());
  PERFORM set_config('app.via', '', true);
  RETURN jsonb_build_object('id', b.id, 'quantity', p_counted, 'changed', true);
END $$;

CREATE OR REPLACE FUNCTION public.transfer_stock(p_inventory_id text, p_to_warehouse text, p_qty numeric, p_notes text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  src public.inventory;
  dst public.inventory;
  v_to text;
  v_dst_id text;
  v_note text;
BEGIN
  IF NOT public.can_edit('inventory') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Moving stock needs full Inventory access.' USING ERRCODE = '42501';
  END IF;
  IF p_qty IS NULL OR p_qty <= 0 OR p_qty <> trunc(p_qty) THEN
    RAISE EXCEPTION 'Enter how many units to move (a whole number above zero).' USING ERRCODE = 'P0001';
  END IF;
  SELECT name INTO v_to FROM public.warehouses WHERE lower(btrim(name)) = lower(btrim(coalesce(p_to_warehouse, '')));
  IF v_to IS NULL THEN
    RAISE EXCEPTION 'Choose a warehouse to move the stock to.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO src FROM public.inventory WHERE id = p_inventory_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'That stock batch no longer exists.' USING ERRCODE = 'P0001';
  END IF;
  IF lower(btrim(coalesce(src.warehouse, ''))) = lower(v_to) THEN
    RAISE EXCEPTION 'This batch is already in %.', v_to USING ERRCODE = 'P0001';
  END IF;
  IF p_qty > coalesce(src.quantity, 0) THEN
    RAISE EXCEPTION 'Only % in this batch; cannot move %.', coalesce(src.quantity, 0), p_qty USING ERRCODE = 'P0001';
  END IF;

  v_note := format('transfer %s → %s%s', coalesce(src.warehouse, '?'), v_to,
                   coalesce(': ' || nullif(btrim(p_notes), ''), ''));
  PERFORM set_config('app.via', format('stock %s of %s units, batch %s', v_note, p_qty, coalesce(nullif(src."batchNumber", ''), src.id)), true);

  -- Same product and batch number already in the destination: add to it.
  SELECT * INTO dst FROM public.inventory
   WHERE product = src.product AND coalesce("batchNumber", '') = coalesce(src."batchNumber", '')
     AND warehouse = v_to AND id <> src.id
   ORDER BY "createdAt" NULLS LAST, id LIMIT 1 FOR UPDATE;

  UPDATE public.inventory SET quantity = quantity - p_qty WHERE id = src.id;
  IF dst.id IS NOT NULL THEN
    UPDATE public.inventory SET quantity = coalesce(quantity, 0) + p_qty WHERE id = dst.id;
    v_dst_id := dst.id;
  ELSE
    v_dst_id := 'INV-ITEM-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
    INSERT INTO public.inventory (id, product, "batchNumber", "expiryDate", quantity, "unitCost", warehouse,
                                  "reorderLevel", reserved, transit, damaged, "createdAt")
    VALUES (v_dst_id, src.product, src."batchNumber", src."expiryDate", p_qty, src."unitCost", v_to,
            coalesce(src."reorderLevel", 0), 0, 0, 0, now());
  END IF;

  INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, note, "createdBy") VALUES
    ('transfer_out', src.id, src.product, src."batchNumber", p_qty, v_note, public.my_user_id()),
    ('transfer_in', v_dst_id, src.product, src."batchNumber", p_qty, v_note, public.my_user_id());
  PERFORM set_config('app.via', '', true);
  RETURN jsonb_build_object('fromId', src.id, 'toId', v_dst_id, 'quantity', p_qty, 'to', v_to);
END $$;

REVOKE EXECUTE ON FUNCTION public.adjust_stock(text, numeric, text) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.count_stock(text, numeric, numeric) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.transfer_stock(text, text, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adjust_stock(text, numeric, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.count_stock(text, numeric, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.transfer_stock(text, text, numeric, text) TO authenticated;

-- ── 4. Audit option lists and warehouses ────────────────────────────────
DROP TRIGGER IF EXISTS audit_row ON public.masters;
CREATE TRIGGER audit_row AFTER INSERT OR DELETE OR UPDATE ON public.masters
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();
DROP TRIGGER IF EXISTS audit_row ON public.warehouses;
CREATE TRIGGER audit_row AFTER INSERT OR DELETE OR UPDATE ON public.warehouses
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('080_stock_moves_in_database.sql',
        'batch 15: expired batch stays expired; adjust_stock/count_stock/transfer_stock in the DB with stock_movements (note, createdBy); direct quantity writes by app users refused; masters and warehouses audited')
ON CONFLICT (filename) DO NOTHING;
