-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — turn off row-level security on every table.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--
--  Symptom it fixes:
--    new row violates row-level security policy for table "…"
--
--  With RLS switched on and no policies defined, Postgres denies every write
--  and filters every read down to nothing — and a SELECT does not error, it
--  just returns an empty table. That is why this keeps surfacing one table at
--  a time: each one only reveals itself when something tries to write to it.
--
--  The app talks to Supabase with the anon key and enforces roles in its own
--  code, so RLS has to stay off until sign-in moves to Supabase Auth. Once
--  there is a real authenticated session, RLS goes back on WITH policies.
--
--  This loops over every table in the public schema rather than naming them,
--  so a table added later cannot be missed the way sfa_expenses was.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. What has it switched on right now? ───────────────────────────────
SELECT relname AS table_name, relrowsecurity AS rls_enabled
FROM   pg_class
WHERE  relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity
ORDER  BY relname;


-- ── 2. Switch it off everywhere ─────────────────────────────────────────
DO $$
DECLARE t record;
BEGIN
  FOR t IN
    SELECT relname
    FROM   pg_class
    WHERE  relnamespace = 'public'::regnamespace
      AND  relkind = 'r'
      AND  relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I DISABLE ROW LEVEL SECURITY', t.relname);
    RAISE NOTICE 'RLS disabled on %', t.relname;
  END LOOP;
END $$;


-- ── 3. Confirm: this must return 0 ──────────────────────────────────────
SELECT count(*) AS tables_still_protected
FROM   pg_class
WHERE  relnamespace = 'public'::regnamespace AND relkind = 'r' AND relrowsecurity;
