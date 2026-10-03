-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 12: master-data rules (and three owner decisions).
--  Apply: npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/078_master_data_rules.sql
--  Safe to run more than once.
--
--  1. Dispatch Team does not delete orders (owner's decision).
--  2. Warehouse Manager records GRNs: it may insert a GRN. The receipt's
--     stock, PO status and vendor balance are moved by the existing definer
--     triggers (041, 051, 065), so nothing else on purchases opens up.
--  3. Master lists are readable by every signed-in staff member (not
--     partners). They hold only option labels (statuses, types, categories,
--     units, warehouses) — checked before this change: no prices, costs,
--     margins or pay. Writing them still needs Settings = full.
--  4. GSTIN, phone and pincode formats on distributors, dealers, retailers and
--     vendors, checked only when the field is entered or changed. Some old
--     rows hold test values that fail; a plain CHECK would refuse every later
--     update of those rows, including the balance triggers. GSTIN is stored in
--     capitals.
--  5. Schemes: discount 0–100, validTo not before validFrom, free goods
--     quantity and minimum order value not negative.
--  6. A product used by stock, orders (or order lines), schemes or complaints
--     cannot be deleted or renamed — those link to it by name.
--  7. One option per list, ignoring capitals (key and label). The one
--     duplicate, lead_source "other", is merged into "Other" first.
--  8. Complaint numbers come from a sequence that starts after the highest
--     CMP number ever used (complaints, audit_log, events), so a deleted
--     number is never given out again.
--  9. Partner prices may not be above the MRP.
-- 10. Credit limits may not be negative.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Dispatch does not delete orders ──────────────────────────────────
DROP POLICY IF EXISTS orders_delete ON public.orders;
CREATE POLICY orders_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.can_edit('orders') AND NOT public.is_partner()
         AND public.my_role_name() IS DISTINCT FROM 'Dispatch Team');

-- ── 2. Warehouse Manager records GRNs ───────────────────────────────────
DROP POLICY IF EXISTS grn_insert_warehouse ON public.grn;
CREATE POLICY grn_insert_warehouse ON public.grn
  FOR INSERT TO authenticated
  WITH CHECK (public.my_role_name() = 'Warehouse Manager');

-- ── 3. Master lists readable by staff ───────────────────────────────────
DROP POLICY IF EXISTS masters_select ON public.masters;
CREATE POLICY masters_select ON public.masters
  FOR SELECT TO authenticated
  USING (public.can_view('settings')
         OR (public.my_role_name() IS NOT NULL AND NOT public.is_partner()));

-- ── 4. GSTIN / phone / pincode formats ──────────────────────────────────
-- Applies to everyone (app, sign-up function, SQL). Old values stand until
-- someone changes that field.
CREATE OR REPLACE FUNCTION public.partner_contact_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_phone text;
  v_new_pin text := to_jsonb(NEW) ->> 'pincode';
  v_old_pin text;
BEGIN
  IF TG_OP = 'UPDATE' THEN v_old_pin := to_jsonb(OLD) ->> 'pincode'; END IF;

  IF nullif(btrim(NEW.gstin), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR upper(btrim(NEW.gstin)) IS DISTINCT FROM upper(btrim(coalesce(OLD.gstin, '')))) THEN
    NEW.gstin := upper(btrim(NEW.gstin));
    IF NEW.gstin !~ '^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$' THEN
      RAISE EXCEPTION 'GSTIN % is not valid: it must be 15 characters, like 24AAACJ1234K1Z5.', NEW.gstin;
    END IF;
  END IF;

  IF nullif(btrim(NEW.phone), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone) THEN
    v_phone := regexp_replace(NEW.phone, '[\s-]', '', 'g');
    IF v_phone !~ '^(\+91|91|0)?[6-9][0-9]{9}$' AND v_phone !~ '^0[1-9][0-9]{9}$' THEN
      RAISE EXCEPTION 'Phone % is not valid: use a 10-digit mobile number starting 6–9 (+91 or 0 in front is fine), or an 11-digit landline starting with 0.', NEW.phone;
    END IF;
  END IF;

  IF nullif(btrim(v_new_pin), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR v_new_pin IS DISTINCT FROM v_old_pin)
     AND btrim(v_new_pin) !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'Pincode % is not valid: it must be 6 digits and cannot start with 0.', v_new_pin;
  END IF;

  RETURN NEW;
