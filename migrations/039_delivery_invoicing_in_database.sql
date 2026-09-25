-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — delivery, stock, invoice and balance in one database step.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 038 (app_access, my_user_id).
--
--  WHAT WAS WRONG
--
--  Marking an order Delivered set off three writes from the browser, each
--  under the permissions of whoever clicked: take the stock out, raise the
--  invoice, add it to the partner's balance. Only Dispatch Team marks orders
--  Delivered, and Dispatch has no Accounting access and view-only Inventory.
--  So a delivery by Dispatch — the normal case — saved, while its stock
--  deduction and its invoice were both refused. The order read Delivered with
--  no invoice, the stock never left the books, and nothing was owed.
--
--  Separately: nothing in the database stopped a second invoice for the same
--  order; a manual invoice on a multi-item order was taxed at a flat 18%;
--  and order ids were "highest known + 1", so a deleted or refused order's
--  number was handed out again (O1 was issued three times).
--
--  WHAT THIS DOES
--
--  On delivery (orders_on_delivery trigger), in the same transaction as the
--  status change, so all of it happens or none of it does:
--
--    1. Stock leaves inventory, earliest expiry first (batches with no expiry
--       last). If any product is short the delivery is refused with a plain
--       message naming it: "Not enough stock for Tulsi Cough Syrup 100ml:
--       this order needs 100, 0 in stock."
--    2. An invoice is raised as a PROFORMA — invoiceType 'auto_draft', tax 0,
--       total = subtotal — with every line carrying its product's catalogue
--       GST rate and HSN code as they stood at delivery. A missing rate or
--       HSN does not block this; it only blocks conversion later.
--    3. The partner (distributor, dealer or retailer, copied from the order)
--       is charged the subtotal.
--
--  If the order already has an invoice (billed in advance by hand), step 2 and
--  3 are skipped without error. Partial deliveries take their stock as each
--  instalment is recorded and bill once the last one lands, as before.
--
--  convert_to_tax_invoice(id) — Accounts turns a proforma into a GST tax
--  invoice: GST line by line at each line's stored rate, rounded once to the
--  rupee; the same invoice is updated, never a second one made; the partner is
--  charged the GST in the same transaction.
--
--  create_invoice(...) — the manual Generate Invoice, done here so the invoice
--  and the balance charge save together, GST is line by line, a product with
--  no rate blocks a GST invoice instead of being guessed, and an order that is
--  already invoiced is refused with the invoice named.
--
--  invoices_one_per_order — at most one invoice per order, in the database.
--
--  Order ids come from a sequence (next_order_id), assigned on insert whatever
--  the browser sent. A sequence never hands a number back, so a deleted or
--  refused order's id is never reused.
-- ════════════════════════════════════════════════════════════════════════

-- ── Invoices: type, lines, billed party ─────────────────────────────────
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "invoiceType" text NOT NULL DEFAULT 'tax_invoice';
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS lines jsonb NOT NULL DEFAULT '[]'::jsonb;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "contactName" text;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "convertedAt" timestamptz;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "convertedBy" text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'invoices_invoice_type_check') THEN
    ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check
      CHECK ("invoiceType" IN ('auto_draft', 'tax_invoice'));
  END IF;
END $$;

-- Every invoice raised before this — O1's and O5's — carried GST already and
-- is a tax invoice; the column default says so.

-- One invoice per order.
CREATE UNIQUE INDEX IF NOT EXISTS invoices_one_per_order
  ON public.invoices ("orderId") WHERE "orderId" IS NOT NULL;

-- ── Order ids from a sequence ───────────────────────────────────────────
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

DO $$
DECLARE
  highest bigint;
BEGIN
  SELECT coalesce(max(substring(id FROM 2)::bigint), 0) INTO highest
  FROM public.orders WHERE id ~ '^O[0-9]+$';
  -- Only ever moves forward: a rerun after orders were deleted leaves it be.
  IF highest >= (SELECT last_value FROM public.order_number_seq) THEN
    PERFORM setval('public.order_number_seq', greatest(highest, 1), highest > 0);
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.next_order_id()
RETURNS text
LANGUAGE sql
VOLATILE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT 'O' || nextval('public.order_number_seq') $$;

-- Assigned by the trigger below, never by a column default as well: with
-- both, every insert drew two numbers and skipped one. NOT NULL is checked
-- after BEFORE triggers run, so an insert without an id is fine.
ALTER TABLE public.orders ALTER COLUMN id DROP DEFAULT;

-- Assigned here even when the browser sends an id: an older build still works
-- out "highest + 1" itself, and that is the number that was being reused.
CREATE OR REPLACE FUNCTION public.orders_assign_id()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.id := public.next_order_id();
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_assign_id ON public.orders;
CREATE TRIGGER orders_assign_id
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_assign_id();

