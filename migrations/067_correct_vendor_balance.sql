-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 4: correct a vendor's balance to its
--  records, audited — the vendor twin of correct_party_balance (048).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 065.
--
--  · correct_vendor_balance(vendor): sets what we owe the vendor to goods
--    receipts − purchase returns − payments (what vendor_balance_drift()
--    calls "should be"). Accounts full or an administrator only. The audit
--    row reads "balance corrected to goods receipts − returns − payments".
--  · Nothing is corrected by this migration.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.vendor_derived_balance(p_id text)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT round(
      coalesce((SELECT sum(public.grn_value(g.items)) FROM public.grn g WHERE public.grn_vendor(g."poId", g."vendorName") = p_id), 0)
    - coalesce((SELECT sum(coalesce(value, 0)) FROM public.purchase_returns WHERE "vendorId" = p_id), 0)
    - coalesce((SELECT sum(coalesce(amount, 0)) FROM public.vendor_payments WHERE "vendorId" = p_id), 0), 2)
$$;

CREATE OR REPLACE FUNCTION public.correct_vendor_balance(p_id text)
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
  PERFORM set_config('app.via', 'balance corrected to goods receipts − returns − payments', true);
  PERFORM set_config('app.vendor_balance', 'on', true);
  UPDATE public.vendors SET "outstandingAmount" = v_new WHERE id = p_id;
  PERFORM set_config('app.vendor_balance', 'off', true);
  RETURN v_new;
END;
$$;

REVOKE ALL ON FUNCTION public.correct_vendor_balance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_vendor_balance(text) TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('067_correct_vendor_balance.sql',
        'correct_vendor_balance(): Accounts/admin set a vendor balance to goods receipts − returns − payments, audited; nothing corrected by the migration')
ON CONFLICT (filename) DO NOTHING;
