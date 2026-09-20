-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — close the privilege-escalation hole in `roles`.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run SECURE_RLS_POLICIES.sql first.
--
--  THE HOLE
--    SECURE_RLS_POLICIES.sql loops every table except `users` and gives each
--    one:  FOR ALL TO authenticated USING (true) WITH CHECK (true).
--    `roles` was in that loop.
--
--    roleUtils.accessFor() grants every module to any role whose level is
--    'admin', before it reads that role's permissions at all:
--
--        if (isAdminLevel(row.level)) return 'full';
--
--    So any signed-in user — a retailer, a sales executive — could send
--
--        PATCH /rest/v1/roles?id=eq.Retailer   {"level":"admin"}
--
--    and hold every permission in the application on their next page load.
--    The Roles screen gates this behind settings:'full', but the screen is
--    not what the database checks.
--
--  THE SHAPE, AND WHY
--    Reading stays open to anyone signed in: AuthContext fetches roles on
--    mount for every user, and permission resolution needs them. Deny the
--    read and every non-admin silently falls back to the compiled-in matrix,
--    so role edits would stop applying to exactly the people they restrict.
--
--    Writing goes to administrators only — the same is_app_admin() gate that
--    already protects `users`, and for the same reason: anyone who can write
--    this table can grant themselves anything.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE public.roles ENABLE ROW LEVEL SECURITY;

-- The blanket policy from SECURE_RLS_POLICIES.sql, by the name it gives it.
DROP POLICY IF EXISTS roles_signed_in ON public.roles;
DROP POLICY IF EXISTS roles_read      ON public.roles;
DROP POLICY IF EXISTS roles_insert    ON public.roles;
DROP POLICY IF EXISTS roles_update    ON public.roles;
DROP POLICY IF EXISTS roles_delete    ON public.roles;


-- ── Read: anyone signed in ──────────────────────────────────────────────
CREATE POLICY roles_read ON public.roles
  FOR SELECT TO authenticated
  USING (true);

-- ── Write: administrators only ──────────────────────────────────────────
CREATE POLICY roles_insert ON public.roles
  FOR INSERT TO authenticated
  WITH CHECK (public.is_app_admin());

CREATE POLICY roles_update ON public.roles
  FOR UPDATE TO authenticated
  USING (public.is_app_admin())
  WITH CHECK (public.is_app_admin());

CREATE POLICY roles_delete ON public.roles
  FOR DELETE TO authenticated
  USING (public.is_app_admin());


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'roles'
ORDER  BY policyname;
-- Expected: exactly four rows — roles_read (SELECT, true), and
-- roles_insert / roles_update / roles_delete, each gated on is_app_admin().
-- If roles_signed_in is still listed, this script did not take.
