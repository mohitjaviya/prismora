-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3, D-17: GST place of supply, decided and kept at issue.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 039 (create_invoice, insert_invoice_for_order),
--  040 (stamp_modified, audit_row), 046 (charge path).
--
--  WHAT WAS WRONG
--
--  An invoice stored one tax figure. Whether it was CGST+SGST or IGST was
--  decided each time it was printed, by comparing the delivery state with the
--  word "gujarat" in the code; a custom invoice had no state at all, so it
--  always printed as intrastate, and each half was rounded on its own (the two
--  could be ₹1 off the total). The seller's name and GSTIN were in the code.
--
--  WHAT THIS DOES
--
--  · company_settings: the seller's name, GSTIN and state — one row, readable
--    by anyone signed in (invoices print it), changed only by an
--    administrator, audited. Seeded with the owner's DEMO values, flagged.
--  · Each invoice records, when issued: the seller as it was (name, GSTIN,
--    state), the place of supply, and the supply type — intra (CGST+SGST) when
--    the place of supply is the seller's state, inter (IGST) otherwise — plus
--    the amounts. The tax is rounded once; CGST is half of it to the paisa and
--    SGST the rest, so the total is the same either way.
--  · Once set, the seller, place of supply and supply type do not change:
--    editing Settings later leaves every issued invoice as it was.
--  · Place of supply: the order's delivery state; else the partner's state;
--    else, for a custom invoice, the state chosen on the form (now required
--    unless a partner is chosen). A custom invoice may now name a partner,
--    who is then charged for it like any other invoice.
--  · Existing invoices are recorded as they were printed until now: place of
--    supply = order state, else Gujarat; intra when that is Gujarat.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Company settings ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.company_settings (
  id            text PRIMARY KEY DEFAULT 'company' CHECK (id = 'company'),
  "companyName" text NOT NULL,
  gstin         text NOT NULL,
  state         text NOT NULL,
  address       text,
  email         text,
  "isDemo"      boolean NOT NULL DEFAULT true,
  "updatedBy"   text,
  "updatedAt"   timestamptz
);

INSERT INTO public.company_settings (id, "companyName", gstin, state, "isDemo")
VALUES ('company', 'Prismora Demo Pvt Ltd', '24AAAAA0000A1Z5', 'Gujarat', true)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.company_settings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS company_settings_select ON public.company_settings;
CREATE POLICY company_settings_select ON public.company_settings FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS company_settings_update ON public.company_settings;
CREATE POLICY company_settings_update ON public.company_settings FOR UPDATE TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());

DROP TRIGGER IF EXISTS stamp_modified ON public.company_settings;
CREATE TRIGGER stamp_modified BEFORE INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.stamp_modified();
DROP TRIGGER IF EXISTS audit_row ON public.company_settings;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();