END $$;

DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributors', 'dealers', 'retailers', 'vendors'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS partner_contact_checks ON public.%I', t);
    EXECUTE format('CREATE TRIGGER partner_contact_checks BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.partner_contact_checks()', t);
  END LOOP;
END $$;

-- ── 5. Scheme values ────────────────────────────────────────────────────
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_discount_0_100;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_discount_0_100
  CHECK ("discountPct" IS NULL OR ("discountPct" >= 0 AND "discountPct" <= 100));
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_dates_in_order;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_dates_in_order
  CHECK ("validFrom" IS NULL OR "validTo" IS NULL OR "validTo" >= "validFrom");
ALTER TABLE public.schemes DROP CONSTRAINT IF EXISTS schemes_amounts_not_negative;
ALTER TABLE public.schemes ADD CONSTRAINT schemes_amounts_not_negative
  CHECK (coalesce("freeGoodsQty", 0) >= 0 AND coalesce("minOrderValue", 0) >= 0);

-- ── 6. A product in use keeps its name ──────────────────────────────────
-- Definer: it must count rows the caller may not be allowed to read. It has
-- no caller test, so definer rights change nothing about who it stops.
CREATE OR REPLACE FUNCTION public.product_in_use_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  k text := lower(btrim(OLD.name));
  n_stock int; n_orders int; n_schemes int; n_complaints int;
BEGIN
  IF TG_OP = 'UPDATE' AND NEW.name IS NOT DISTINCT FROM OLD.name THEN RETURN NEW; END IF;
  IF k IS NULL OR k = '' THEN RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END; END IF;

  SELECT count(*) INTO n_stock FROM public.inventory WHERE lower(btrim(product)) = k;
  SELECT count(*) INTO n_orders FROM public.orders o
   WHERE lower(btrim(o.product)) = k
      OR (jsonb_typeof(o.items) = 'array' AND EXISTS (
            SELECT 1 FROM jsonb_array_elements(o.items) i
             WHERE jsonb_typeof(i) = 'object'
               AND lower(btrim(coalesce(i ->> 'name', i ->> 'product'))) = k));
  SELECT count(*) INTO n_schemes FROM public.schemes s
   WHERE lower(btrim(s."freeGoodsProduct")) = k
      OR EXISTS (SELECT 1 FROM unnest(coalesce(s.products, '{}')) p WHERE lower(btrim(p)) = k)
      OR (jsonb_typeof(s."applicableProducts") = 'array' AND EXISTS (
            SELECT 1 FROM jsonb_array_elements_text(s."applicableProducts") a WHERE lower(btrim(a)) = k));
  SELECT count(*) INTO n_complaints FROM public.complaints WHERE lower(btrim(product)) = k;

  IF n_stock + n_orders + n_schemes + n_complaints > 0 THEN
    RAISE EXCEPTION 'Product "%" is in use (% stock batch(es), % order(s), % scheme(s), % complaint(s)), so it cannot be % — they refer to it by name. Set its status to Discontinued instead.',
      OLD.name, n_stock, n_orders, n_schemes, n_complaints,
      CASE WHEN TG_OP = 'DELETE' THEN 'deleted' ELSE 'renamed' END;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS product_in_use_guard ON public.products;
CREATE TRIGGER product_in_use_guard
  BEFORE UPDATE OF name OR DELETE ON public.products
  FOR EACH ROW EXECUTE FUNCTION public.product_in_use_guard();

