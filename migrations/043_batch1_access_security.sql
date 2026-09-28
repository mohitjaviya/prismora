-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 1 security: what each signed-in account may read and
--  change, decided by the database.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 029, 034, 035, 038, 040.
--
--  Phase 1 testing found these, each reachable with an account's own login
--  through the REST API, whatever the screens show:
--
--  D-04  users_update let anyone edit their own row, checking only that the
--        role came back unchanged. A partner could point distributorId at
--        another partner and read its books; a Pending partner could set its
--        own status to Active and approve itself.
--  D-05  orders_update let a partner change any column of its own orders —
--        value, prices, status, even Delivered, which takes stock and raises
--        the invoice. Partner orders were also priced by the browser.
--  D-03  bank_transactions, notifications, stock_transfers and warehouses were
--        open to every signed-in account, partners included (014's blanket
--        "signed in" policy, never replaced for these four).
--  D-02  leads and orders were guarded by module only, so a Sales Executive
--        read every rep's leads and orders.
--  D-06  a partner also saw any invoice whose customer name equalled its own
--        name. Names are not unique: two distributors are both called
--        "Krishna pharma".
--  D-07  there was no way to switch an account off. Only Pending and Rejected
--        were refused.
--
--  WHAT THIS DOES
--
--  1. 'Inactive' joins Pending and Rejected: my_role_name(), my_user_id() and
--     the partner helpers return NULL for it, which every policy already
--     fails closed on. Still a blocklist, for 029's reason (an unexpected
--     status must not lock every administrator out).
--  2. users: a trigger allows an account holder to change only their own name.
--     Administrators (settings full) change anything, except their own status.
--     The server functions (service key) and this database's own functions are
--     not affected, and updatedBy/updatedAt stamping still works. Approving a
--     partner now activates its Pending login in the database, so whoever may
--     approve the partner does not also need rights over `users`.
--     A browser insert of a Pending partner profile may no longer name a
--     partner record — real sign-ups go through partner-signup.
--  3. orders: partners lose direct UPDATE. They may confirm receipt
--     (confirm_my_order_receipt) and cancel while Pending (cancel_my_order),
--     both checked here. A partner's new order is always Pending, carries only
--     its own party id, and is priced here from the products table at its tier
--     (distributorPrice / dealerPrice / retailerPrice) — the browser's prices
--     and value are ignored. Staff status changes (Warehouse, Dispatch) and the
--     Delivered trigger are unchanged.
--  4. leads and orders are scoped by owner for the roles that own accounts
--     (sales and manager level with full Leads or SFA):
--       · Sales Executive / Sales — rows assigned to or created by them;
--       · Sales Manager / Manager — theirs and their team's, unassigned rows,
--         and every partner-placed order;
--       · everyone else (admin level, Customer Support, Accounts, Warehouse,
--         Dispatch, Purchase Manager) — unchanged.
--  5. invoices: a partner sees only invoices of its own orders. No invoice
--     data is changed.
--  6. bank_transactions → accounting; stock_transfers, warehouses → inventory;
--     notifications → read/edit/delete your own, and any active staff account
--     may send one to someone else. Partners get none of these.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Inactive accounts have no access ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.account_is_blocked()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$ SELECT coalesce(public.my_account_status() IN ('Pending', 'Rejected', 'Inactive'), false) $$;

CREATE OR REPLACE FUNCTION public.my_role_name()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT role FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected', 'Inactive')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_user_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT id FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected', 'Inactive')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_distributor_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT "distributorId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected', 'Inactive')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_dealer_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT "dealerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected', 'Inactive')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_retailer_id()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT "retailerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected', 'Inactive')
  LIMIT 1
$$;


-- ── 2. users: your own row, name only ───────────────────────────────────
CREATE OR REPLACE FUNCTION public.users_guard_self_edit()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  -- Server functions (service key) and this database's own functions.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN NEW;
  END IF;

  IF public.is_app_admin() THEN
    IF NEW.id = public.my_user_id() AND NEW.status IS DISTINCT FROM OLD.status THEN
      RAISE EXCEPTION 'You cannot change the status of your own account. Ask another administrator.'
        USING ERRCODE = '42501';
    END IF;
    RETURN NEW;
  END IF;

  IF (to_jsonb(NEW) - 'name' - 'updatedBy' - 'updatedAt')
     IS DISTINCT FROM (to_jsonb(OLD) - 'name' - 'updatedBy' - 'updatedAt') THEN
    RAISE EXCEPTION 'You can change only your own name. An administrator changes everything else.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_guard_self_edit ON public.users;
