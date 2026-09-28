-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 3: an invoice's status comes from what has been paid,
--  and Overdue from the date — in the database, whether or not anyone opens
--  the app.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  One transaction. Needs 046, 048 (partner rule), 054.
--
--  WHAT WAS WRONG
--
--  Invoice status was set by hand (Mark as Paid / Unpaid / Overdue), by the
--  browser after a payment (only invoices a payment covered in full, so a
--  part-payment left its invoice "Unpaid"), and turned Overdue only when
--  someone with the invoices loaded opened the app. There was no Partially
--  Paid, and nothing tied a status to the money actually received.
--
--  WHAT THIS DOES
--
--  Statuses: Unpaid · Partially Paid · Settled · Overdue.
--    Settled         covered in full
--    Partially Paid  covered in part
--    Unpaid          nothing yet
--    Overdue         not settled, and past its due date (India time)
--  "amountPaid" records how much of the invoice is covered.
--
--  What covers an invoice, per partner:
--    1. explicitly — the payment "Mark as Paid" records (PAY-INV-<invoice>)
--       and credit notes raised against that invoice;
--    2. then everything else the partner has paid or been credited, applied
--       to its invoices oldest first.
--  A walk-in invoice (no partner) is covered by credit notes against it, or
--  settled by Mark as Paid ("markedPaid").
--
--  Recalculated here whenever a payment, credit note or invoice changes, and
--  every night at 00:05 IST (pg_cron) so Overdue arrives on its date.
--  Only status and amountPaid are written: no payment, credit note or
--  balance is touched, so partner balances and the Balance check are
--  unchanged.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "amountPaid" numeric NOT NULL DEFAULT 0;
ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS "markedPaid" boolean NOT NULL DEFAULT false;

-- Walk-in invoices already marked Paid keep that as their settlement.
UPDATE public.invoices i SET "markedPaid" = true
FROM (SELECT i2.id FROM public.invoices i2 LEFT JOIN public.orders o ON o.id = i2."orderId"
      WHERE i2.status = 'Paid'
        AND coalesce(i2."distributorId", i2."dealerId", i2."retailerId", o."distributorId", o."dealerId", o."retailerId") IS NULL) w
WHERE i.id = w.id AND NOT i."markedPaid";

-- ── The calculation ─────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_status_for(p_total numeric, p_paid numeric, p_due timestamptz)
RETURNS text LANGUAGE sql STABLE
AS $$
  SELECT CASE
    WHEN p_total <= 0 OR p_paid >= p_total - 0.005 THEN 'Settled'
    WHEN p_due IS NOT NULL AND (p_due AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date THEN 'Overdue'
    WHEN p_paid > 0 THEN 'Partially Paid'
    ELSE 'Unpaid'
  END
$$;

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

    -- Everything not tied to one of these invoices, plus any explicit excess.
    v_pool :=
        coalesce((SELECT sum(amount) FROM public.distributor_payments p
                  WHERE coalesce(p."distributorId", p."dealerId", p."retailerId") = v_party
                    AND NOT EXISTS (SELECT 1 FROM party_inv x WHERE p.id = 'PAY-INV-' || x.id)), 0)
      + coalesce((SELECT sum(amount) FROM public.credit_notes c
                  WHERE coalesce(c."distributorId", c."dealerId", c."retailerId") = v_party
                    AND (c."invoiceId" IS NULL OR NOT EXISTS (SELECT 1 FROM party_inv x WHERE x.id = c."invoiceId"))), 0)
      + coalesce((SELECT sum(greatest(explicit - total, 0)) FROM party_inv), 0);

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

-- ── When money moves, statuses follow ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.invoice_status_follows_money()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_old text; v_new text; v_inv text;
  o public.orders;
BEGIN
  IF current_setting('app.recomputing', true) = 'on' THEN RETURN NULL; END IF;

  IF TG_TABLE_NAME = 'invoices' THEN
    IF TG_OP <> 'INSERT' THEN
      SELECT * INTO o FROM public.orders WHERE id = OLD."orderId";
      v_old := coalesce(OLD."distributorId", OLD."dealerId", OLD."retailerId", o."distributorId", o."dealerId", o."retailerId");
      v_inv := OLD.id;
    END IF;
    IF TG_OP <> 'DELETE' THEN
      SELECT * INTO o FROM public.orders WHERE id = NEW."orderId";
      v_new := coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId", o."distributorId", o."dealerId", o."retailerId");
      v_inv := NEW.id;
    END IF;
  ELSE
    IF TG_OP <> 'INSERT' THEN v_old := coalesce(OLD."distributorId", OLD."dealerId", OLD."retailerId"); END IF;
    IF TG_OP <> 'DELETE' THEN v_new := coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId"); END IF;
    IF TG_TABLE_NAME = 'credit_notes' THEN
      v_inv := CASE WHEN TG_OP = 'DELETE' THEN OLD."invoiceId" ELSE NEW."invoiceId" END;
    END IF;
  END IF;

  IF v_old IS NOT NULL THEN PERFORM public.recompute_invoice_statuses(v_old, NULL); END IF;
  IF v_new IS NOT NULL AND v_new IS DISTINCT FROM v_old THEN PERFORM public.recompute_invoice_statuses(v_new, NULL); END IF;
  IF v_old IS NULL AND v_new IS NULL AND v_inv IS NOT NULL AND TG_OP <> 'DELETE' OR (TG_TABLE_NAME = 'credit_notes' AND v_new IS NULL AND v_inv IS NOT NULL) THEN
    PERFORM public.recompute_invoice_statuses(NULL, v_inv);
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.invoice_status_follows_money() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS invoice_status_follows_money ON public.distributor_payments;
CREATE TRIGGER invoice_status_follows_money AFTER INSERT OR UPDATE OR DELETE ON public.distributor_payments
  FOR EACH ROW EXECUTE FUNCTION public.invoice_status_follows_money();
DROP TRIGGER IF EXISTS invoice_status_follows_money ON public.credit_notes;
CREATE TRIGGER invoice_status_follows_money AFTER INSERT OR UPDATE OR DELETE ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.invoice_status_follows_money();
DROP TRIGGER IF EXISTS invoice_status_follows_money ON public.invoices;
CREATE TRIGGER invoice_status_follows_money AFTER INSERT OR UPDATE OR DELETE ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.invoice_status_follows_money();

-- ── Every night: Overdue on its date ────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'invoice-status-nightly';
  PERFORM cron.schedule('invoice-status-nightly', '35 18 * * *', 'SELECT public.recompute_invoice_statuses()');   -- 00:05 IST
END $$;

-- ── Existing invoices, now ──────────────────────────────────────────────
SELECT public.recompute_invoice_statuses();

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (filename, note)
VALUES ('057_invoice_status_from_payments.sql',
        'Invoice status Unpaid/Partially Paid/Settled/Overdue and amountPaid derived in the DB from payments and credit notes (explicit, then oldest first); recalculated on change and nightly (pg_cron)')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
