-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the three signup pages can see the lists they ask you to
--  choose from.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  DealerSignup asks a new dealer to pick the distributor they buy through.
--  RetailerSignup asks a new retailer to pick their dealer. Both dropdowns
--  read `distributors` / `dealers` directly, and a signup page is visited by
--  somebody who does not have an account yet — so the request is anonymous.
--
--  Under the policies applied in 017–020, an anonymous SELECT on those tables
--  returns HTTP 200 with zero rows. Not an error: an empty list. So the
--  dropdown renders with nothing in it but the "-- Select --" placeholder,
--  on a field marked required. Verified against the live database on
--  2026-09-21:
--
--      GET /rest/v1/distributors?select=id,name  ->  200  []
--      GET /rest/v1/territories?select=id,name   ->  200  []
--
--  The territory field on all three pages is a free text box for the same
--  reason — there was no list to offer.
--
--  WHY A VIEW AND NOT A POLICY
--
--  A SELECT policy for `anon` on `distributors` would expose every column on
--  the row: credit limit, outstanding balance, GSTIN, the contact's phone and
--  email. None of that belongs on a public page.
--
--  These views expose the three columns a dropdown needs and nothing else.
--  They are the whole of the public surface, so what a stranger can see is a
--  question with a short, readable answer rather than one that has to be
--  worked out from a policy expression.
--
--  Only Active partners are listed. A Pending signup is not somebody you can
--  buy through yet, and a Suspended one is not somebody you should be joining.
-- ════════════════════════════════════════════════════════════════════════


-- ── Territories: what the territory dropdown offers ──────────────────────
-- id and name are what the <select> needs. `state` is shown beside the name
-- because two territories can reasonably share one, and a person signing up
-- in Gujarat should not have to guess which "North Zone" is theirs.
CREATE OR REPLACE VIEW public.public_territories AS
  SELECT id, name, state
  FROM public.territories;



-- ── Distributors: what DealerSignup's parent dropdown offers ─────────────
-- The territory name is joined in rather than read from the old text column,
-- so this view is already correct when 027 drops that column.
CREATE OR REPLACE VIEW public.public_distributors AS
  SELECT d.id,
         d.name,
         t.name AS "territoryName"
  FROM public.distributors d
  LEFT JOIN public.territories t ON t.id = d."territoryId"
  WHERE d.status = 'Active';



-- ── Dealers: what RetailerSignup's parent dropdown offers ────────────────
CREATE OR REPLACE VIEW public.public_dealers AS
  SELECT d.id,
         d.name,
         t.name AS "territoryName"
  FROM public.dealers d
  LEFT JOIN public.territories t ON t.id = d."territoryId"
  WHERE d.status = 'Active';



-- ── How they read past RLS, stated rather than relied upon ───────────────
-- `security_invoker = off` is the default: the view runs as its owner, which
-- owns the base tables, so RLS on those does not apply to it. That is the
-- entire mechanism, so it is set explicitly.
--
-- The option only exists from PostgreSQL 15. On anything older the statement
-- errors and the default is already what we want, so it is caught rather than
-- allowed to abort a migration that has otherwise succeeded.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['public_territories', 'public_distributors', 'public_dealers']
  LOOP
    BEGIN
      EXECUTE format('ALTER VIEW public.%I SET (security_invoker = off)', v);
    EXCEPTION WHEN others THEN
      RAISE NOTICE 'Could not set security_invoker on % (%). It is off by default, so this is only worth noting.', v, SQLERRM;
    END;
  END LOOP;
END $$;


-- ── Who may read them ────────────────────────────────────────────────────
-- Revoked first, so re-running this file cannot quietly widen access that a
-- previous run granted and somebody has since narrowed by hand.
DO $$
DECLARE v text;
BEGIN
  FOREACH v IN ARRAY ARRAY['public_territories', 'public_distributors', 'public_dealers']
  LOOP
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', v);
    EXECUTE format('GRANT SELECT ON public.%I TO anon, authenticated', v);
    RAISE NOTICE 'SELECT granted on % to anon', v;
  END LOOP;
END $$;


-- PostgREST caches the schema. Without this the views return 404 until the
-- cache happens to be rebuilt, which looks exactly like the migration not
-- having run.
NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Each should report has_anon_select = true.
SELECT c.relname AS view_name,
       has_table_privilege('anon', c.oid, 'SELECT') AS has_anon_select,
       (SELECT count(*) FROM pg_attribute a
         WHERE a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped) AS columns_exposed
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public'
AND    c.relname IN ('public_territories', 'public_distributors', 'public_dealers')
ORDER  BY c.relname;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('026_public_signup_directory.sql',
        'public_territories / public_distributors / public_dealers — three columns each, readable by anon, so the signup dropdowns have something in them')
ON CONFLICT (filename) DO NOTHING;
