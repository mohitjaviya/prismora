-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 093: paying a partner's credit balance back (Gap 7 C)
--  Prepared 2026-10-04, NOT applied. Independent of 085–092.
--
--  WHAT WAS MISSING
--
--  A partner's balance goes below zero when they have paid or been credited
--  more than they were invoiced (an advance, or a sales return after payment:
--  075 lets a return's credit note reach the invoice total, 046 moves the
--  balance, 057 keeps the excess to pay their next invoices). The ledger now
--  calls that a "Credit Balance" (Gap 7 B). There was no way to record that
--  the money was paid back, so the credit could only ever be used up by new
--  invoices.
--
--  WHAT THIS DOES (owner's choice, 2026-10-04: option 2 + a refund action)
--
--  partner_refunds: one row per refund paid to a distributor, dealer or
--  retailer (amount, date, payment mode, reference, reason, who recorded it).
--    * Written only by record_partner_refund(); app users cannot insert, edit
--      or delete a refund directly (no write policy, no table rights).
--    * Who: the payments rule (046): Ledger or Accounting full, not a partner
--      (Accounts, Admin, Super Admin).
--    * Only while the partner holds a credit (balance below 0), and never more
--      than that credit. Amount, date (not after today, India time), payment
--      mode, reference (UTR / cheque no.) and reason are all required.
--    * One partner at a time (the same advisory lock as 092's payments, plus
--      the partner row locked), so two refunds cannot both spend one credit.
--    * Read: the same people who read payments; a partner reads its own.
--  refund_moves_balance: a refund raises the balance by its amount (toward 0),
--  the way 046 moves it for payments and credit notes.
--  partner_derived_balance (048, the Balance check) counts refunds, so the
--  check stays empty.
--  recompute_invoice_statuses (057) takes refunds out of the credit that pays
--  the partner's invoices, so money already paid back does not also settle a
--  later invoice. Otherwise the 057 definition, unchanged.
--  is_money_event (049) includes 'partner_refund', so the activity feed hides
--  it from roles without Accounting view, like payments.
--  partner_refund_enabled() tells the screen 093 is in place; until then no
--  Refund button is shown.
--
--  Nothing else changes: no existing row, balance or invoice status. A
--  partner without refunds gets exactly the same statuses as before.
-- ════════════════════════════════════════════════════════════════════════


-- ── The table ───────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.partner_refunds (
  id              text PRIMARY KEY,
  "distributorId" text REFERENCES public.distributors(id),
  "dealerId"      text REFERENCES public.dealers(id),
  "retailerId"    text REFERENCES public.retailers(id),
  amount          numeric     NOT NULL CONSTRAINT partner_refunds_amount_positive CHECK (amount > 0),
  date            timestamptz NOT NULL,
  method          text        NOT NULL CONSTRAINT partner_refunds_method_given    CHECK (btrim(method) <> ''),
  reference       text        NOT NULL CONSTRAINT partner_refunds_reference_given CHECK (btrim(reference) <> ''),
  reason          text        NOT NULL CONSTRAINT partner_refunds_reason_given    CHECK (length(btrim(reason)) >= 3),
  "recordedBy"    text,
  "createdAt"     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT partner_refunds_one_party CHECK (num_nonnulls("distributorId", "dealerId", "retailerId") = 1)
);
CREATE INDEX IF NOT EXISTS partner_refunds_distributor ON public.partner_refunds ("distributorId");
CREATE INDEX IF NOT EXISTS partner_refunds_dealer      ON public.partner_refunds ("dealerId");
CREATE INDEX IF NOT EXISTS partner_refunds_retailer    ON public.partner_refunds ("retailerId");

ALTER TABLE public.partner_refunds ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.partner_refunds FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.partner_refunds TO authenticated;

-- Read like payments (046). No write policy: only record_partner_refund writes.
DROP POLICY IF EXISTS partner_refunds_select ON public.partner_refunds;
CREATE POLICY partner_refunds_select ON public.partner_refunds
  FOR SELECT TO authenticated
  USING (
    (public.can_view('ledger') OR public.can_view('accounting'))
    AND (NOT public.is_partner() OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

DROP TRIGGER IF EXISTS audit_row ON public.partner_refunds;
CREATE TRIGGER audit_row AFTER INSERT OR DELETE OR UPDATE ON public.partner_refunds
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();


-- ── A refund raises the balance (toward 0) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.refund_moves_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM set_config('app.via', format('refund %s %s', OLD.id, lower(TG_OP)), true);
    PERFORM public.adjust_party_outstanding(OLD."distributorId", OLD."dealerId", OLD."retailerId", -coalesce(OLD.amount, 0));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM set_config('app.via', format('refund %s', NEW.id), true);
    PERFORM public.adjust_party_outstanding(NEW."distributorId", NEW."dealerId", NEW."retailerId", coalesce(NEW.amount, 0));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.refund_moves_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS refund_moves_balance ON public.partner_refunds;
CREATE TRIGGER refund_moves_balance
  AFTER INSERT OR DELETE OR UPDATE OF amount, "distributorId", "dealerId", "retailerId" ON public.partner_refunds
  FOR EACH ROW EXECUTE FUNCTION public.refund_moves_balance();

-- Statuses follow refunds too (057's trigger function handles any table with
-- the three party columns).
DROP TRIGGER IF EXISTS invoice_status_follows_money ON public.partner_refunds;
CREATE TRIGGER invoice_status_follows_money AFTER INSERT OR UPDATE OR DELETE ON public.partner_refunds
  FOR EACH ROW EXECUTE FUNCTION public.invoice_status_follows_money();


-- ── Recording one ───────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_partner_refund(
  p_party_type text,
  p_party_id   text,
  p_amount     numeric,
  p_date       date,
  p_method     text,
  p_reference  text,
  p_reason     text
) RETURNS public.partner_refunds
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_type    text := initcap(trim(coalesce(p_party_type, '')));
  v_balance numeric;
  v_credit  numeric;
  v_amount  numeric := round(coalesce(p_amount, 0), 2);
  v_id      text;
  v_now     timestamptz := now();
  v_row     public.partner_refunds;
BEGIN
  IF NOT ((public.can_edit('ledger') OR public.can_edit('accounting')) AND NOT public.is_partner()) THEN
    RAISE EXCEPTION 'Only Accounts (Ledger or Accounting full) can record a refund.' USING ERRCODE = 'P0001';
  END IF;
  IF v_type NOT IN ('Distributor', 'Dealer', 'Retailer') THEN
    RAISE EXCEPTION 'A refund is paid to a distributor, dealer or retailer.' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(coalesce(p_party_id, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose who the refund is paid to.' USING ERRCODE = 'P0001';
  END IF;
  IF v_amount <= 0 THEN
    RAISE EXCEPTION 'A refund must be more than zero.' USING ERRCODE = 'P0001';
  END IF;
  IF p_date IS NULL THEN
    RAISE EXCEPTION 'Enter the date the refund was paid.' USING ERRCODE = 'P0001';
  END IF;
  IF p_date > (v_now AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'A refund cannot be dated after today.' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(coalesce(p_method, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Choose the payment mode.' USING ERRCODE = 'P0001';
  END IF;
  IF nullif(trim(coalesce(p_reference, '')), '') IS NULL THEN
    RAISE EXCEPTION 'Enter the reference (UTR or cheque number).' USING ERRCODE = 'P0001';
  END IF;
  IF length(trim(coalesce(p_reason, ''))) < 3 THEN
    RAISE EXCEPTION 'Enter the reason for the refund.' USING ERRCODE = 'P0001';
  END IF;

  -- Same lock as record_partner_payment (092): one money entry per partner at a time.
  PERFORM pg_advisory_xact_lock(hashtext('partner_payment:' || p_party_id));
  EXECUTE format('SELECT coalesce("outstandingAmount", 0) FROM public.%I WHERE id = $1 FOR UPDATE', lower(v_type) || 's')
    INTO v_balance USING p_party_id;
  IF v_balance IS NULL THEN
    RAISE EXCEPTION '% % was not found.', v_type, p_party_id USING ERRCODE = 'P0001';
  END IF;

  v_credit := round(-v_balance, 2);
  IF v_credit <= 0 THEN
    RAISE EXCEPTION '% has no credit balance to refund.', p_party_id USING ERRCODE = 'P0001';
  END IF;
  IF v_amount > v_credit THEN
    RAISE EXCEPTION 'A refund cannot be more than the credit balance (₹%).', to_char(v_credit, 'FM99,99,99,990.00') USING ERRCODE = 'P0001';
  END IF;

  v_id := 'RFD-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM public.partner_refunds WHERE id = v_id) LOOP
    v_id := 'RFD-' || floor(extract(epoch FROM clock_timestamp()) * 1000)::bigint || '-' || substr(md5(random()::text), 1, 4);
  END LOOP;

  INSERT INTO public.partner_refunds
    (id, "distributorId", "dealerId", "retailerId", amount, date, method, reference, reason, "recordedBy", "createdAt")
  VALUES (
    v_id,
    CASE WHEN v_type = 'Distributor' THEN p_party_id END,
    CASE WHEN v_type = 'Dealer'      THEN p_party_id END,
    CASE WHEN v_type = 'Retailer'    THEN p_party_id END,
    v_amount,
    -- Midday India time, so the day shows the same everywhere.
    (p_date::timestamp + interval '12 hours') AT TIME ZONE 'Asia/Kolkata',
    trim(p_method), trim(p_reference), trim(p_reason),
    public.my_user_id(),
    v_now
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.record_partner_refund(text, text, numeric, date, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_refund(text, text, numeric, date, text, text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.partner_refund_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.partner_refund_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_refund_enabled() TO authenticated;


-- ── The Balance check counts refunds (048) ──────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_derived_balance(p_id text)
RETURNS numeric LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT
    coalesce((SELECT sum(coalesce(i.amount, 0) + coalesce(i.tax, 0))
              FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
              WHERE coalesce(i."distributorId", i."dealerId", i."retailerId",
                             o."distributorId", o."dealerId", o."retailerId") = p_id), 0)
  - coalesce((SELECT sum(coalesce(amount, 0)) FROM public.distributor_payments
              WHERE coalesce("distributorId", "dealerId", "retailerId") = p_id), 0)
  - coalesce((SELECT sum(coalesce(amount, 0)) FROM public.credit_notes
              WHERE coalesce("distributorId", "dealerId", "retailerId") = p_id), 0)
  + coalesce((SELECT sum(coalesce(amount, 0)) FROM public.partner_refunds
              WHERE coalesce("distributorId", "dealerId", "retailerId") = p_id), 0)
$$;
REVOKE ALL ON FUNCTION public.partner_derived_balance(text) FROM PUBLIC, anon, authenticated;


-- ── Refunded money no longer pays invoices (057) ────────────────────────
-- The 057 definition; the only change is "− refunds" in v_pool.
CREATE OR REPLACE FUNCTION public.recompute_invoice_statuses(p_party text DEFAULT NULL, p_invoice text DEFAULT NULL)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_party text;
  inv record;
  v_pool numeric;
  v_paid numeric;
  v_take numeric;
  v_status text;
  v_changed integer := 0;
  v_prev_flag text := current_setting('app.recomputing', true);
BEGIN
  PERFORM set_config('app.recomputing', 'on', true);
  PERFORM set_config('app.via', 'invoice status from payments and credit notes', true);

  -- Partners
  FOR v_party IN
    SELECT DISTINCT coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId")
    FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
    WHERE coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") IS NOT NULL
      AND (p_party IS NULL OR coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") = p_party)
      AND p_invoice IS NULL
  LOOP
    DROP TABLE IF EXISTS pg_temp.party_inv;
    CREATE TEMP TABLE party_inv ON COMMIT DROP AS
      SELECT i.id, coalesce(i.amount, 0) + coalesce(i.tax, 0) AS total, i."dueDate" AS due, i."createdAt" AS created,
             coalesce((SELECT sum(amount) FROM public.distributor_payments p WHERE p.id = 'PAY-INV-' || i.id), 0)
           + coalesce((SELECT sum(amount) FROM public.credit_notes c WHERE c."invoiceId" = i.id
                         AND coalesce(c."distributorId", c."dealerId", c."retailerId") IS NOT DISTINCT FROM v_party), 0) AS explicit,
             i.status AS old_status, i."amountPaid" AS old_paid
      FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
      WHERE coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") = v_party;

    -- Everything not tied to one of these invoices, plus any explicit excess,
    -- less what has been paid back to the partner (093).
    v_pool :=
        coalesce((SELECT sum(amount) FROM public.distributor_payments p
                  WHERE coalesce(p."distributorId", p."dealerId", p."retailerId") = v_party
                    AND NOT EXISTS (SELECT 1 FROM party_inv x WHERE p.id = 'PAY-INV-' || x.id)), 0)
      + coalesce((SELECT sum(amount) FROM public.credit_notes c
                  WHERE coalesce(c."distributorId", c."dealerId", c."retailerId") = v_party
                    AND (c."invoiceId" IS NULL OR NOT EXISTS (SELECT 1 FROM party_inv x WHERE x.id = c."invoiceId"))), 0)
      + coalesce((SELECT sum(greatest(explicit - total, 0)) FROM party_inv), 0)
      - coalesce((SELECT sum(amount) FROM public.partner_refunds r
                  WHERE coalesce(r."distributorId", r."dealerId", r."retailerId") = v_party), 0);
    v_pool := greatest(v_pool, 0);

    FOR inv IN SELECT * FROM party_inv ORDER BY created NULLS FIRST, id LOOP
      v_paid := least(inv.explicit, inv.total);
      v_take := greatest(least(v_pool, inv.total - v_paid), 0);
      v_paid := v_paid + v_take;
      v_pool := v_pool - v_take;
      v_status := public.invoice_status_for(inv.total, v_paid, inv.due);
      IF inv.old_status IS DISTINCT FROM v_status OR inv.old_paid IS DISTINCT FROM round(v_paid, 2) THEN
        UPDATE public.invoices SET status = v_status, "amountPaid" = round(v_paid, 2) WHERE id = inv.id;
        v_changed := v_changed + 1;
      END IF;
    END LOOP;
  END LOOP;

  -- Walk-ins (no partner)
  FOR inv IN
    SELECT i.id, coalesce(i.amount, 0) + coalesce(i.tax, 0) AS total, i."dueDate" AS due, i.status AS old_status, i."amountPaid" AS old_paid,
           i."markedPaid" AS marked,
           coalesce((SELECT sum(amount) FROM public.credit_notes c WHERE c."invoiceId" = i.id), 0) AS credited
    FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
    WHERE coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") IS NULL
      AND p_party IS NULL AND (p_invoice IS NULL OR i.id = p_invoice)
  LOOP
    v_paid := CASE WHEN inv.marked THEN inv.total ELSE least(inv.credited, inv.total) END;
    v_status := public.invoice_status_for(inv.total, v_paid, inv.due);
    IF inv.old_status IS DISTINCT FROM v_status OR inv.old_paid IS DISTINCT FROM round(v_paid, 2) THEN
      UPDATE public.invoices SET status = v_status, "amountPaid" = round(v_paid, 2) WHERE id = inv.id;
      v_changed := v_changed + 1;
    END IF;
  END LOOP;

  PERFORM set_config('app.recomputing', coalesce(v_prev_flag, ''), true);
  RETURN v_changed;
END $$;
REVOKE ALL ON FUNCTION public.recompute_invoice_statuses(text, text) FROM PUBLIC, anon, authenticated;


-- ── Refunds are money entries in the activity feed (049) ────────────────
CREATE OR REPLACE FUNCTION public.is_money_event(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(p_type, '') IN ('distributor_payment', 'dealer_payment', 'retailer_payment',
                                  'invoice_new', 'invoice_status_update', 'invoice_converted',
                                  'credit_note', 'credit_note_deleted', 'balance_corrected',
                                  'partner_refund')
$$;


INSERT INTO public.schema_migrations (filename, note)
VALUES ('093_partner_refunds.sql',
        'Gap 7 C: record_partner_refund pays back a partner''s credit balance (Accounts, ≤ credit, all details required); balance, Balance check and invoice statuses count refunds')
ON CONFLICT (filename) DO NOTHING;


NOTIFY pgrst, 'reload schema';
