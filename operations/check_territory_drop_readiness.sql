-- Is the `territory` text column safe to drop yet?
--
-- 024_territory_id.sql was the expand half: every table that named a territory
-- by text gained a `territoryId` beside it, and both are written. The contract
-- half — dropping `territory` — is not a migration yet, because three write
-- paths still set the name and nothing else:
--
--   src/pages/DistributorSignup.jsx
--   src/pages/DealerSignup.jsx
--   src/pages/RetailerSignup.jsx
--
-- They are anonymous pages. A dropdown needs to read `territories`, and an
-- anonymous request to that table returns HTTP 200 with zero rows under the
-- RLS policies now in force (verified 2026-09-21), so there is nothing to put
-- in a dropdown. Dropping the column before that is resolved throws away the
-- only territory a self-signed-up partner ever supplies.
--
-- This file reads and changes nothing. Run it to see whether the data is ready
-- even if the code is not.

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

-- 3. When both the data verdict above is clean AND the three signup pages
--    write an id, the contract migration is this and nothing more:
--
--    ALTER TABLE public.distributors DROP COLUMN territory;
--    ALTER TABLE public.dealers      DROP COLUMN territory;
--    ALTER TABLE public.retailers    DROP COLUMN territory;
--    ALTER TABLE public.orders       DROP COLUMN territory;
--    ALTER TABLE public.leads        DROP COLUMN territory;
--    ALTER TABLE public.beat_plans   DROP COLUMN territory;
--
--    Deliberately not saved as a numbered migration: a numbered file in that
--    folder reads as something to run, and this one is not.
