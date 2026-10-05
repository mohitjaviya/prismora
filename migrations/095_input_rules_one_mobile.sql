-- Migration 095: Gap 9 follow-up - one mobile rule, order/complaint phones, limits
-- (prepared 2026-10-05; FILE ONLY, not applied. 088 is reserved for Gap 5.)
--
-- The screen rules are in src/utils/formRules.js; this file makes the database
-- say the same thing:
--
--  1. ONE mobile rule: 10 digits starting 6-9; spaces and dashes ignored; +91,
--     91 or a leading 0 allowed in front. No landlines (078 allowed them for
--     partners and vendors). Function is_indian_mobile().
--  2. Phone/email checks on orders (phone, email), complaints (customerPhone),
--     leads, partners, vendors and company settings - as a TRIGGER that looks
--     only when the field is entered or changed. 094 used CHECK ... NOT VALID
--     for leads/partners, but a CHECK is also tested on every later UPDATE of
--     the row, so an old lead with a bad test phone could not even change
--     status. Those CHECKs are dropped here and replaced by the trigger.
--     Old values stand until someone edits that field (they are listed in
--     NOTES.md for staff to correct).
--  3. Order value must be more than 0 (a lead's deal value may stay 0).
--  4. Upper limits that catch typing mistakes: quantity <= 1,00,000 (orders,
--     order lines, stock batch), a stock adjustment +/- 1,00,000 per change,
--     amounts <= Rs 10 crore (orders, payments, expenses, credit notes,
--     purchase orders/returns, product prices, unit cost, lead deal value).
--  5. A stock batch must have a quantity (0 is allowed).
--
-- Not needed here: scheme discount 0-100 is already CHECKed (078,
-- schemes_discount_0_100, confirmed live 2026-10-05); sales return quantities
-- are already refused unless whole and above 0 (record_sales_return, 054/086).
-- The "2 decimals" rule for scheme % is screen-only.
--
-- Checked read-only on the live data before writing: no existing row breaks
-- any CHECK below (orders value <= 0: 0; qty > 1,00,000: 0; amounts > 10
-- crore: 0; inventory over limit or NULL quantity: 0). The only old rows that
-- fail the phone rule are the ones in the NOTES.md checklist; the triggers
-- leave them alone until their phone is edited.
--
-- Rollback: drop the triggers/constraints named below and, if wanted, recreate
-- 078's partner_contact_checks (landlines) and 094's CHECKs.

BEGIN;

-- 1. The one mobile rule -------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_indian_mobile(p text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
AS $$ SELECT regexp_replace(coalesce(p, ''), '[\s-]', '', 'g') ~ '^(\+91|91|0)?[6-9][0-9]{9}$' $$;

-- 2. Phone / email trigger (only when entered or changed) ------------------
-- Arguments: 'phone=<column>' and/or 'email=<column>'.
CREATE OR REPLACE FUNCTION public.input_contact_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  a text; kind text; col text; v_new text; v_old text;
BEGIN
  FOREACH a IN ARRAY TG_ARGV LOOP
    kind := split_part(a, '=', 1);
    col := split_part(a, '=', 2);
    v_new := to_jsonb(NEW) ->> col;
    IF nullif(btrim(v_new), '') IS NULL THEN CONTINUE; END IF;
    IF TG_OP = 'UPDATE' THEN
      v_old := to_jsonb(OLD) ->> col;
      IF v_new IS NOT DISTINCT FROM v_old THEN CONTINUE; END IF;
    END IF;
    IF kind = 'phone' AND NOT public.is_indian_mobile(v_new) THEN
      RAISE EXCEPTION 'Phone % is not valid: use a 10-digit mobile number starting 6-9 (+91 in front is fine).', v_new;
    END IF;
    IF kind = 'email' AND btrim(v_new) !~ '^[^@\s]+@[^@\s]+\.[^@\s]{2,}$' THEN
      RAISE EXCEPTION 'Email % is not valid: use an address like name@domain.com.', v_new;
    END IF;
  END LOOP;
  RETURN NEW;
END $$;

-- 094's CHECKs (tested on every update) give way to the trigger.
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_phone_format;
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_email_format;
ALTER TABLE public.company_settings DROP CONSTRAINT IF EXISTS company_settings_email_format;
ALTER TABLE public.dealers DROP CONSTRAINT IF EXISTS dealers_email_format;
ALTER TABLE public.retailers DROP CONSTRAINT IF EXISTS retailers_email_format;
ALTER TABLE public.distributors DROP CONSTRAINT IF EXISTS distributors_email_format;

DROP TRIGGER IF EXISTS input_contact_checks ON public.leads;
CREATE TRIGGER input_contact_checks BEFORE INSERT OR UPDATE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.input_contact_checks('phone=phone', 'email=email');
DROP TRIGGER IF EXISTS input_contact_checks ON public.orders;
CREATE TRIGGER input_contact_checks BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.input_contact_checks('phone=phone', 'email=email');
DROP TRIGGER IF EXISTS input_contact_checks ON public.complaints;
CREATE TRIGGER input_contact_checks BEFORE INSERT OR UPDATE ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.input_contact_checks('phone=customerPhone');
DROP TRIGGER IF EXISTS input_contact_checks ON public.company_settings;
CREATE TRIGGER input_contact_checks BEFORE INSERT OR UPDATE ON public.company_settings
  FOR EACH ROW EXECUTE FUNCTION public.input_contact_checks('email=email');
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributors', 'dealers', 'retailers', 'vendors'] LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS input_contact_checks ON public.%I', t);
    EXECUTE format('CREATE TRIGGER input_contact_checks BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.input_contact_checks(%L)', t, 'email=email');
  END LOOP;
END $$;

-- Partners and vendors: 078's trigger, phone part now the one mobile rule (no landlines).
CREATE OR REPLACE FUNCTION public.partner_contact_checks()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
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
     AND (TG_OP = 'INSERT' OR NEW.phone IS DISTINCT FROM OLD.phone)
     AND NOT public.is_indian_mobile(NEW.phone) THEN
    RAISE EXCEPTION 'Phone % is not valid: use a 10-digit mobile number starting 6-9 (+91 in front is fine).', NEW.phone;
  END IF;

  IF nullif(btrim(v_new_pin), '') IS NOT NULL
     AND (TG_OP = 'INSERT' OR v_new_pin IS DISTINCT FROM v_old_pin)
     AND btrim(v_new_pin) !~ '^[1-9][0-9]{5}$' THEN
    RAISE EXCEPTION 'Pincode % is not valid: it must be 6 digits and cannot start with 0.', v_new_pin;
  END IF;

  RETURN NEW;
END $$;

-- 3 + 4. Order value, quantity and amount limits ---------------------------
ALTER TABLE public.orders ADD CONSTRAINT orders_value_positive CHECK (value IS NULL OR value > 0) NOT VALID;
ALTER TABLE public.orders ADD CONSTRAINT orders_value_max CHECK (value IS NULL OR value <= 100000000) NOT VALID;
ALTER TABLE public.orders ADD CONSTRAINT orders_quantity_max CHECK (quantity IS NULL OR quantity <= 100000) NOT VALID;

-- Each order line: whole units, above 0, at most 1,00,000.
CREATE OR REPLACE FUNCTION public.order_item_limits()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE i jsonb; q numeric;
BEGIN
  IF NEW.items IS NULL OR jsonb_typeof(NEW.items) <> 'array' THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW.items IS NOT DISTINCT FROM OLD.items THEN RETURN NEW; END IF;
  FOR i IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    q := nullif(i ->> 'quantity', '')::numeric;
    IF q IS NULL THEN CONTINUE; END IF;
    IF q <= 0 OR q <> trunc(q) THEN
      RAISE EXCEPTION 'Quantity for "%" must be a whole number above 0.', i ->> 'name';
    END IF;
    IF q > 100000 THEN
      RAISE EXCEPTION 'Quantity for "%" cannot be more than 1,00,000.', i ->> 'name';
    END IF;
  END LOOP;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS order_item_limits ON public.orders;
CREATE TRIGGER order_item_limits BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_item_limits();

-- Stock batches: a quantity is required (0 is a sold-out batch) and none is over 1,00,000.
ALTER TABLE public.inventory ADD CONSTRAINT inventory_quantity_required CHECK (quantity IS NOT NULL) NOT VALID;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_counts_max CHECK (
  coalesce(quantity, 0) <= 100000 AND coalesce(reserved, 0) <= 100000 AND coalesce(transit, 0) <= 100000
  AND coalesce(damaged, 0) <= 100000 AND coalesce("reorderLevel", 0) <= 100000
) NOT VALID;
ALTER TABLE public.inventory ADD CONSTRAINT inventory_unit_cost_max CHECK (coalesce("unitCost", 0) <= 100000000) NOT VALID;

-- A stock adjustment is at most +/- 1,00,000 per change (adjust_stock writes the movement row;
-- refusing it here undoes the whole adjustment).
CREATE OR REPLACE FUNCTION public.stock_adjustment_limit()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.kind = 'adjustment' AND abs(coalesce(NEW.quantity, 0)) > 100000 THEN
    RAISE EXCEPTION 'A stock adjustment cannot be more than 1,00,000 either way.';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS stock_adjustment_limit ON public.stock_movements;
CREATE TRIGGER stock_adjustment_limit BEFORE INSERT ON public.stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.stock_adjustment_limit();

-- Amounts at most Rs 10 crore (10,00,00,000).
ALTER TABLE public.leads ADD CONSTRAINT leads_deal_value_max CHECK (coalesce("dealValue", 0) <= 100000000) NOT VALID;
ALTER TABLE public.distributor_payments ADD CONSTRAINT distributor_payments_amount_max CHECK (coalesce(amount, 0) <= 100000000) NOT VALID;
ALTER TABLE public.expenses ADD CONSTRAINT expenses_amount_max CHECK (coalesce(amount, 0) <= 100000000) NOT VALID;
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_amount_max CHECK (coalesce(amount, 0) <= 100000000) NOT VALID;
ALTER TABLE public.purchase_orders ADD CONSTRAINT purchase_orders_total_max CHECK (coalesce(total, 0) <= 100000000) NOT VALID;
ALTER TABLE public.purchase_returns ADD CONSTRAINT purchase_returns_value_max CHECK (coalesce(value, 0) <= 100000000) NOT VALID;
ALTER TABLE public.products ADD CONSTRAINT products_prices_max CHECK (
  coalesce(mrp, 0) <= 100000000 AND coalesce("distributorPrice", 0) <= 100000000
  AND coalesce("dealerPrice", 0) <= 100000000 AND coalesce("retailerPrice", 0) <= 100000000
) NOT VALID;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('095_input_rules_one_mobile.sql',
        'Gap 9 follow-up: one mobile rule (no landlines), phone/email triggers (changed-only) replace 094 CHECKs, order value > 0, limits (qty 1,00,000, amount Rs 10 crore, adjustment +/-1,00,000)');

COMMIT;