CREATE TRIGGER users_guard_self_edit
  BEFORE UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_guard_self_edit();

DROP POLICY IF EXISTS users_insert ON public.users;
CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR (
      lower(email) = public.current_app_email()
      AND role IN ('Distributor', 'Dealer', 'Retailer')
      AND status = 'Pending'
      AND "distributorId" IS NULL AND "dealerId" IS NULL AND "retailerId" IS NULL
      AND coalesce(cardinality("managedUsers"), 0) = 0
    )
  );

-- Approving a partner activates its Pending login, whoever approves it.
CREATE OR REPLACE FUNCTION public.partner_approval_activates_login()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  link_column text := CASE TG_TABLE_NAME
    WHEN 'distributors' THEN 'distributorId'
    WHEN 'dealers'      THEN 'dealerId'
    WHEN 'retailers'    THEN 'retailerId' END;
BEGIN
  PERFORM set_config('app.via', format('approval of %s %s', TG_TABLE_NAME, NEW.id), true);
  EXECUTE format('UPDATE public.users SET status = ''Active'' WHERE %I = $1 AND status = ''Pending''', link_column)
    USING NEW.id;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.partner_approval_activates_login() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS partner_approval_activates_login ON public.distributors;
CREATE TRIGGER partner_approval_activates_login
  AFTER UPDATE OF status ON public.distributors
  FOR EACH ROW WHEN (NEW.status = 'Active' AND OLD.status IS DISTINCT FROM 'Active')
  EXECUTE FUNCTION public.partner_approval_activates_login();

DROP TRIGGER IF EXISTS partner_approval_activates_login ON public.dealers;
CREATE TRIGGER partner_approval_activates_login
  AFTER UPDATE OF status ON public.dealers
  FOR EACH ROW WHEN (NEW.status = 'Active' AND OLD.status IS DISTINCT FROM 'Active')
  EXECUTE FUNCTION public.partner_approval_activates_login();

DROP TRIGGER IF EXISTS partner_approval_activates_login ON public.retailers;
CREATE TRIGGER partner_approval_activates_login
  AFTER UPDATE OF status ON public.retailers
  FOR EACH ROW WHEN (NEW.status = 'Active' AND OLD.status IS DISTINCT FROM 'Active')
  EXECUTE FUNCTION public.partner_approval_activates_login();


-- ── 4. Owner scoping for the roles that own accounts ────────────────────
CREATE OR REPLACE FUNCTION public.sees_account_row(p_owner text, p_creator text, p_partner_order boolean)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(public.my_role_level(), '') NOT IN ('sales', 'manager') THEN true
    WHEN NOT (public.can_edit('leads') OR public.can_edit('sfa')) THEN true
    WHEN public.my_role_level() = 'manager' THEN
         coalesce(p_partner_order, false)
      OR p_owner IS NULL
      OR public.can_see_rep(p_owner)
      OR (p_creator IS NOT NULL AND public.can_see_rep(p_creator))
    ELSE p_owner = public.my_user_id() OR p_creator = public.my_user_id()
  END IS TRUE
$$;

DROP POLICY IF EXISTS leads_select ON public.leads;
CREATE POLICY leads_select ON public.leads
  FOR SELECT TO authenticated
  USING (public.can_view('leads') AND public.sees_account_row("assignedTo", "createdBy", false));

DROP POLICY IF EXISTS leads_write ON public.leads;
CREATE POLICY leads_write ON public.leads
  FOR ALL TO authenticated
  USING      (public.can_edit('leads') AND public.sees_account_row("assignedTo", "createdBy", false))
  WITH CHECK (public.can_edit('leads') AND public.sees_account_row("assignedTo", "createdBy", false));

DROP POLICY IF EXISTS orders_select ON public.orders;
CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.can_view('orders')
    AND CASE WHEN public.is_partner()
             THEN public.owns_party_row("distributorId", "dealerId", "retailerId")
             ELSE public.sees_account_row("assignedTo", "createdBy",
                    coalesce("distributorId", "dealerId", "retailerId") IS NOT NULL)
        END
  );


