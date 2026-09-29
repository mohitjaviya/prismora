-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 1 (Phase 2 finding B10): once an order has
--  an invoice, what was billed can no longer change.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT WAS WRONG
--
--  An order's value, quantity and items stayed editable after it was billed.
--  Admin set Delivered O118 to ₹999 against its ₹850 invoice on the order
--  screen, and set Shipped O113 to ₹1 × 1 against a ₹2,400 invoice through
--  the API. Nothing refused it, so the order no longer matched its bill.
--
--  WHAT THIS DOES
--
--  · Once any invoice (proforma or tax) names the order, its value, quantity,
--    product and line items are read-only for every app user, Admin
--    included. The refusal names the invoice and points to a sales return
--    or a credit note for corrections.
--  · Line items are compared by what was billed — product, quantity and
--    unit price, in order — not by the exact JSON, so the order form
--    resending the same lines with a status change is not refused.
--  · Status, delivery progress, receipt and address changes carry on as
--    before (the stage rules are in 062).
--  · Database maintenance (no signed-in user: migrations, the TEST clean-up)
--    is not an app action and passes.
--  · O113 and O118 keep the values the Phase 2 test gave them, as evidence;
--    this migration does not correct existing rows.
-- ════════════════════════════════════════════════════════════════════════

-- What an order bills: one row per line, in order. A single-product order
-- (no items) bills its product and quantity.
CREATE OR REPLACE FUNCTION public.order_billed_lines(p_items jsonb, p_product text, p_quantity numeric)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  SELECT CASE
    WHEN jsonb_typeof(p_items) = 'array' AND jsonb_array_length(p_items) > 0 THEN (
      SELECT jsonb_agg(jsonb_build_array(
               coalesce(i ->> 'name', i ->> 'product', ''),
               coalesce(nullif(i ->> 'quantity', '')::numeric, 0),
               coalesce(nullif(i ->> 'unitPrice', '')::numeric, 0))
             ORDER BY o)
      FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(i, o))
    ELSE jsonb_build_array(jsonb_build_array(coalesce(p_product, ''), coalesce(p_quantity, 0), NULL))
  END
$$;

CREATE OR REPLACE FUNCTION public.order_invoiced_is_locked()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice text;
BEGIN
  -- Only what a signed-in app user does. Maintenance has no user.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  IF NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND coalesce(NEW.product, '') = coalesce(OLD.product, '')
     AND public.order_billed_lines(NEW.items, NEW.product, NEW.quantity)
         = public.order_billed_lines(OLD.items, OLD.product, OLD.quantity) THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_invoice FROM public.invoices WHERE "orderId" = OLD.id ORDER BY "createdAt" LIMIT 1;
  IF v_invoice IS NULL THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Order % has been invoiced (%), so its value, quantity and items can no longer change. To correct it, record a sales return (Orders → Sales return) or issue a credit note.', OLD.id, v_invoice
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS order_invoiced_is_locked ON public.orders;
CREATE TRIGGER order_invoiced_is_locked
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_invoiced_is_locked();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('061_invoiced_order_locked.sql',
        'B10: once an order has any invoice, its value, quantity, product and line items are read-only for every app user; corrections go through a sales return or credit note')
ON CONFLICT (filename) DO NOTHING;
