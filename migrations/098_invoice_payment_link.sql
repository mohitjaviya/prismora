-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 098: a payment can be tied to an invoice (Gap 21)
--  Owner-approved 2026-10-13. Independent of 085–097 (needs 092 and 093,
--  both live). Gap 8 will be 099; 088 stays reserved for Gap 5.
--
--  WHAT WAS WRONG
--
--  A delivered order is billed with a proforma. Accounts marks it paid
--  (payment PAY-INV-<invoice>), then converts it to a GST invoice: the total
--  goes up by the GST, the partner's balance goes up by the same amount, and
--  the invoice is correctly Partially Paid. But the GST due could not be
--  settled:
--    * Mark as Paid: one settling payment per invoice. The screen saw
--      PAY-INV-<invoice>, recorded nothing and still said "settled"; the
--      database (092) refused "already has its settling payment".
--    * Record Payment: the money went into the partner's pool, which pays
--      invoices oldest first, so it settled this invoice only if it happened
--      to be the oldest open one.
--  Live 2026-10-13: 7 invoices stuck Partially Paid, ₹11,685 due. Distributors,
--  dealers and retailers alike.
--
--  WHAT THIS DOES
--
--  * distributor_payments."invoiceId" (nullable, FK invoices): the invoice a
--    payment pays. Existing rows are not rewritten; PAY-INV-<invoice> keeps
--    tying a payment to its invoice by id, as before.
--  * payment_invoice_link_check (invoker): an app user may tie a payment
--    only to an invoice of the same partner, and cannot change the tie later.
--  * recompute_invoice_statuses = live 093 definition, with a payment counted
--    against an invoice when its id is PAY-INV-<invoice> OR its invoiceId is
--    that invoice. Everything else still goes into the oldest-first pool.
--  * record_partner_payment = live 092 definition, plus:
--      - Mark as Paid (p_invoice_id) on an invoice that already has its
--        PAY-INV-<invoice> payment records what is still due as
--        PAY-INV-<invoice>-2 (-3, …) with invoiceId set. "Mark unpaid"
--        removes PAY-INV-<invoice> and these, and nothing else.
--      - Record Payment against an invoice (p_against_invoice): amount typed,
--        must be more than 0 and no more than that invoice's due (a clear
--        refusal otherwise; the extra is recorded as a separate normal
--        payment), id PAY-<epoch ms>, invoiceId set.
--    One new optional parameter, so the old 8-argument signature is dropped
--    and recreated with it (the screen calls by name; old calls still work).
--  * invoice_payment_link_enabled() tells the screen 098 is in place.
--
--  Balances still move only through payment_moves_balance (046); the Balance
--  check is unchanged (it counts every payment, tied or not). Convert is not
--  changed or blocked. No existing row is changed: the 7 stuck invoices are
--  settled by Accounts with Mark as Paid where the GST was really received.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.distributor_payments ADD COLUMN IF NOT EXISTS "invoiceId" text;
ALTER TABLE public.distributor_payments DROP CONSTRAINT IF EXISTS distributor_payments_invoice_fk;
ALTER TABLE public.distributor_payments ADD CONSTRAINT distributor_payments_invoice_fk
  FOREIGN KEY ("invoiceId") REFERENCES public.invoices(id);
CREATE INDEX IF NOT EXISTS distributor_payments_invoice_idx ON public.distributor_payments ("invoiceId") WHERE "invoiceId" IS NOT NULL;


-- ── An app user ties a payment only to the same partner's invoice ───────
CREATE OR REPLACE FUNCTION public.payment_invoice_link_check()
RETURNS trigger LANGUAGE plpgsql SECURITY INVOKER SET search_path TO 'public' AS $$
DECLARE
  v_party text;
