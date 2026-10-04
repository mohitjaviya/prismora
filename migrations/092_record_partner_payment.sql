-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 092: one way to record a partner's payment (Gap 7 A)
--  Prepared 2026-10-04, NOT applied. Independent of 085–091.
--
--  WHAT WAS WRONG
--
--  Two buttons wrote a `distributor_payments` row, each built in the browser:
--
--    Accounting "Mark as Paid"  id PAY-INV-<invoice>, amount = what the browser
--                               thought was due, method "Invoice settled",
--                               recordedBy NULL (nobody), date = now
--    Partner "Record Payment"   id PAY-<clock>, amount/method/reference/date
--                               typed, recordedBy = whatever the browser sent
--
--  Same table, so the balance (046) and invoice statuses (057) already move
--  the same way. But the rows were not the same record: the settling one named
--  nobody, its amount came from a possibly stale screen, and nothing checked
--  that the invoice was this partner's, or still open.
--
--  WHAT THIS DOES
--
--  record_partner_payment(party type, party id, amount, method, reference,
--  date, notes, invoice) is the only insert both buttons make.
--    * Invoker: the 046 rules decide who may (Ledger or Accounting full, not a
--      partner); the 046/057 triggers move the balance and the statuses.
--    * recordedBy is the caller (my_user_id()), never sent by the browser.
--    * With an invoice (Mark as Paid): it must be this partner's and still
--      have money due; the amount is what is due NOW in the database
--      (total − amountPaid), id PAY-INV-<invoice> (057 ties it to that
--      invoice; "Mark unpaid" still deletes it), method defaults to
--      "Invoice settled", reference to the invoice id.
--    * Without one (Record Payment): amount > 0 (also 075's CHECK), id
--      PAY-<epoch ms>; the database spreads it oldest first (057).
--    * One partner's payments are recorded one at a time (advisory lock), so
--      two clicks cannot both read the same "due".
--  partner_payment_function_enabled() tells the screen 092 is in place; until
--  then the screen inserts the row as before.
--
--  Nothing else changes: no table, column, policy, trigger or existing row.
-- ════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.record_partner_payment(
  p_party_type text,
  p_party_id   text,
  p_amount     numeric,
  p_method     text        DEFAULT NULL,
  p_reference  text        DEFAULT NULL,
  p_date       timestamptz DEFAULT NULL,
  p_notes      text        DEFAULT NULL,
  p_invoice_id text        DEFAULT NULL
) RETURNS public.distributor_payments
LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public'
AS $$
DECLARE
  v_type   text := initcap(trim(coalesce(p_party_type, '')));
  v_exists boolean;
  v_inv    record;
  v_due    numeric;
  v_amount numeric;
  v_id     text;
  v_now    timestamptz := now();
  v_row    public.distributor_payments;
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

  EXECUTE format('SELECT EXISTS (SELECT 1 FROM public.%I WHERE id = $1)', lower(v_type) || 's')
    INTO v_exists USING p_party_id;
  IF NOT v_exists THEN
    RAISE EXCEPTION '% % was not found.', v_type, p_party_id USING ERRCODE = 'P0001';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('partner_payment:' || p_party_id));

  IF p_invoice_id IS NOT NULL THEN
    SELECT i.id, coalesce(i.amount, 0) + coalesce(i.tax, 0) AS total, coalesce(i."amountPaid", 0) AS paid,
           coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") AS party
      INTO v_inv
      FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
     WHERE i.id = p_invoice_id;
    IF v_inv.id IS NULL THEN
      RAISE EXCEPTION 'Invoice % was not found.', p_invoice_id USING ERRCODE = 'P0001';
    END IF;
    IF v_inv.party IS DISTINCT FROM p_party_id THEN
      RAISE EXCEPTION 'Invoice % is not %''s.', p_invoice_id, p_party_id USING ERRCODE = 'P0001';
    END IF;
    v_id := 'PAY-INV-' || p_invoice_id;
    IF EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = v_id) THEN
      RAISE EXCEPTION 'Invoice % already has its settling payment.', p_invoice_id USING ERRCODE = 'P0001';
    END IF;
    v_due := round(v_inv.total - v_inv.paid, 2);
    IF v_due <= 0.005 THEN
      RAISE EXCEPTION 'Invoice % has nothing left to pay.', p_invoice_id USING ERRCODE = 'P0001';
    END IF;
    v_amount := v_due;
  ELSE
    v_amount := round(coalesce(p_amount, 0), 2);
    IF v_amount <= 0 THEN
      RAISE EXCEPTION 'A payment must be more than zero.' USING ERRCODE = 'P0001';
    END IF;
    v_id := 'PAY-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
    WHILE EXISTS (SELECT 1 FROM public.distributor_payments WHERE id = v_id) LOOP
      v_id := 'PAY-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
    END LOOP;
  END IF;

  INSERT INTO public.distributor_payments
    (id, "distributorId", "dealerId", "retailerId", amount, method, reference, date, notes, "recordedBy", "createdAt")
  VALUES (
    v_id,
    CASE WHEN v_type = 'Distributor' THEN p_party_id END,
    CASE WHEN v_type = 'Dealer'      THEN p_party_id END,
    CASE WHEN v_type = 'Retailer'    THEN p_party_id END,
    v_amount,
    coalesce(nullif(trim(coalesce(p_method, '')), ''), CASE WHEN p_invoice_id IS NOT NULL THEN 'Invoice settled' END),
    coalesce(nullif(trim(coalesce(p_reference, '')), ''), p_invoice_id),
    coalesce(p_date, v_now),
    coalesce(nullif(trim(coalesce(p_notes, '')), ''),
             CASE WHEN p_invoice_id IS NOT NULL THEN format('Recorded when invoice %s was marked paid.', p_invoice_id) END),
    public.my_user_id(),
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_payment_function_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.partner_payment_function_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_payment_function_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('092_record_partner_payment.sql',
        'Gap 7 A: record_partner_payment is the one insert for Mark as Paid and Record Payment (recordedBy from the caller, invoice checked, amount due from the DB)')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';