-- ── 3. orders: partners raise, confirm receipt, cancel while Pending ────
DROP POLICY IF EXISTS orders_update ON public.orders;
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING      (public.can_edit('orders') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('orders') AND NOT public.is_partner());

-- A partner's new order: Pending, its own, priced here.
CREATE OR REPLACE FUNCTION public.orders_partner_order_rules()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_role  text := public.my_role_name();
  v_price text;
  line    jsonb;
  v_items jsonb := '[]'::jsonb;
  v_prod  public.products;
  v_qty   numeric;
  v_unit  numeric;
  v_value numeric := 0;
  v_total_qty numeric := 0;
BEGIN
  IF NOT coalesce(public.is_partner(), false) THEN
    RETURN NEW;
  END IF;

  v_price := CASE v_role
    WHEN 'Distributor' THEN 'distributorPrice'
    WHEN 'Dealer'      THEN 'dealerPrice'
    WHEN 'Retailer'    THEN 'retailerPrice' END;
  IF v_price IS NULL THEN
    RAISE EXCEPTION 'This account has no price list to order from.' USING ERRCODE = '42501';
  END IF;

  IF jsonb_typeof(NEW.items) IS DISTINCT FROM 'array' OR jsonb_array_length(NEW.items) = 0 THEN
    RAISE EXCEPTION 'An order needs at least one product.' USING ERRCODE = '23514';
  END IF;

  FOR line IN SELECT * FROM jsonb_array_elements(NEW.items) LOOP
    SELECT * INTO v_prod FROM public.products p
    WHERE lower(btrim(p.name)) = lower(btrim(line ->> 'name'))
    ORDER BY p.id LIMIT 1;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Product "%" is not on the price list.', line ->> 'name' USING ERRCODE = '23514';
    END IF;

    v_qty := nullif(line ->> 'quantity', '')::numeric;
    IF v_qty IS NULL OR v_qty <= 0 OR v_qty <> trunc(v_qty) THEN
      RAISE EXCEPTION 'Quantity for "%" must be a whole number above zero.', v_prod.name USING ERRCODE = '23514';
    END IF;

    v_unit := coalesce((to_jsonb(v_prod) ->> v_price)::numeric, 0);
    IF v_unit <= 0 THEN
      RAISE EXCEPTION '"%" has no % set, so it cannot be ordered yet.', v_prod.name, v_price USING ERRCODE = '23514';
    END IF;

    v_items := v_items || jsonb_build_object(
      'name', v_prod.name, 'quantity', v_qty, 'unitPrice', v_unit,
      'gstPct', coalesce(v_prod."gstPct", 0), 'total', v_qty * v_unit);
    v_value := v_value + v_qty * v_unit;
    v_total_qty := v_total_qty + v_qty;
  END LOOP;

  NEW.items    := v_items;
  NEW.value    := v_value;
  NEW.quantity := v_total_qty;
  NEW.status   := 'Pending';
  NEW."distributorId" := CASE WHEN v_role = 'Distributor' THEN public.my_distributor_id() END;
  NEW."dealerId"      := CASE WHEN v_role = 'Dealer'      THEN public.my_dealer_id() END;
  NEW."retailerId"    := CASE WHEN v_role = 'Retailer'    THEN public.my_retailer_id() END;
  NEW."createdBy"     := public.my_user_id();
  NEW."fulfilledAt"   := NULL;
  NEW."deliveredQty"  := NULL;
  NEW."receivedByDistributor" := false;
  NEW."receivedAt"    := NULL;
  NEW."receiptSource" := NULL;
  NEW."receiptRecordedBy" := NULL;
  NEW."receiptEvidence"   := NULL;
  NEW."receiptNote"   := NULL;
  NEW."leadId"        := NULL;
  NEW."splitFromOrderId" := NULL;
  NEW."splitIntoOrderId" := NULL;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.orders_partner_order_rules() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS orders_partner_order_rules ON public.orders;
CREATE TRIGGER orders_partner_order_rules
  BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_partner_order_rules();

