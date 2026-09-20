-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — turn row-level security ON, with policies.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  RUN THIS ONLY AFTER SIGN-IN GOES THROUGH SUPABASE AUTH.
--  Every one of the 16 accounts must exist in Authentication → Users and be
--  able to log in. If they cannot, this will lock the app out of its own data.
--
--  What it fixes:
--    The browser talks to Supabase with the anon key, and that key ships
--    inside the deployed JavaScript. Until now that key could read the users
--    table — every password in plain text — and insert a Super Admin row.
--    Both were confirmed against this database.
--
--    After this, the anon key on its own can do nothing at all. Every request
--    must carry a signed-in session, and the database checks it rather than
--    trusting the browser.
--
--  What it does NOT do:
--    It does not reproduce the app's 12-role permission matrix in SQL. Any
--    signed-in employee can still reach any business row through the API, the
--    way they could through the UI if they edited it. That is a colleague with
--    a password, not the open internet, and it is the difference between a
--    locked building and an open one. Tightening per-role comes later; closing
--    the front door comes now.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Who is asking, and are they an administrator? ────────────────────
-- SECURITY DEFINER so these can read `users` without tripping the policies
-- defined on `users` further down — a policy that queried its own table
-- through RLS would recurse.
CREATE OR REPLACE FUNCTION public.current_app_email()
RETURNS text
LANGUAGE sql STABLE
AS $$ SELECT lower(auth.jwt() ->> 'email') $$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.users
    WHERE lower(email) = public.current_app_email()
      AND role IN ('Super Admin', 'Director', 'Admin')
  )
$$;

-- The role a row currently holds, read past RLS. Used to stop someone editing
-- their own profile into a promotion.
CREATE OR REPLACE FUNCTION public.stored_role(user_id text)
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$ SELECT role FROM public.users WHERE id = user_id $$;


-- ── 2. Every business table: signed-in only ─────────────────────────────
-- Looped over the catalogue rather than a written-out list, so a table added
-- later cannot be quietly left open the way sfa_expenses was left closed.
--
-- `users` and `roles` are excluded. Both decide who may do what, so a policy
-- letting any signed-in session write them hands out administrator rights:
-- accessFor() grants every module to any role whose level is 'admin', so one
-- PATCH of `roles` was enough. `users` is handled in section 3 below; `roles`
-- in SECURE_ROLES_TABLE.sql. Leaving them in this loop would undo both the
-- next time this file is run.
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT c.relname
    FROM   pg_class c
    WHERE  c.relnamespace = 'public'::regnamespace
      AND  c.relkind = 'r'
      AND  c.relname NOT IN ('users', 'roles')
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t.relname);
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.%I', t.relname || '_signed_in', t.relname);
    EXECUTE format(
      'CREATE POLICY %I ON public.%I FOR ALL TO authenticated USING (true) WITH CHECK (true)',
      t.relname || '_signed_in', t.relname
    );
    RAISE NOTICE 'secured %', t.relname;
  END LOOP;
END $$;


-- ── 3. users: read by anyone signed in, written only by an administrator ─
-- The app needs the list to fill assignment dropdowns and manager hierarchies,
-- so reading is open to a signed-in session. Writing is not: an employee who
-- could update this table could simply set their own role to Super Admin.
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read      ON public.users;
DROP POLICY IF EXISTS users_insert    ON public.users;
DROP POLICY IF EXISTS users_update    ON public.users;
DROP POLICY IF EXISTS users_delete    ON public.users;
DROP POLICY IF EXISTS users_signed_in ON public.users;

CREATE POLICY users_read ON public.users
  FOR SELECT TO authenticated
  USING (true);

-- An administrator adds anyone. Everyone else may create only their own
-- partner registration, only as a partner, and only as Pending — which is
-- exactly what the three self-signup forms do, and nothing more.
CREATE POLICY users_insert ON public.users
  FOR INSERT TO authenticated
  WITH CHECK (
    public.is_app_admin()
    OR (
      lower(email) = public.current_app_email()
      AND role IN ('Distributor', 'Dealer', 'Retailer')
      AND status = 'Pending'
    )
  );

-- You may edit your own profile, but not promote yourself: the role has to
-- come back the same as it went in. An administrator may change anyone.
CREATE POLICY users_update ON public.users
  FOR UPDATE TO authenticated
  USING (
    public.is_app_admin()
    OR lower(email) = public.current_app_email()
  )
  WITH CHECK (
    public.is_app_admin()
    OR (
      lower(email) = public.current_app_email()
      AND role = public.stored_role(id)
    )
  );

CREATE POLICY users_delete ON public.users
  FOR DELETE TO authenticated
  USING (public.is_app_admin());


-- ── 4. Confirm ──────────────────────────────────────────────────────────
-- 4a. Every table must have RLS on. This must return no rows.
SELECT relname AS table_without_rls
FROM   pg_class
WHERE  relnamespace = 'public'::regnamespace
  AND  relkind = 'r'
  AND  NOT relrowsecurity
ORDER  BY relname;

-- 4b. Nothing may be granted to anon. This must return no rows.
SELECT schemaname, tablename, policyname, roles
FROM   pg_policies
WHERE  schemaname = 'public'
  AND  'anon' = ANY (roles)
ORDER  BY tablename;

-- 4c. Every table should have at least one policy. Anything listed here is
--     locked to everybody, which is the state sfa_expenses was in.
SELECT c.relname AS table_with_no_policy
FROM   pg_class c
WHERE  c.relnamespace = 'public'::regnamespace
  AND  c.relkind = 'r'
  AND  NOT EXISTS (
         SELECT 1 FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname
       )
ORDER  BY c.relname;
