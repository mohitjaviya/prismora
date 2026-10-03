-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix batch 9 (Phase 3 findings): money and stock integrity.
--
--  WHAT WAS WRONG
--
--  1. Purchase returns were checked by nothing. The browser wrote the row
--     and then took stock out itself (stopping at 0), so a 100,000-unit
--     return credited the vendor ₹50,00,000 while only 4 units left the
--     shelf, and "Withdraw" then put the full 100,000 back (G5).
--  2. A credit note had no limit: ₹5,000 against a ₹1,180 invoice marked it
--     Settled and put the partner ₹3,920 in credit (G6).
--  3. An issued GST tax invoice could be edited (amount, tax) or deleted,
--     payment and all, by any Accounting-full role, Admin included (G6).
--  4. Negative expenses, payments, credit notes and prices were accepted.
--
--  WHAT THIS DOES
--
--  1. record_purchase_return / withdraw_purchase_return do the whole job in
--     the database. A return line must be a whole quantity above zero, no
--     more than this vendor's GRNs delivered less what has already gone back
--     to them, and no more than is on the shelf; its unit cost may not be
--     above the highest this vendor charged for the product (GRN or PO).
--     The stock comes out here, this vendor's batches first, and every unit
--     is written to stock_movements. Withdrawing puts back exactly what
--     those movements took — nothing more. A return recorded before this
--     (no movements) cannot be withdrawn. Direct writes to purchase_returns
--     by a signed-in user are refused: the two functions are the only way.
--  2. credit_note_within_due: a credit note on an invoice is capped at what
--     is still due on it (a sales return's note, which follows goods coming
--     back, at what was billed and not yet credited — its quantities are
--     checked by record_sales_return). It must go to the invoice's partner.
--     Without an invoice it is capped at what the partner owes, and with
--     neither an invoice nor a partner it is refused. Amount, invoice and
--     partner are fixed once issued: withdraw and issue a new one.
--  3. invoice_issued_is_locked: a GST tax invoice cannot be deleted, and
--     only its payment state (by the database's own recalculation), the
--     walk-in "marked paid" flag and the person it is assigned to can
--     change. A proforma becomes a tax invoice only through Convert, and
--     cannot be deleted once a payment or credit note is against it.
--     Corrections are made by credit note.
--  4. CHECK constraints: amounts above zero on expenses, partner payments,
--     vendor payments and credit notes; zero or more on invoice amount/tax,
--     purchase return value, product prices and GST %.
--
--  "Signed-in app user" = a request carrying an e-mail claim
--  (current_app_email()), as in 073. Maintenance and the service key, which
--  carry none, are not stopped by the guards; the CHECKs bind everyone.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 4. Value rules ──────────────────────────────────────────────────────
ALTER TABLE public.expenses             ADD CONSTRAINT expenses_amount_positive             CHECK (amount > 0);
ALTER TABLE public.distributor_payments ADD CONSTRAINT distributor_payments_amount_positive CHECK (amount > 0);
ALTER TABLE public.vendor_payments      ADD CONSTRAINT vendor_payments_amount_positive      CHECK (amount > 0);
ALTER TABLE public.credit_notes         ADD CONSTRAINT credit_notes_amount_positive         CHECK (amount > 0);
ALTER TABLE public.invoices             ADD CONSTRAINT invoices_amounts_not_negative        CHECK (coalesce(amount, 0) >= 0 AND coalesce(tax, 0) >= 0);
ALTER TABLE public.purchase_returns     ADD CONSTRAINT purchase_returns_value_not_negative  CHECK (coalesce(value, 0) >= 0);
ALTER TABLE public.products             ADD CONSTRAINT products_prices_not_negative         CHECK (
  coalesce(mrp, 0) >= 0 AND coalesce("distributorPrice", 0) >= 0 AND coalesce("dealerPrice", 0) >= 0
  AND coalesce("retailerPrice", 0) >= 0 AND coalesce("gstPct", 0) >= 0);

-- Purchase returns now leave a stock trail too.
ALTER TABLE public.stock_movements DROP CONSTRAINT stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check
  CHECK (kind = ANY (ARRAY['delivery', 'return', 'purchase_return', 'purchase_return_withdrawn']));

-- ── 1. Purchase returns ─────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.purchase_returns_through_functions()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF public.current_app_email() IS NULL OR current_setting('app.purchase_return', true) = 'on' THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  RAISE EXCEPTION 'Purchase returns are recorded and withdrawn only from Purchases → Returns, which checks the stock held and what the vendor supplied.'
    USING ERRCODE = '42501';
END $fn$;

DROP TRIGGER IF EXISTS purchase_returns_through_functions ON public.purchase_returns;
CREATE TRIGGER purchase_returns_through_functions
  BEFORE INSERT OR UPDATE OR DELETE ON public.purchase_returns
  FOR EACH ROW EXECUTE FUNCTION public.purchase_returns_through_functions();

CREATE OR REPLACE FUNCTION public.record_purchase_return(
  p_vendor_id text, p_reason text, p_items jsonb, p_notes text DEFAULT NULL, p_date timestamptz DEFAULT NULL)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_vendor public.vendors;
  line jsonb;
  b record;
  v_product text; v_qty numeric; v_cost numeric; v_max_cost numeric;
  v_received numeric; v_returned numeric; v_this numeric; v_held numeric;
  v_need numeric; v_take numeric;
  v_batches text[];
  v_id text;
  v_value numeric := 0;
  v_lines jsonb := '[]'::jsonb;
BEGIN
  IF NOT public.can_edit('purchases') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Recording a purchase return needs full Purchases access.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO v_vendor FROM public.vendors WHERE id = p_vendor_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Choose the vendor the goods go back to.' USING ERRCODE = 'P0001';
  END IF;
  IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A return needs at least one line.' USING ERRCODE = 'P0001';
  END IF;

  v_id := 'PR-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM public.purchase_returns WHERE id = v_id) LOOP v_id := v_id || 'x'; END LOOP;
  PERFORM set_config('app.via', format('purchase return %s to %s', v_id, v_vendor.name), true);

  FOR line IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    v_product := nullif(btrim(line ->> 'product'), '');
    v_qty := public.json_num(line ->> 'quantity');
    v_cost := public.json_num(line ->> 'unitCost');
    IF v_product IS NULL THEN
      RAISE EXCEPTION 'Choose the product being returned.' USING ERRCODE = 'P0001';
    END IF;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'Quantity to return for "%" must be a whole number above zero.', v_product USING ERRCODE = 'P0001';
    END IF;
    IF v_cost IS NULL OR v_cost < 0 THEN
      RAISE EXCEPTION 'Enter the unit cost of "%" (zero or more).', v_product USING ERRCODE = 'P0001';
    END IF;

    -- What this vendor delivered (GRNs) and charged (GRN and PO lines).
    SELECT coalesce(sum(coalesce(public.json_num(l ->> 'receivedQty'), public.json_num(l ->> 'quantity'), 0)), 0),
           max(public.json_num(l ->> 'unitCost')),
           array_agg(DISTINCT lower(btrim(l ->> 'batchNumber'))) FILTER (WHERE nullif(btrim(l ->> 'batchNumber'), '') IS NOT NULL)
      INTO v_received, v_max_cost, v_batches
      FROM public.grn g, jsonb_array_elements(coalesce(g.items, '[]'::jsonb)) l
     WHERE public.grn_vendor(g."poId", g."vendorName") = p_vendor_id
       AND lower(btrim(l ->> 'product')) = lower(v_product);
    SELECT greatest(v_max_cost, max(public.json_num(l ->> 'unitCost'))) INTO v_max_cost
      FROM public.purchase_orders po, jsonb_array_elements(coalesce(po.items, '[]'::jsonb)) l
     WHERE po."vendorId" = p_vendor_id AND lower(btrim(l ->> 'product')) = lower(v_product);

    SELECT coalesce(sum(public.json_num(l ->> 'quantity')), 0) INTO v_returned
      FROM public.purchase_returns r, jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) l
     WHERE r."vendorId" = p_vendor_id AND lower(btrim(l ->> 'product')) = lower(v_product);
    SELECT coalesce(sum((l ->> 'quantity')::numeric), 0) INTO v_this
      FROM jsonb_array_elements(v_lines) l WHERE lower(l ->> 'product') = lower(v_product);

    IF v_received <= 0 THEN
      RAISE EXCEPTION '% has never delivered "%" (no goods receipt), so it cannot be returned to them.', v_vendor.name, v_product
        USING ERRCODE = 'P0001';
    END IF;
    IF v_returned + v_this + v_qty > v_received THEN
      RAISE EXCEPTION 'Returning % of "%" is more than % supplied: received %, already returned %, so at most % can go back.',
        v_this + v_qty, v_product, v_vendor.name, v_received, v_returned, greatest(v_received - v_returned - v_this, 0)
        USING ERRCODE = 'P0001';
    END IF;
    IF v_cost > coalesce(v_max_cost, 0) THEN
      RAISE EXCEPTION 'Unit cost ₹% for "%" is above the most % ever charged for it (₹%).', v_cost, v_product, v_vendor.name, coalesce(v_max_cost, 0)
        USING ERRCODE = 'P0001';
    END IF;

    PERFORM 1 FROM public.inventory WHERE lower(btrim(product)) = lower(v_product) FOR UPDATE;
    SELECT coalesce(sum(greatest(coalesce(quantity, 0), 0)), 0) INTO v_held
      FROM public.inventory WHERE lower(btrim(product)) = lower(v_product);
    IF v_qty > v_held THEN
      RAISE EXCEPTION 'Only % of "%" is in stock, so % cannot be returned.', v_held, v_product, v_qty USING ERRCODE = 'P0001';
    END IF;

    -- Out of the shelf: this vendor's batches first, then the oldest.
    v_need := v_qty;
    FOR b IN
      SELECT i.id, i.product, i."batchNumber", i.quantity FROM public.inventory i
       WHERE lower(btrim(i.product)) = lower(v_product) AND coalesce(i.quantity, 0) > 0
       ORDER BY (lower(btrim(coalesce(i."batchNumber", ''))) = ANY (coalesce(v_batches, '{}'))) DESC,
                i."createdAt" NULLS LAST, i.id
    LOOP
      v_take := least(b.quantity, v_need);
      UPDATE public.inventory SET quantity = quantity - v_take WHERE id = b.id;
      INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "returnId")
      VALUES ('purchase_return', b.id, b.product, b."batchNumber", v_take, v_id);
      v_lines := v_lines || jsonb_build_object('product', v_product, 'quantity', v_take, 'unitCost', v_cost,
        'batchId', b.id, 'batchNumber', b."batchNumber");
      v_need := v_need - v_take;
      EXIT WHEN v_need <= 0;
    END LOOP;
    v_value := v_value + round(v_qty * v_cost, 2);
  END LOOP;

  PERFORM set_config('app.purchase_return', 'on', true);
  INSERT INTO public.purchase_returns (id, "vendorId", "vendorName", reason, items, value, notes, date, "recordedBy", "createdAt")
  VALUES (v_id, p_vendor_id, v_vendor.name, coalesce(nullif(btrim(p_reason), ''), 'Other'), v_lines, v_value,
          nullif(btrim(p_notes), ''), coalesce(p_date, now()), public.my_user_id(), now());
  PERFORM set_config('app.purchase_return', 'off', true);

  RETURN jsonb_build_object('id', v_id, 'value', v_value, 'items', v_lines);
