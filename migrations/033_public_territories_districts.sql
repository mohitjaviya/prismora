-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the signup forms can work out a territory instead of asking
--  for one.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  The three signup pages ask "Territory / Zone". A distributor in Pune knows
--  they are in Pune. They do not know they are in "Maharashtra Mega Zone" --
--  that is an internal name for how the sales team is organised, and asking a
--  partner to choose one is asking them something only the business knows.
--
--  It is also unnecessary. A territory already carries the districts it covers,
--  and every signup form already asks for state and city -- from the same list
--  the districts are chosen from, so the two are the same vocabulary rather
--  than two spellings to reconcile. The answer is derivable.
--
--  026's view exposes id, name and state. This adds `districts`, which is what
--  makes the derivation possible in the browser as well as on the server.
--
--  IS THAT SAFE TO PUBLISH
--
--  It is a list of district names -- Ahmedabad, Pune, Surat. It says which
--  parts of the country this business covers, which is what a distributor is
--  being invited to join, and is the sort of thing a company prints on its own
--  website. Nothing about a person, a price or a partner is in it.
--
--  The view still exposes four columns and no more. executiveId in particular
--  stays out: which colleague owns a zone is nobody else's business.
--
--  A NOTE ON THE TYPE
--
--  `districts` is jsonb, not text[]. 002 and 004 both declare it
--  JSONB DEFAULT '[]'::jsonb. The view passes it through unchanged and
--  supabase-js hands the browser a real JavaScript array either way, so
--  nothing in the application cares -- but SQL written against it needs
--  jsonb_array_length and not cardinality. That mistake is what made the first
--  version of this file fail.
-- ════════════════════════════════════════════════════════════════════════


-- Appended rather than inserted: CREATE OR REPLACE VIEW can add a column at
-- the end and cannot reorder or remove one, so the shape 026 published is
-- unchanged for anything already reading it.
CREATE OR REPLACE VIEW public.public_territories AS
  SELECT id, name, state, districts
  FROM public.territories;

DO $$
BEGIN
  BEGIN
    EXECUTE 'ALTER VIEW public.public_territories SET (security_invoker = off)';
  EXCEPTION WHEN others THEN
    RAISE NOTICE 'Could not set security_invoker (%). It is off by default, so this is only worth noting.', SQLERRM;
  END;
END $$;

REVOKE ALL ON public.public_territories FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.public_territories TO anon, authenticated;

NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Expected: four columns, anon may select, and executiveId is not among them.
SELECT a.attname AS column_name
FROM   pg_attribute a
JOIN   pg_class c ON c.oid = a.attrelid
JOIN   pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relname = 'public_territories'
AND    a.attnum > 0 AND NOT a.attisdropped
ORDER  BY a.attnum;

SELECT has_table_privilege('anon', 'public.public_territories', 'SELECT') AS anon_can_read;

-- Every territory, and how many districts it covers. A zone with none is one
-- the signup forms cannot place anybody in, so a partner registering there
-- will be told their area is not covered yet.
--
-- `districts` is jsonb, not a native array -- 002 and 004 both declare it
-- JSONB DEFAULT '[]'::jsonb -- so it is jsonb_array_length rather than
-- cardinality, and CASE rather than OR. A plain OR chain does not guarantee
-- left-to-right evaluation, and jsonb_array_length raises on anything that is
-- not an array, so the type has to be established before the length is asked
-- for.
SELECT id,
       name,
       state,
       jsonb_typeof(districts) AS districts_type,
       CASE WHEN jsonb_typeof(districts) = 'array'
            THEN jsonb_array_length(districts)
       END AS district_count
FROM   public.territories
ORDER  BY district_count NULLS FIRST, name;

-- The same thing as a verdict: just the territories nobody can be placed in.
SELECT id, name, state
FROM   public.territories
WHERE  districts IS NULL
   OR  CASE WHEN jsonb_typeof(districts) = 'array'
            THEN jsonb_array_length(districts) = 0
            ELSE true          -- a jsonb scalar or object is not a district list
       END
ORDER  BY name;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('033_public_territories_districts.sql',
        'public_territories gains districts, so the signup forms derive a territory from state+city instead of asking a partner for an internal zone name')
ON CONFLICT (filename) DO NOTHING;