-- A partner confirms its own order arrived.
CREATE OR REPLACE FUNCTION public.confirm_my_order_receipt(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_partner(), false)
     OR NOT public.owns_party_row(o."distributorId", o."dealerId", o."retailerId") THEN
    RAISE EXCEPTION 'Order % is not one of yours.', p_order_id USING ERRCODE = '42501';
  END IF;
  IF o.status = 'Cancelled' THEN
    RAISE EXCEPTION 'Order % was cancelled.', p_order_id USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.via', format('receipt confirmed for order %s', p_order_id), true);
  UPDATE public.orders
     SET "receivedByDistributor" = true, "receivedAt" = now(), "receiptSource" = 'partner'
   WHERE id = p_order_id;
END $$;

-- A partner cancels its own order while nobody has started on it.
CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_partner(), false)
     OR NOT public.owns_party_row(o."distributorId", o."dealerId", o."retailerId") THEN
    RAISE EXCEPTION 'Order % is not one of yours.', p_order_id USING ERRCODE = '42501';
  END IF;
  IF o.status IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'Order % is % and can no longer be cancelled here. Contact us to change it.', p_order_id, o.status
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.via', format('cancelled by the partner, order %s', p_order_id), true);
  UPDATE public.orders SET status = 'Cancelled' WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.confirm_my_order_receipt(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.cancel_my_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_order_receipt(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(text) TO authenticated;


-- ── 5. invoices: a partner's own orders only ────────────────────────────
DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.can_view('accounting')
    OR (public.is_partner() AND EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = invoices."orderId"
            AND public.owns_party_row(o."distributorId", o."dealerId", o."retailerId")))
  );


-- ── 6. The four tables that were open to everyone ───────────────────────
DROP POLICY IF EXISTS bank_transactions_signed_in ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_select ON public.bank_transactions;
DROP POLICY IF EXISTS bank_transactions_write ON public.bank_transactions;
CREATE POLICY bank_transactions_select ON public.bank_transactions
  FOR SELECT TO authenticated USING (public.can_view('accounting') AND NOT public.is_partner());
CREATE POLICY bank_transactions_write ON public.bank_transactions
  FOR ALL TO authenticated
  USING      (public.can_edit('accounting') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('accounting') AND NOT public.is_partner());

DROP POLICY IF EXISTS stock_transfers_signed_in ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_select ON public.stock_transfers;
DROP POLICY IF EXISTS stock_transfers_write ON public.stock_transfers;
CREATE POLICY stock_transfers_select ON public.stock_transfers
  FOR SELECT TO authenticated USING (public.can_view('inventory') AND NOT public.is_partner());
CREATE POLICY stock_transfers_write ON public.stock_transfers
  FOR ALL TO authenticated
  USING      (public.can_edit('inventory') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('inventory') AND NOT public.is_partner());

DROP POLICY IF EXISTS warehouses_signed_in ON public.warehouses;
DROP POLICY IF EXISTS warehouses_select ON public.warehouses;
DROP POLICY IF EXISTS warehouses_write ON public.warehouses;
CREATE POLICY warehouses_select ON public.warehouses
  FOR SELECT TO authenticated USING (public.can_view('inventory') AND NOT public.is_partner());
CREATE POLICY warehouses_write ON public.warehouses
  FOR ALL TO authenticated
  USING      (public.can_edit('inventory') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('inventory') AND NOT public.is_partner());

DROP POLICY IF EXISTS notifications_signed_in ON public.notifications;
DROP POLICY IF EXISTS notifications_select ON public.notifications;
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
DROP POLICY IF EXISTS notifications_update ON public.notifications;
DROP POLICY IF EXISTS notifications_delete ON public.notifications;
CREATE POLICY notifications_select ON public.notifications
  FOR SELECT TO authenticated USING ("userId" = public.my_user_id());
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (public.my_user_id() IS NOT NULL AND NOT public.is_partner());
CREATE POLICY notifications_update ON public.notifications
  FOR UPDATE TO authenticated
  USING ("userId" = public.my_user_id()) WITH CHECK ("userId" = public.my_user_id());
CREATE POLICY notifications_delete ON public.notifications
  FOR DELETE TO authenticated USING ("userId" = public.my_user_id());


NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('043_batch1_access_security.sql',
        'Batch 1: Inactive blocks access; own users row name-only; partner orders priced and limited in the DB; leads/orders owner-scoped for sales roles; invoices by order only; four open tables locked')
ON CONFLICT (filename) DO NOTHING;