END $fn$;

CREATE OR REPLACE FUNCTION public.withdraw_purchase_return(p_id text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  r public.purchase_returns;
  m record;
  v_units numeric := 0;
BEGIN
  IF NOT public.can_edit('purchases') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Withdrawing a purchase return needs full Purchases access.' USING ERRCODE = '42501';
  END IF;
  SELECT * INTO r FROM public.purchase_returns WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Return % no longer exists.', p_id USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.via', format('purchase return %s withdrawn', p_id), true);

  IF NOT EXISTS (SELECT 1 FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'purchase_return')
     AND EXISTS (SELECT 1 FROM jsonb_array_elements(coalesce(r.items, '[]'::jsonb)) l WHERE coalesce(public.json_num(l ->> 'quantity'), 0) > 0) THEN
    RAISE EXCEPTION 'Return % was recorded before stock moves were tracked, so the database cannot tell what stock it took. It cannot be withdrawn; correct the stock with a Cycle Count instead.', p_id
      USING ERRCODE = 'P0001';
  END IF;

  FOR m IN SELECT * FROM public.stock_movements WHERE "returnId" = p_id AND kind = 'purchase_return' ORDER BY id LOOP
    UPDATE public.inventory SET quantity = coalesce(quantity, 0) + m.quantity WHERE id = m."inventoryId";
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Batch % of "%" that return % took stock from no longer exists, so the stock cannot be put back.', coalesce(m."batchNumber", '(none)'), m.product, p_id
        USING ERRCODE = 'P0001';
    END IF;
    INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "returnId")
    VALUES ('purchase_return_withdrawn', m."inventoryId", m.product, m."batchNumber", m.quantity, p_id);
    v_units := v_units + m.quantity;
  END LOOP;

  PERFORM set_config('app.purchase_return', 'on', true);
  DELETE FROM public.purchase_returns WHERE id = p_id;
  PERFORM set_config('app.purchase_return', 'off', true);
  RETURN jsonb_build_object('id', p_id, 'value', r.value, 'units', v_units);
