-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — per-role RLS, part 2 of 3: the five tables partners can reach.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  RUN RLS_1_FOUNDATION.sql FIRST. This file calls its functions.
--
--  THIS ONE CHANGES ACCESS. Read the two warnings below before running it.
--
--  WHAT IT CLOSES
--
--  Confirmed live on 2026-09-20:
--
--      orders | orders_signed_in | ALL | true | true
--
--  Every business table carries that. Any signed-in account reads and writes
--  every row through the API. One distributor can read another distributor's
--  orders, incentives, payments and claims by changing an id in a URL. The
--  screens hide it; the database does not.
--
--  These five are the tables where that matters most, because they are the
--  ones holding more than one party's data at once.
--
--  ── WARNING 1: partners write to tables they only "view" ────────────────
--
--  Distributor, Dealer and Retailer all hold orders: 'view'. Their portal
--  calls addOrder (INSERT) and confirmOrderReceipt (UPDATE) anyway.
--
--  So gating writes on can_edit('orders') -- which is what the permission
--  matrix literally says -- would stop every partner placing an order or
--  confirming a delivery. The matrix does not describe what partners actually
--  do. The orders policies below carry an explicit exception for that, scoped
--  to their own rows.
--
--  This is worth fixing properly in the application later: either partners
--  hold 'full' on orders, or the model grows a notion of "may act on their
--  own". Until then the exception is written here, in the open, rather than
--  left as a lockout to discover in production.
--
--  ── WARNING 2: test with a real partner login before trusting this ──────
--
--  There is no non-admin account whose password is known, so none of this has
--  been verified against an actual partner session -- only reasoned from the
--  policy text. Set a temporary password on dist@prismora.com in
--  Authentication → Users, sign in as them, and confirm:
--
--      · My Orders shows their orders and nobody else's
--      · placing an order still works
--      · confirming receipt still works
--      · Ledger, Claims and Incentives show only their own rows
--
--  If any of that fails, the rollback at the bottom of this file puts things
--  back exactly as they are now.
-- ════════════════════════════════════════════════════════════════════════


