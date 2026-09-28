-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3: partner balances reconciled, and kept honest.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 045, 046.
--
--  THE RULE (the same everywhere from here on)
--
--    balance = Σ invoice totals (amount + tax) − Σ payments − Σ credit notes
--
--  with each line belonging to a partner by id: the invoice's own partner id,
--  else its order's. Never by name.
--
--  1. CORRECTIONS (owner-approved 2026-09-28, FIX-BATCH-3-RECONCILIATION.md).
--     Each one refuses to run unless the stored balance is still exactly what
--     the reconciliation found, so nothing changed since is overwritten.
--  2. A deleted invoice takes its charge off the partner, in the database.
--     It was the last balance change still made from the browser, and the
--     browser's write was refused for Accounts — how Gujarat super stockist's
--     balance kept a credit for an invoice and order deleted on 21–23 Sep.
--  3. Nobody writes a balance directly. Balances move only with invoices,
--     payments and credit notes (all in the database), or through
--     correct_party_balance(), which sets the rule's figure and records why.
--  4. partner_balance_drift(): every partner whose stored balance differs
--     from the rule, for Accounting viewers (Super Admin, Admin, Director,
--     Accounts). The Accounting screen shows it as "Balance check".
--  5. The activity feed stops showing payment, invoice and credit-note entries
--     to roles without Accounting view (Sales Manager, Manager, Purchase
--     Manager read amounts there that they may not read anywhere else).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Corrections ──────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION pg_temp.correct(p_table text, p_id text, p_expected numeric, p_new numeric, p_reason text)
RETURNS void LANGUAGE plpgsql AS $$
DECLARE v_now numeric;
BEGIN
  EXECUTE format('SELECT coalesce("outstandingAmount", 0) FROM public.%I WHERE id = $1', p_table) INTO v_now USING p_id;
  IF v_now IS NULL THEN
    RAISE EXCEPTION 'Reconciliation: % % not found — nothing changed.', p_table, p_id;
  END IF;
  IF v_now <> p_expected THEN
    RAISE EXCEPTION 'Reconciliation: % balance is % now, not the % that was reviewed — nothing changed. Re-run the reconciliation.', p_id, v_now, p_expected;
  END IF;
  PERFORM set_config('app.via', 'reconciliation 2026-09-28: ' || p_reason, true);
  EXECUTE format('UPDATE public.%I SET "outstandingAmount" = $1 WHERE id = $2', p_table) USING p_new, p_id;
END $$;

SELECT pg_temp.correct('distributors', 'DIST-1790265786389', 0, 15680,
  'charge INV-1790265113364 (order O5, ₹14,000 + ₹1,680 GST); O5 had no partner when invoiced, linked to this distributor on 2026-09-28');
SELECT pg_temp.correct('distributors', 'DIST-1789982501250', -22400, -11200,
  'remove a ₹11,200 credit left by invoice INV-1789984000579 and the original order O3, deleted 21–23 Sep without reversing it; ₹11,200 advance (PAY-1790578368063) stays');
SELECT pg_temp.correct('distributors', 'D-TEST-1', 8233, 6733,
  'apply test payment TEST-PAY-1 (₹1,500), inserted by the seed script without moving the balance (NEW-02)');
SELECT pg_temp.correct('retailers', 'R-TEST-1', 2951, 2671,
  'apply test credit note TEST-CN-1 (₹280), inserted by the seed script without moving the balance');
SELECT pg_temp.correct('distributors', 'DIST-1790404680208', 60, 0,
  'remove ₹60 left by marking INV-1790570862249 Paid/Unpaid/Paid around its GST conversion (old browser code); both invoices are fully paid');


-- ── The rule, in one place ──────────────────────────────────────────────
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
$$;
REVOKE ALL ON FUNCTION public.partner_derived_balance(text) FROM PUBLIC, anon, authenticated;


-- ── 2. A deleted invoice takes its charge back ──────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_delete_moves_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = OLD."orderId";
  PERFORM set_config('app.via', format('invoice %s deleted', OLD.id), true);
  PERFORM public.adjust_party_outstanding(
    coalesce(OLD."distributorId", CASE WHEN OLD."dealerId" IS NULL AND OLD."retailerId" IS NULL THEN o."distributorId" END),
    coalesce(OLD."dealerId",      CASE WHEN OLD."distributorId" IS NULL AND OLD."retailerId" IS NULL THEN o."dealerId" END),
    coalesce(OLD."retailerId",    CASE WHEN OLD."distributorId" IS NULL AND OLD."dealerId" IS NULL THEN o."retailerId" END),
    -(coalesce(OLD.amount, 0) + coalesce(OLD.tax, 0)));
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.invoice_delete_moves_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_delete_moves_balance ON public.invoices;
CREATE TRIGGER invoice_delete_moves_balance
  AFTER DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_delete_moves_balance();


