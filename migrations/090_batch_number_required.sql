-- ============================================================================
--  PRISMORA — 090: batch number required and unique per product (Gap 18,
--  owner 2026-10-04)
--
--  New and edited batches only; existing rows are left as they are:
--    - 4 batches without a number (owner gives them numbers on the Edit form)
--    - Aloevera Skin Gel 150g "abc123" held by 3 batches (left alone; they may
--      still be edited as long as the number itself is not changed)
--
--  Rules (trigger inventory_batch_number_rules, invoker, BEFORE INSERT/UPDATE):
--  1. An app user (current_user authenticated/anon) cannot add a batch without
--     a batch number (Add Batch), nor clear one (Edit). The Edit form also asks
--     for a number before saving an old batch that has none.
--     Owner-rights paths are not asked: transfer_stock copies the moved batch's
--     number into the other warehouse, blank or not (same batch, not a new one).
--  2. Unique per product: a batch added by an app user may not reuse a number
--     the same product already has in any warehouse (trimmed, case ignored);
--     to add units to it use the GRN, Adjust or Transfer. A number changed by
--     anyone (or a batch moved to another product) may not take one the
--     product already has. transfer_stock's copy in the other warehouse is the
--     same batch and is allowed (it never changes a number).
--  3. Goods receipts (grn_lines_need_batch, BEFORE INSERT on grn): every line
--     with a received quantity above 0 must carry a batch number. The receipt
--     merges into the product's batch with that number or creates it (081).
--     Old receipts are not touched (lines are locked after insert, 084).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.inventory_batch_number_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  v_batch text := btrim(coalesce(NEW."batchNumber", ''));
  v_app boolean := current_user IN ('authenticated', 'anon');
  v_changed boolean;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_changed := true;
  ELSE
    v_changed := lower(v_batch) IS DISTINCT FROM lower(btrim(coalesce(OLD."batchNumber", '')))
              OR lower(btrim(NEW.product)) IS DISTINCT FROM lower(btrim(OLD.product));
  END IF;

  -- On an update only when the number itself changes (cleared): stock moves on
  -- the 4 old batches without a number (deliveries, returns) never stop here.
  IF v_app AND v_batch = '' AND v_changed THEN
    RAISE EXCEPTION 'Give the batch number: every stock batch needs one.'
      USING ERRCODE = 'P0001';
  END IF;

  -- Only a new batch from the app, or a number/product that changes.
  IF v_batch <> '' AND ((TG_OP = 'INSERT' AND v_app) OR (TG_OP = 'UPDATE' AND v_changed)) THEN
    PERFORM pg_advisory_xact_lock(hashtext('batch-number|' || lower(btrim(NEW.product)) || '|' || lower(v_batch)));
    IF EXISTS (SELECT 1 FROM public.inventory i
               WHERE i.id <> NEW.id
                 AND lower(btrim(i.product)) = lower(btrim(NEW.product))
                 AND lower(btrim(coalesce(i."batchNumber", ''))) = lower(v_batch)) THEN
      RAISE EXCEPTION 'Batch number % is already used for %. Each batch of a product needs its own number (to add units to that batch, use a goods receipt, Adjust or Transfer).',
        v_batch, NEW.product USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF v_changed AND v_batch <> '' THEN NEW."batchNumber" := v_batch; END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS inventory_batch_number_rules ON public.inventory;
CREATE TRIGGER inventory_batch_number_rules BEFORE INSERT OR UPDATE ON public.inventory
  FOR EACH ROW EXECUTE FUNCTION public.inventory_batch_number_rules();

CREATE OR REPLACE FUNCTION public.grn_lines_need_batch()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path = public AS $$
DECLARE
  line jsonb;
BEGIN
  FOR line IN SELECT * FROM jsonb_array_elements(coalesce(NEW.items, '[]'::jsonb))
  LOOP
    CONTINUE WHEN nullif(btrim(line ->> 'product'), '') IS NULL;
    CONTINUE WHEN coalesce(nullif(line ->> 'receivedQty', '')::numeric, nullif(line ->> 'quantity', '')::numeric, 0) <= 0;
    IF btrim(coalesce(line ->> 'batchNumber', '')) = '' THEN
      RAISE EXCEPTION 'Give the batch number for % on this goods receipt: every stock batch needs one.',
        btrim(line ->> 'product') USING ERRCODE = 'P0001';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS grn_lines_need_batch ON public.grn;
CREATE TRIGGER grn_lines_need_batch BEFORE INSERT ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_lines_need_batch();

REVOKE EXECUTE ON FUNCTION public.inventory_batch_number_rules() FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.grn_lines_need_batch() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.inventory_batch_number_rules() TO authenticated;
GRANT EXECUTE ON FUNCTION public.grn_lines_need_batch() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('090_batch_number_required.sql',
        'Gap 18: batch number required on new/edited batches and GRN lines; unique per product for new numbers')
ON CONFLICT (filename) DO NOTHING;