-- ── 7. One option per list, ignoring capitals ───────────────────────────
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.masters WHERE list = 'lead_source' AND key = 'Other')
     AND EXISTS (SELECT 1 FROM public.masters WHERE list = 'lead_source' AND key = 'other') THEN
    UPDATE public.leads SET "leadSource" = 'Other' WHERE "leadSource" = 'other';
    DELETE FROM public.masters WHERE list = 'lead_source' AND key = 'other';
  END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS masters_list_key_ci ON public.masters (list, lower(btrim(key)));
CREATE UNIQUE INDEX IF NOT EXISTS masters_list_label_ci ON public.masters (list, lower(btrim(label)));

-- ── 8. Complaint numbers never reused ───────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.complaints_number_seq;
GRANT USAGE, SELECT ON SEQUENCE public.complaints_number_seq TO authenticated, service_role;

DO $$
DECLARE v bigint;
BEGIN
  SELECT greatest(
    (SELECT max(substr(id, 5)::bigint) FROM public.complaints WHERE id ~ '^CMP-[0-9]{1,15}$'),
    (SELECT max(substr(row_id, 5)::bigint) FROM public.audit_log WHERE table_name = 'complaints' AND row_id ~ '^CMP-[0-9]{1,15}$'),
    (SELECT max(substr("dataId", 5)::bigint) FROM public.events WHERE "dataId" ~ '^CMP-[0-9]{1,15}$'),
    (SELECT last_value FROM public.complaints_number_seq WHERE is_called),
    0) INTO v;
  PERFORM setval('public.complaints_number_seq', greatest(v, 1), v > 0);
END $$;

-- Invoker, so it can tell app users from maintenance: a blank id is always
-- numbered; an app user's CMP-<n> is replaced (the browser cannot pick a
-- number); maintenance (restore, SQL) keeps the id it gives. Other ids
-- (TEST-…) are kept.
CREATE OR REPLACE FUNCTION public.complaints_assign_id()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF nullif(btrim(NEW.id), '') IS NULL
     OR (NEW.id ~ '^CMP-[0-9]+$' AND current_user IN ('authenticated', 'anon') AND NOT public.is_service_request()) THEN
    NEW.id := 'CMP-' || nextval('public.complaints_number_seq');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS complaints_assign_id ON public.complaints;
CREATE TRIGGER complaints_assign_id
  BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_assign_id();

-- ── 9. Partner prices within MRP ────────────────────────────────────────
ALTER TABLE public.products DROP CONSTRAINT IF EXISTS products_partner_prices_within_mrp;
ALTER TABLE public.products ADD CONSTRAINT products_partner_prices_within_mrp
  CHECK (mrp IS NULL OR (coalesce("distributorPrice", 0) <= mrp
                         AND coalesce("dealerPrice", 0) <= mrp
                         AND coalesce("retailerPrice", 0) <= mrp));

-- ── 10. Credit limits not negative ──────────────────────────────────────
ALTER TABLE public.distributors DROP CONSTRAINT IF EXISTS distributors_credit_limit_not_negative;
ALTER TABLE public.distributors ADD CONSTRAINT distributors_credit_limit_not_negative CHECK (coalesce("creditLimit", 0) >= 0);
ALTER TABLE public.dealers DROP CONSTRAINT IF EXISTS dealers_credit_limit_not_negative;
ALTER TABLE public.dealers ADD CONSTRAINT dealers_credit_limit_not_negative CHECK (coalesce("creditLimit", 0) >= 0);
ALTER TABLE public.retailers DROP CONSTRAINT IF EXISTS retailers_credit_limit_not_negative;
ALTER TABLE public.retailers ADD CONSTRAINT retailers_credit_limit_not_negative CHECK (coalesce("creditLimit", 0) >= 0);


INSERT INTO public.schema_migrations (filename, note)
VALUES ('078_master_data_rules.sql',
        'batch 12: Dispatch no order delete; Warehouse GRN insert; masters readable by staff; GSTIN/phone/pincode on change; scheme/price/credit CHECKs; product in use not deleted/renamed; masters unique ignoring case; complaint ids from a sequence')
ON CONFLICT (filename) DO NOTHING;
