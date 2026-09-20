-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — territory becomes a reference instead of a typed-in name.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG WITH THE NAME
--
--  Six tables carry a `territory` column holding a name, matched against
--  territories.name by string comparison. Nothing enforces that the name is
--  one that exists. Before the test data was cleared this database held:
--
--      territories        Demo territory, Gujrat North Hub, Maharashtra Mega Zone
--      distributors       Gujarat North, Karnataka South, Maharashtra West
--
--  Three distributors, none of them on a territory that existed. Two spellings
--  of Gujarat in use at once, treated as different places. Geography reporting
--  was built on that.
--
--  The forms have since been given a dropdown and a warning, so new records are
--  harder to get wrong. The model underneath is unchanged: rename a territory
--  and every partner pointing at it detaches silently, because the link was
--  only ever the spelling.
--
--  WHY NOW
--
--  All six tables are empty. There is no data to migrate, no downtime, and no
--  reconciling two spellings of Gujarat by hand. This will not be cheap again.
--
--  EXPAND, THEN CONTRACT
--
--  This is the expand half. `territoryId` is added beside `territory`; nothing
--  is dropped and nothing breaks, because the new column starts unused. The
--  application then writes both and reads the id. `territory` is dropped in a
--  later migration, once nothing reads it -- which is checked rather than
--  assumed, because sixty-one places read it today.
-- ════════════════════════════════════════════════════════════════════════


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['distributors', 'dealers', 'retailers', 'orders', 'leads', 'beat_plans']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "territoryId" TEXT', t);

    -- Backfill by the only link there has ever been: the spelling. A no-op on
    -- an empty table, and correct anywhere this runs against data -- a name
    -- that matches nothing stays NULL rather than inventing a territory.
    EXECUTE format(
      'UPDATE public.%I x SET "territoryId" = ter.id
         FROM public.territories ter
        WHERE x."territoryId" IS NULL
          AND x.territory IS NOT NULL
          AND lower(btrim(x.territory)) = lower(btrim(ter.name))', t);

    -- ON DELETE SET NULL, not RESTRICT: a territory being retired should not
    -- be blocked by the partners in it. They become unassigned, which is
    -- visible and fixable, rather than the delete failing.
    IF NOT EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class cl ON cl.oid = c.conrelid
      WHERE c.conname = 'fk_' || t || '_territoryid' AND cl.relname = t
    ) THEN
      EXECUTE format(
        'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY ("territoryId")
           REFERENCES public.territories(id) ON DELETE SET NULL',
        t, 'fk_' || t || '_territoryid');
    END IF;

    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I("territoryId")',
                   'idx_' || t || '_territoryid', t);

    RAISE NOTICE 'territoryId added to %', t;
  END LOOP;
END $$;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT c.relname AS table_name,
       count(*) FILTER (WHERE a.attname = 'territoryId')  AS has_column,
       count(*) FILTER (WHERE k.conname IS NOT NULL)      AS has_foreign_key
FROM   pg_class c
LEFT   JOIN pg_attribute a ON a.attrelid = c.oid AND a.attname = 'territoryId' AND NOT a.attisdropped
LEFT   JOIN pg_constraint k ON k.conrelid = c.oid AND k.conname = 'fk_' || c.relname || '_territoryid'
WHERE  c.relname IN ('distributors','dealers','retailers','orders','leads','beat_plans')
AND    c.relnamespace = 'public'::regnamespace
GROUP  BY c.relname
ORDER  BY c.relname;
-- Expected: six rows, has_column and has_foreign_key both 1 on every one.

-- Anything left pointing at a name that is not a territory. Should be empty.
SELECT 'distributors' AS t, territory FROM public.distributors WHERE territory IS NOT NULL AND "territoryId" IS NULL
UNION ALL SELECT 'dealers',    territory FROM public.dealers    WHERE territory IS NOT NULL AND "territoryId" IS NULL
UNION ALL SELECT 'retailers',  territory FROM public.retailers  WHERE territory IS NOT NULL AND "territoryId" IS NULL
UNION ALL SELECT 'orders',     territory FROM public.orders     WHERE territory IS NOT NULL AND "territoryId" IS NULL
UNION ALL SELECT 'leads',      territory FROM public.leads      WHERE territory IS NOT NULL AND "territoryId" IS NULL
UNION ALL SELECT 'beat_plans', territory FROM public.beat_plans WHERE territory IS NOT NULL AND "territoryId" IS NULL;
-- Rows here are records whose territory name matches nothing. On this database
-- there should be none, because the tables are empty. Anywhere else, each row
-- is a partner that needs assigning to a real territory by hand.


CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('024_territory_id.sql',
        'territoryId + FK on distributors, dealers, retailers, orders, leads, beat_plans; territory kept until nothing reads it')
ON CONFLICT (filename) DO NOTHING;
