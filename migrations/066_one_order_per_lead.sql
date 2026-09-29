-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 4 (Phase 2 finding A06): a lead is converted
--  to an order once, enforced by the database.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT WAS WRONG
--
--  "An order has already been raised for this lead" was checked only in the
--  browser, on that tab's copy of the lead. A second tab opened earlier (or
--  two clicks in the same instant) raised a second order for the same lead:
--  L11 has O113, O114 and O115.
--
--  WHAT THIS DOES
--
--  · A new order that names a lead is refused while that lead already has an
--    order that is not Cancelled. Cancelling the first order (e.g. a lead
--    rolled back) frees the lead to be converted again.
--  · Existing orders are not touched (L11's Phase 2 duplicates stay as
--    evidence).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.order_one_per_lead()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing text;
BEGIN
  IF NEW."leadId" IS NULL OR coalesce(NEW.status, 'Pending') = 'Cancelled' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('order_one_per_lead:' || NEW."leadId"));
  SELECT id INTO v_existing FROM public.orders
   WHERE "leadId" = NEW."leadId" AND status IS DISTINCT FROM 'Cancelled'
   ORDER BY "createdAt" LIMIT 1;
  IF v_existing IS NOT NULL THEN
    RAISE EXCEPTION 'Lead % has already been converted to order %. Open that order instead.', NEW."leadId", v_existing
      USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_one_per_lead ON public.orders;
CREATE TRIGGER order_one_per_lead
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_one_per_lead();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('066_one_order_per_lead.sql',
        'A06: a new order naming a lead is refused while that lead already has a non-cancelled order (database-enforced single conversion)')
ON CONFLICT (filename) DO NOTHING;
