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

-- Every territory with no districts recorded. Each one is a zone the signup
-- forms cannot place anybody in, so a partner registering there will be told
-- their area is not covered yet.
SELECT id, name, state
FROM   public.territories
WHERE  districts IS NULL OR cardinality(districts) = 0
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
