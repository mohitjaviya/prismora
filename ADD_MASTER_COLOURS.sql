-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a colour and a description on each master option.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Run CREATE_MASTERS.sql first.
--
--  Why the colour matters, beyond looking nice:
--    Status badges were coloured from a map hardcoded in each screen —
--    statusConfig in Purchases and Complaints, a switch in Orders. Those maps
--    only know the statuses that existed when they were written. Add a status
--    through Master Lists and it came out grey, with no way to change it.
--    The colour travels with the option now.
--
--  The values below are the ones those maps already use, so nothing on screen
--  changes on the day this runs.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE masters ADD COLUMN IF NOT EXISTS "color"       TEXT;
ALTER TABLE masters ADD COLUMN IF NOT EXISTS "description" TEXT DEFAULT '';


-- ── Lead statuses ───────────────────────────────────────────────────────
UPDATE masters SET color = '#38bdf8' WHERE list = 'lead_status' AND key = 'Lead Created'         AND color IS NULL;
UPDATE masters SET color = '#818cf8' WHERE list = 'lead_status' AND key = 'Call'                 AND color IS NULL;
UPDATE masters SET color = '#a78bfa' WHERE list = 'lead_status' AND key = 'Sample Sent'          AND color IS NULL;
UPDATE masters SET color = '#f472b6' WHERE list = 'lead_status' AND key = 'Meeting'              AND color IS NULL;
UPDATE masters SET color = '#fbbf24' WHERE list = 'lead_status' AND key = 'Negotiation'          AND color IS NULL;
UPDATE masters SET color = '#34d399' WHERE list = 'lead_status' AND key = 'Distributor Approved' AND color IS NULL;
UPDATE masters SET color = '#22c55e' WHERE list = 'lead_status' AND key = 'First Order'          AND color IS NULL;
UPDATE masters SET color = '#10b981' WHERE list = 'lead_status' AND key = 'Active'               AND color IS NULL;
UPDATE masters SET color = '#f87171' WHERE list = 'lead_status' AND key = 'Lost'                 AND color IS NULL;

-- ── Order statuses ──────────────────────────────────────────────────────
UPDATE masters SET color = '#eab308' WHERE list = 'order_status' AND key = 'Pending'            AND color IS NULL;
UPDATE masters SET color = '#3b82f6' WHERE list = 'order_status' AND key = 'Processing'         AND color IS NULL;
UPDATE masters SET color = '#06b6d4' WHERE list = 'order_status' AND key = 'Ready for Dispatch' AND color IS NULL;
UPDATE masters SET color = '#a855f7' WHERE list = 'order_status' AND key = 'Shipped'            AND color IS NULL;
UPDATE masters SET color = '#22c55e' WHERE list = 'order_status' AND key = 'Delivered'          AND color IS NULL;
UPDATE masters SET color = '#ef4444' WHERE list = 'order_status' AND key = 'Cancelled'          AND color IS NULL;

-- ── Purchase order statuses ─────────────────────────────────────────────
UPDATE masters SET color = '#64748b' WHERE list = 'po_status' AND key = 'Draft'     AND color IS NULL;
UPDATE masters SET color = '#3b82f6' WHERE list = 'po_status' AND key = 'Confirmed' AND color IS NULL;
UPDATE masters SET color = '#10b981' WHERE list = 'po_status' AND key = 'GRN Done'  AND color IS NULL;
UPDATE masters SET color = '#a855f7' WHERE list = 'po_status' AND key = 'Closed'    AND color IS NULL;
UPDATE masters SET color = '#f43f5e' WHERE list = 'po_status' AND key = 'Cancelled' AND color IS NULL;

-- ── Complaint statuses ──────────────────────────────────────────────────
UPDATE masters SET color = '#f43f5e' WHERE list = 'complaint_status' AND key = 'Registered'   AND color IS NULL;
UPDATE masters SET color = '#f59e0b' WHERE list = 'complaint_status' AND key = 'Under Review' AND color IS NULL;
UPDATE masters SET color = '#10b981' WHERE list = 'complaint_status' AND key = 'Resolved'     AND color IS NULL;
UPDATE masters SET color = '#64748b' WHERE list = 'complaint_status' AND key = 'Closed'       AND color IS NULL;


-- ── Confirm: every status option should now have a colour ───────────────
SELECT list,
       count(*)                          AS options,
       count(*) FILTER (WHERE color IS NOT NULL) AS with_colour
FROM   masters
WHERE  list LIKE '%status'
GROUP  BY list
ORDER  BY list;
-- Expected: with_colour equal to options on all four status lists.
