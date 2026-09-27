-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a record of saves that failed, stalled or were abandoned.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 034 (my_user_id).
--
--  WHY
--
--  Two saves in testing went nowhere with no error: a delivery whose form
--  stayed open with nothing saved, and an invoice whose form closed with
--  nothing saved. Neither could be reproduced, and there was no record of
--  either. The app now writes a row here when a save fails, takes longer than
--  a few seconds, or is still in flight when the page closes or reloads —
--  with the page, how long after sign-in it was, and the last few things the
--  app did before it — so the next one leaves a trace.
--
--  Anyone signed in can add their own rows; only Super Admin, Admin and
--  Director can read them. Read with:
--    select at, kind, label, duration_ms, error, page, since_sign_in_ms, u.name
--    from client_write_log l left join users u on u.id = l.user_id
--    order by at desc limit 50;
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.client_write_log (
  id                bigserial PRIMARY KEY,
  at                timestamptz NOT NULL DEFAULT now(),
  user_id           text DEFAULT public.my_user_id(),
  kind              text NOT NULL CHECK (kind IN ('failed', 'slow', 'abandoned')),
  label             text NOT NULL,
  duration_ms       integer,
  error             text,
  page              text,
  since_sign_in_ms  integer,
  recent            jsonb NOT NULL DEFAULT '[]'::jsonb,
  app_build         text
);

CREATE INDEX IF NOT EXISTS client_write_log_at ON public.client_write_log (at DESC);

ALTER TABLE public.client_write_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS client_write_log_insert ON public.client_write_log;
CREATE POLICY client_write_log_insert ON public.client_write_log
  FOR INSERT TO authenticated
  WITH CHECK (user_id IS NOT DISTINCT FROM public.my_user_id());

DROP POLICY IF EXISTS client_write_log_select ON public.client_write_log;
CREATE POLICY client_write_log_select ON public.client_write_log
  FOR SELECT TO authenticated
  USING (public.my_role_name() IN ('Super Admin', 'Admin', 'Director'));

REVOKE UPDATE, DELETE, TRUNCATE ON public.client_write_log FROM PUBLIC, anon, authenticated;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('042_client_write_log.sql', 'client_write_log: saves that failed, stalled or were abandoned, with context')
ON CONFLICT (filename) DO NOTHING;
