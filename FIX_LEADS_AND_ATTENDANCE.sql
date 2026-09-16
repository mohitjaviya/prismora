-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — make leads and attendance save.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  The same fault in two places. PostgREST rejects an ENTIRE insert or
--  update when the payload names one column the table lacks. Both forms
--  send fields no column matched, so the database refused every statement
--  either of them ever made.
--
--  Nothing reported it. The record still appeared on screen and still wrote
--  its entry to `events`, because it was being held in the browser alone —
--  visible only to the person who typed it, on that one machine, until
--  their local cache was next cleared.
--
--  Proof, before this runs:
--    SELECT count(*) FROM leads;       -- 0, against 4 'lead_new' events
--    SELECT count(*) FROM attendance;  -- 0, against 3 'attendance_checkin'
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Leads: the five fields the form collects and the table never had ──
-- state and city are not optional extras. Leads.jsx refuses to convert a lead
-- without them, and convertLeadToOrder() copies both onto the order it raises
-- — so while they were being discarded, an order raised from a lead was left
-- with no geography and dropped straight out of territory coverage.
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "state"     TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "city"      TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "district"  TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "territory" TEXT DEFAULT '';
ALTER TABLE leads ADD COLUMN IF NOT EXISTS "leadType"  TEXT DEFAULT '';

-- `attachments` is deliberately not added. The form offers a file picker with
-- no file storage behind it, so the column would only ever hold empty arrays.
-- The app strips it from the payload instead.


-- ── 2. Attendance: where the punch happened, and who approved it ─────────
-- Check-in sends the GPS fix that proves the salesperson was at the outlet,
-- which is the entire point of a field punch. Without these columns every
-- check-in was refused, so nobody's attendance has ever been recorded.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchInLat"       NUMERIC;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchInLng"       NUMERIC;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchInAccuracy"  NUMERIC;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchOutLat"      NUMERIC;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchOutLng"      NUMERIC;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "punchOutAccuracy" NUMERIC;

-- The Approve button writes both of these, and the year report counts days by
-- `approved`. Neither column existed, so approving was refused every time and
-- the count it feeds could only ever read zero.
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "approved"   BOOLEAN DEFAULT false;
ALTER TABLE attendance ADD COLUMN IF NOT EXISTS "approvedBy" TEXT    DEFAULT '';

UPDATE attendance SET "approved" = false WHERE "approved" IS NULL;


-- ── 3. Confirm: this must return no rows ────────────────────────────────
WITH expected(tbl, col) AS (
  VALUES
    ('leads','state'), ('leads','city'), ('leads','district'),
    ('leads','territory'), ('leads','leadType'), ('leads','leadSource'),
    ('attendance','punchInLat'), ('attendance','punchInLng'),
    ('attendance','punchInAccuracy'), ('attendance','punchOutLat'),
    ('attendance','punchOutLng'), ('attendance','punchOutAccuracy'),
    ('attendance','approved'), ('attendance','approvedBy')
)
SELECT e.tbl AS still_missing_table, e.col AS still_missing_column
FROM   expected e
LEFT   JOIN information_schema.columns c
       ON c.table_name = e.tbl AND c.column_name = e.col AND c.table_schema = 'public'
WHERE  c.column_name IS NULL;
