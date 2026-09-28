-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the rest of the invoice's printed identity comes from Settings.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 053.
--
--  053 moved the seller's name, GSTIN and state out of the code. The printed
--  invoice still carried, from the code, its brand ("PRISMORA", "Premium Skin
--  & Body Care") and "All disputes are subject to Ahmedabad jurisdiction".
--  They join company_settings (Admin edits, audited), and — like the GST
--  details — each invoice records them when issued and keeps them: changing
--  Settings later affects only invoices raised afterwards. Existing invoices
--  record exactly what they have always printed.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS "brandName"    text NOT NULL DEFAULT 'PRISMORA';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS "brandTagline" text NOT NULL DEFAULT 'Premium Skin & Body Care';
ALTER TABLE public.company_settings ADD COLUMN IF NOT EXISTS jurisdiction   text NOT NULL DEFAULT 'Ahmedabad';

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerBrand"        text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerTagline"      text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "sellerJurisdiction" text;

-- Existing invoices: what they have always printed. The status trigger (057)
-- is told this is not a money change.
DO $$
BEGIN
  PERFORM set_config('app.recomputing', 'on', true);
  PERFORM set_config('app.via', 'migration 058: brand and jurisdiction recorded as previously printed', true);
  UPDATE public.invoices SET "sellerBrand" = 'PRISMORA', "sellerTagline" = 'Premium Skin & Body Care', "sellerJurisdiction" = 'Ahmedabad'
  WHERE "sellerBrand" IS NULL;
  PERFORM set_config('app.recomputing', '', true);
END $$;

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
      OR NEW."sellerState" IS DISTINCT FROM OLD."sellerState"
      OR NEW."sellerBrand" IS DISTINCT FROM OLD."sellerBrand"
      OR NEW."sellerTagline" IS DISTINCT FROM OLD."sellerTagline"
      OR NEW."sellerJurisdiction" IS DISTINCT FROM OLD."sellerJurisdiction") THEN
      RAISE EXCEPTION 'Invoice %: the seller details, place of supply and GST type are fixed when it is issued.', NEW.id
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NEW."sellerName" IS NULL THEN
    SELECT * INTO s FROM public.company_settings WHERE id = 'company';
    NEW."sellerName" := s."companyName";
    NEW."sellerGstin" := s.gstin;
    NEW."sellerState" := s.state;
  END IF;
  IF NEW."sellerBrand" IS NULL THEN
    SELECT * INTO s FROM public.company_settings WHERE id = 'company';
    NEW."sellerBrand" := s."brandName";
    NEW."sellerTagline" := s."brandTagline";
    NEW."sellerJurisdiction" := s.jurisdiction;
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

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations (filename, note)
VALUES ('058_invoice_brand_from_settings.sql', 'brand name, tagline and jurisdiction in company_settings; recorded on each invoice at issue and fixed')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
