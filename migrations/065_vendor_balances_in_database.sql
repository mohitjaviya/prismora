-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 2: vendor balances move in the database,
--  with the record that causes them, and can be checked.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Deploy the app with it: the older app also
--  writes the balance itself, which this refuses.
--
--  WHAT WAS WRONG
--
--  What we owe a vendor was moved by the browser in a second, separate write
--  after the goods receipt, purchase return or vendor payment. If that write
--  failed, or the page was left between the two, the payable no longer
--  matched its records — and there was no check to show it (the partner one,
--  048, does not cover vendors).
--
--  WHAT THIS DOES
--
--  · The database moves the vendor's outstandingAmount in the same
--    transaction as the record:
--      goods receipt   + Σ quantity × unit cost      (removed: −)
--      purchase return − its value                    (withdrawn: +)
--      vendor payment  − its amount                   (withdrawn: +)
--    An edit to a record's amount, value, items or vendor moves the
--    difference. The vendor of a receipt is its PO's vendor, or — for a
--    receipt with no PO — the vendor with exactly its name.
--  · App users can no longer write outstandingAmount directly; only these
--    triggers (and maintenance) move it.
--  · vendor_balance_drift(): every vendor whose stored balance differs from
--    receipts − returns − payments, for Accounting or Purchases viewers.
--  · Existing balances are NOT corrected here. Two older vendors drift
--    (TEST-V-1, V1790054615576); they are listed for the owner to decide,
--    as the partner corrections were in 048.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- What a goods receipt charges: Σ quantity (or receivedQty) × unit cost.
CREATE OR REPLACE FUNCTION public.grn_value(p_items jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(round(sum(
           coalesce(nullif(i ->> 'quantity', '')::numeric, nullif(i ->> 'receivedQty', '')::numeric, 0)
         * coalesce(nullif(i ->> 'unitCost', '')::numeric, 0)), 2), 0)
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(p_items) = 'array' THEN p_items ELSE '[]'::jsonb END) i
$$;

-- Whose receipt it is: the PO's vendor, else the vendor of exactly that name.
CREATE OR REPLACE FUNCTION public.grn_vendor(p_po_id text, p_vendor_name text)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(
    (SELECT "vendorId" FROM public.purchase_orders WHERE id = p_po_id),
    (SELECT id FROM public.vendors WHERE lower(btrim(name)) = lower(btrim(p_vendor_name)) ORDER BY id LIMIT 1))
$$;

