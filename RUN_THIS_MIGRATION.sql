-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — run this once, then everything below starts saving.
--
--  Supabase dashboard → SQL Editor → New query → paste all of this → Run.
--  It replaces the four separate fix_*.sql files. Safe to run more than once.
--
--  Until it runs, these are silently discarded by the database:
--    · every field visit  (the report AND the order it raises)
--    · every lead conversion (no order is created)
--    · every delivery address
-- ════════════════════════════════════════════════════════════════════════


-- ── Field visits ────────────────────────────────────────────────────────
-- A beat carries one status for the whole route, so checking in at the first
-- outlet closed the rest. Outcomes belong to outlets, and an outlet that could
-- not be worked has to be recordable too — otherwise a shop found closed looks
-- the same as one never reached.
ALTER TABLE beat_plans    ADD COLUMN IF NOT EXISTS "outletVisits"     JSONB DEFAULT '{}'::jsonb;
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "outcome"          TEXT  DEFAULT 'Visited';
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "notVisitedReason" TEXT  DEFAULT '';
ALTER TABLE visit_reports ADD COLUMN IF NOT EXISTS "beatId"           TEXT;


-- ── Lead conversion ─────────────────────────────────────────────────────
-- orderCreated stops a second order being raised for the same lead. Because the
-- column was missing, PostgREST rejected the whole update — so converting a lead
-- never saved its status, and converting it again raised a duplicate.
ALTER TABLE leads  ADD COLUMN IF NOT EXISTS "orderCreated" BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "leadId"       TEXT;


-- ── Territory on an order ───────────────────────────────────────────────
-- A beat already knows the territory; without this the field order loses it and
-- coverage has to guess it back from the state.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "territory" TEXT;


-- ── Delivery addresses ──────────────────────────────────────────────────
-- Vendors (who we buy from) had a full address. The partners we deliver TO had
-- only a state and a city, and an order had no address at all.
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT DEFAULT '';
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS "deliveryPincode" TEXT DEFAULT '';
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS "address"         TEXT DEFAULT '';
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS "pincode"         TEXT DEFAULT '';
ALTER TABLE dealers      ADD COLUMN IF NOT EXISTS "address"         TEXT DEFAULT '';
ALTER TABLE dealers      ADD COLUMN IF NOT EXISTS "pincode"         TEXT DEFAULT '';
ALTER TABLE retailers    ADD COLUMN IF NOT EXISTS "address"         TEXT DEFAULT '';
ALTER TABLE retailers    ADD COLUMN IF NOT EXISTS "pincode"         TEXT DEFAULT '';


-- ── Backfill rows that predate the columns ──────────────────────────────
UPDATE visit_reports SET "outcome"      = 'Visited'     WHERE "outcome"      IS NULL;
UPDATE beat_plans    SET "outletVisits" = '{}'::jsonb   WHERE "outletVisits" IS NULL;
UPDATE leads         SET "orderCreated" = false         WHERE "orderCreated" IS NULL;


-- ── Confirm: this should return no rows ─────────────────────────────────
WITH expected(tbl, col) AS (
  VALUES
    ('beat_plans','outletVisits'), ('visit_reports','outcome'),
    ('visit_reports','notVisitedReason'), ('visit_reports','beatId'),
    ('leads','orderCreated'), ('orders','leadId'), ('orders','territory'),
    ('orders','deliveryAddress'), ('orders','deliveryPincode'),
    ('distributors','address'), ('distributors','pincode'),
    ('dealers','address'), ('dealers','pincode'),
    ('retailers','address'), ('retailers','pincode')
)
SELECT e.tbl AS still_missing_table, e.col AS still_missing_column
FROM   expected e
LEFT   JOIN information_schema.columns c
       ON c.table_name = e.tbl AND c.column_name = e.col AND c.table_schema = 'public'
WHERE  c.column_name IS NULL;
