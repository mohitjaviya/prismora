-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5 wrap-up:
--    1. a purchase order with goods receipts can't be deleted;
--    2. correct_vendor_balance() takes an optional reason for the audit log.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 065 and 067.
--
--  WHAT WAS WRONG
--
--  Admin User deleted PO-10 five minutes after receiving it as GRN-17. The
--  receipt stayed, with its stock and its payable, but its PO link was set
--  to null — a ₹1,10,000 receipt with no purchase order behind it.
--
--  WHAT THIS DOES
--
--  · For every signed-in user, Admin included: deleting a purchase order
--    that any goods receipt names is refused, naming the receipt. Closing or
--    cancelling it keeps the record. Maintenance (no user) passes.
--  · correct_vendor_balance(vendor, reason): the reason, when given, is what
--    the audit row says ("balance corrected: <reason>"); without one it
--    reads as before. The one-argument call the app makes still works.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE OR REPLACE FUNCTION public.po_with_receipts_not_deleted()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_grn text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN OLD;
  END IF;
  SELECT id INTO v_grn FROM public.grn WHERE "poId" = OLD.id ORDER BY "createdAt" LIMIT 1;
  IF v_grn IS NOT NULL THEN
    RAISE EXCEPTION 'Purchase order % has goods received against it (%), so it cannot be deleted. Close it instead — the receipt, its stock and what we owe the vendor stay with it.', OLD.id, v_grn
      USING ERRCODE = '42501';
  END IF;
  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS po_with_receipts_not_deleted ON public.purchase_orders;
CREATE TRIGGER po_with_receipts_not_deleted
  BEFORE DELETE ON public.purchase_orders
  FOR EACH ROW EXECUTE FUNCTION public.po_with_receipts_not_deleted();

DROP FUNCTION IF EXISTS public.correct_vendor_balance(text);
CREATE OR REPLACE FUNCTION public.correct_vendor_balance(p_id text, p_reason text DEFAULT NULL)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new numeric;
BEGIN
  IF NOT (public.is_app_admin() OR public.can_edit('accounting')) THEN
    RAISE EXCEPTION 'Only Accounts or an administrator can correct a balance.' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.vendors WHERE id = p_id) THEN
    RAISE EXCEPTION 'Vendor % not found.', p_id USING ERRCODE = '23503';
  END IF;
  v_new := public.vendor_derived_balance(p_id);
  PERFORM set_config('app.via',
    CASE WHEN nullif(btrim(p_reason), '') IS NULL THEN 'balance corrected to goods receipts − returns − payments'
         ELSE 'balance corrected: ' || btrim(p_reason) END, true);
  PERFORM set_config('app.vendor_balance', 'on', true);
  UPDATE public.vendors SET "outstandingAmount" = v_new WHERE id = p_id;
  PERFORM set_config('app.vendor_balance', 'off', true);
  RETURN v_new;
END;
$$;
REVOKE ALL ON FUNCTION public.correct_vendor_balance(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_vendor_balance(text, text) TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('068_po_with_receipts_not_deleted.sql',
        'A purchase order with goods receipts cannot be deleted by any app user; correct_vendor_balance takes an optional audit reason')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