END $fn$;

-- ── 2. Credit notes capped ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.credit_note_within_due()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  inv public.invoices;
  o public.orders;
  v_party text := coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId");
  v_inv_party text;
  v_total numeric; v_credited numeric; v_cap numeric; v_bal numeric;
  v_sales_return boolean;
BEGIN
  IF public.current_app_email() IS NULL THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.amount IS DISTINCT FROM OLD.amount OR NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId"
       OR NEW."distributorId" IS DISTINCT FROM OLD."distributorId" OR NEW."dealerId" IS DISTINCT FROM OLD."dealerId"
       OR NEW."retailerId" IS DISTINCT FROM OLD."retailerId" THEN
      RAISE EXCEPTION 'Credit note %: the amount, invoice and partner are fixed once issued. Withdraw it and issue a new one.', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;

  -- Raised by record_sales_return (it sets app.via; a request cannot).
  v_sales_return := NEW.id LIKE 'CN-SR-%' AND coalesce(current_setting('app.via', true), '') LIKE 'sales return %';

  IF NEW."invoiceId" IS NOT NULL THEN
    SELECT * INTO inv FROM public.invoices WHERE id = NEW."invoiceId" FOR UPDATE;
    IF NOT FOUND THEN RETURN NEW; END IF;   -- the foreign key refuses it
    SELECT * INTO o FROM public.orders WHERE id = inv."orderId";
    v_inv_party := coalesce(inv."distributorId", inv."dealerId", inv."retailerId", o."distributorId", o."dealerId", o."retailerId");
    IF v_party IS DISTINCT FROM v_inv_party THEN
      RAISE EXCEPTION 'A credit note against invoice % must go to the partner the invoice is for.', inv.id USING ERRCODE = 'P0001';
    END IF;
    v_total := coalesce(inv.amount, 0) + coalesce(inv.tax, 0);
    SELECT coalesce(sum(amount), 0) INTO v_credited FROM public.credit_notes WHERE "invoiceId" = inv.id;
    IF v_sales_return THEN
      v_cap := v_total - v_credited;
      IF NEW.amount > v_cap + 0.005 THEN
        RAISE EXCEPTION 'This return is worth ₹%, but only ₹% of invoice % has not been credited already.', NEW.amount, greatest(v_cap, 0), inv.id
          USING ERRCODE = 'P0001';
      END IF;
    ELSE
      v_cap := least(v_total - coalesce(inv."amountPaid", 0), v_total - v_credited);
      IF NEW.amount > v_cap + 0.005 THEN
        RAISE EXCEPTION 'A credit note on invoice % can be at most ₹%, what is still due on it (₹% entered). For goods coming back after payment, record a sales return.',
          inv.id, greatest(v_cap, 0), NEW.amount USING ERRCODE = 'P0001';
      END IF;
    END IF;
    RETURN NEW;
  END IF;

  IF v_sales_return THEN RETURN NEW; END IF;   -- an order never invoiced: quantities already checked
  IF v_party IS NULL THEN
    RAISE EXCEPTION 'A credit note needs an invoice or a partner. For a customer who is not a partner, issue it against their invoice.'
      USING ERRCODE = 'P0001';
  END IF;
  SELECT "outstandingAmount" INTO v_bal FROM (
    SELECT "outstandingAmount" FROM public.distributors WHERE id = NEW."distributorId"
    UNION ALL SELECT "outstandingAmount" FROM public.dealers WHERE id = NEW."dealerId"
    UNION ALL SELECT "outstandingAmount" FROM public.retailers WHERE id = NEW."retailerId") p LIMIT 1;
  IF NEW.amount > greatest(coalesce(v_bal, 0), 0) + 0.005 THEN
    RAISE EXCEPTION '% owes ₹% in all, so a credit note not tied to an invoice can be at most that (₹% entered).',
      coalesce(NEW."customerName", 'This partner'), greatest(coalesce(v_bal, 0), 0), NEW.amount USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS credit_note_within_due ON public.credit_notes;
