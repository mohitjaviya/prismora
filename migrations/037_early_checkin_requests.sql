-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a beat is worked on its date; earlier needs an approved request.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 034 (my_user_id) and 035 (can_see_rep).
--
--  WHAT WAS WRONG
--
--  Nothing tied a check-in to the beat's date. A beat planned for the 22nd was
--  checked into on the 21st, and a beat whose day had passed could still be
--  worked as though it had not.
--
--  WHAT THIS DOES
--
--    · On the beat's date, checking in is as before.
--    · Before it, a visit is refused unless the rep has an early check-in
--      request for that beat, made today and approved. An approval is good for
--      the day it was asked on only; an undecided request lapses the same way.
--    · After it, the beat is Missed: its outlets can no longer be recorded.
--      (Logging a missed beat late is a separate policy, not yet designed.)
--
--  WHO DECIDES
--
--  Whoever may see the rep's field records (can_see_rep, from 035) and whose
--  role is set to full SFA access: an admin for anyone, a manager for their
--  own team. Director can see requests but is set to view-only SFA, so does not
--  decide them — read from the role itself (role_grants), because can_edit()
--  counts every admin-level role as full. Nobody decides their own.
--
--  "TODAY"
--
--  app_today() is the date in India (Asia/Kolkata). The server's own clock is
--  UTC, whose date runs 5½ hours behind until morning — the same mistake the
--  app was making in the browser.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.app_today()
RETURNS date
LANGUAGE sql
STABLE
AS $$ SELECT (now() AT TIME ZONE 'Asia/Kolkata')::date $$;

-- ── The requests ────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.beat_checkin_requests (
  id              text PRIMARY KEY,
  "beatId"        text NOT NULL REFERENCES public.beat_plans(id) ON DELETE CASCADE,
  "requestedBy"   text NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  "requestedFor"  date NOT NULL,
  reason          text NOT NULL CHECK (length(btrim(reason)) > 0),
  status          text NOT NULL DEFAULT 'Pending' CHECK (status IN ('Pending', 'Approved', 'Rejected')),
  "decidedBy"     text REFERENCES public.users(id) ON DELETE SET NULL,
  "decidedAt"     timestamptz,
  "decisionNote"  text,
  "createdAt"     timestamptz NOT NULL DEFAULT now()
);

-- One undecided request per beat per day.
CREATE UNIQUE INDEX IF NOT EXISTS beat_checkin_requests_one_open
  ON public.beat_checkin_requests ("beatId", "requestedFor") WHERE status = 'Pending';
CREATE INDEX IF NOT EXISTS beat_checkin_requests_beat ON public.beat_checkin_requests ("beatId");

ALTER TABLE public.beat_checkin_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS beat_checkin_requests_select ON public.beat_checkin_requests;
CREATE POLICY beat_checkin_requests_select ON public.beat_checkin_requests
  FOR SELECT TO authenticated
  USING (public.can_view('sfa') AND public.can_see_rep("requestedBy"));

-- A rep asks for themselves, for today, on their own beat whose date is still
-- ahead, and undecided.
DROP POLICY IF EXISTS beat_checkin_requests_insert ON public.beat_checkin_requests;
CREATE POLICY beat_checkin_requests_insert ON public.beat_checkin_requests
  FOR INSERT TO authenticated
  WITH CHECK (
    public.can_edit('sfa')
    AND "requestedBy" = public.my_user_id()
    AND "requestedFor" = public.app_today()
    AND status = 'Pending'
    AND "decidedBy" IS NULL AND "decidedAt" IS NULL
    AND EXISTS (
      SELECT 1 FROM public.beat_plans b
      WHERE b.id = "beatId"
        AND b."executiveId" = public.my_user_id()
        AND b.date > public.app_today()
    )
  );

