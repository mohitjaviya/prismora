-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 099: payment details by mode (Gap 8)
--  Owner-approved 2026-10-13. Needs 092, 093 and 098 (all live). 088 stays
--  reserved for Gap 5.
--
--  WHAT WAS WRONG
--
--  A partner payment had a method and one free-text reference, nothing more:
--  no cheque number, date or bank, no DD details, nothing required per mode,
--  and Accounting's Mark as Paid recorded no mode at all ("Invoice settled").
--
--  WHAT THIS DOES
--
--  * distributor_payments gets the details of how the money came:
--      "instrumentNumber"  cheque / DD number
--      "instrumentDate"    cheque / DD date
--      "bankName"          the bank the cheque / DD is drawn on
--      "chequeStatus"      Received / Deposited / Cleared / Bounced (cheques)
--      "modeDetail"        what "Other" was
--      "receivedInto"      our bank or cash account it went into (free text)
--      "proofPath"         a file in the private payment-proofs bucket
--    "reference" keeps the UTR, card transaction ID or cash receipt number.
--    Existing rows are not rewritten; their details stay empty ("Not recorded").
--  * payment_details_problem(): the per-mode rules, the same as the screen's
--    (utils/paymentDetails.js):
--      UPI / Bank Transfer  UTR / reference required
--      Cheque               number, date, bank required; status default Received
--      Demand Draft         number, date, bank required
--      Card                 transaction ID required
--      Cash                 receipt number optional
--      Other                description required
--  * record_partner_payment = live 098 definition + p_details (jsonb). With
--    details (the Gap 8 form) the mode must be one of the seven and its
--    fields are required as above. Without them (a screen from before 099)
--    it behaves exactly as 098. The date may not be in the future (India
--    date) either way. Mark as Paid, PAY-INV-<id>(-N), against-invoice and
--    the amount rules are unchanged.
--  * set_cheque_status(): Received → Deposited → Cleared / Bounced. A label
--    only: no balance or invoice changes (reversing a bounced cheque is a
--    later gap). Same people who record payments.
--  * payment-proofs bucket: private, PDF / images up to 10 MB. Only full
--    Accounting (not partners) can upload, read or delete; no public links.
--  * payment_details_enabled() tells the screen 099 is in place.
--
--  Balances still move only through payment_moves_balance (046), which fires
--  on amount / partner changes only, so none of this moves a balance.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "instrumentNumber" text;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "instrumentDate"   date;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "bankName"         text;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "chequeStatus"     text;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "modeDetail"       text;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "receivedInto"     text;
ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "proofPath"        text;

ALTER TABLE public.distributor_payments DROP CONSTRAINT IF EXISTS distributor_payments_cheque_status_chk;
ALTER TABLE public.distributor_payments ADD CONSTRAINT distributor_payments_cheque_status_chk
  CHECK ("chequeStatus" IS NULL OR "chequeStatus" IN ('Received', 'Deposited', 'Cleared', 'Bounced'));


-- ── The per-mode rules (one place; the screen mirrors them) ─────────────
CREATE OR REPLACE FUNCTION public.payment_details_problem(p_method text, p_reference text, p_details jsonb)
RETURNS text LANGUAGE plpgsql IMMUTABLE SET search_path TO 'public' AS $$
DECLARE
  v_m    text := trim(coalesce(p_method, ''));
  v_d    jsonb := coalesce(p_details, '{}'::jsonb);
  v_ref  text := nullif(trim(coalesce(p_reference, '')), '');
  v_no   text := nullif(trim(coalesce(v_d->>'instrumentNumber', '')), '');
  v_dt   text := nullif(trim(coalesce(v_d->>'instrumentDate', '')), '');
  v_bank text := nullif(trim(coalesce(v_d->>'bankName', '')), '');
  v_desc text := nullif(trim(coalesce(v_d->>'modeDetail', '')), '');
  v_cs   text := nullif(trim(coalesce(v_d->>'chequeStatus', '')), '');
  v_word text;