CREATE TRIGGER credit_note_within_due
  BEFORE INSERT OR UPDATE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_within_due();

-- ── 3. Issued tax invoices locked ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_issued_is_locked()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_free text[] := ARRAY['markedPaid', 'assignedTo', 'updatedAt', 'updatedBy'];
BEGIN
  IF public.current_app_email() IS NULL THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD."invoiceType" = 'tax_invoice' THEN
      RAISE EXCEPTION 'Invoice % is an issued GST tax invoice, so it cannot be deleted. To reverse it, issue a credit note (or record a sales return for goods that came back).', OLD.id
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = 'PAY-INV-' || OLD.id)
       OR EXISTS (SELECT 1 FROM public.credit_notes WHERE "invoiceId" = OLD.id) THEN
      RAISE EXCEPTION 'Proforma % has a payment or credit note against it, so it cannot be deleted. Withdraw those first.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."invoiceType" IS DISTINCT FROM 'tax_invoice' THEN
    IF NEW."invoiceType" = 'tax_invoice' AND coalesce(current_setting('app.via', true), '') NOT LIKE 'conversion of %' THEN
      RAISE EXCEPTION 'Proforma % becomes a GST tax invoice only through Convert, which works out its GST.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- The payment state is the database's, from payments and credit notes (057).
  IF current_setting('app.recomputing', true) = 'on' THEN
    v_free := v_free || ARRAY['status', 'amountPaid'];
  END IF;
  IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
    RAISE EXCEPTION 'Invoice % is an issued GST tax invoice, so it can no longer be changed. To correct it, issue a credit note.', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS invoice_issued_is_locked ON public.invoices;
CREATE TRIGGER invoice_issued_is_locked
  BEFORE UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_issued_is_locked();

REVOKE EXECUTE ON FUNCTION public.record_purchase_return(text, text, jsonb, text, timestamptz) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.withdraw_purchase_return(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_purchase_return(text, text, jsonb, text, timestamptz) TO authenticated;
GRANT EXECUTE ON FUNCTION public.withdraw_purchase_return(text) TO authenticated;

COMMIT;