-- What the signed-in user's role is actually granted for a module, as set on
-- the role. can_edit() is not enough here: app_access() treats every admin-
-- level role as 'full' everywhere, which would let Director — admin level, but
-- view-only for SFA — approve.
CREATE OR REPLACE FUNCTION public.role_grants(p_module text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce((
    SELECT r.permissions ->> p_module FROM public.roles r
    WHERE r.id = public.my_role_name() AND coalesce(r.active, true)
    LIMIT 1
  ), 'none')
$$;

-- An approver decides a request that is still open today, and signs it.
DROP POLICY IF EXISTS beat_checkin_requests_decide ON public.beat_checkin_requests;
CREATE POLICY beat_checkin_requests_decide ON public.beat_checkin_requests
  FOR UPDATE TO authenticated
  USING (
    public.role_grants('sfa') = 'full'
    AND public.my_role_level() IN ('admin', 'manager')
    AND public.can_see_rep("requestedBy")
    AND "requestedBy" IS DISTINCT FROM public.my_user_id()
    AND status = 'Pending'
    AND "requestedFor" = public.app_today()
  )
  WITH CHECK (
    status IN ('Approved', 'Rejected')
    AND "decidedBy" = public.my_user_id()
  );

-- A decision changes the decision and nothing else: not what was asked, by
-- whom, for which beat or which day.
CREATE OR REPLACE FUNCTION public.beat_checkin_requests_freeze()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW."beatId" IS DISTINCT FROM OLD."beatId"
     OR NEW."requestedBy" IS DISTINCT FROM OLD."requestedBy"
     OR NEW."requestedFor" IS DISTINCT FROM OLD."requestedFor"
     OR NEW.reason IS DISTINCT FROM OLD.reason
     OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
    RAISE EXCEPTION 'A check-in request cannot be changed once made, only approved or rejected.';
  END IF;
  NEW."decidedAt" := coalesce(NEW."decidedAt", now());
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS beat_checkin_requests_freeze ON public.beat_checkin_requests;
CREATE TRIGGER beat_checkin_requests_freeze
  BEFORE UPDATE ON public.beat_checkin_requests
  FOR EACH ROW EXECUTE FUNCTION public.beat_checkin_requests_freeze();

-- ── The window itself ───────────────────────────────────────────────────
-- Why a rep may not record an outlet on this beat today, or NULL if they may.
CREATE OR REPLACE FUNCTION public.beat_closed_reason(p_beat text, p_rep text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  d date;
BEGIN
  SELECT b.date INTO d FROM public.beat_plans b WHERE b.id = p_beat;
  IF d IS NULL OR d = public.app_today() THEN
    RETURN NULL;
  END IF;
  IF d < public.app_today() THEN
    RETURN format('This beat was on %s and has been missed. It can no longer be checked into.', d);
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.beat_checkin_requests r
    WHERE r."beatId" = p_beat AND r."requestedBy" = p_rep
      AND r."requestedFor" = public.app_today() AND r.status = 'Approved'
  ) THEN
    RETURN NULL;
  END IF;
  RETURN format('This beat is for %s. Checking in before then needs an early check-in request approved today.', d);
END $$;

CREATE OR REPLACE FUNCTION public.visit_reports_beat_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  why text;
BEGIN
  IF NEW."beatId" IS NULL THEN
    RETURN NEW;
  END IF;
  why := public.beat_closed_reason(NEW."beatId", NEW."executiveId");
  IF why IS NOT NULL THEN
    RAISE EXCEPTION '%', why USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS visit_reports_beat_window ON public.visit_reports;
CREATE TRIGGER visit_reports_beat_window
  BEFORE INSERT ON public.visit_reports
  FOR EACH ROW EXECUTE FUNCTION public.visit_reports_beat_window();

-- Recording an outlet's outcome on the beat itself is held to the same window.
CREATE OR REPLACE FUNCTION public.beat_plans_outlet_window()
RETURNS trigger
LANGUAGE plpgsql
AS $$
DECLARE
  why text;
BEGIN
  IF NEW."outletVisits" IS NOT DISTINCT FROM OLD."outletVisits" THEN
    RETURN NEW;
  END IF;
  why := public.beat_closed_reason(NEW.id, NEW."executiveId");
  IF why IS NOT NULL THEN
    RAISE EXCEPTION '%', why USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS beat_plans_outlet_window ON public.beat_plans;
CREATE TRIGGER beat_plans_outlet_window
  BEFORE UPDATE ON public.beat_plans
  FOR EACH ROW EXECUTE FUNCTION public.beat_plans_outlet_window();

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('037_early_checkin_requests.sql',
        'beats are worked on their date; early needs a request approved today by an admin or the rep''s manager; past beats are Missed')
ON CONFLICT (filename) DO NOTHING;
