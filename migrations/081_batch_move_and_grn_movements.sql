-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 081: the two gaps left by batch 15 (owner, 2026-10-03)
-- ════════════════════════════════════════════════════════════════════════
--
--  1. Changing a batch's warehouse on the Edit form moved the whole batch
--     with no movement row. Now a batch holding stock changes warehouse only
--     through transfer_stock (the guard refuses a direct change by an app
--     user; an empty batch may still be relabelled). transfer_stock moves the
--     batch itself when all of it goes and the destination has no matching
--     batch, instead of leaving an empty row behind; either way it writes
--     transfer_out + transfer_in. The Edit form calls it for the full quantity.
--
--  2. GRNs write a movement row, like deliveries and returns: grn_adds_stock
--     records kind 'grn' per received line, with the new "grnId" column, the
--     person and a note. GRNs from before 081 are not backfilled (INT-01
--     reconciled them from the audit log).
--
--  Proof before applying: test-results/full-test/fix-batch-15b/dryrun.mjs.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS "grnId" text;
ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn']));

-- ── 1a. Guard: + warehouse of a batch holding stock ─────────────────────
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

  IF current_user IN ('authenticated', 'anon')
     AND NEW.warehouse IS DISTINCT FROM OLD.warehouse
     AND coalesce(OLD.quantity, 0) > 0 THEN
    RAISE EXCEPTION 'Stock in batch % changes warehouse only through Transfer, so the move is recorded.',
      coalesce(nullif(OLD."batchNumber", ''), OLD.id)
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

-- ── 1b. transfer_stock: a whole batch with nowhere to merge moves itself ─
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

  IF dst.id IS NOT NULL THEN
    UPDATE public.inventory SET quantity = quantity - p_qty WHERE id = src.id;
    UPDATE public.inventory SET quantity = coalesce(quantity, 0) + p_qty WHERE id = dst.id;
    v_dst_id := dst.id;
  ELSIF p_qty = coalesce(src.quantity, 0) THEN
    -- All of it, and nothing to merge into: the batch itself moves.
    UPDATE public.inventory SET warehouse = v_to WHERE id = src.id;
    v_dst_id := src.id;
  ELSE
    UPDATE public.inventory SET quantity = quantity - p_qty WHERE id = src.id;
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
  RETURN jsonb_build_object('fromId', src.id, 'toId', v_dst_id, 'quantity', p_qty, 'to', v_to, 'movedBatch', v_dst_id = src.id);
END $$;

-- ── 2. GRNs write a movement row per received line ──────────────────────
CREATE OR REPLACE FUNCTION public.grn_adds_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  line jsonb;
  v_product text;
  v_batch text;
  v_qty numeric;
  v_expiry timestamptz;
  v_cost numeric;
  v_existing public.inventory;
  v_inv_id text;
BEGIN
  PERFORM set_config('app.via', format('goods receipt %s', NEW.id), true);

  FOR line IN SELECT * FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb))
  LOOP
    v_product := nullif(btrim(line ->> 'product'), '');
    v_qty := coalesce(nullif(line ->> 'receivedQty', '')::numeric, nullif(line ->> 'quantity', '')::numeric, 0);
    CONTINUE WHEN v_product IS NULL OR v_qty <= 0;

    v_batch := coalesce(btrim(line ->> 'batchNumber'), '');
    v_expiry := nullif(line ->> 'expiryDate', '')::timestamptz;
    v_cost := nullif(line ->> 'unitCost', '')::numeric;

    SELECT * INTO v_existing FROM public.inventory i
    WHERE lower(btrim(i.product)) = lower(v_product)
      AND lower(btrim(coalesce(i."batchNumber", ''))) = lower(v_batch)
    ORDER BY i."createdAt" NULLS LAST, i.id
    LIMIT 1
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.inventory SET
        quantity = coalesce(quantity, 0) + v_qty,
        "expiryDate" = coalesce("expiryDate", v_expiry),
        "unitCost" = CASE WHEN coalesce("unitCost", 0) = 0 THEN coalesce(v_cost, "unitCost") ELSE "unitCost" END
      WHERE id = v_existing.id;
      v_inv_id := v_existing.id;
    ELSE
      v_inv_id := 'INV-ITEM-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
      INSERT INTO public.inventory (id, product, "batchNumber", "expiryDate", quantity, "unitCost", warehouse,
                                    "reorderLevel", reserved, transit, damaged, "createdAt")
      VALUES (v_inv_id, v_product, v_batch, v_expiry, v_qty, coalesce(v_cost, 0), 'Main Warehouse', 0, 0, 0, 0, now());
    END IF;

    INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "grnId", note, "createdBy")
    VALUES ('grn', v_inv_id, v_product, v_batch, v_qty, NEW.id,
            format('goods receipt %s%s', NEW.id, coalesce(' (' || nullif(NEW."poId", '') || ')', '')), public.my_user_id());
  END LOOP;

  PERFORM set_config('app.via', '', true);
  RETURN NULL;
END $function$;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('081_batch_move_and_grn_movements.sql',
        'batch 15 gaps: a batch holding stock changes warehouse only via transfer_stock (whole batch moves itself); GRNs write kind grn movements with grnId')
ON CONFLICT (filename) DO NOTHING;