CREATE OR REPLACE FUNCTION public.adjust_vendor_outstanding(p_vendor text, p_delta numeric, p_via text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_vendor IS NULL OR coalesce(p_delta, 0) = 0 THEN
    RETURN;
  END IF;
  PERFORM set_config('app.via', p_via, true);
  PERFORM set_config('app.vendor_balance', 'on', true);
  UPDATE public.vendors SET "outstandingAmount" = round(coalesce("outstandingAmount", 0) + p_delta, 2) WHERE id = p_vendor;
  PERFORM set_config('app.vendor_balance', 'off', true);
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_balance_from_grn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.adjust_vendor_outstanding(public.grn_vendor(OLD."poId", OLD."vendorName"), -public.grn_value(OLD.items),
      format('goods receipt %s %s', OLD.id, CASE WHEN TG_OP = 'DELETE' THEN 'removed' ELSE 'changed' END));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.adjust_vendor_outstanding(public.grn_vendor(NEW."poId", NEW."vendorName"), public.grn_value(NEW.items),
      format('goods receipt %s', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_balance_from_return()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.adjust_vendor_outstanding(OLD."vendorId", coalesce(OLD.value, 0),
      format('purchase return %s %s', OLD.id, CASE WHEN TG_OP = 'DELETE' THEN 'withdrawn' ELSE 'changed' END));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.adjust_vendor_outstanding(NEW."vendorId", -coalesce(NEW.value, 0), format('purchase return %s', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.vendor_balance_from_payment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM public.adjust_vendor_outstanding(OLD."vendorId", coalesce(OLD.amount, 0),
      format('vendor payment %s %s', OLD.id, CASE WHEN TG_OP = 'DELETE' THEN 'withdrawn' ELSE 'changed' END));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM public.adjust_vendor_outstanding(NEW."vendorId", -coalesce(NEW.amount, 0), format('vendor payment %s', NEW.id));
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS vendor_balance_from_grn ON public.grn;
CREATE TRIGGER vendor_balance_from_grn
  AFTER INSERT OR DELETE OR UPDATE OF items, "poId", "vendorName" ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.vendor_balance_from_grn();
DROP TRIGGER IF EXISTS vendor_balance_from_return ON public.purchase_returns;
CREATE TRIGGER vendor_balance_from_return
  AFTER INSERT OR DELETE OR UPDATE OF value, "vendorId" ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.vendor_balance_from_return();
DROP TRIGGER IF EXISTS vendor_balance_from_payment ON public.vendor_payments;
CREATE TRIGGER vendor_balance_from_payment
  AFTER INSERT OR DELETE OR UPDATE OF amount, "vendorId" ON public.vendor_payments
  FOR EACH ROW EXECUTE FUNCTION public.vendor_balance_from_payment();

-- Only the triggers above (and maintenance) move a vendor's balance.
CREATE OR REPLACE FUNCTION public.vendor_balance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW."outstandingAmount" IS DISTINCT FROM OLD."outstandingAmount"
     AND auth.uid() IS NOT NULL
     AND coalesce(current_setting('app.vendor_balance', true), 'off') <> 'on' THEN
    RAISE EXCEPTION 'A vendor''s balance moves only with its goods receipts, purchase returns and payments.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS vendor_balance_guard ON public.vendors;
CREATE TRIGGER vendor_balance_guard
  BEFORE UPDATE ON public.vendors
  FOR EACH ROW EXECUTE FUNCTION public.vendor_balance_guard();

-- The check: stored balance against receipts − returns − payments.
CREATE OR REPLACE FUNCTION public.vendor_balance_drift()
RETURNS TABLE(id text, name text, stored numeric, derived numeric, difference numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH g AS (
    SELECT public.grn_vendor(g."poId", g."vendorName") AS vid, sum(public.grn_value(g.items)) AS v
    FROM public.grn g GROUP BY 1),
  r AS (SELECT "vendorId" AS vid, sum(coalesce(value, 0)) AS v FROM public.purchase_returns GROUP BY 1),
  p AS (SELECT "vendorId" AS vid, sum(coalesce(amount, 0)) AS v FROM public.vendor_payments GROUP BY 1)
  SELECT v.id, v.name, coalesce(v."outstandingAmount", 0),
         round(coalesce(g.v, 0) - coalesce(r.v, 0) - coalesce(p.v, 0), 2),
         round(coalesce(v."outstandingAmount", 0) - (coalesce(g.v, 0) - coalesce(r.v, 0) - coalesce(p.v, 0)), 2)
  FROM public.vendors v
  LEFT JOIN g ON g.vid = v.id LEFT JOIN r ON r.vid = v.id LEFT JOIN p ON p.vid = v.id
  WHERE (public.can_view('accounting') OR public.can_view('purchases'))
    AND abs(coalesce(v."outstandingAmount", 0) - (coalesce(g.v, 0) - coalesce(r.v, 0) - coalesce(p.v, 0))) >= 0.01
  ORDER BY 5 DESC
$$;
REVOKE ALL ON FUNCTION public.vendor_balance_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.vendor_balance_drift() TO authenticated;
REVOKE ALL ON FUNCTION public.adjust_vendor_outstanding(text, numeric, text) FROM PUBLIC, anon, authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('065_vendor_balances_in_database.sql',
        'Vendor balances move in the database with the goods receipt, purchase return or vendor payment that causes them; direct writes refused; vendor_balance_drift() check. Existing balances not corrected.')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
