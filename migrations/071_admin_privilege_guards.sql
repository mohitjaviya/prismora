-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 7: admin privilege guards (Phase 2 story G findings).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 040 (audit), 043 (users_guard_self_edit).
--
--  WHAT WAS WRONG
--
--  1. users_update / roles policies only asked "is this an administrator?"
--     (settings = full). So an Admin, calling the database directly, could set
--     any user's role to Super Admin (themselves included), deactivate or
--     re-email a Super Admin account, or edit the Super Admin role. The screen
--     and the create-user function refused all of that; the database did not.
--  2. Deleting a user's profile left their sign-in behind: it still signed in,
--     with no profile and no role, and its e-mail could not be used again.
--  3. Nothing in the database stopped a role with Settings from removing
--     Settings from itself (the Roles screen did), leaving nobody able to give
--     it back.
--
--  WHAT THIS DOES
--
--  users_guard_privilege (BEFORE INSERT/UPDATE/DELETE on users), for what a
--  signed-in app user does — the service key (Edge functions) and database
--  maintenance are not app actions and pass:
--    · only a Super Admin may give anyone the role Super Admin, Admin or
--      Director (the same rule create-user applies to new accounts);
--    · only a Super Admin may change or delete an account that is a Super Admin;
--    · nobody may delete their own account;
--    · the last active Super Admin cannot be deleted, demoted or deactivated.
--  roles_guard_privilege (BEFORE UPDATE/DELETE on roles):
--    · only a Super Admin may change the Super Admin role, and nobody may
--      delete it, rename it or switch it off;
--    · a role holding Settings cannot, by anyone signed in under it, lose
--      Settings, be switched off, renamed or deleted (the screen's own rule).
--  users_delete_login (AFTER DELETE on users): the sign-in goes with the
--  profile, so the e-mail is free again and no login is left with no profile.
--
--  Existing rows are not changed.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.users_guard_privilege()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_other_super boolean;
BEGIN
  -- Server functions (service key) and database maintenance are not app users.
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_role := public.my_role_name();

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.role IN ('Super Admin', 'Admin', 'Director')
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
     AND v_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Only a Super Admin can give the role %.', NEW.role USING ERRCODE = '42501';
  END IF;

  IF TG_OP IN ('UPDATE', 'DELETE') AND OLD.role = 'Super Admin' THEN
    IF v_role IS DISTINCT FROM 'Super Admin' THEN
      RAISE EXCEPTION 'Only a Super Admin can change or delete a Super Admin account.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE'
       OR NEW.role IS DISTINCT FROM 'Super Admin'
       OR coalesce(NEW.status, 'Active') <> 'Active' THEN
      SELECT EXISTS (SELECT 1 FROM public.users u
                      WHERE u.role = 'Super Admin' AND coalesce(u.status, 'Active') = 'Active' AND u.id <> OLD.id)
        INTO v_other_super;
      IF NOT v_other_super THEN
        RAISE EXCEPTION 'This is the last active Super Admin. Make another one first.' USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF TG_OP = 'DELETE' AND OLD.id = public.my_user_id() THEN
    RAISE EXCEPTION 'You cannot delete your own account. Ask another administrator.' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS users_guard_privilege ON public.users;
CREATE TRIGGER users_guard_privilege
  BEFORE INSERT OR UPDATE OR DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_guard_privilege();

CREATE OR REPLACE FUNCTION public.roles_guard_privilege()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_role := public.my_role_name();

  IF OLD.id = 'Super Admin' THEN
    IF v_role IS DISTINCT FROM 'Super Admin' THEN
      RAISE EXCEPTION 'Only a Super Admin can change the Super Admin role.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR coalesce(NEW.active, true) = false THEN
      RAISE EXCEPTION 'The Super Admin role cannot be deleted, renamed or switched off.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Your own role keeps Settings: otherwise nobody could give it back.
  IF v_role IS NOT NULL AND OLD.id = v_role AND coalesce(OLD.permissions ->> 'settings', 'none') = 'full' THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'This is your own role. Deleting it would lock you out, and nobody could give access back.' USING ERRCODE = '42501';
    END IF;
    IF coalesce(NEW.permissions ->> 'settings', 'none') <> 'full'
       OR coalesce(NEW.active, true) = false OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'This is your own role. Taking away Settings, switching it off or renaming it would lock you out, and nobody could give it back.' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS roles_guard_privilege ON public.roles;
CREATE TRIGGER roles_guard_privilege
  BEFORE UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_guard_privilege();

-- The sign-in goes with the profile. Skipped while another profile still uses
-- the same e-mail.
CREATE OR REPLACE FUNCTION public.users_delete_login()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF OLD.email IS NOT NULL
     AND NOT EXISTS (SELECT 1 FROM public.users u WHERE lower(u.email) = lower(OLD.email) AND u.id <> OLD.id) THEN
    DELETE FROM auth.users WHERE lower(email) = lower(OLD.email);
  END IF;
  RETURN NULL;
END $$;

DROP TRIGGER IF EXISTS users_delete_login ON public.users;
CREATE TRIGGER users_delete_login
  AFTER DELETE ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_delete_login();

REVOKE ALL ON FUNCTION public.users_guard_privilege() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.roles_guard_privilege() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.users_delete_login() FROM PUBLIC, anon, authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('071_admin_privilege_guards.sql',
        'G findings: only a Super Admin grants Super Admin/Admin/Director or touches a Super Admin account/role; last Super Admin and own account cannot be deleted; a role cannot remove its own Settings; deleting a profile deletes its login')
ON CONFLICT (filename) DO NOTHING;
