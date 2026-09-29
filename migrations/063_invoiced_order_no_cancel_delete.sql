-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 1 (owner's follow-up to 061):
--    1. an order with an invoice can't be cancelled or deleted;
--    2. O113 and O118 put back to what they were billed at.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 061.
--
--  WHAT WAS WRONG
--
--  061 froze an invoiced order's value, quantity and items, but staff with
--  Orders full could still cancel it (the invoice then stood for an order
--  that no longer existed in any real sense) or delete it outright if it had
--  not been delivered.
--
--  WHAT THIS DOES
--
--  · For every signed-in user, Admin included: an order that any invoice
--    names can't move to Cancelled and can't be deleted. The refusal names
--    the invoice and points to a credit note (or a sales return for goods
--    already delivered). Accounts removing the invoice is what frees it.
--  · A one-off maintenance correction, audited with its reason: O113 back to
--    ₹2,400 × 20 and O118 back to ₹850 — the values on their invoices
--    (INV-1790657046836, INV-1790621973293). They had been changed by the
--    Phase 2 test that found B10; only the value and quantity move, the
--    lines were never touched. Balances are unaffected (they follow invoices).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

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
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  SELECT id INTO v_invoice FROM public.invoices WHERE "orderId" = OLD.id ORDER BY "createdAt" LIMIT 1;
  IF v_invoice IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'Order % has been invoiced (%), so it cannot be deleted. To reverse it, issue a credit note (or record a sales return for goods already delivered).', OLD.id, v_invoice
      USING ERRCODE = '42501';
  END IF;
  IF NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    RAISE EXCEPTION 'Order % has been invoiced (%), so it cannot be cancelled. To reverse it, issue a credit note (or record a sales return for goods already delivered).', OLD.id, v_invoice
      USING ERRCODE = '42501';
  END IF;
  IF NEW.value IS NOT DISTINCT FROM OLD.value
     AND NEW.quantity IS NOT DISTINCT FROM OLD.quantity
     AND coalesce(NEW.product, '') = coalesce(OLD.product, '')
     AND public.order_billed_lines(NEW.items, NEW.product, NEW.quantity)
         = public.order_billed_lines(OLD.items, OLD.product, OLD.quantity) THEN
    RETURN NEW;
  END IF;
  RAISE EXCEPTION 'Order % has been invoiced (%), so its value, quantity and items can no longer change. To correct it, record a sales return (Orders → Sales return) or issue a credit note.', OLD.id, v_invoice
    USING ERRCODE = '42501';
END;
$$;

DROP TRIGGER IF EXISTS order_invoiced_is_locked ON public.orders;
CREATE TRIGGER order_invoiced_is_locked
  BEFORE UPDATE OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_invoiced_is_locked();

-- The correction, labelled for the audit trail (040).
SELECT set_config('app.via', 'maintenance correction: Phase 2 test artifact from the B10 fix verification — value/quantity restored to the invoice', true);
UPDATE public.orders SET value = 2400, quantity = 20
 WHERE id = 'O113' AND (value IS DISTINCT FROM 2400 OR quantity IS DISTINCT FROM 20);
UPDATE public.orders SET value = 850
 WHERE id = 'O118' AND value IS DISTINCT FROM 850;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('063_invoiced_order_no_cancel_delete.sql',
        'An invoiced order cannot be cancelled or deleted by any app user; O113 and O118 restored to their invoiced values (audited maintenance correction of the B10 test artifact)')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
