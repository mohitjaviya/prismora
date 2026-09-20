-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — per-role RLS, part 3 of 3: everything parts 1 and 2 left open.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  RUN RLS_1_FOUNDATION.sql AND RLS_2_PARTNER_SCOPED.sql FIRST.
--
--  WHAT IS STILL OPEN, measured as a signed-in Distributor after part 2:
--
--      distributors   3 rows   competitors' names and outstanding balances
--      dealers        5 rows   the whole dealer network
--      retailers      8 rows   the whole retailer network
--      invoices       8 rows   every party's invoices
--      products      24 rows   including distributorPrice -- wholesale margin
--      events         5 rows   the audit log, narrating the entire business
--      users          5 rows   every colleague's name, email and role
--
--  ── THE TRAP IN THIS FILE ───────────────────────────────────────────────
--
--  Partners hold distributors:'none', dealers:'none', retailers:'none'. Gating
--  on can_view alone would therefore hide a partner's own party record from
--  them -- and DistributorOrders opens with
--
--      distributors.find(d => d.id === user.distributorId)
--
--  so their portal would render with no company, no territory and no credit
--  limit. Same shape as the orders exception in part 2: the matrix describes
--  what a role may administer, not what it may see about itself.
--
--  Each of the three carries an explicit "or it is your own row" clause.
-- ════════════════════════════════════════════════════════════════════════


-- ════════════════════════════════════════════════════════════════════════
--  The three party tables: administered by staff, and each partner sees
--  exactly one row -- their own.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.distributors ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS distributors_signed_in ON public.distributors;
DROP POLICY IF EXISTS distributors_select    ON public.distributors;
DROP POLICY IF EXISTS distributors_write     ON public.distributors;

CREATE POLICY distributors_select ON public.distributors
  FOR SELECT TO authenticated
  USING (public.can_view('distributors')
         OR (public.is_partner() AND id = public.my_distributor_id()));

CREATE POLICY distributors_write ON public.distributors
  FOR ALL TO authenticated
  USING      (public.can_edit('distributors') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('distributors') AND NOT public.is_partner());


ALTER TABLE public.dealers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS dealers_signed_in ON public.dealers;
DROP POLICY IF EXISTS dealers_select    ON public.dealers;
DROP POLICY IF EXISTS dealers_write     ON public.dealers;

-- A distributor also sees the dealers beneath them: that is their own network,
-- and the hierarchy is the business they run.
CREATE POLICY dealers_select ON public.dealers
  FOR SELECT TO authenticated
  USING (public.can_view('dealers')
         OR (public.is_partner()
             AND (id = public.my_dealer_id()
                  OR "parentDistributorId" = public.my_distributor_id())));

CREATE POLICY dealers_write ON public.dealers
  FOR ALL TO authenticated
  USING      (public.can_edit('dealers') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('dealers') AND NOT public.is_partner());


ALTER TABLE public.retailers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS retailers_signed_in ON public.retailers;
DROP POLICY IF EXISTS retailers_select    ON public.retailers;
DROP POLICY IF EXISTS retailers_write     ON public.retailers;

CREATE POLICY retailers_select ON public.retailers
  FOR SELECT TO authenticated
  USING (public.can_view('retailers')
         OR (public.is_partner()
             AND (id = public.my_retailer_id()
                  OR "parentDealerId" = public.my_dealer_id())));

CREATE POLICY retailers_write ON public.retailers
  FOR ALL TO authenticated
  USING      (public.can_edit('retailers') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('retailers') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  invoices — the one with no party column on it at all.
--
--  A partner's invoices are found two ways, and the application uses both:
--  through orderId into orders, or by customerName against the party's name.
--  Matching on only one of them hid a real bug in the ledger earlier this
--  month, so both are here.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.invoices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS invoices_signed_in ON public.invoices;
DROP POLICY IF EXISTS invoices_select    ON public.invoices;
DROP POLICY IF EXISTS invoices_write     ON public.invoices;

CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.can_view('accounting')
    OR (public.is_partner() AND (
          EXISTS (SELECT 1 FROM public.orders o
                  WHERE o.id = invoices."orderId"
                    AND public.owns_party_row(o."distributorId", o."dealerId", o."retailerId"))
       OR invoices."customerName" = (SELECT d.name FROM public.distributors d WHERE d.id = public.my_distributor_id())
       OR invoices."customerName" = (SELECT d.name FROM public.dealers      d WHERE d.id = public.my_dealer_id())
       OR invoices."customerName" = (SELECT r.name FROM public.retailers    r WHERE r.id = public.my_retailer_id())
    ))
  );

-- Raising and settling an invoice is the business's act, never the payer's.
CREATE POLICY invoices_write ON public.invoices
  FOR ALL TO authenticated
  USING      (public.can_edit('accounting') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('accounting') AND NOT public.is_partner());


