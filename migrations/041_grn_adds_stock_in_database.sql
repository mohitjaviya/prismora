-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a goods receipt adds its stock in the database.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 039 (app.via tagging) only for its notes.
--
--  WHAT WAS WRONG
--
--  Recording a GRN was two writes from the browser: the receipt (allowed with
--  Purchases access), then the stock, under whoever clicked's Inventory access.
--  Purchase Manager has full Purchases and no Inventory, so its receipts saved
--  and their stock was refused — goods on the shelf that the books never saw.
--  And because the receipt saved first, a refused stock write left a receipt
--  with nothing behind it.
--
--  WHAT THIS DOES
--
--  grn_adds_stock (AFTER INSERT on grn) takes each line's received quantity
--  into stock in the same transaction as the receipt, so both save or neither
--  does, whoever records it — without giving Purchase Manager Inventory access.
--  Same rules as the app used (utils/stockMoves.js):
--    · a line joins the batch with the same product and batch number
--      (ignoring case and surrounding spaces; blank joins blank);
--    · joining adds the quantity, and fills expiry and unit cost only where
--      the batch had none;
--    · otherwise it starts a new batch in "Main Warehouse";
--    · a line with no product or no positive quantity is skipped.
--  The app no longer writes the stock itself (it would count twice).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.grn_adds_stock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  line jsonb;
  v_product text;
  v_batch text;
  v_qty numeric;
  v_expiry timestamptz;
  v_cost numeric;
  v_existing public.inventory;
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
    ELSE
      INSERT INTO public.inventory (id, product, "batchNumber", "expiryDate", quantity, "unitCost", warehouse,
                                    "reorderLevel", reserved, transit, damaged, "createdAt")
      VALUES ('INV-ITEM-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4),
              v_product, v_batch, v_expiry, v_qty, coalesce(v_cost, 0), 'Main Warehouse', 0, 0, 0, 0, now());
    END IF;
  END LOOP;

  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.grn_adds_stock() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS grn_adds_stock ON public.grn;
CREATE TRIGGER grn_adds_stock
  AFTER INSERT ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_adds_stock();

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('041_grn_adds_stock_in_database.sql',
        'goods receipts add their stock in the database, in the same transaction, whoever records them')
ON CONFLICT (filename) DO NOTHING;