BEGIN
  IF v_m NOT IN ('Cash', 'UPI', 'Bank Transfer', 'Cheque', 'Card', 'Demand Draft', 'Other') THEN
    RETURN 'Choose the payment mode: Cash, UPI, Bank Transfer, Cheque, Card, Demand Draft or Other.';
  END IF;
  IF v_m IN ('UPI', 'Bank Transfer') AND v_ref IS NULL THEN
    RETURN 'Enter the UTR / reference for a ' || v_m || ' payment.';
  END IF;
  IF v_m = 'Card' AND v_ref IS NULL THEN
    RETURN 'Enter the card transaction ID.';
  END IF;
  IF v_m IN ('Cheque', 'Demand Draft') THEN
    v_word := CASE v_m WHEN 'Cheque' THEN 'cheque' ELSE 'DD' END;
    IF v_no IS NULL THEN RETURN 'Enter the ' || v_word || ' number.'; END IF;
    IF v_dt IS NULL THEN RETURN 'Enter the ' || v_word || ' date.'; END IF;
    IF v_dt !~ '^\d{4}-\d{2}-\d{2}$' THEN RETURN 'The ' || v_word || ' date is not a date.'; END IF;
    IF v_bank IS NULL THEN RETURN 'Enter the bank the ' || v_word || ' is drawn on.'; END IF;
  END IF;
  IF v_m = 'Other' AND v_desc IS NULL THEN
    RETURN 'Describe how the payment was made.';
  END IF;
  IF v_cs IS NOT NULL AND v_cs NOT IN ('Received', 'Deposited', 'Cleared', 'Bounced') THEN
    RETURN 'Cheque status is Received, Deposited, Cleared or Bounced.';
  END IF;
  IF length(coalesce(v_ref, '')) > 100 OR length(coalesce(v_no, '')) > 50 OR length(coalesce(v_bank, '')) > 100
     OR length(coalesce(v_desc, '')) > 200 OR length(coalesce(trim(v_d->>'receivedInto'), '')) > 100 THEN
    RETURN 'A payment detail is too long (reference 100, number 50, bank 100, description 200 characters).';
  END IF;
  RETURN NULL;
END $$;
GRANT EXECUTE ON FUNCTION public.payment_details_problem(text, text, jsonb) TO authenticated;


-- ── The one partner-payment insert: live 098 + the details ──────────────
DROP FUNCTION IF EXISTS public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text, text);

CREATE OR REPLACE FUNCTION public.record_partner_payment(
  p_party_type       text,
  p_party_id         text,
  p_amount           numeric,
  p_method           text        DEFAULT NULL,
  p_reference        text        DEFAULT NULL,
  p_date             timestamptz DEFAULT NULL,
  p_notes            text        DEFAULT NULL,
  p_invoice_id       text        DEFAULT NULL,   -- Mark as Paid: pays what is due
  p_against_invoice  text        DEFAULT NULL,   -- Record Payment against an invoice: amount typed
  p_details          jsonb       DEFAULT NULL    -- Gap 8: how the money came (099)
) RETURNS public.distributor_payments
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $$
DECLARE
  v_type    text := initcap(trim(coalesce(p_party_type, '')));
  v_exists  boolean;
  v_inv     record;
  v_inv_id  text := coalesce(p_invoice_id, p_against_invoice);
  v_due     numeric;
  v_amount  numeric;
  v_id      text;
  v_link    text;
  v_n       integer;
  v_now     timestamptz := now();
  v_problem text;
  v_method  text := nullif(trim(coalesce(p_method, '')), '');
  v_proof   text := nullif(trim(coalesce(p_details->>'proofPath', '')), '');
  v_row     public.distributor_payments;
