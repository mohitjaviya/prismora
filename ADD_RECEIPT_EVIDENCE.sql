-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — who says the goods arrived, and how they know.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  Receipt could only ever be recorded by the customer, signed in to their own
--  portal. A customer created by staff has no login, so for them it could
--  never be recorded at all: their delivered stock stayed "unconfirmed" for
--  ever, under a prompt telling them to confirm it on a page they cannot open.
--
--  Staff can now record it for them. These columns are what keep the two
--  apart — the customer saying "it arrived" and an employee saying "they told
--  me it arrived" are different claims, and a year later somebody auditing a
--  disputed delivery needs to know which one this was.
--
--    receiptSource      'partner' or 'staff'
--    receiptRecordedBy  the employee's name, when it was staff
--    receiptEvidence    how they knew: a phone call, a signed note, a POD
--    receiptNote        the detail, required when the evidence is "Other"
--
--  Until this runs, the application still records receipt — the tick and the
--  date are existing columns — but it cannot keep the proof, and it says so
--  on screen rather than dropping it quietly.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receiptSource"     TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receiptRecordedBy" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receiptEvidence"   TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receiptNote"       TEXT;


-- ── Everything already confirmed came from the portal, because until now
--    that was the only way to confirm anything. Say so, rather than leaving
--    it blank and letting it be mistaken for a staff entry later. ──────────
UPDATE orders
SET    "receiptSource" = 'partner'
WHERE  "receivedByDistributor" IS TRUE
AND    "receiptSource" IS NULL;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT "receiptSource",
       count(*) AS orders
FROM   orders
WHERE  "receivedByDistributor" IS TRUE
GROUP  BY "receiptSource";
-- Expected: every confirmed order accounted for, none with a NULL source.
