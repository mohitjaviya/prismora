-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a sales executive sees their own field records, not the team's.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 034 (my_user_id).
--
--  WHAT IS WRONG
--
--  visit_reports, attendance, beat_plans and sfa_expenses were guarded by the
--  module alone: can_view('sfa') to read, can_edit('sfa') to write. Nothing
--  asked whose row it was. So a Sales Executive could read every other rep's
--  visit reports, attendance, beats and expense claims, and — the write side of
--  the same gap — change or delete them. The Visit Reports screen showed this
--  plainly; the other screens hid other reps' rows in the browser only, which
--  anyone signed in could step around by asking the API directly.
--
--  WHAT THIS DOES
--
--  One rule, the same one the app's canAccessData applies:
--
--    · admin level (Admin, Super Admin, Director) — everyone's rows
--    · manager level (Sales Manager, Manager)     — their own, and their
--                                                   team's (users.managedUsers)
--    · anyone else                                — their own only
--
--  applied to both reading and writing, on top of the module check that was
--  already there. A row belongs to its executiveId (visit_reports,
--  beat_plans) or userId (attendance, sfa_expenses).
--
--  Rows whose owner was removed (the id set to NULL by the foreign key) are
--  visible to admins only.
-- ════════════════════════════════════════════════════════════════════════

-- Whether the signed-in user may see a row owned by `p_owner`.
CREATE OR REPLACE FUNCTION public.can_see_rep(p_owner text)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE public.my_role_level()
    WHEN 'admin' THEN true
    WHEN 'manager' THEN p_owner = public.my_user_id()
      OR EXISTS (
        SELECT 1 FROM public.users me
        WHERE me.id = public.my_user_id()
          AND p_owner = ANY (me."managedUsers")
      )
    ELSE p_owner = public.my_user_id()
  END IS TRUE
$$;

-- ── visit_reports ───────────────────────────────────────────────────────
DROP POLICY IF EXISTS visit_reports_select ON public.visit_reports;
CREATE POLICY visit_reports_select ON public.visit_reports
  FOR SELECT TO authenticated
  USING (public.can_view('sfa') AND public.can_see_rep("executiveId"));

DROP POLICY IF EXISTS visit_reports_write ON public.visit_reports;
CREATE POLICY visit_reports_write ON public.visit_reports
  FOR ALL TO authenticated
  USING (public.can_edit('sfa') AND public.can_see_rep("executiveId"))
  WITH CHECK (public.can_edit('sfa') AND public.can_see_rep("executiveId"));

-- ── beat_plans ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS beat_plans_select ON public.beat_plans;
CREATE POLICY beat_plans_select ON public.beat_plans
  FOR SELECT TO authenticated
  USING (public.can_view('sfa') AND public.can_see_rep("executiveId"));

DROP POLICY IF EXISTS beat_plans_write ON public.beat_plans;
CREATE POLICY beat_plans_write ON public.beat_plans
  FOR ALL TO authenticated
  USING (public.can_edit('sfa') AND public.can_see_rep("executiveId"))
  WITH CHECK (public.can_edit('sfa') AND public.can_see_rep("executiveId"));

-- ── attendance ──────────────────────────────────────────────────────────
DROP POLICY IF EXISTS attendance_select ON public.attendance;
CREATE POLICY attendance_select ON public.attendance
  FOR SELECT TO authenticated
  USING (public.can_view('sfa') AND public.can_see_rep("userId"));

DROP POLICY IF EXISTS attendance_write ON public.attendance;
CREATE POLICY attendance_write ON public.attendance
  FOR ALL TO authenticated
  USING (public.can_edit('sfa') AND public.can_see_rep("userId"))
  WITH CHECK (public.can_edit('sfa') AND public.can_see_rep("userId"));

-- ── sfa_expenses ────────────────────────────────────────────────────────
DROP POLICY IF EXISTS sfa_expenses_select ON public.sfa_expenses;
CREATE POLICY sfa_expenses_select ON public.sfa_expenses
  FOR SELECT TO authenticated
  USING (public.can_view('sfa') AND public.can_see_rep("userId"));

DROP POLICY IF EXISTS sfa_expenses_write ON public.sfa_expenses;
CREATE POLICY sfa_expenses_write ON public.sfa_expenses
  FOR ALL TO authenticated
  USING (public.can_edit('sfa') AND public.can_see_rep("userId"))
  WITH CHECK (public.can_edit('sfa') AND public.can_see_rep("userId"));

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('035_sfa_own_rows.sql',
        'visit_reports, attendance, beat_plans, sfa_expenses: a rep sees and writes only their own rows, a manager their team''s, admins all')
ON CONFLICT (filename) DO NOTHING;
