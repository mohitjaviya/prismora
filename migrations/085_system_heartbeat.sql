-- 085_system_heartbeat.sql
-- Keep-alive for the Supabase free tier (Gap 13). A free project is paused
-- after 7 days without activity; the in-database cron job
-- (invoice-status-nightly, 057) does not count. A GitHub Actions workflow
-- (.github/workflows/supabase-keepalive.yml) calls heartbeat_ping() through
-- the REST API every 2 days with the anon key.
--
-- One table with exactly one row. Nobody reads or writes the table directly:
-- anon and authenticated have no table rights and RLS has no policies. The
-- only way in is the two functions below. Only anon may run them. They update
-- or read row 1 and nothing else. The ERP does not load this table, and it is
-- not a module in Roles & Permissions.
--
-- Touches no business table, no data and no existing job.

CREATE TABLE IF NOT EXISTS public.system_heartbeat (
  id           smallint    PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  last_ping_at timestamptz NOT NULL DEFAULT now(),
  source       text        NOT NULL DEFAULT 'migration 085' CHECK (char_length(source) <= 64)
);

INSERT INTO public.system_heartbeat (id, last_ping_at, source)
VALUES (1, now(), 'migration 085')
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.system_heartbeat ENABLE ROW LEVEL SECURITY;
-- No policies on purpose: direct access through the API returns nothing.
REVOKE ALL ON TABLE public.system_heartbeat FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.system_heartbeat IS
  'Keep-alive (085). One row, touched every 2 days by GitHub Actions via heartbeat_ping(). Not part of the ERP.';

-- Stamps row 1 and returns it. The caller can only choose a short label.
CREATE OR REPLACE FUNCTION public.heartbeat_ping(p_source text DEFAULT 'github-actions')
RETURNS TABLE (last_ping_at timestamptz, source text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
  RETURN QUERY
  UPDATE public.system_heartbeat h
     SET last_ping_at = now(),
         source = left(coalesce(nullif(btrim(p_source), ''), 'unknown'), 64)
   WHERE h.id = 1
  RETURNING h.last_ping_at, h.source;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'system_heartbeat row 1 is missing (re-run migration 085)';
  END IF;
END;
$$;

-- Reads row 1, so the workflow can check the ping really landed.
CREATE OR REPLACE FUNCTION public.heartbeat_status()
RETURNS TABLE (last_ping_at timestamptz, source text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT h.last_ping_at, h.source FROM public.system_heartbeat h WHERE h.id = 1;
$$;

-- Supabase grants new functions to anon/authenticated by default; take that
-- back and give them to anon only.
REVOKE ALL ON FUNCTION public.heartbeat_ping(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.heartbeat_status()   FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.heartbeat_ping(text) TO anon;
GRANT EXECUTE ON FUNCTION public.heartbeat_status()   TO anon;
