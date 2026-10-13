-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 097: final invoices without GST (Gap 20)
--  Prepared 2026-10-13. Independent of 085–096.
--
--  WHAT WAS WRONG
--
--  A delivered order is billed with a PROFORMA (invoiceType 'auto_draft',
--  GST 0; migration 039). The owner's rule is that a proforma is not a sale:
--  it counts in no sales total, receivable or GST figure. The only way out
--  of a proforma was Convert, which adds GST. An order that is genuinely
--  billed without GST (unregistered partner, exempt or nil-rated goods)
--  stayed a proforma for ever, so it never reached net sales, receivables,
--  the Invoice Register or GSTR-1 — even once paid. Live on 2026-10-13:
--  23 proformas, ₹60,350, ₹58,800 received, 20 settled, all outside sales.
--
--  WHAT THIS DOES
--
--  * invoiceType 'non_gst': a final invoice with GST 0. It counts as a sale
--    (Accounting, Dashboard, Reports) and is reported in GSTR-1 as a
--    nil-rated / non-GST line, not in the HSN tax summary.
--  * invoices."nonGstReason": why no GST was charged, required.
--  * finalise_without_gst(invoice, reason) — the only way a proforma becomes
--    'non_gst'. Full Accounting access (can_raise_invoices, as Convert);
--    reason 3+ characters; proformas only. Lines keep their HSN code and get
--    GST 0; tax/CGST/SGST/IGST 0; convertedAt/convertedBy stamped. The
--    partner's balance does not move (it was charged the subtotal at
--    delivery, and no GST is added).
--  * invoice_issued_is_locked: a non-GST invoice is final like a GST tax
--    invoice — no delete, no change except the free fields; a proforma
--    becomes non_gst only through finalise_without_gst. Otherwise the live
--    075 definition.
--  * convert_to_tax_invoice: the live definition, with a clear refusal for a
--    non-GST invoice.
--  * non_gst_invoice_enabled() tells the screen 097 is in place.
--
--  Existing rows: none changed. The 23 proformas stay proformas (owner,
--  2026-10-13): Accounts finalises them one by one, or they go in the data
--  clean-up. Returns against a non-GST invoice refund no GST (054/056/086
--  already use the GST rate only on 'tax_invoice').
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "nonGstReason" text;

ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_invoice_type_check
  CHECK ("invoiceType" = ANY (ARRAY['auto_draft'::text, 'tax_invoice'::text, 'non_gst'::text]));

-- A non-GST invoice carries its reason and no GST.
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_non_gst_shape;
ALTER TABLE public.invoices ADD CONSTRAINT invoices_non_gst_shape
  CHECK ("invoiceType" <> 'non_gst'
         OR (coalesce(tax, 0) = 0 AND length(btrim(coalesce("nonGstReason", ''))) >= 3));


CREATE OR REPLACE FUNCTION public.finalise_without_gst(p_invoice_id text, p_reason text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  inv public.invoices;
  v_reason text := btrim(coalesce(p_reason, ''));
BEGIN
  IF NOT public.can_raise_invoices() THEN
    RAISE EXCEPTION 'Your role cannot finalise invoices. It needs full Accounting access.' USING ERRCODE = '42501';
  END IF;
  IF length(v_reason) < 3 THEN
    RAISE EXCEPTION 'Give the reason no GST is charged (at least 3 characters).' USING ERRCODE = 'P0001';
  END IF;

  SELECT * INTO inv FROM public.invoices WHERE id = p_invoice_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Invoice % no longer exists.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;
  IF inv."invoiceType" = 'tax_invoice' THEN
    RAISE EXCEPTION 'Invoice % is already a GST tax invoice.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;
  IF inv."invoiceType" = 'non_gst' THEN
    RAISE EXCEPTION 'Invoice % is already finalised without GST.', p_invoice_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.via', format('finalisation of %s without GST', p_invoice_id), true);

  UPDATE public.invoices
  SET "invoiceType" = 'non_gst', tax = 0, "nonGstReason" = v_reason,
      lines = (SELECT coalesce(jsonb_agg(l || jsonb_build_object('gstPct', 0, 'gstAmount', 0) ORDER BY ord), '[]'::jsonb)
               FROM jsonb_array_elements(inv.lines) WITH ORDINALITY AS t(l, ord)),
      "convertedAt" = now(), "convertedBy" = public.my_user_id()
  WHERE id = p_invoice_id;

  RETURN jsonb_build_object('id', p_invoice_id, 'reason', v_reason);
END $$;

REVOKE ALL ON FUNCTION public.finalise_without_gst(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.finalise_without_gst(text, text) TO authenticated;


-- Live 075 definition; 'non_gst' is final like 'tax_invoice', and a proforma
-- becomes one only through finalise_without_gst.
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
    IF OLD."invoiceType" = 'non_gst' THEN
      RAISE EXCEPTION 'Invoice % is a final invoice without GST, so it cannot be deleted. To reverse it, issue a credit note (or record a sales return for goods that came back).', OLD.id
        USING ERRCODE = '42501';
    END IF;
    IF EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = 'PAY-INV-' || OLD.id)
       OR EXISTS (SELECT 1 FROM public.credit_notes WHERE "invoiceId" = OLD.id) THEN
      RAISE EXCEPTION 'Proforma % has a payment or credit note against it, so it cannot be deleted. Withdraw those first.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN OLD;
  END IF;

  IF OLD."invoiceType" NOT IN ('tax_invoice', 'non_gst') THEN
    IF NEW."invoiceType" = 'tax_invoice' AND coalesce(current_setting('app.via', true), '') NOT LIKE 'conversion of %' THEN
      RAISE EXCEPTION 'Proforma % becomes a GST tax invoice only through Convert, which works out its GST.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    IF NEW."invoiceType" = 'non_gst' AND coalesce(current_setting('app.via', true), '') NOT LIKE 'finalisation of %' THEN
      RAISE EXCEPTION 'Proforma % becomes a final invoice without GST only through Finalise without GST, which records the reason.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  -- The payment state is the database's, from payments and credit notes (057).
  IF current_setting('app.recomputing', true) = 'on' THEN
    v_free := v_free || ARRAY['status', 'amountPaid'];
  END IF;
  IF (to_jsonb(NEW) - v_free) IS DISTINCT FROM (to_jsonb(OLD) - v_free) THEN
    IF OLD."invoiceType" = 'non_gst' THEN
      RAISE EXCEPTION 'Invoice % is a final invoice without GST, so it can no longer be changed. To correct it, issue a credit note.', OLD.id
        USING ERRCODE = '42501';
    END IF;
    RAISE EXCEPTION 'Invoice % is an issued GST tax invoice, so it can no longer be changed. To correct it, issue a credit note.', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $fn$;


-- Live definition (039), with a clear refusal for a non-GST invoice.
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
  IF inv."invoiceType" = 'non_gst' THEN
    RAISE EXCEPTION 'Invoice % is a final invoice without GST; it cannot be converted. Issue a credit note and bill again if GST applies.', p_invoice_id
      USING ERRCODE = 'P0001';
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


CREATE OR REPLACE FUNCTION public.non_gst_invoice_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.non_gst_invoice_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.non_gst_invoice_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('097_non_gst_invoice.sql',
        'Gap 20: invoiceType non_gst + nonGstReason; finalise_without_gst (full Accounting, reason required, proformas only, no balance move); non-GST invoices locked like tax invoices; Convert refuses them')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';