-- ── Building blocks (not callable by users) ─────────────────────────────

-- An order's lines, each with its product's catalogue GST rate and HSN code
-- as they stand now. A product not in the catalogue has null for both.
CREATE OR REPLACE FUNCTION public.order_lines(o public.orders)
RETURNS jsonb
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH raw AS (
    SELECT i.ord,
           i.value ->> 'name' AS name,
           coalesce((i.value ->> 'quantity')::numeric, 0) AS qty,
           coalesce((i.value ->> 'unitPrice')::numeric, 0) AS price,
           coalesce((i.value ->> 'total')::numeric,
                    coalesce((i.value ->> 'quantity')::numeric, 0) * coalesce((i.value ->> 'unitPrice')::numeric, 0)) AS amount
    FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(o.items) = 'array' AND jsonb_array_length(o.items) > 0 THEN o.items END
         ) WITH ORDINALITY AS i(value, ord)
    UNION ALL
    SELECT 1, o.product, coalesce(o.quantity, 0),
           CASE WHEN coalesce(o.quantity, 0) > 0 THEN round(coalesce(o.value, 0) / o.quantity, 2) ELSE 0 END,
           coalesce(o.value, 0)
    WHERE NOT coalesce(jsonb_typeof(o.items) = 'array' AND jsonb_array_length(o.items) > 0, false)
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'name', r.name, 'quantity', r.qty, 'unitPrice', r.price, 'amount', r.amount,
           'gstPct', p."gstPct", 'hsnCode', nullif(btrim(p."hsnCode"), '')
         ) ORDER BY r.ord), '[]'::jsonb)
  FROM raw r
  LEFT JOIN LATERAL (
    SELECT pr."gstPct", pr."hsnCode" FROM public.products pr WHERE pr.name = r.name LIMIT 1
  ) p ON true
$$;