BEGIN
  IF public.current_app_email() IS NULL THEN RETURN NEW; END IF;   -- maintenance
  IF TG_OP = 'UPDATE' AND NEW."invoiceId" IS DISTINCT FROM OLD."invoiceId" THEN
    RAISE EXCEPTION 'The invoice a payment pays cannot be changed. Withdraw the payment and record it again.' USING ERRCODE = 'P0001';
  END IF;
  IF NEW."invoiceId" IS NOT NULL AND TG_OP = 'INSERT' THEN
    SELECT coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId")
      INTO v_party
      FROM public.invoices i LEFT JOIN public.orders o ON o.id = i."orderId"
     WHERE i.id = NEW."invoiceId";
    IF v_party IS DISTINCT FROM coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId") THEN
      RAISE EXCEPTION 'Invoice % is not this partner''s.', NEW."invoiceId" USING ERRCODE = 'P0001';
    END IF;
  END IF;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.payment_invoice_link_check() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payment_invoice_link_check ON public.distributor_payments;
CREATE TRIGGER payment_invoice_link_check BEFORE INSERT OR UPDATE ON public.distributor_payments
  FOR EACH ROW EXECUTE FUNCTION public.payment_invoice_link_check();


-- ── Statuses: live 093 definition + payments tied by invoiceId ──────────
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
             coalesce((SELECT sum(amount) FROM public.distributor_payments p
                        WHERE p.id = 'PAY-INV-' || i.id OR p."invoiceId" = i.id), 0)
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
                    AND NOT EXISTS (SELECT 1 FROM party_inv x WHERE p.id = 'PAY-INV-' || x.id OR p."invoiceId" = x.id)), 0)
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


-- ── The one partner-payment insert: live 092 + the two invoice cases ────
DROP FUNCTION IF EXISTS public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text);

CREATE OR REPLACE FUNCTION public.record_partner_payment(
  p_party_type       text,
  p_party_id         text,
  p_amount           numeric,
  p_method           text        DEFAULT NULL,
  p_reference        text        DEFAULT NULL,
  p_date             timestamptz DEFAULT NULL,
  p_notes            text        DEFAULT NULL,
  p_invoice_id       text        DEFAULT NULL,   -- Mark as Paid: pays what is due
  p_against_invoice  text        DEFAULT NULL    -- Record Payment against an invoice: amount typed
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
    -- Mark as Paid: what is due now. The first one keeps 057's PAY-INV-<id>;
    -- a later one (after Convert added GST) is PAY-INV-<id>-2, -3, … tied by
    -- invoiceId, so "Mark unpaid" can find exactly these.
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
    (id, "distributorId", "dealerId", "retailerId", amount, method, reference, date, notes, "recordedBy", "createdAt", "invoiceId")
  VALUES (
    v_id,
    CASE WHEN v_type = 'Distributor' THEN p_party_id END,
    CASE WHEN v_type = 'Dealer'      THEN p_party_id END,
    CASE WHEN v_type = 'Retailer'    THEN p_party_id END,
    v_amount,
    coalesce(nullif(trim(coalesce(p_method, '')), ''), CASE WHEN p_invoice_id IS NOT NULL THEN 'Invoice settled' END),
    coalesce(nullif(trim(coalesce(p_reference, '')), ''), v_inv_id),
    coalesce(p_date, v_now),
    coalesce(nullif(trim(coalesce(p_notes, '')), ''),
             CASE WHEN p_invoice_id IS NOT NULL THEN format('Recorded when invoice %s was marked paid.', p_invoice_id) END),
    public.my_user_id(),
    v_now,
    v_link
  )
  RETURNING * INTO v_row;

  RETURN v_row;
END $$;
REVOKE ALL ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_partner_payment(text, text, numeric, text, text, timestamptz, text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.invoice_payment_link_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.invoice_payment_link_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.invoice_payment_link_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('098_invoice_payment_link.sql',
        'Gap 21: distributor_payments.invoiceId; Mark as Paid pays the GST due after Convert (PAY-INV-<id>-N); Record Payment against an invoice (amount <= due); recompute counts tied payments')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';
