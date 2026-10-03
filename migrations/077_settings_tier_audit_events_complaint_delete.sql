-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 11: permissions and audit events.
--  Apply: npx -y supabase@2.117.0 db query --linked --project-ref qvckvvckkfvelhnxmmvp -f migrations/077_...sql
--  Safe to run more than once. Needs 071/072.
--
--  1. SETTINGS = FULL IS ADMIN TIER
--     Settings = full lets a role create users and edit every role, so it makes
--     its holders administrators. 071/072 kept Super Admin/Admin/Director for a
--     Super Admin, but an Admin could still give Settings = full to any role (or
--     create a new role with it, as the guard did not run on INSERT), and then
--     give that role to anyone. Now, for anyone but a Super Admin:
--       - giving or taking Settings = full on a role is refused (insert, update,
--         delete of a role that has it);
--       - giving a user a role that has Settings = full is refused, whatever its
--         name (same tier as Admin/Director).
--
--  2. EVERY ROLE'S ACTIONS ARE LOGGED
--     events_insert needed Reports = full, so Sales Executive, partners,
--     Dispatch, Warehouse, Purchase Manager, Customer Support ... got a silent
--     403 on every event. Now any active signed-in user may add an event.
--     Money events stay limited to those who could already write them or can
--     view Accounting (same rule as reading them). The new "actorEmail" column
--     and the timestamp are set by the database, so an event cannot be written
--     in someone else's name or back-dated. Reading, editing and deleting
--     events are unchanged (Reports permission), so for everyone else the log is
--     add-only.
--
--  3. COMPLAINT DELETE
--     complaints had no DELETE policy: a delete removed nothing (RLS returns 0
--     rows, no error) while the screen hid the row. Owner's decision: only Super
--     Admin and Admin delete complaints.
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Settings = full is admin tier ────────────────────────────────────

-- Whether a role (by name) has Settings = full. Definer so the users guard can
-- ask about any role whatever the caller may read; no caller test inside.
CREATE OR REPLACE FUNCTION public.role_has_full_settings(p_role text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.roles r
                  WHERE r.id = p_role AND coalesce(r.permissions ->> 'settings', 'none') = 'full')
$$;

REVOKE ALL ON FUNCTION public.role_has_full_settings(text) FROM public;
GRANT EXECUTE ON FUNCTION public.role_has_full_settings(text) TO authenticated, service_role;

-- 072's users guard, with "or any role that has Settings = full" added to the
-- Super-Admin-only list. Invoker function (see 072), otherwise unchanged.
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
     AND (TG_OP = 'INSERT' OR NEW.role IS DISTINCT FROM OLD.role)
     AND v_role IS DISTINCT FROM 'Super Admin' THEN
    IF NEW.role IN ('Super Admin', 'Admin', 'Director') THEN
      RAISE EXCEPTION 'Only a Super Admin can give the role %.', NEW.role USING ERRCODE = '42501';
    END IF;
    IF public.role_has_full_settings(NEW.role) THEN
      RAISE EXCEPTION 'Only a Super Admin can give the role % — it has full Settings access, which makes its holders administrators.', NEW.role USING ERRCODE = '42501';
    END IF;
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

-- 072's roles guard, now also on INSERT, plus the Settings = full rule.
CREATE OR REPLACE FUNCTION public.roles_guard_privilege()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_role text;
  v_old_full boolean := false;
  v_new_full boolean := false;
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;
  v_role := public.my_role_name();
  IF TG_OP <> 'INSERT' THEN v_old_full := coalesce(OLD.permissions ->> 'settings', 'none') = 'full'; END IF;
  IF TG_OP <> 'DELETE' THEN v_new_full := coalesce(NEW.permissions ->> 'settings', 'none') = 'full'; END IF;

  IF TG_OP <> 'INSERT' AND OLD.id = 'Super Admin' THEN
    IF v_role IS DISTINCT FROM 'Super Admin' THEN
      RAISE EXCEPTION 'Only a Super Admin can change the Super Admin role.' USING ERRCODE = '42501';
    END IF;
    IF TG_OP = 'DELETE' OR NEW.id <> OLD.id OR coalesce(NEW.active, true) = false THEN
      RAISE EXCEPTION 'The Super Admin role cannot be deleted, renamed or switched off.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Your own role keeps Settings: otherwise nobody could give it back.
  IF TG_OP <> 'INSERT' AND v_role IS NOT NULL AND OLD.id = v_role AND v_old_full THEN
    IF TG_OP = 'DELETE' THEN
      RAISE EXCEPTION 'This is your own role. Deleting it would lock you out, and nobody could give access back.' USING ERRCODE = '42501';
    END IF;
    IF NOT v_new_full OR coalesce(NEW.active, true) = false OR NEW.id <> OLD.id THEN
      RAISE EXCEPTION 'This is your own role. Taking away Settings, switching it off or renaming it would lock you out, and nobody could give it back.' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Settings = full makes a role's holders administrators: only a Super Admin
  -- gives it, takes it away, or deletes a role that has it.
  IF v_new_full IS DISTINCT FROM v_old_full AND v_role IS DISTINCT FROM 'Super Admin' THEN
    RAISE EXCEPTION 'Only a Super Admin can give or take away full Settings access — it makes the role''s holders administrators.' USING ERRCODE = '42501';
  END IF;

  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $$;

DROP TRIGGER IF EXISTS roles_guard_privilege ON public.roles;
CREATE TRIGGER roles_guard_privilege
  BEFORE INSERT OR UPDATE OR DELETE ON public.roles
  FOR EACH ROW EXECUTE FUNCTION public.roles_guard_privilege();

-- ── 2. Audit events from every role ─────────────────────────────────────

ALTER TABLE public.events ADD COLUMN IF NOT EXISTS "actorEmail" text;

-- Who and when come from the database for app users, never the browser.
-- Invoker (see 072): the caller test must see the real caller.
CREATE OR REPLACE FUNCTION public.events_stamp_actor()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    NEW."actorEmail" := coalesce(NEW."actorEmail", public.current_app_email());
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    NEW."actorEmail" := public.current_app_email();
    NEW."timestamp" := now();
  ELSE
    NEW."actorEmail" := OLD."actorEmail";
    NEW."timestamp" := OLD."timestamp";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS events_stamp_actor ON public.events;
CREATE TRIGGER events_stamp_actor
  BEFORE INSERT OR UPDATE ON public.events
  FOR EACH ROW EXECUTE FUNCTION public.events_stamp_actor();

DROP POLICY IF EXISTS events_insert ON public.events;
CREATE POLICY events_insert ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (
    public.my_role_name() IS NOT NULL
    AND (NOT public.is_money_event(type) OR public.can_edit('reports') OR public.can_view('accounting'))
  );

-- ── 3. Complaint delete: Super Admin and Admin ──────────────────────────

DROP POLICY IF EXISTS complaints_delete ON public.complaints;
CREATE POLICY complaints_delete ON public.complaints
  FOR DELETE TO authenticated
  USING (public.my_role_name() IN ('Super Admin', 'Admin'));


INSERT INTO public.schema_migrations (filename, note)
VALUES ('077_settings_tier_audit_events_complaint_delete.sql',
        'batch 11: Settings=full grant/assign is Super Admin only (roles guard on INSERT too); events insert for every active user with DB-stamped actorEmail/timestamp; complaints DELETE for Super Admin/Admin')
ON CONFLICT (filename) DO NOTHING;
