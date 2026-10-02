-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 7, correction to 071: the guards did not fire.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 071.
--
--  WHAT WAS WRONG
--
--  071's users_guard_privilege and roles_guard_privilege were declared
--  SECURITY DEFINER. Inside a definer function current_user is the function's
--  owner, never 'authenticated', so the line that lets the service key and
--  database maintenance through ("current_user NOT IN ('authenticated','anon')")
--  let EVERY caller through, and no rule applied. (users_guard_self_edit from
--  043 works because it is not a definer function.) Found when the Phase 2 G
--  tests, run against 071, still succeeded.
--
--  WHAT THIS DOES
--
--  Redefines both guards without SECURITY DEFINER, otherwise unchanged. They
--  read only what the caller may read: an administrator can read every user, and
--  the helpers they call (my_role_name, my_user_id) are definers themselves.
--  users_delete_login stays a definer: it needs to delete from auth.users and
--  has no caller test.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.users_guard_privilege()
RETURNS trigger
LANGUAGE plpgsql
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


INSERT INTO public.schema_migrations (filename, note)
VALUES ('072_admin_privilege_guards_fix.sql',
        'correction to 071: the guard functions were SECURITY DEFINER so their caller test never applied; now invoker functions')
ON CONFLICT (filename) DO NOTHING;