-- ════════════════════════════════════════════════════════════════════════
--  products — read by the price list, written by master data.
--
--  Read and write deliberately sit on different modules. Partners hold
--  priceList:'view' and the Price List screen reads this table, so read has to
--  be wider than write or the screen empties.
--
--  LIMIT WORTH KNOWING: row-level security cannot hide a column. A partner who
--  can read this table reads distributorPrice, dealerPrice and retailerPrice
--  together -- so a retailer can see the distributor's buying price and work
--  out the margin above them. Closing that needs a view exposing only the tier
--  that applies, which is an application change, not a policy.
-- ════════════════════════════════════════════════════════════════════════
ALTER TABLE public.products ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS products_signed_in ON public.products;
DROP POLICY IF EXISTS products_select    ON public.products;
DROP POLICY IF EXISTS products_write     ON public.products;

CREATE POLICY products_select ON public.products
  FOR SELECT TO authenticated
  USING (public.can_view('priceList') OR public.can_view('settings') OR public.can_view('inventory'));

CREATE POLICY products_write ON public.products
  FOR ALL TO authenticated
  USING      (public.can_edit('settings'))
  WITH CHECK (public.can_edit('settings'));


-- ════════════════════════════════════════════════════════════════════════
--  Everything else: one module, one table, no partner ever.
--
--  Looped rather than written out, so the pattern is visibly the same for all
--  of them and a table cannot be given a quietly different rule by accident.
-- ════════════════════════════════════════════════════════════════════════
DO $$
DECLARE t record;
BEGIN
  FOR t IN SELECT * FROM (VALUES
      ('leads',            'leads'),
      ('attendance',       'sfa'),
      ('beat_plans',       'sfa'),
      ('visit_reports',    'sfa'),
      ('sfa_expenses',     'sfa'),
      ('inventory',        'inventory'),
      ('purchase_orders',  'purchases'),
      ('grn',              'purchases'),
      ('purchase_returns', 'purchases'),
      ('vendors',          'purchases'),
      ('vendor_payments',  'purchases'),
      ('credit_notes',     'accounting'),
      ('expenses',         'accounting'),
      ('territories',      'geography'),
      ('masters',          'settings'),
      ('events',           'reports')
    ) AS x(tbl, module)
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tbl || '_signed_in', t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tbl || '_select',    t.tbl);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.tbl || '_write',     t.tbl);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR SELECT TO authenticated USING (public.can_view(%L))',
      t.tbl || '_select', t.tbl, t.module);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (public.can_edit(%L)) WITH CHECK (public.can_edit(%L))',
      t.tbl || '_write', t.tbl, t.module, t.module);
    RAISE NOTICE 'scoped % to module %', t.tbl, t.module;
  END LOOP;
END $$;


-- schemes is the exception in that list: partners hold schemes:'view' and are
-- meant to see them, because a scheme is an offer being made to them.
ALTER TABLE public.schemes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS schemes_signed_in ON public.schemes;
DROP POLICY IF EXISTS schemes_select    ON public.schemes;
DROP POLICY IF EXISTS schemes_write     ON public.schemes;

CREATE POLICY schemes_select ON public.schemes
  FOR SELECT TO authenticated
  USING (public.can_view('schemes'));

CREATE POLICY schemes_write ON public.schemes
  FOR ALL TO authenticated
  USING      (public.can_edit('schemes') AND NOT public.is_partner())
  WITH CHECK (public.can_edit('schemes') AND NOT public.is_partner());


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT tablename,
       count(*) FILTER (WHERE policyname LIKE '%_signed_in') AS blanket_left,
       count(*)                                             AS policies
FROM   pg_policies
WHERE  schemaname = 'public'
GROUP  BY tablename
ORDER  BY blanket_left DESC, tablename;
-- Expected: blanket_left is 0 on every row. Any table still showing 1 is still
-- granting everything to everyone -- policies are PERMISSIVE and Postgres ORs
-- them together, so a single survivor undoes the table it sits on.


/*
  ── LEFT ALONE ON PURPOSE ────────────────────────────────────────────────

  users   SECURE_RLS_POLICIES.sql opened reads to every signed-in session, and
          AuthContext loads the whole table on sign-in to build the assignment
          and manager dropdowns. Narrowing it is right -- a distributor has no
          business reading staff emails -- but it risks emptying something in
          the application, and that needs testing rather than a guess in this
          file. It is the last thing still wide open.

  ── THE SIGNUP PAGES ARE ALREADY BROKEN, BEFORE ANY OF THIS ──────────────

  /register-dealer reads `distributors` to fill its parent dropdown, and
  /register-retailer reads `dealers`. Both pages run signed-out, on the anon
  key, and anon has been unable to read any table since SECURE_RLS_POLICIES.sql
  ran -- confirmed by probe: all 29 tables return zero rows anonymously.

  So those dropdowns are empty today and nothing here changed that. Fixing it
  needs a deliberate anon-readable projection -- id and name only, nothing
  else -- rather than reopening the tables.


  ── ROLLBACK ─────────────────────────────────────────────────────────────

    DO $$
    DECLARE t text;
    BEGIN
      FOREACH t IN ARRAY ARRAY['distributors','dealers','retailers','invoices',
        'products','leads','attendance','beat_plans','visit_reports','sfa_expenses',
        'inventory','purchase_orders','grn','purchase_returns','vendors',
        'vendor_payments','credit_notes','expenses','territories','masters',
        'events','schemes']
      LOOP
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_select', t);
        EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t || '_write',  t);
        EXECUTE format(
          'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
          t || '_signed_in', t);
      END LOOP;
    END $$;
*/
