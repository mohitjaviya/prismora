-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 6: incentives earned in the database (Phase 2 F02),
--  backorder invoices billed to the company, and the two 066 gaps.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 039 and 066.
--
--  WHAT WAS WRONG
--
--  1. F02. Scheme incentives were written by the browser after an order was
--     saved (DataContext.generateIncentivesForOrder). A partner may not write
--     distributor_incentives (018), so an order a partner placed for itself
--     earned nothing: O145 has no incentive, O146 — the same scheme, placed by
--     staff — has one.
--  2. A backorder has no leadId (it must not claim its parent's lead, 066), so
--     insert_invoice_for_order billed it to the person, not the company the
--     parent order was billed to.
--  3. order_one_per_lead ran on INSERT only: an UPDATE that pointed an order
--     at a lead already converted went through.
--  4. A parent order could be cancelled while its backorder was still being
--     fulfilled, leaving a live order split from a void one.
--
--  WHAT THIS DOES
--
--  1. orders_earn_incentives (AFTER INSERT on orders) raises the incentives in
--     the same transaction as the order, whoever placed it. The rules are
--     utils/schemeUtils.js isSchemeEligible / getSchemeMatchValue, unchanged:
--     the scheme is Active and in date, is for this partner type or All, the
--     targeted lines (or the whole order) reach the minimum. A split backorder
--     earns nothing — its units were counted on the parent, as before.
--     At most one incentive per order and scheme (unique index).
--  2. insert_invoice_for_order: a backorder takes the lead and company of the
--     order it was split from (followed up the chain of splits), so it is
--     billed like its parent.
--  3. order_one_per_lead also runs when an order's leadId changes.
--  4. order_backorder_open_guard: an order cannot be cancelled or deleted
--     while a backorder split from it is not yet Delivered or Cancelled.
--
--  Existing rows are not changed: O145 stays as the F02 evidence.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Incentives ───────────────────────────────────────────────────────

-- A number from a JSON value, or NULL for anything that is not one. An order
-- line with a stray "" must not refuse the order.
CREATE OR REPLACE FUNCTION public.json_num(v text)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE WHEN v ~ '^\s*-?[0-9]+(\.[0-9]+)?\s*$' THEN v::numeric END
$$;

-- The money that counts toward a scheme: the whole order when the scheme
-- targets no product, else the targeted lines only (getSchemeMatchValue).
CREATE OR REPLACE FUNCTION public.scheme_match_value(s public.schemes, o public.orders)
RETURNS numeric
LANGUAGE sql
STABLE
AS $$
  SELECT CASE
    WHEN NOT coalesce(jsonb_typeof(s."applicableProducts") = 'array', false) THEN coalesce(o.value, 0)
    WHEN jsonb_array_length(s."applicableProducts") = 0 THEN coalesce(o.value, 0)
    ELSE coalesce((
      SELECT sum(coalesce(nullif(public.json_num(li ->> 'total'), 0),
                          public.json_num(li ->> 'quantity') * public.json_num(li ->> 'unitPrice'),
                          0))
      FROM jsonb_array_elements(
             CASE WHEN coalesce(jsonb_typeof(o.items) = 'array' AND jsonb_array_length(o.items) > 0, false)
                  THEN o.items
                  ELSE jsonb_build_array(jsonb_build_object('name', o.product, 'total', o.value)) END) li
      WHERE s."applicableProducts" ? (li ->> 'name')
    ), 0)
  END
$$;

CREATE UNIQUE INDEX IF NOT EXISTS distributor_incentives_one_per_order_scheme
  ON public.distributor_incentives ("orderId", "schemeId")
  WHERE "orderId" IS NOT NULL AND "schemeId" IS NOT NULL;

-- Raise every incentive an order earns. Returns how many were raised.
CREATE OR REPLACE FUNCTION public.earn_incentives_for_order(o public.orders)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_party text;
  s public.schemes;
  v_targeted boolean;
  v_match numeric;
  v_type text;
  v_value numeric;
  v_ms bigint := floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  v_n integer := 0;
BEGIN
  v_party := CASE WHEN o."distributorId" IS NOT NULL THEN 'Distributor'
                  WHEN o."dealerId" IS NOT NULL THEN 'Dealer'
                  WHEN o."retailerId" IS NOT NULL THEN 'Retailer' END;
  IF v_party IS NULL OR o."splitFromOrderId" IS NOT NULL OR o.status = 'Cancelled' THEN
    RETURN 0;
  END IF;

  FOR s IN
    SELECT * FROM public.schemes
    WHERE "applicableTo" IN (v_party, 'All')
      AND status = 'Active'
      AND ("validFrom" IS NULL OR "validFrom" <= now())
      AND ("validTo" IS NULL OR "validTo" >= now())
    ORDER BY id
  LOOP
    v_targeted := coalesce(jsonb_typeof(s."applicableProducts") = 'array', false)
                  AND jsonb_array_length(CASE WHEN jsonb_typeof(s."applicableProducts") = 'array'
                                              THEN s."applicableProducts" ELSE '[]'::jsonb END) > 0;
    v_match := public.scheme_match_value(s, o);
    CONTINUE WHEN v_targeted AND v_match <= 0;
    CONTINUE WHEN v_match < coalesce(s."minOrderValue", 0);

    v_type := CASE WHEN coalesce(s."discountPct", 0) > 0 THEN 'Discount'
                   WHEN coalesce(s."freeGoodsQty", 0) > 0 THEN 'Free Goods'
                   ELSE 'Cash' END;
    v_value := CASE WHEN v_type = 'Discount' THEN round(v_match * s."discountPct" / 100)
                    ELSE coalesce(s."freeGoodsQty", 0) END;

    INSERT INTO public.distributor_incentives (
      id, "distributorId", "dealerId", "retailerId", "schemeId", "schemeName", "orderId",
      "orderValue", "incentiveType", "incentiveValue", "incentiveProduct", status, "createdAt")
    VALUES (
      'INC-' || v_ms || '-' || s.id, o."distributorId", o."dealerId", o."retailerId", s.id, s.name, o.id,
      coalesce(o.value, 0), v_type, v_value,
      -- Copied, not looked up later: next quarter's edit to the scheme must
      -- not rewrite what was given away this quarter.
      CASE WHEN v_type = 'Free Goods' THEN s."freeGoodsProduct" END,
      'Earned', now())
    ON CONFLICT ("orderId", "schemeId") WHERE "orderId" IS NOT NULL AND "schemeId" IS NOT NULL DO NOTHING;
    IF FOUND THEN v_n := v_n + 1; END IF;
  END LOOP;
  RETURN v_n;
END $$;

REVOKE ALL ON FUNCTION public.earn_incentives_for_order(public.orders) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.orders_earn_incentives()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_via text := current_setting('app.via', true);
BEGIN
  -- Named for the audit trail (040), then put back, so a later statement in
  -- the same transaction is not labelled as this.
  PERFORM set_config('app.via', format('incentives earned on order %s', NEW.id), true);
  PERFORM public.earn_incentives_for_order(NEW);
  PERFORM set_config('app.via', coalesce(v_via, ''), true);
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS orders_earn_incentives ON public.orders;
CREATE TRIGGER orders_earn_incentives
  AFTER INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_earn_incentives();

-- ── 2. Backorder invoices: billed like the parent ───────────────────────
CREATE OR REPLACE FUNCTION public.insert_invoice_for_order(
  o public.orders, p_type text, p_with_tax boolean, p_due timestamptz, p_assigned_to text)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_lines jsonb := public.order_lines(o);
  v_amount numeric := coalesce(o.value, 0);
  v_tax numeric := 0;
  v_id text;
  v_missing text;
  v_lead text := o."leadId";
  v_company text := nullif(btrim(o."companyName"), '');
  v_billed text;
  v_contact text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.invoices WHERE "orderId" = o.id) THEN
    RETURN NULL;
  END IF;

  IF p_type = 'tax_invoice' AND p_with_tax THEN
    SELECT string_agg(DISTINCT coalesce(l ->> 'name', '(unnamed product)'), ', ') INTO v_missing
    FROM jsonb_array_elements(v_lines) l WHERE l ->> 'gstPct' IS NULL;
    IF v_missing IS NOT NULL THEN
      RAISE EXCEPTION 'No GST rate in the catalogue for %. Set it under Product Catalogue, then raise the invoice.', v_missing
        USING ERRCODE = 'P0001';
    END IF;
    v_lines := public.lines_with_gst(v_lines);
    v_tax := public.gst_total(v_lines);
  END IF;

  -- A backorder has no lead of its own (066); it is billed as the order it
  -- was split from was, following the chain up to the first order.
  IF v_lead IS NULL AND o."splitFromOrderId" IS NOT NULL THEN
    WITH RECURSIVE up AS (
      SELECT p.id, p."leadId", p."companyName", p."splitFromOrderId", 1 AS depth
      FROM public.orders p WHERE p.id = o."splitFromOrderId"
      UNION ALL
      SELECT p.id, p."leadId", p."companyName", p."splitFromOrderId", up.depth + 1
      FROM public.orders p JOIN up ON p.id = up."splitFromOrderId"
      WHERE up.depth < 50
    )
    SELECT "leadId", coalesce(v_company, nullif(btrim("companyName"), ''))
    INTO v_lead, v_company
    FROM up WHERE "leadId" IS NOT NULL OR "splitFromOrderId" IS NULL
    ORDER BY depth LIMIT 1;
    IF NOT FOUND THEN
      v_company := nullif(btrim(o."companyName"), '');
    END IF;
  END IF;

  -- A lead that has a company is billed to the company; the person is the contact.
  IF v_lead IS NOT NULL AND v_company IS NOT NULL THEN
    v_billed := v_company;
    v_contact := o."customerName";
  ELSE
    v_billed := o."customerName";
  END IF;

  v_id := 'INV-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM public.invoices WHERE id = v_id) LOOP
    v_id := v_id || 'x';
  END LOOP;

  INSERT INTO public.invoices (
    id, "orderId", "customerName", "contactName", "distributorId", "dealerId", "retailerId",
    amount, tax, status, "dueDate", "assignedTo", "createdBy", "createdAt", "invoiceType", lines)
  VALUES (
    v_id, o.id, v_billed, v_contact, o."distributorId", o."dealerId", o."retailerId",
    v_amount, v_tax, 'Unpaid', p_due, p_assigned_to, public.my_user_id(), now(), p_type, v_lines)
  ON CONFLICT ("orderId") WHERE "orderId" IS NOT NULL DO NOTHING;

  IF NOT FOUND THEN
    RETURN NULL;   -- raised by someone else a moment ago
  END IF;

  PERFORM public.charge_party(o."distributorId", o."dealerId", o."retailerId", v_amount + v_tax);
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.insert_invoice_for_order(public.orders, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- ── 3. One order per lead, also when the lead changes ───────────────────
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
  -- An edit that leaves the lead alone is not a conversion (L11's old
  -- duplicates can still move through their stages).
  IF TG_OP = 'UPDATE' AND NEW."leadId" IS NOT DISTINCT FROM OLD."leadId"
     AND OLD.status IS DISTINCT FROM 'Cancelled' THEN
    RETURN NEW;
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('order_one_per_lead:' || NEW."leadId"));
  SELECT id INTO v_existing FROM public.orders
   WHERE "leadId" = NEW."leadId" AND status IS DISTINCT FROM 'Cancelled'
     AND (TG_OP = 'INSERT' OR id <> OLD.id)
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
  BEFORE INSERT OR UPDATE OF "leadId", status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_one_per_lead();

