-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — per-role RLS, part 1 of 3: the questions the policies ask.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  THIS FILE CHANGES NOBODY'S ACCESS. It creates functions and nothing else:
--  no policy is added, dropped or altered. Run it, read the report at the
--  bottom, and decide whether the answers are right before part 2 uses them.
--  That order matters -- a wrong policy locks the business out of its own
--  data, and this is the half that can be checked without that risk.
--
--  WHAT IT IS FOR
--
--  The permission matrix -- 15 roles against 21 modules -- lives in React and
--  is enforced nowhere else. Every business table currently carries
--  `FOR ALL TO authenticated USING (true) WITH CHECK (true)`, so any signed-in
--  account can read and write every row through the API regardless of role.
--  A retailer can read every other retailer's pricing; a sales executive can
--  read the ledger. The screens hide it; the API does not.
--
--  These functions let a policy ask the same questions the browser asks, with
--  the `roles` table as the single source of truth for both.
--
--  ONE MISMATCH TO SETTLE FIRST
--
--  is_app_admin(), from SECURE_RLS_POLICIES.sql, matches three hard-coded role
--  NAMES: 'Super Admin', 'Director', 'Admin'. The application decides admin by
--  the `level` column instead -- roleUtils.isAdminLevel(level === 'admin').
--
--  Today they agree. The moment somebody sets a new role to admin level in the
--  Roles screen they stop agreeing: the UI hands that role everything, the
--  database still refuses it. app_access() below follows the table, because
--  that is what the product treats as true. is_app_admin() is deliberately
--  left alone -- SECURE_ROLES_TABLE.sql uses it to protect `roles` itself, and
--  a check that reads the table it guards could be turned off by editing that
--  table. Keeping the two separate is the point.
-- ════════════════════════════════════════════════════════════════════════


-- ── Who is asking ───────────────────────────────────────────────────────
-- current_app_email() already exists, from SECURE_RLS_POLICIES.sql.
-- SECURITY DEFINER throughout: these read `users` and `roles` past RLS, which
-- they must, or a policy that called them would recurse into itself.

CREATE OR REPLACE FUNCTION public.my_role_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users
  WHERE lower(email) = public.current_app_email()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_role_level()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.level FROM public.roles r
  WHERE r.id = public.my_role_name()
    AND coalesce(r.active, true)
  LIMIT 1
$$;


-- ── What this account may do with one module ────────────────────────────
-- 'full', 'view' or 'none' -- the same three the screens use.
--
-- Fails closed at every step. No signed-in user, no matching role row, a role
-- switched off, a module missing from the permissions object: all 'none'. An
-- unreadable permission model must deny, never allow.
CREATE OR REPLACE FUNCTION public.app_access(p_module text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce((
    SELECT CASE
             WHEN r.level = 'admin' THEN 'full'
             ELSE coalesce(r.permissions ->> p_module, 'none')
           END
    FROM public.roles r
    WHERE r.id = public.my_role_name()
      AND coalesce(r.active, true)
    LIMIT 1
  ), 'none')
$$;

CREATE OR REPLACE FUNCTION public.can_view(p_module text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT public.app_access(p_module) IN ('view', 'full') $$;

CREATE OR REPLACE FUNCTION public.can_edit(p_module text)
RETURNS boolean
LANGUAGE sql STABLE
AS $$ SELECT public.app_access(p_module) = 'full' $$;


-- ── Which rows belong to this account ───────────────────────────────────
-- A module permission is not enough on its own. Distributor, Dealer and
-- Retailer all hold `orders: view` -- without these, that grant would let one
-- distributor read every other distributor's orders, which is the same hole
-- one level down.
--
-- Staff are not scoped by these: a sales manager is meant to see everybody's
-- orders. is_partner() is what tells the two apart.

CREATE OR REPLACE FUNCTION public.is_partner()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT coalesce(public.my_role_level() = 'partner', false) $$;

CREATE OR REPLACE FUNCTION public.my_distributor_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "distributorId" FROM public.users
  WHERE lower(email) = public.current_app_email()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_dealer_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "dealerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_retailer_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "retailerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
  LIMIT 1
$$;

/*
  ── The map part 2 will use ───────────────────────────────────────────────

  RLS gates tables; the permission model is written in modules. This is the
  join between them, and it is the part worth arguing with before any policy
  is written, because everything else follows from it.

    module        tables
    ───────────── ──────────────────────────────────────────────────────────
    leads         leads
    sfa           attendance, beat_plans, visit_reports, sfa_expenses
    orders        orders
    inventory     inventory
    purchases     purchase_orders, grn, purchase_returns, vendors,
                  vendor_payments
    accounting    invoices, credit_notes, expenses
    ledger        distributor_payments
    schemes       schemes
    claims        scheme_claims
    incentives    distributor_incentives
    complaints    complaints
    geography     territories
    distributors  distributors
    dealers       dealers
    retailers     retailers
    settings      masters, products, roles, users
    reports       events

  Three worth a decision rather than a default:

    products    sits under `settings` here, so only an administrator may edit
                the catalogue. But `priceList` is a module of its own that
                partners hold as 'view', and the price list is read from this
                table. Read must therefore be wider than write.

    events      the audit log. Nothing writes to it but the application, and
                `reports` is the closest module. Partners should almost
                certainly not read it at all -- it narrates the whole business.

    users       already protected by SECURE_RLS_POLICIES.sql (read open to any
                signed-in session, writes admin-only). Part 2 leaves it alone.
                Whether every employee should read every colleague's email is a
                separate question worth asking.
*/


-- ── Report: what each role would get, per module ────────────────────────
-- Read this against the Roles screen. If a line here disagrees with what that
-- screen shows, the disagreement is the bug -- find it before part 2.
SELECT r.id                AS role,
       r.level,
       coalesce(r.active, true) AS active,
       m.module,
       CASE WHEN r.level = 'admin' THEN 'full'
            ELSE coalesce(r.permissions ->> m.module, 'none') END AS access
FROM   public.roles r
CROSS  JOIN (VALUES
         ('leads'), ('sfa'), ('orders'), ('inventory'), ('purchases'),
         ('accounting'), ('ledger'), ('schemes'), ('claims'), ('incentives'),
         ('complaints'), ('geography'), ('distributors'), ('dealers'),
         ('retailers'), ('settings'), ('reports'), ('stock'), ('priceList'),
         ('customers'), ('dashboard')
       ) AS m(module)
WHERE  CASE WHEN r.level = 'admin' THEN 'full'
            ELSE coalesce(r.permissions ->> m.module, 'none') END <> 'none'
ORDER  BY r.level, r.id, m.module;
-- Expected: the admin roles (Super Admin, Director, Admin) show 'full' on all
-- 21. Partners show a short list -- dashboard, orders, schemes, complaints,
-- ledger, claims, incentives, stock, priceList. Nothing else should reach
-- accounting, settings or purchases.
