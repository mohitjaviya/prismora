-- PRISMORA — field visit tracking. Run once in the Supabase SQL editor.
--
-- A beat plan currently carries one status for the whole route, so checking in
-- at the first outlet marks every outlet on that beat as done and the remaining
-- ones lose their check-in button. Outcomes have to be recorded per outlet.
--
-- There is also no way to record an outlet that could not be visited — shop
-- closed, owner away, route cut short. Only a completed visit can be filed, so
-- coverage figures count an unvisited outlet the same as one never reached.
--
-- Safe to run more than once.

-- Per-outlet outcome for a beat, keyed by outlet name:
--   { "Shiv Pharma": { "outcome": "Visited", "visitId": "VR-…", "at": "…" },
--     "Arogya Store": { "outcome": "Not Visited", "reason": "Shop closed", "at": "…" } }
ALTER TABLE beat_plans ADD COLUMN IF NOT EXISTS "outletVisits" JSONB DEFAULT '{}'::jsonb;

-- What happened at the outlet, and which beat it belonged to.
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "outcome"          TEXT DEFAULT 'Visited';
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "notVisitedReason" TEXT DEFAULT '';
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "beatId"           TEXT;

-- Reports filed before the outcome existed were all completed visits.
UPDATE visit_reports SET "outcome" = 'Visited' WHERE "outcome" IS NULL;

-- Beats predating per-outlet tracking keep their overall status; the map starts
-- empty and fills as outlets are worked.
UPDATE beat_plans SET "outletVisits" = '{}'::jsonb WHERE "outletVisits" IS NULL;