-- ── 4. No cancelling a parent while its backorder is open ───────────────
CREATE OR REPLACE FUNCTION public.order_backorder_open_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_child public.orders;
BEGIN
  IF TG_OP = 'UPDATE' AND NOT (NEW.status = 'Cancelled' AND OLD.status IS DISTINCT FROM 'Cancelled') THEN
    RETURN NEW;
  END IF;
  SELECT * INTO v_child FROM public.orders
   WHERE "splitFromOrderId" = OLD.id
     AND coalesce(status, 'Pending') NOT IN ('Delivered', 'Cancelled')
   ORDER BY "createdAt" LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'Order % has an open backorder % (%). Deliver or cancel the backorder first.',
      OLD.id, v_child.id, coalesce(v_child.status, 'Pending')
      USING ERRCODE = '23514';
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_backorder_open_guard ON public.orders;
CREATE TRIGGER order_backorder_open_guard
  BEFORE UPDATE OF status OR DELETE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_backorder_open_guard();

-- ── Record ───────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (filename, note)
VALUES ('070_incentives_and_backorders_in_database.sql',
        'F02: incentives raised by an orders trigger (partner orders earn them); backorder invoices billed to the parent''s company; one-order-per-lead re-checked when leadId changes; no cancelling/deleting a parent with an open backorder')
ON CONFLICT (filename) DO NOTHING;