BEGIN
  -- The 046 policy, asked first so the refusal says why (otherwise a role that
  -- cannot see the partner is told it does not exist).
  IF NOT ((public.can_edit('ledger') OR public.can_edit('accounting')) AND NOT public.is_partner()) THEN
    RAISE EXCEPTION 'Only Accounts (Ledger or Accounting full) can record a partner payment.' USING ERRCODE = 'P0001';
  END IF;
  IF v_type NOT IN ('Distributor', 'Dealer', 'Retailer') THEN
    RAISE EXCEPTION 'A payment is recorded for a distributor, dealer or retailer.' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(coalesce(p_party_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose who the payment is from.' USING ERRCODE = 'P0001';
  END IF;
  IF p_invoice_id IS NOT NULL AND p_against_invoice IS NOT NULL THEN
    RAISE EXCEPTION 'Mark the invoice paid, or record a payment against it, not both at once.' USING ERRCODE = 'P0001';
  END IF;
  -- No payment dated after today (India date; a date-only value is midnight UTC).
  IF p_date IS NOT NULL AND (p_date AT TIME ZONE 'Asia/Kolkata')::date > (v_now AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'The payment date cannot be in the future.' USING ERRCODE = 'P0001';
  END IF;
  -- Gap 8: with details, the mode and its fields are required.
  IF p_details IS NOT NULL THEN
    v_problem := public.payment_details_problem(v_method, p_reference, p_details);
    IF v_problem IS NOT NULL THEN
      RAISE EXCEPTION '%', v_problem USING ERRCODE = 'P0001';
    END IF;
    IF v_proof IS NOT NULL AND split_part(v_proof, '/', 1) IS DISTINCT FROM p_party_id THEN
      RAISE EXCEPTION 'The proof file is not filed under this partner.' USING ERRCODE = 'P0001';
    END IF;
  END IF;

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', lower(v_type) || 's')
    INTO v_exists USING p_party_id;
  IF NOT v_exists THEN
    RAISE EXCEPTION '% % was not found.', v_type, p_party_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('partner_payment:' || p_party_id));

  IF v_inv_id IS NOT NULL THEN
    SELECT i.id, coalesce(i.amount, 0) + coalesce(i.tax, 0) AS total, coalesce(i."amountPaid", 0) AS paid,
           coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") AS party
      INTO v_inv
      FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
     WHERE i.id = v_inv_id;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % was not found.', v_inv_id USING ERRCODE = 'P0001';
    END IF;
    IF v_inv.party IS DISTINCT FROM p_party_id THEN
      RAISE EXCEPTION 'Invoice % is not %''s.', v_inv_id, p_party_id USING ERRCODE = 'P0001';
    END IF;
    v_due := round(v_inv.total - v_inv.paid, 2);
    IF v_due <= 0.005 THEN
      RAISE EXCEPTION 'Invoice % has nothing left to pay.', v_inv_id USING ERRCODE = 'P0001';
    END IF;
  END IF;

  IF p_invoice_id IS NOT NULL THEN
    -- Mark as Paid: what is due now (098, unchanged).
    v_amount := v_due;
    v_id := 'PAY-INV-' || p_invoice_id;
    IF EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = v_id) THEN
      v_n := 2;
      WHILE EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = 'PAY-INV-' || p_invoice_id || '-' || v_n) LOOP
        v_n := v_n + 1;
      END LOOP;
      v_id := 'PAY-INV-' || p_invoice_id || '-' || v_n;
      v_link := p_invoice_id;
    END IF;
  ELSE
    v_amount := round(coalesce(p_amount, 0), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'A payment must be more than zero.' USING ERRCODE = 'P0001';
    END IF;
    IF p_against_invoice IS NOT NULL THEN
      IF v_amount > v_due THEN
        RAISE EXCEPTION '₹% is more than the ₹% still due on invoice %. Record ₹% against the invoice, and the rest as a separate payment (not against an invoice).',
          to_char(v_amount, 'FM99999999990.00'), to_char(v_due, 'FM99999999990.00'), p_against_invoice, to_char(v_due, 'FM99999999990.00')
          USING ERRCODE = 'P0001';
      END IF;
      v_link := p_against_invoice;
    END IF;
    v_id := 'PAY-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
    WHILE EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = v_id) LOOP
      v_id := 'PAY-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
    END LOOP;
  END IF;

  INSERT INTO public.distributor_payments
    (id, "distributorId", "dealerId", "retailerId", amount, method, reference, date, notes, "recordedBy", "createdAt", "invoiceId",
     "instrumentNumber", "instrumentDate", "bankName", "chequeStatus", "modeDetail", "receivedInto", "proofPath")
  VALUES (
    v_id,
    CASE WHEN v_type = 'Distributor' THEN p_party_id END,
    CASE WHEN v_type = 'Dealer'      THEN p_party_id END,
    CASE WHEN v_type = 'Retailer'    THEN p_party_id END,
    v_amount,
    coalesce(v_method, CASE WHEN p_invoice_id IS NOT NULL THEN 'Invoice settled' END),
    coalesce(nullif(trim(coalesce(p_reference, '')), ''), v_inv_id),
    coalesce(p_date, v_now),
    coalesce(nullif(trim(coalesce(p_notes, '')), ''),
             CASE WHEN p_invoice_id IS NOT NULL THEN format('Recorded when invoice %s was marked paid.', p_invoice_id) END),
    public.my_user_id(),
    v_now,
    v_link,
    -- Only the fields of the chosen mode are kept.
    CASE WHEN v_method IN ('Cheque', 'Demand Draft') THEN nullif(trim(coalesce(p_details->>'instrumentNumber', '')), '') END,
    CASE WHEN v_method IN ('Cheque', 'Demand Draft') THEN nullif(trim(coalesce(p_details->>'instrumentDate', '')), '')::date END,
    CASE WHEN v_method IN ('Cheque', 'Demand Draft') THEN nullif(trim(coalesce(p_details->>'bankName', '')), '') END,
    CASE WHEN v_method = 'Cheque' AND p_details IS NOT NULL
         THEN coalesce(nullif(trim(coalesce(p_details->>'chequeStatus', '')), ''), 'Received') END,
    CASE WHEN v_method = 'Other' THEN nullif(trim(coalesce(p_details->>'modeDetail', '')), '') END,
    nullif(trim(coalesce(p_details->>'receivedInto', '')), ''),
    v_proof
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text, text, jsonb) TO authenticated;