-- ── 3. Nobody writes a balance directly ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.party_balance_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF NEW."outstandingAmount" IS DISTINCT FROM OLD."outstandingAmount"
     AND current_user IN ('authenticated', 'anon') AND NOT public.is_service_request() THEN
    RAISE EXCEPTION 'A partner''s balance moves only with its invoices, payments and credit notes. Use "Correct balance" to match it to the ledger.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS party_balance_guard ON public.distributors;
CREATE TRIGGER party_balance_guard BEFORE UPDATE ON public.distributors FOR EACH ROW EXECUTE FUNCTION public.party_balance_guard();
DROP TRIGGER IF EXISTS party_balance_guard ON public.dealers;
CREATE TRIGGER party_balance_guard BEFORE UPDATE ON public.dealers FOR EACH ROW EXECUTE FUNCTION public.party_balance_guard();
DROP TRIGGER IF EXISTS party_balance_guard ON public.retailers;
CREATE TRIGGER party_balance_guard BEFORE UPDATE ON public.retailers FOR EACH ROW EXECUTE FUNCTION public.party_balance_guard();

-- The one sanctioned correction: stored := the rule's figure, with who and why.
CREATE OR REPLACE FUNCTION public.correct_party_balance(p_id text)
RETURNS numeric LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_new numeric := public.partner_derived_balance(p_id);
  v_table text;
BEGIN
  IF NOT (public.is_app_admin() OR public.can_edit('accounting')) THEN
    RAISE EXCEPTION 'Only Accounts or an administrator can correct a balance.' USING ERRCODE = '42501';
  END IF;
  SELECT t INTO v_table FROM (VALUES ('distributors'), ('dealers'), ('retailers')) v(t)
  WHERE EXISTS (SELECT 1 FROM public.distributors WHERE t = 'distributors' AND id = p_id)
     OR EXISTS (SELECT 1 FROM public.dealers      WHERE t = 'dealers'      AND id = p_id)
     OR EXISTS (SELECT 1 FROM public.retailers    WHERE t = 'retailers'    AND id = p_id)
  LIMIT 1;
  IF v_table IS NULL THEN
    RAISE EXCEPTION 'Partner % not found.', p_id USING ERRCODE = '23503';
  END IF;
  PERFORM set_config('app.via', 'balance corrected to invoices − payments − credit notes', true);
  EXECUTE format('UPDATE public.%I SET "outstandingAmount" = $1 WHERE id = $2', v_table) USING v_new, p_id;
  RETURN v_new;
END $$;
REVOKE ALL ON FUNCTION public.correct_party_balance(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.correct_party_balance(text) TO authenticated;


-- ── 4. The drift check ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.partner_balance_drift()
RETURNS TABLE (kind text, id text, name text, stored numeric, derived numeric, difference numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH p AS (
    SELECT 'Distributor' AS kind, d.id, d.name, coalesce(d."outstandingAmount", 0) AS stored FROM public.distributors d
    UNION ALL SELECT 'Dealer', l.id, l.name, coalesce(l."outstandingAmount", 0) FROM public.dealers l
    UNION ALL SELECT 'Retailer', r.id, r.name, coalesce(r."outstandingAmount", 0) FROM public.retailers r
  )
  SELECT kind, id, name, stored, der, round(stored - der, 2)
  FROM (SELECT p.*, public.partner_derived_balance(p.id) AS der FROM p) x
  WHERE public.can_view('accounting') AND abs(stored - der) >= 0.01
  ORDER BY abs(stored - der) DESC
$$;
REVOKE ALL ON FUNCTION public.partner_balance_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.partner_balance_drift() TO authenticated;


-- ── 5. Money out of the activity feed for non-Accounting roles ──────────
DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT TO authenticated
  USING (
    public.can_view('reports')
    AND (public.can_view('accounting')
         OR coalesce(type, '') NOT IN ('distributor_payment', 'dealer_payment', 'retailer_payment',
                                       'invoice_new', 'invoice_status_update', 'invoice_converted',
                                       'credit_note', 'credit_note_deleted', 'balance_corrected'))
  );

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('048_balance_reconciliation.sql',
        'five approved balance corrections; invoice delete moves the balance in the DB; direct balance writes refused; correct_party_balance and partner_balance_drift; money events hidden from non-Accounting roles')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