-- ── Does this row belong to the signed-in partner? ──────────────────────
-- Written as a function so the same question is asked the same way five
-- times. NULLs are handled explicitly: a partner with no party id, or a row
-- with no party, is not a match. `NULL = NULL` is NULL in SQL, and a policy
-- that returns NULL denies -- correct here, but only by luck, so it is made
-- deliberate instead.
CREATE OR REPLACE FUNCTION public.owns_party_row(p_dist text, p_dealer text, p_retail text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$
  SELECT (p_dist   IS NOT NULL AND p_dist   = public.my_distributor_id())
      OR (p_dealer IS NOT NULL AND p_dealer = public.my_dealer_id())
      OR (p_retail IS NOT NULL AND p_retail = public.my_retailer_id())
$$;


-- ════════════════════════════════════════════════════════════════════════
--  orders
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS orders_signed_in ON public.orders;
DROP POLICY IF EXISTS orders_select    ON public.orders;
DROP POLICY IF EXISTS orders_insert    ON public.orders;
DROP POLICY IF EXISTS orders_update    ON public.orders;
DROP POLICY IF EXISTS orders_delete    ON public.orders;

CREATE POLICY orders_select ON public.orders
  FOR SELECT TO authenticated
  USING (
    public.can_view('orders')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- The exception from warning 1: a partner may raise an order for themselves.
CREATE POLICY orders_insert ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit('orders')
    OR (public.is_partner()
        AND public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- And may confirm receipt of one. Row-level, not column-level: this does allow
-- a partner to change other fields on their own order through the API. Holding
-- that narrower needs a column grant or a stored procedure, which is a bigger
-- change than this file.
CREATE POLICY orders_update ON public.orders
  FOR UPDATE TO authenticated
  USING (
    public.can_edit('orders')
    OR (public.is_partner()
        AND public.owns_party_row("distributorId", "dealerId", "retailerId"))
  )
  WITH CHECK (
    public.can_edit('orders')
    OR (public.is_partner()
        AND public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- Deleting is staff only. No partner screen deletes an order.
CREATE POLICY orders_delete ON public.orders
  FOR DELETE TO authenticated
  USING (public.can_edit('orders') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  distributor_payments  — the ledger. Read-only to partners.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.distributor_payments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distributor_payments_signed_in ON public.distributor_payments;
DROP POLICY IF EXISTS distributor_payments_select    ON public.distributor_payments;
DROP POLICY IF EXISTS distributor_payments_write     ON public.distributor_payments;

CREATE POLICY distributor_payments_select ON public.distributor_payments
  FOR SELECT TO authenticated
  USING (
    public.can_view('ledger')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- Recording money received is the business's act, never the payer's.
CREATE POLICY distributor_payments_write ON public.distributor_payments
  FOR ALL TO authenticated
  USING      (public.can_edit('ledger') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('ledger') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  distributor_incentives  — partners see what they earned, change nothing.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.distributor_incentives ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distributor_incentives_signed_in ON public.distributor_incentives;
DROP POLICY IF EXISTS distributor_incentives_select    ON public.distributor_incentives;
DROP POLICY IF EXISTS distributor_incentives_write     ON public.distributor_incentives;

CREATE POLICY distributor_incentives_select ON public.distributor_incentives
  FOR SELECT TO authenticated
  USING (
    public.can_view('incentives')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

CREATE POLICY distributor_incentives_write ON public.distributor_incentives
  FOR ALL TO authenticated
  USING      (public.can_edit('incentives') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('incentives') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  scheme_claims  — partners hold claims:'full' and do submit their own.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.scheme_claims ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS scheme_claims_signed_in ON public.scheme_claims;
DROP POLICY IF EXISTS scheme_claims_select    ON public.scheme_claims;
DROP POLICY IF EXISTS scheme_claims_insert    ON public.scheme_claims;
DROP POLICY IF EXISTS scheme_claims_modify    ON public.scheme_claims;

CREATE POLICY scheme_claims_select ON public.scheme_claims
  FOR SELECT TO authenticated
  USING (
    public.can_view('claims')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

CREATE POLICY scheme_claims_insert ON public.scheme_claims
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit('claims')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- Approving and settling is the reviewer's act. A claimant approving their own
-- claim is the one thing this table must not allow.
CREATE POLICY scheme_claims_modify ON public.scheme_claims
  FOR UPDATE TO authenticated
  USING      (public.can_edit('claims') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('claims') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  complaints  — partners hold complaints:'full' and raise their own.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.complaints ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS complaints_signed_in ON public.complaints;
DROP POLICY IF EXISTS complaints_select    ON public.complaints;
DROP POLICY IF EXISTS complaints_insert    ON public.complaints;
DROP POLICY IF EXISTS complaints_modify    ON public.complaints;

CREATE POLICY complaints_select ON public.complaints
  FOR SELECT TO authenticated
  USING (
    public.can_view('complaints')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

CREATE POLICY complaints_insert ON public.complaints
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit('complaints')
    AND (NOT public.is_partner()
         OR public.owns_party_row("distributorId", "dealerId", "retailerId"))
  );

-- Resolving a complaint is support's act, not the complainant's.
CREATE POLICY complaints_modify ON public.complaints
  FOR UPDATE TO authenticated
  USING      (public.can_edit('complaints') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('complaints') AND NOT public.is_partner());


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT tablename, policyname, cmd
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  tablename IN ('orders','distributor_payments','distributor_incentives',
                     'scheme_claims','complaints')
ORDER  BY tablename, policyname;
-- Expected: no policy named *_signed_in remains on any of the five.
-- If one does, it is still granting everything to everyone: policies are
-- PERMISSIVE and Postgres ORs them together, so one survivor undoes the file.


/*
  ── invoices is deliberately not here ─────────────────────────────────────

  It has no distributorId, dealerId or retailerId. A partner's invoices are
  found by customerName, or through orderId into orders -- the same two-way
  match that hid a real bug in the ledger earlier.

  Scoping it needs a decision about which link is authoritative before a policy
  can be written, and guessing would either leak other parties' invoices or
  hide a partner's own. It stays open until that is settled.


  ── ROLLBACK ─────────────────────────────────────────────────────────────
  Puts all five back exactly as they are today. Use it if a partner login
  cannot do something it could before.

    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY['orders','distributor_payments',
                               'distributor_incentives','scheme_claims','complaints']
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_insert', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_update', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_delete', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_modify', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write',  t);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
          t || '_signed_in', t);
      END LOOP;
    END $$;
*/
