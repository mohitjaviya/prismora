-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 2: roles that could not do their daily work.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 040 (audit), 043 (sees_account_row).
--
--  D-01  Purchase Manager's row had drifted to a partner-like profile (no
--        Inventory, but every partner payment and complaint). Restored to
--        010's values; Purchases stays full, as 010 has it.
--  D-11  Approving a field expense booked an Accounting expense from the
--        manager's browser, which needs Accounting full — so the Sales
--        Manager's approvals failed. The database now books (and unbooks) it
--        on the status change. Only a manager or admin may decide a claim,
--        never their own. Accounts can read field expenses.
--  D-12  Partner payments needed Ledger full (Accounts has none), and every
--        payment's effect on the partner's balance was a separate browser
--        write to the partner record (Distributors full). Accounting full may
--        now record and remove payments, and the balance moves here, in the
--        same transaction, whoever records it.
--  D-22  Credit notes found their partner by typed name and moved its
--        balance from the browser. They now carry the partner's id and the
--        balance moves here. Partners can read their own credit notes.
--  D-09/D-10  Sales roles hold Orders view, so "Assign to Warehouse Manager",
--        "Cancel Order" and a lead rollback (which deleted the order) were all
--        refused. sales_move_order lets them move their own Pending order to
--        Processing or Cancelled — nothing else — and a rollback now cancels
--        instead of deleting.
--
--  Existing balances are not recalculated here. Batch 3 reconciles them.
-- ════════════════════════════════════════════════════════════════════════


-- ── D-01 Purchase Manager as 010 set it up ──────────────────────────────
DO $$
BEGIN
  PERFORM set_config('app.via', 'migration 046: Purchase Manager restored to its original setup (D-01)', true);
  UPDATE public.roles
     SET permissions = '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"full","purchases":"full","distributors":"full","dealers":"full","retailers":"full","accounting":"view","schemes":"none","complaints":"none","reports":"view","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb
   WHERE id = 'Purchase Manager'
     AND permissions IS DISTINCT FROM '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"full","purchases":"full","distributors":"full","dealers":"full","retailers":"full","accounting":"view","schemes":"none","complaints":"none","reports":"view","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb;
END $$;


-- ── A partner's balance, moved in one place ─────────────────────────────
-- Positive delta: they owe more. Applied to the first party id given.
CREATE OR REPLACE FUNCTION public.adjust_party_outstanding(p_dist text, p_dealer text, p_retail text, p_delta numeric)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(p_delta, 0) = 0 THEN RETURN; END IF;
  IF p_dist IS NOT NULL THEN
    UPDATE public.distributors SET "outstandingAmount" = coalesce("outstandingAmount", 0) + p_delta WHERE id = p_dist;
  ELSIF p_dealer IS NOT NULL THEN
    UPDATE public.dealers SET "outstandingAmount" = coalesce("outstandingAmount", 0) + p_delta WHERE id = p_dealer;
  ELSIF p_retail IS NOT NULL THEN
    UPDATE public.retailers SET "outstandingAmount" = coalesce("outstandingAmount", 0) + p_delta WHERE id = p_retail;
  END IF;
END $$;
REVOKE ALL ON FUNCTION public.adjust_party_outstanding(text, text, text, numeric) FROM PUBLIC, anon, authenticated;