-- ── What each invoice records at issue ──────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "placeOfSupply" text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "supplyType"    text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS cgst            numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS sgst            numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS igst            numeric;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerName"    text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerGstin"   text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerState"   text;
DO $$ BEGIN
  ALTER TABLE public.invoices ADD CONSTRAINT invoices_supply_type_check CHECK ("supplyType" IN ('intra', 'inter'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Existing invoices, recorded as they have been printed until now.
DO $$
BEGIN
  PERFORM set_config('app.via', 'migration 053: GST place of supply and split recorded as previously printed', true);
  UPDATE public.invoices i SET
    "sellerName"    = s."companyName",
    "sellerGstin"   = s.gstin,
    "sellerState"   = s.state,
    "placeOfSupply" = coalesce(nullif(btrim(o.state), ''), 'Gujarat'),
    "supplyType"    = CASE WHEN lower(btrim(coalesce(nullif(btrim(o.state), ''), 'Gujarat'))) = 'gujarat' THEN 'intra' ELSE 'inter' END
  FROM public.company_settings s, public.invoices i2 LEFT JOIN public.orders o ON o.id = i2."orderId"
  WHERE s.id = 'company' AND i2.id = i.id AND i."supplyType" IS NULL;

  UPDATE public.invoices SET
    igst = CASE WHEN "supplyType" = 'inter' THEN coalesce(tax, 0) ELSE 0 END,
    cgst = CASE WHEN "supplyType" = 'intra' THEN round(coalesce(tax, 0) / 2, 2) ELSE 0 END,
    sgst = CASE WHEN "supplyType" = 'intra' THEN coalesce(tax, 0) - round(coalesce(tax, 0) / 2, 2) ELSE 0 END
  WHERE cgst IS NULL;
END $$;

-- Every invoice from now on.
CREATE OR REPLACE FUNCTION public.invoice_gst_split()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  s public.company_settings;
  v_state text;
  v_tax numeric := coalesce(NEW.tax, 0);
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF OLD."supplyType" IS NOT NULL AND (
         NEW."supplyType" IS DISTINCT FROM OLD."supplyType"
      OR NEW."placeOfSupply" IS DISTINCT FROM OLD."placeOfSupply"
      OR NEW."sellerName" IS DISTINCT FROM OLD."sellerName"
      OR NEW."sellerGstin" IS DISTINCT FROM OLD."sellerGstin"
      OR NEW."sellerState" IS DISTINCT FROM OLD."sellerState") THEN
      RAISE EXCEPTION 'Invoice %: the seller, place of supply and GST type are fixed when it is issued.', NEW.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW."sellerName" IS NULL THEN
    SELECT * INTO s FROM public.company_settings WHERE id = 'company';
    NEW."sellerName" := s."companyName";
    NEW."sellerGstin" := s.gstin;
    NEW."sellerState" := s.state;
  END IF;

  IF nullif(btrim(NEW."placeOfSupply"), '') IS NULL THEN
    SELECT nullif(btrim(o.state), '') INTO v_state FROM public.orders o WHERE o.id = NEW."orderId";
    IF v_state IS NULL THEN
      SELECT nullif(btrim(p.state), '') INTO v_state FROM (
        SELECT state FROM public.distributors WHERE id = NEW."distributorId"
        UNION ALL SELECT state FROM public.dealers WHERE id = NEW."dealerId"
        UNION ALL SELECT state FROM public.retailers WHERE id = NEW."retailerId") p LIMIT 1;
    END IF;
    -- Nothing to go on (an order with no state): the seller's own state, which
    -- is how such an invoice has always been treated. create_invoice asks for
    -- a state on a custom invoice, so this is only ever an order's gap.
    NEW."placeOfSupply" := coalesce(v_state, NEW."sellerState");
  END IF;

  IF NEW."supplyType" IS NULL THEN
    NEW."supplyType" := CASE WHEN lower(btrim(NEW."placeOfSupply")) = lower(btrim(NEW."sellerState")) THEN 'intra' ELSE 'inter' END;
  END IF;

  NEW.igst := CASE WHEN NEW."supplyType" = 'inter' THEN v_tax ELSE 0 END;
  NEW.cgst := CASE WHEN NEW."supplyType" = 'intra' THEN round(v_tax / 2, 2) ELSE 0 END;
  NEW.sgst := CASE WHEN NEW."supplyType" = 'intra' THEN v_tax - round(v_tax / 2, 2) ELSE 0 END;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.invoice_gst_split() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_gst_split ON public.invoices;
CREATE TRIGGER invoice_gst_split
  BEFORE INSERT OR UPDATE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_gst_split();


-- ── create_invoice: a custom invoice names a partner or a state ─────────
DROP FUNCTION IF EXISTS public.create_invoice(text, text, numeric, boolean, numeric, timestamptz);

CREATE OR REPLACE FUNCTION public.create_invoice(
  p_order_id text, p_customer_name text, p_amount numeric, p_with_tax boolean, p_gst_pct numeric,
  p_due timestamptz, p_party_id text DEFAULT NULL, p_place_of_supply text DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o public.orders;
  v_existing text;
  v_id text;
  v_tax numeric := 0;
  v_dist text; v_dealer text; v_retail text;
  v_party_name text; v_party_state text;
BEGIN
  IF NOT public.can_raise_invoices() THEN
    RAISE EXCEPTION 'Your role cannot raise invoices. It needs full Accounting access.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('app.via', CASE WHEN p_order_id IS NOT NULL
    THEN format('manual invoice for order %s', p_order_id) ELSE 'manual custom invoice' END, true);

  IF p_order_id IS NOT NULL THEN
    SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Order % no longer exists.', p_order_id USING ERRCODE = 'P0001';
    END IF;
    SELECT id INTO v_existing FROM public.invoices WHERE "orderId" = p_order_id LIMIT 1;
    IF v_existing IS NOT NULL THEN
      RAISE EXCEPTION 'Order % is already invoiced as %. An order can have only one invoice.', p_order_id, v_existing
        USING ERRCODE = 'P0001';
    END IF;
    v_id := public.insert_invoice_for_order(o, 'tax_invoice', coalesce(p_with_tax, true),
      coalesce(p_due, now() + interval '14 days'), public.my_user_id());
    IF v_id IS NULL THEN
      RAISE EXCEPTION 'Order % was invoiced a moment ago by someone else.', p_order_id USING ERRCODE = 'P0001';
    END IF;
    RETURN v_id;
  END IF;

  -- Custom invoice: for a partner (charged), or a walk-in (a state is needed).
  IF p_party_id IS NOT NULL THEN
    SELECT id, name, state INTO v_dist, v_party_name, v_party_state FROM public.distributors WHERE id = p_party_id;
    IF v_dist IS NULL THEN
      SELECT id, name, state INTO v_dealer, v_party_name, v_party_state FROM public.dealers WHERE id = p_party_id;
    END IF;
    IF v_dist IS NULL AND v_dealer IS NULL THEN
      SELECT id, name, state INTO v_retail, v_party_name, v_party_state FROM public.retailers WHERE id = p_party_id;
    END IF;
    IF v_dist IS NULL AND v_dealer IS NULL AND v_retail IS NULL THEN
      RAISE EXCEPTION 'Partner % not found.', p_party_id USING ERRCODE = 'P0001';
    END IF;
    IF nullif(btrim(v_party_state), '') IS NULL AND nullif(btrim(p_place_of_supply), '') IS NULL THEN
      RAISE EXCEPTION '% has no state on record. Choose the place of supply for this invoice.', v_party_name USING ERRCODE = 'P0001';
    END IF;
  ELSIF nullif(btrim(p_place_of_supply), '') IS NULL THEN
    RAISE EXCEPTION 'Choose the customer''s state (place of supply) — it decides CGST+SGST or IGST.' USING ERRCODE = 'P0001';
  END IF;

  IF nullif(btrim(coalesce(p_customer_name, v_party_name)), '') IS NULL OR coalesce(p_amount, 0) <= 0 THEN
    RAISE EXCEPTION 'A custom invoice needs a customer name and an amount above zero.' USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(p_with_tax, true) THEN
    IF p_gst_pct IS NULL OR p_gst_pct NOT IN (0, 5, 12, 18, 28) THEN
      RAISE EXCEPTION 'Choose the GST rate for a custom invoice (0, 5, 12, 18 or 28%%).' USING ERRCODE = 'P0001';
    END IF;
    v_tax := round(p_amount * p_gst_pct / 100);
  END IF;

  v_id := 'INV-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM public.invoices WHERE id = v_id) LOOP
    v_id := v_id || 'x';
  END LOOP;

  INSERT INTO public.invoices (id, "customerName", "distributorId", "dealerId", "retailerId", "placeOfSupply",
                               amount, tax, status, "dueDate", "assignedTo", "createdBy", "createdAt", "invoiceType", lines)
  VALUES (v_id, btrim(coalesce(nullif(btrim(p_customer_name), ''), v_party_name)), v_dist, v_dealer, v_retail,
          coalesce(nullif(btrim(p_place_of_supply), ''), nullif(btrim(v_party_state), '')),
          p_amount, v_tax, 'Unpaid', coalesce(p_due, now() + interval '14 days'),
          public.my_user_id(), public.my_user_id(), now(), 'tax_invoice',
          jsonb_build_array(jsonb_build_object('name', 'Custom invoice', 'quantity', 1, 'unitPrice', p_amount,
            'amount', p_amount, 'gstPct', CASE WHEN coalesce(p_with_tax, true) THEN p_gst_pct END,
            'gstAmount', v_tax)));

  -- A partner is charged for it, as for any other invoice.
  PERFORM public.charge_party(v_dist, v_dealer, v_retail, p_amount + v_tax);
  RETURN v_id;
END $function$;

REVOKE ALL ON FUNCTION public.create_invoice(text, text, numeric, boolean, numeric, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_invoice(text, text, numeric, boolean, numeric, timestamptz, text, text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('053_gst_place_of_supply.sql',
        'D-17: company_settings (demo); invoices record seller, place of supply, supply type and CGST/SGST/IGST at issue, fixed thereafter; custom invoices name a partner or a state')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
