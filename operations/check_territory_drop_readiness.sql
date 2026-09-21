-- Is the `territory` text column safe to drop yet?
--
-- 024_territory_id.sql was the expand half: every table that named a territory
-- by text gained a `territoryId` beside it. 027_drop_territory_name.sql is the
-- contract half, and refuses to run if any row would lose its territory.
--
-- This file is what to run first, to see which rows those are before 027 stops
-- you. It is the same check, without the drop attached.
--
-- This file reads and changes nothing. Run it to see whether the data is ready
-- even if the code is not.
--
-- It only works before 027 runs. Afterwards the column it asks about is gone
-- and every query below errors, which is the right answer in the bluntest
-- possible form.

-- 1. Rows carrying a territory name that never resolved to an id.
--    Every row here loses its territory the moment the column is dropped.
SELECT 'distributors' AS table_name, id, name, territory FROM public.distributors WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
UNION ALL SELECT 'dealers',    id, name,          territory FROM public.dealers    WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
UNION ALL SELECT 'retailers',  id, name,          territory FROM public.retailers  WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
UNION ALL SELECT 'orders',     id, "customerName", territory FROM public.orders     WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
UNION ALL SELECT 'leads',      id, name,          territory FROM public.leads      WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
UNION ALL SELECT 'beat_plans', id, territory,     territory FROM public.beat_plans WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL;

-- 2. The same thing as a single verdict.
SELECT CASE WHEN count(*) = 0
            THEN 'DATA READY — no row would lose a territory. The three signup pages still need fixing first.'
            ELSE count(*) || ' row(s) would lose their territory. Point each at a real territory before dropping the column.'
       END AS verdict
FROM (
  SELECT 1 FROM public.distributors WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM public.dealers    WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM public.retailers  WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM public.orders     WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM public.leads      WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM public.beat_plans WHERE territory IS NOT NULL AND territory <> '' AND "territoryId" IS NULL
) x;

-- 3. If the verdict above is clean, run migrations/027_drop_territory_name.sql
--    — but deploy the application and run 026 first. A build that still writes
--    `territory` fails to save every partner, order, lead and beat plan the
--    moment the column goes, because PostgREST refuses a whole statement that
--    names a column the table does not have.
