-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the contract half of 024. The `territory` name column goes.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  ⚠ RUN 026 FIRST, AND DEPLOY THE APPLICATION FIRST.
--
--  This migration is the only one in this folder that the running application
--  can notice immediately. PostgREST refuses an entire INSERT or UPDATE that
--  names a column the table does not have — it does not skip the unknown key
--  and write the rest. A build that still writes `territory` will therefore
--  fail to save every partner, order, lead and beat plan the moment this runs,
--  while appearing to succeed locally, because local state and localStorage
--  are written before the request goes out.
--
--  The order is: deploy, then 026, then this. Reversed, signups lose their
--  territory dropdown and every write above starts failing silently.
--
--  WHAT 024 SET UP
--
--  Six tables carried a `territory` column holding a name, matched against
--  territories.name by string comparison. Nothing enforced that the name was
--  one that existed, and before the test data was cleared this database held
--  three distributors on territories that did not exist, plus two spellings of
--  Gujarat treated as different places.
--
--  024 added `territoryId` beside it with a foreign key, and both were written
--  while the reading code was converted. That work is finished:
--
--    · All 61 read sites resolve through territoryId (utils/territory.js).
--    · territoryFields() writes the id and nothing else.
--    · ORDER_COLUMNS and LEAD_COLUMNS no longer list `territory`, so neither
--      an order nor a lead sends the name over the wire.
--    · The three signup pages were the last writers of a bare name. They now
--      offer a dropdown, reading the view 026 creates — which is why 026 has
--      to run first.
--
--  BEFORE YOU RUN IT
--
--  operations/check_territory_drop_readiness.sql lists any row that would lose
--  its territory. This file refuses to run if there are any, rather than
--  trusting that it was checked.
-- ════════════════════════════════════════════════════════════════════════


-- ── Refuse rather than lose anything ─────────────────────────────────────
-- A row with a name and no id has a territory that exists nowhere else. The
-- drop would be the moment it is lost, and nothing would report it.
DO $$
DECLARE
  t         text;
  stranded  bigint;
  total     bigint := 0;
  checked   int    := 0;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributors', 'dealers', 'retailers', 'orders', 'leads', 'beat_plans']
  LOOP
    -- Skip a table whose column has already gone. Without this the re-run
    -- this file promises would fail on its own safety check, which is a poor
    -- way to learn that the first run worked.
    CONTINUE WHEN NOT EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = t AND column_name = 'territory'
    );

    checked := checked + 1;
    EXECUTE format(
      'SELECT count(*) FROM public.%I WHERE territory IS NOT NULL AND territory <> '''' AND "territoryId" IS NULL', t)
      INTO stranded;

    IF stranded > 0 THEN
      RAISE NOTICE '%: % row(s) would lose their territory', t, stranded;
      total := total + stranded;
    END IF;
  END LOOP;

  IF total > 0 THEN
    RAISE EXCEPTION
      '% row(s) name a territory but have no territoryId. Dropping the column would lose them. Run operations/check_territory_drop_readiness.sql to see which, point each at a real territory, then run this again.',
      total;
  END IF;

  IF checked = 0 THEN
    RAISE NOTICE 'territory is already gone from all six tables — nothing to drop.';
  ELSE
    RAISE NOTICE 'No row would lose its territory (% table(s) still have the column). Proceeding.', checked;
  END IF;
END $$;


-- ── Refuse if 026 has not run ────────────────────────────────────────────
-- The signup pages read these views. Without them the dropdowns are empty and
-- a self-signed-up partner has no way to state a territory at all — which is
-- the state this whole change exists to leave behind.
DO $$
BEGIN
  IF to_regclass('public.public_territories') IS NULL THEN
    RAISE EXCEPTION 'Run 026_public_signup_directory.sql first — without it the signup pages have no territory list, and this drop removes their only other way to record one.';
  END IF;
END $$;


-- ── Drop ─────────────────────────────────────────────────────────────────
-- IF EXISTS on each, so a partial previous run finishes cleanly.
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributors', 'dealers', 'retailers', 'orders', 'leads', 'beat_plans']
  LOOP
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS territory', t);
    RAISE NOTICE 'territory dropped from %', t;
  END LOOP;
END $$;


-- PostgREST caches the schema, and a stale cache here means it keeps offering
-- a column the table no longer has.
NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- has_name_column should be 0 everywhere and has_id_column 1 everywhere.
SELECT c.relname AS table_name,
       count(*) FILTER (WHERE a.attname = 'territory')   AS has_name_column,
       count(*) FILTER (WHERE a.attname = 'territoryId') AS has_id_column
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_attribute a ON a.attrelid = c.oid
       AND a.attname IN ('territory', 'territoryId') AND NOT a.attisdropped
WHERE  n.nspname = 'public'
AND    c.relname IN ('distributors', 'dealers', 'retailers', 'orders', 'leads', 'beat_plans')
GROUP  BY c.relname
ORDER  BY c.relname;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('027_drop_territory_name.sql',
        'contract half of 024 — territory name column dropped from all six tables; territoryId + FK is the only link')
ON CONFLICT (filename) DO NOTHING;