-- ── Cheque status: a label, no money moves ──────────────────────────────
CREATE OR REPLACE FUNCTION public.set_cheque_status(p_payment_id text, p_status text)
RETURNS public.distributor_payments
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_row public.distributor_payments;
BEGIN
  IF NOT ((public.can_edit('ledger') OR public.can_edit('accounting')) AND NOT public.is_partner()) THEN
    RAISE EXCEPTION 'Only Accounts (Ledger or Accounting full) can change a cheque''s status.' USING ERRCODE = 'P0001';
  END IF;
  IF p_status IS NULL OR p_status NOT IN ('Received', 'Deposited', 'Cleared', 'Bounced') THEN
    RAISE EXCEPTION 'Cheque status is Received, Deposited, Cleared or Bounced.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO v_row FROM public.distributor_payments WHERE id = p_payment_id;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'Payment % was not found.', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  IF v_row.method IS DISTINCT FROM 'Cheque' THEN
    RAISE EXCEPTION 'Payment % is not a cheque.', p_payment_id USING ERRCODE = 'P0001';
  END IF;
  UPDATE public.distributor_payments SET "chequeStatus" = p_status WHERE id = p_payment_id RETURNING * INTO v_row;
  IF v_row.id IS NULL THEN
    RAISE EXCEPTION 'The cheque status could not be changed.' USING ERRCODE = 'P0001';
  END IF;
  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.set_cheque_status(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_cheque_status(text, text) TO authenticated;


-- ── Proof of payment: private bucket, full Accounting only ──────────────
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('payment-proofs', 'payment-proofs', false, 10485760, ARRAY[
  'application/pdf', 'image/jpeg', 'image/png', 'image/webp', 'image/heic'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE OR REPLACE FUNCTION public.can_handle_payment_proofs()
RETURNS boolean LANGUAGE sql STABLE SET search_path TO 'public' AS $$
  SELECT public.can_edit('accounting') AND NOT public.is_partner()
$$;
REVOKE ALL ON FUNCTION public.can_handle_payment_proofs() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_handle_payment_proofs() TO authenticated;

DROP POLICY IF EXISTS payment_proofs_select ON storage.objects;
CREATE POLICY payment_proofs_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.can_handle_payment_proofs());
DROP POLICY IF EXISTS payment_proofs_insert ON storage.objects;
CREATE POLICY payment_proofs_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'payment-proofs' AND public.can_handle_payment_proofs());
DROP POLICY IF EXISTS payment_proofs_delete ON storage.objects;
CREATE POLICY payment_proofs_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'payment-proofs' AND public.can_handle_payment_proofs());


CREATE OR REPLACE FUNCTION public.payment_details_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.payment_details_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.payment_details_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('099_payment_details.sql',
        'Gap 8: payment mode details (UTR, cheque/DD number, date, bank, cheque status, received into, proof); per-mode checks in record_partner_payment; set_cheque_status; private payment-proofs bucket')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';