-- The products on a set of lines with no GST rate or no HSN code, or NULL.
CREATE OR REPLACE FUNCTION public.lines_missing_tax_details(p_lines jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT string_agg(DISTINCT coalesce(l ->> 'name', '(unnamed product)'), ', ')
  FROM jsonb_array_elements(p_lines) l
  WHERE l ->> 'gstPct' IS NULL OR nullif(btrim(l ->> 'hsnCode'), '') IS NULL
$$;

-- Lines with their GST worked out, and the total rounded once to the rupee —
-- the same arithmetic as utils/billing.js gstForOrder.
CREATE OR REPLACE FUNCTION public.lines_with_gst(p_lines jsonb)
RETURNS jsonb
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(jsonb_agg(
           l || jsonb_build_object('gstAmount',
             round(coalesce((l ->> 'amount')::numeric, 0) * coalesce((l ->> 'gstPct')::numeric, 0) / 100, 2))
         ORDER BY ord), '[]'::jsonb)
  FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(l, ord)
$$;

CREATE OR REPLACE FUNCTION public.gst_total(p_lines jsonb)
RETURNS numeric
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT coalesce(round(sum(coalesce((l ->> 'amount')::numeric, 0) * coalesce((l ->> 'gstPct')::numeric, 0) / 100)), 0)
  FROM jsonb_array_elements(p_lines) l
$$;

-- Add to whichever partner the order belongs to: distributor, else dealer,
-- else retailer (utils/billing.js partyForOrder). Rounded to paise.
CREATE OR REPLACE FUNCTION public.charge_party(p_distributor text, p_dealer text, p_retailer text, p_amount numeric)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(p_amount, 0) = 0 THEN RETURN; END IF;
  IF p_distributor IS NOT NULL THEN
    UPDATE public.distributors SET "outstandingAmount" = round(coalesce("outstandingAmount", 0) + p_amount, 2) WHERE id = p_distributor;
  ELSIF p_dealer IS NOT NULL THEN
    UPDATE public.dealers SET "outstandingAmount" = round(coalesce("outstandingAmount", 0) + p_amount, 2) WHERE id = p_dealer;
  ELSIF p_retailer IS NOT NULL THEN
    UPDATE public.retailers SET "outstandingAmount" = round(coalesce("outstandingAmount", 0) + p_amount, 2) WHERE id = p_retailer;
  END IF;
END $$;

-- Take units of each product out of stock, earliest expiry first. Every
-- shortage is found before anything moves, so the message names all of them.
CREATE OR REPLACE FUNCTION public.deduct_stock(p_order_id text, p_needs jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  need record;
  batch record;
  remaining numeric;
  taken numeric;
  short text;
BEGIN
  -- Lock the batches involved so two deliveries cannot both spend the same units.
  PERFORM 1 FROM public.inventory
  WHERE product IN (SELECT n ->> 'name' FROM jsonb_array_elements(p_needs) n)
  FOR UPDATE;

  SELECT string_agg(format('%s: this order needs %s, %s in stock', w.name, w.qty, w.have), '; ')
  INTO short
  FROM (
    SELECT n.name, n.qty,
           coalesce((SELECT sum(quantity) FROM public.inventory i WHERE i.product = n.name AND i.quantity > 0), 0) AS have
    FROM (
      SELECT n ->> 'name' AS name, sum((n ->> 'quantity')::numeric) AS qty
      FROM jsonb_array_elements(p_needs) n
      WHERE nullif(n ->> 'name', '') IS NOT NULL AND (n ->> 'quantity')::numeric > 0
      GROUP BY 1
    ) n
  ) w
  WHERE w.have < w.qty;

  IF short IS NOT NULL THEN
    RAISE EXCEPTION 'Not enough stock to deliver order %. %.', p_order_id, short USING ERRCODE = 'P0001';
  END IF;

  FOR need IN
    SELECT n ->> 'name' AS name, sum((n ->> 'quantity')::numeric) AS qty
    FROM jsonb_array_elements(p_needs) n
    WHERE nullif(n ->> 'name', '') IS NOT NULL AND (n ->> 'quantity')::numeric > 0
    GROUP BY 1
  LOOP
    remaining := need.qty;
    FOR batch IN
      SELECT id, quantity FROM public.inventory
      WHERE product = need.name AND quantity > 0
      ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC, id
    LOOP
      EXIT WHEN remaining <= 0;
      taken := least(remaining, batch.quantity);
      UPDATE public.inventory SET quantity = quantity - taken WHERE id = batch.id;
      remaining := remaining - taken;
    END LOOP;
  END LOOP;
END $$;

-- Raise an order's invoice and charge its partner. Returns the new id, or NULL
-- when the order already has one (nothing is charged then).
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

  -- A lead that has a company is billed to the company; the person is the contact.
  IF o."leadId" IS NOT NULL AND v_company IS NOT NULL THEN
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

REVOKE ALL ON FUNCTION public.order_lines(public.orders) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.charge_party(text, text, text, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.deduct_stock(text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.insert_invoice_for_order(public.orders, text, boolean, timestamptz, text) FROM PUBLIC, anon, authenticated;

-- ── The delivery trigger ────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.orders_on_delivery()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  itemised boolean := coalesce(jsonb_typeof(NEW.items) = 'array' AND jsonb_array_length(NEW.items) > 0, false);
  before_qty numeric := coalesce(OLD."deliveredQty", 0);
  after_qty numeric := coalesce(NEW."deliveredQty", 0);
  needs jsonb;
BEGIN
  -- Fulfilment happens once. The stamp cannot be cleared by a later edit,
  -- or the next "Delivered" would take the stock a second time.
  IF OLD."fulfilledAt" IS NOT NULL THEN
    NEW."fulfilledAt" := OLD."fulfilledAt";
    RETURN NEW;
  END IF;

  IF NEW.status = 'Delivered' AND OLD.status IS DISTINCT FROM 'Delivered' THEN
    -- Named for the audit trail (040), so the stock, invoice and balance
    -- changes below read as part of this delivery, not as separate edits.
    PERFORM set_config('app.via', format('delivery of order %s', NEW.id), true);
    -- What is still to leave the warehouse: an itemised order all at once; a
    -- single-product order whatever earlier instalments did not take.
    IF itemised THEN
      SELECT jsonb_agg(jsonb_build_object('name', i ->> 'name', 'quantity', coalesce((i ->> 'quantity')::numeric, 0)))
      INTO needs FROM jsonb_array_elements(NEW.items) i;
    ELSE
      needs := jsonb_build_array(jsonb_build_object(
        'name', NEW.product, 'quantity', greatest(coalesce(NEW.quantity, 0) - before_qty, 0)));
    END IF;
    PERFORM public.deduct_stock(NEW.id, needs);

    PERFORM public.insert_invoice_for_order(NEW, 'auto_draft', false, now() + interval '30 days', NEW."assignedTo");
    NEW."fulfilledAt" := now();

  ELSIF NOT itemised AND after_qty > before_qty THEN
    -- A partial delivery instalment: its units leave now; billing waits for
    -- the last one.
    PERFORM set_config('app.via', format('partial delivery of order %s', NEW.id), true);
    PERFORM public.deduct_stock(NEW.id, jsonb_build_array(jsonb_build_object(
      'name', NEW.product, 'quantity', after_qty - before_qty)));
  END IF;

  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS orders_on_delivery ON public.orders;
CREATE TRIGGER orders_on_delivery
  BEFORE UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_on_delivery();

-- ── For Accounts ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.can_raise_invoices()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$ SELECT public.app_access('accounting') = 'full' AND NOT coalesce(public.is_partner(), false) $$;

-- Turn a proforma into a GST tax invoice, in place.
CREATE OR REPLACE FUNCTION public.convert_to_tax_invoice(p_invoice_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv public.invoices;
  v_lines jsonb;
  v_missing text;
  v_tax numeric;
BEGIN
  IF NOT public.can_raise_invoices() THEN
    RAISE EXCEPTION 'Your role cannot convert invoices. It needs full Accounting access.' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % no longer exists.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;
  IF inv."invoiceType" <> 'auto_draft' THEN
    RAISE EXCEPTION 'Invoice % is already a GST tax invoice.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;

  -- The rate and HSN stored at delivery are used. Where one was missing then,
  -- the catalogue's current value fills the gap, so fixing the catalogue is
  -- enough to let the conversion through.
  SELECT coalesce(jsonb_agg(
           l
           || jsonb_build_object('gstPct', coalesce(l -> 'gstPct', to_jsonb(p."gstPct")))
           || jsonb_build_object('hsnCode', coalesce(nullif(btrim(l ->> 'hsnCode'), ''), nullif(btrim(p."hsnCode"), '')))
           ORDER BY ord), '[]'::jsonb)
  INTO v_lines
  FROM jsonb_array_elements(inv.lines) WITH ORDINALITY AS t(l, ord)
  LEFT JOIN LATERAL (
    SELECT pr."gstPct", pr."hsnCode" FROM public.products pr WHERE pr.name = l ->> 'name' LIMIT 1
  ) p ON true;

  IF jsonb_array_length(v_lines) = 0 THEN
    RAISE EXCEPTION 'Invoice % has no product lines to tax.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;

  v_missing := public.lines_missing_tax_details(v_lines);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot convert: no GST rate or HSN code for %. Set them under Product Catalogue, then convert.', v_missing
      USING ERRCODE = 'P0001';
  END IF;

  v_lines := public.lines_with_gst(v_lines);
  v_tax := public.gst_total(v_lines);
  PERFORM set_config('app.via', format('conversion of %s to a GST invoice', p_invoice_id), true);

  UPDATE public.invoices
  SET tax = v_tax, lines = v_lines, "invoiceType" = 'tax_invoice',
      "convertedAt" = now(), "convertedBy" = public.my_user_id()
  WHERE id = p_invoice_id;

  PERFORM public.charge_party(inv."distributorId", inv."dealerId", inv."retailerId", v_tax);
  RETURN jsonb_build_object('id', p_invoice_id, 'tax', v_tax);
END $$;

-- The manual Generate Invoice. With p_order_id it bills that order (refused
-- if it already has an invoice); without, a custom invoice at p_gst_pct.
CREATE OR REPLACE FUNCTION public.create_invoice(
  p_order_id text, p_customer_name text, p_amount numeric,
  p_with_tax boolean, p_gst_pct numeric, p_due timestamptz)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  v_existing text;
  v_id text;
  v_tax numeric := 0;
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

  -- Custom invoice: a walk-in with no order and no partner, so no balance moves.
  IF nullif(btrim(p_customer_name), '') IS NULL OR coalesce(p_amount, 0) <= 0 THEN
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

  INSERT INTO public.invoices (id, "customerName", amount, tax, status, "dueDate", "assignedTo", "createdBy", "createdAt", "invoiceType", lines)
  VALUES (v_id, btrim(p_customer_name), p_amount, v_tax, 'Unpaid', coalesce(p_due, now() + interval '14 days'),
          public.my_user_id(), public.my_user_id(), now(), 'tax_invoice',
          jsonb_build_array(jsonb_build_object('name', 'Custom invoice', 'quantity', 1, 'unitPrice', p_amount,
            'amount', p_amount, 'gstPct', CASE WHEN coalesce(p_with_tax, true) THEN p_gst_pct END,
            'gstAmount', v_tax)));
  RETURN v_id;
END $$;

REVOKE ALL ON FUNCTION public.convert_to_tax_invoice(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.create_invoice(text, text, numeric, boolean, numeric, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.convert_to_tax_invoice(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_invoice(text, text, numeric, boolean, numeric, timestamptz) TO authenticated;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('039_delivery_invoicing_in_database.sql',
        'delivery takes stock, raises a proforma (no GST) and charges the partner in one transaction; convert_to_tax_invoice; create_invoice; one invoice per order; order ids from a sequence')
ON CONFLICT (filename) DO NOTHING;