-- ── D-12 Partner payments ───────────────────────────────────────────────
DROP POLICY IF EXISTS distributor_payments_select ON public.distributor_payments;
CREATE POLICY distributor_payments_select ON public.distributor_payments
  FOR SELECT TO authenticated
  USING (
    (public.can_view('ledger') OR public.can_view('accounting'))
    AND (NOT public.is_partner() OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

DROP POLICY IF EXISTS distributor_payments_write ON public.distributor_payments;
CREATE POLICY distributor_payments_write ON public.distributor_payments
  FOR ALL TO authenticated
  USING      ((public.can_edit('ledger') OR public.can_edit('accounting')) AND NOT public.is_partner())
  WITH CHECK ((public.can_edit('ledger') OR public.can_edit('accounting')) AND NOT public.is_partner());

CREATE OR REPLACE FUNCTION public.payment_moves_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM set_config('app.via', format('payment %s %s', OLD.id, lower(TG_OP)), true);
    PERFORM public.adjust_party_outstanding(OLD."distributorId", OLD."dealerId", OLD."retailerId", coalesce(OLD.amount, 0));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM set_config('app.via', format('payment %s', NEW.id), true);
    PERFORM public.adjust_party_outstanding(NEW."distributorId", NEW."dealerId", NEW."retailerId", -coalesce(NEW.amount, 0));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.payment_moves_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS payment_moves_balance ON public.distributor_payments;
CREATE TRIGGER payment_moves_balance
  AFTER INSERT OR DELETE OR UPDATE OF amount, "distributorId", "dealerId", "retailerId" ON public.distributor_payments
  FOR EACH ROW EXECUTE FUNCTION public.payment_moves_balance();


-- ── D-22 Credit notes carry their partner ───────────────────────────────
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS "distributorId" text REFERENCES public.distributors(id) ON DELETE SET NULL;
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS "dealerId"      text REFERENCES public.dealers(id)      ON DELETE SET NULL;
ALTER TABLE public.credit_notes ADD COLUMN IF NOT EXISTS "retailerId"    text REFERENCES public.retailers(id)    ON DELETE SET NULL;

-- Existing notes: linked only where exactly one partner of any kind has the
-- name. Done before the balance trigger exists, so linking moves no money —
-- the browser already applied these credits when they were issued.
WITH names AS (
  SELECT id, 'd' AS kind, lower(btrim(name)) AS n FROM public.distributors
  UNION ALL SELECT id, 'l', lower(btrim(name)) FROM public.dealers
  UNION ALL SELECT id, 'r', lower(btrim(name)) FROM public.retailers
), unique_match AS (
  SELECT c.id AS cn, min(n.id) AS party, min(n.kind) AS kind
  FROM public.credit_notes c JOIN names n ON n.n = lower(btrim(c."customerName"))
  WHERE c."distributorId" IS NULL AND c."dealerId" IS NULL AND c."retailerId" IS NULL
  GROUP BY c.id HAVING count(*) = 1
)
UPDATE public.credit_notes c SET
  "distributorId" = CASE WHEN m.kind = 'd' THEN m.party END,
  "dealerId"      = CASE WHEN m.kind = 'l' THEN m.party END,
  "retailerId"    = CASE WHEN m.kind = 'r' THEN m.party END
FROM unique_match m WHERE c.id = m.cn;

CREATE OR REPLACE FUNCTION public.credit_note_moves_balance()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    PERFORM set_config('app.via', format('credit note %s %s', OLD.id, lower(TG_OP)), true);
    PERFORM public.adjust_party_outstanding(OLD."distributorId", OLD."dealerId", OLD."retailerId", coalesce(OLD.amount, 0));
  END IF;
  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    PERFORM set_config('app.via', format('credit note %s', NEW.id), true);
    PERFORM public.adjust_party_outstanding(NEW."distributorId", NEW."dealerId", NEW."retailerId", -coalesce(NEW.amount, 0));
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.credit_note_moves_balance() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS credit_note_moves_balance ON public.credit_notes;
CREATE TRIGGER credit_note_moves_balance
  AFTER INSERT OR DELETE OR UPDATE OF amount, "distributorId", "dealerId", "retailerId" ON public.credit_notes
  FOR EACH ROW EXECUTE FUNCTION public.credit_note_moves_balance();

DROP POLICY IF EXISTS credit_notes_select ON public.credit_notes;
CREATE POLICY credit_notes_select ON public.credit_notes
  FOR SELECT TO authenticated
  USING (
    public.can_view('accounting')
    OR (public.is_partner() AND public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );


-- ── D-11 Field expenses ─────────────────────────────────────────────────
-- Who may decide a claim: a manager or admin, never their own. A claim is
-- filed Pending, and an approved claim's amount is fixed.
CREATE OR REPLACE FUNCTION public.sfa_expense_rules()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
DECLARE
  v_level text := public.my_role_level();
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.status, 'Pending') <> 'Pending' AND v_level IS DISTINCT FROM 'admin' THEN
      NEW.status := 'Pending';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    IF coalesce(v_level, '') NOT IN ('manager', 'admin') OR NEW."userId" IS NOT DISTINCT FROM public.my_user_id() THEN
      RAISE EXCEPTION 'Only a manager or an administrator can approve or reject a field expense, and not their own.'
        USING ERRCODE = '42501';
    END IF;
  END IF;
  IF OLD.status = 'Approved' AND NEW.status = 'Approved' AND v_level IS DISTINCT FROM 'admin'
     AND (NEW.amount IS DISTINCT FROM OLD.amount OR NEW."userId" IS DISTINCT FROM OLD."userId") THEN
    RAISE EXCEPTION 'An approved field expense cannot be changed. Reject it first.' USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS sfa_expense_rules ON public.sfa_expenses;
CREATE TRIGGER sfa_expense_rules
  BEFORE INSERT OR UPDATE ON public.sfa_expenses
  FOR EACH ROW EXECUTE FUNCTION public.sfa_expense_rules();

-- Approved books it in Accounting → Expenses under the same id the app used
-- (EXP-FLD-…), so anything booked before this is recognised, not doubled.
CREATE OR REPLACE FUNCTION public.sfa_expense_books_expense()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id text := 'EXP-' || regexp_replace(NEW.id, '^EXP-', 'FLD-');
BEGIN
  PERFORM set_config('app.via', format('approval of field expense %s', NEW.id), true);
  IF NEW.status = 'Approved' AND coalesce(NEW.amount, 0) > 0 THEN
    INSERT INTO public.expenses (id, category, amount, description, date, "assignedTo", "createdBy", "createdAt")
    VALUES (v_id, coalesce(nullif(NEW.category, ''), 'Field Expense'), NEW.amount,
            'Field expense' || coalesce(': ' || nullif(NEW.description, ''), ''),
            coalesce(NEW.date, now()), NEW."userId", NEW."userId", now())
    ON CONFLICT (id) DO UPDATE SET amount = EXCLUDED.amount, category = EXCLUDED.category, description = EXCLUDED.description;
  ELSE
    DELETE FROM public.expenses WHERE id = v_id;
  END IF;
  RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.sfa_expense_books_expense() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS sfa_expense_books_expense ON public.sfa_expenses;
CREATE TRIGGER sfa_expense_books_expense
  AFTER INSERT OR UPDATE OF status, amount ON public.sfa_expenses
  FOR EACH ROW EXECUTE FUNCTION public.sfa_expense_books_expense();

DROP POLICY IF EXISTS sfa_expenses_select ON public.sfa_expenses;
CREATE POLICY sfa_expenses_select ON public.sfa_expenses
  FOR SELECT TO authenticated
  USING ((public.can_view('sfa') AND public.can_see_rep("userId")) OR public.can_view('accounting'));


-- ── D-09 / D-10 Sales move their own Pending order ──────────────────────
CREATE OR REPLACE FUNCTION public.sales_move_order(p_order_id text, p_status text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  v_invoice text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % does not exist.', p_order_id USING ERRCODE = '42501';
  END IF;

  IF NOT public.can_edit('orders') THEN
    IF NOT ((public.can_edit('leads') OR public.can_edit('sfa'))
            AND public.sees_account_row(o."assignedTo", o."createdBy",
                  coalesce(o."distributorId", o."dealerId", o."retailerId") IS NOT NULL)) THEN
      RAISE EXCEPTION 'Order % is not one of yours.', p_order_id USING ERRCODE = '42501';
    END IF;
    IF o.status IS DISTINCT FROM 'Pending' OR p_status NOT IN ('Processing', 'Cancelled') THEN
      RAISE EXCEPTION 'Order % is %; the sales team can only send a Pending order to the warehouse or cancel it.', p_order_id, o.status
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF p_status = 'Processing' AND (nullif(btrim(o."deliveryAddress"), '') IS NULL OR nullif(btrim(o."deliveryPincode"), '') IS NULL) THEN
    RAISE EXCEPTION 'Order % needs a delivery address and pincode before it can go to the warehouse.', p_order_id
      USING ERRCODE = '23514';
  END IF;
  IF p_status = 'Cancelled' THEN
    SELECT id INTO v_invoice FROM public.invoices WHERE "orderId" = p_order_id LIMIT 1;
    IF v_invoice IS NOT NULL THEN
      RAISE EXCEPTION 'Order % has been invoiced (%), so it cannot be cancelled here. Accounts must reverse the invoice first.', p_order_id, v_invoice
        USING ERRCODE = '23514';
    END IF;
  END IF;

  PERFORM set_config('app.via', format('order %s moved to %s', p_order_id, p_status), true);
  UPDATE public.orders SET status = p_status WHERE id = p_order_id;
END $$;
REVOKE ALL ON FUNCTION public.sales_move_order(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.sales_move_order(text, text) TO authenticated;


NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('046_batch2_role_fixes.sql',
        'Batch 2: Purchase Manager restored; field expenses booked by the DB on approval; Accounting may record partner payments; payments and credit notes move balances in the DB by party id; sales_move_order')
ON CONFLICT (filename) DO NOTHING;
