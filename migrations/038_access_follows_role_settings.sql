-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a role may do what its settings say, and no more.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 037 (role_grants).
--
--  WHAT WAS WRONG
--
--  Two functions granted access for being an administrator rather than for
--  what the role was set to:
--
--    · app_access() — which every can_view()/can_edit() check reads — answered
--      'full' for any admin-level role, for every module, without looking at
--      the role's permissions. Admin level is Super Admin, Admin and Director.
--      Director is set to view-only in 14 modules and none in 4 (ledger,
--      price list, settings, stock), and got full in all 21.
--
--    · is_app_admin() — which guards writing the users and roles tables —
--      named 'Super Admin', 'Director' and 'Admin' outright. So Director, set
--      to no Settings access at all, could edit any account, including its
--      own role.
--
--  WHAT THIS DOES
--
--    · app_access() returns the role's own setting for the module. The one
--      exception is Super Admin, which always has everything, so there is
--      always an account that can undo a bad permission change. Admin's row is
--      full everywhere, so it keeps exactly what it had.
--
--    · is_app_admin() means "may manage users and roles", which is what the
--      Settings module governs (Team Members and Roles & Permissions are both
--      Settings screens): app_access('settings') = 'full'.
--
--    · role_grants() (037) becomes the same answer as app_access(); it existed
--      only because app_access() could not be trusted for Director.
--
--  WHAT DOES NOT CHANGE
--
--  Level still decides whose records a role sees: can_see_rep() and the app's
--  canAccessData() give admin level everyone's rows. That is scope, not
--  permission — Director still sees every rep's field records, read-only.
--  Every role that is not admin level already got exactly its settings.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_access(p_module text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT CASE
             WHEN r.id = 'Super Admin' THEN 'full'
             WHEN r.permissions ->> p_module IN ('full', 'view') THEN r.permissions ->> p_module
             ELSE 'none'
           END
    FROM public.roles r
    WHERE r.id = public.my_role_name()
      AND coalesce(r.active, true)
    LIMIT 1
  ), 'none')
$$;

CREATE OR REPLACE FUNCTION public.is_app_admin()
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.app_access('settings') = 'full' $$;

CREATE OR REPLACE FUNCTION public.role_grants(p_module text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$ SELECT public.app_access(p_module) $$;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('038_access_follows_role_settings.sql',
        'app_access follows each role''s settings (Super Admin excepted); is_app_admin = settings full; Director no longer full everywhere')
ON CONFLICT (filename) DO NOTHING;
