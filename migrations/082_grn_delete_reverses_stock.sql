-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 082: deleting a GRN takes its stock back out (owner, 2026-10-03)
-- ════════════════════════════════════════════════════════════════════════
--
--  A GRN adds stock on insert (041) and moves the vendor's balance (065).
--  Deleting one reversed the balance but left its units in stock and left
--  the PO's status as it was (a "GRN Done" PO could then take no more
--  receipts). No screen deletes a GRN; Purchases-full roles can through the
--  API.
--
--  Now, on delete:
--    · the units the GRN added are taken back out of exactly the batches its
--      081 movement rows name, each written as kind 'grn_reversed';
--    · refused if any of those batches no longer holds them (sold, moved or
--      adjusted since): taking them out would remove stock that is not there,
--      so the right tool is a purchase return;
--    · refused for an app user when the GRN predates 081 (no movement rows,
--      so nothing says which batches it went into). Database maintenance may
--      still remove such a row, with no stock change, as before;
--    · the PO's status is worked out again from the receipts that remain
--      (Confirmed / Partially Received / GRN Done); a Closed or Cancelled PO
--      is left alone.
--  The vendor balance is still reversed by vendor_balance_from_grn.
--
--  Proof before applying: test-results/full-test/fix-batch-15c/dryrun.mjs.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn', 'grn_reversed']));

CREATE OR REPLACE FUNCTION public.grn_delete_reverses_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  m record;
  b public.inventory;
  v_received numeric;
BEGIN
  PERFORM set_config('app.via', format('goods receipt %s removed', OLD.id), true);

  IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE "grnId" = OLD.id AND kind = 'grn') THEN
    SELECT coalesce(sum(coalesce(nullif(l ->> 'receivedQty', '')::numeric, nullif(l ->> 'quantity', '')::numeric, 0)), 0)
      INTO v_received FROM jsonb_array_elements(coalesce(OLD.items, '[]'::jsonb)) l;
    IF v_received > 0 AND public.current_app_email() IS NOT NULL THEN
      RAISE EXCEPTION 'Goods receipt % was recorded before receipts were tied to their stock batches, so deleting it cannot take its % units back out. Correct the stock with Adjust, or record a purchase return.',
        OLD.id, v_received USING ERRCODE = 'P0001';
    END IF;
    PERFORM set_config('app.via', '', true);
    RETURN OLD;
  END IF;

  FOR m IN
    SELECT "inventoryId", product, "batchNumber", sum(quantity) AS qty
      FROM public.stock_movements WHERE "grnId" = OLD.id AND kind = 'grn'
     GROUP BY "inventoryId", product, "batchNumber" ORDER BY "inventoryId"
  LOOP
    SELECT * INTO b FROM public.inventory WHERE id = m."inventoryId" FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Goods receipt % put % units of % into batch %, which no longer exists, so the receipt cannot be removed. Record a purchase return instead.',
        OLD.id, m.qty, m.product, coalesce(nullif(m."batchNumber", ''), m."inventoryId") USING ERRCODE = 'P0001';
    END IF;
    IF coalesce(b.quantity, 0) < m.qty THEN
      RAISE EXCEPTION 'Goods receipt % added % units of % to batch %, which now holds only % (the rest have been delivered, moved or adjusted), so the receipt cannot be removed. Record a purchase return instead.',
        OLD.id, m.qty, m.product, coalesce(nullif(b."batchNumber", ''), b.id), coalesce(b.quantity, 0) USING ERRCODE = 'P0001';
    END IF;
    UPDATE public.inventory SET quantity = quantity - m.qty WHERE id = b.id;
    INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "grnId", note, "createdBy")
    VALUES ('grn_reversed', b.id, m.product, m."batchNumber", m.qty, OLD.id,
            format('goods receipt %s removed', OLD.id), public.my_user_id());
  END LOOP;

  PERFORM set_config('app.via', '', true);
  RETURN OLD;
END $$;

DROP TRIGGER IF EXISTS grn_delete_reverses_stock ON public.grn;
CREATE TRIGGER grn_delete_reverses_stock BEFORE DELETE ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_delete_reverses_stock();

CREATE OR REPLACE FUNCTION public.grn_delete_po_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_status text;
  v_any boolean;
  v_open boolean;
BEGIN
  IF OLD."poId" IS NULL THEN RETURN NULL; END IF;
  SELECT status INTO v_status FROM public.purchase_orders WHERE id = OLD."poId" FOR UPDATE;
  IF v_status IS NULL OR v_status NOT IN ('Partially Received', 'GRN Done') THEN RETURN NULL; END IF;
  SELECT bool_or(received > 0), bool_or(received < ordered) INTO v_any, v_open
    FROM public.po_receipt_position(OLD."poId");
  PERFORM set_config('app.via', format('goods receipt %s removed', OLD.id), true);
  UPDATE public.purchase_orders
     SET status = CASE WHEN NOT coalesce(v_any, false) THEN 'Confirmed'
                       WHEN coalesce(v_open, false) THEN 'Partially Received'
                       ELSE 'GRN Done' END
   WHERE id = OLD."poId";
  PERFORM set_config('app.via', '', true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS grn_delete_po_status ON public.grn;
CREATE TRIGGER grn_delete_po_status AFTER DELETE ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_delete_po_status();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('082_grn_delete_reverses_stock.sql',
        'deleting a GRN takes its units back out of the batches its grn movements name (grn_reversed), refused if they are no longer there or the GRN predates 081; PO status recomputed')
ON CONFLICT (filename) DO NOTHING;
