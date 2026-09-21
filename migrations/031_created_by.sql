-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — "who added this?" becomes a column rather than a search
--  through the audit log.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  Ask who logged a ₹40,000 expense and there is no answer on the expense. The
--  only record is an `events` row written at the time, findable by scrolling
--  the audit trail in Settings and matching on wording. For a purchase order,
--  the same.
--
--  Four tables already store it and no screen has ever shown it:
--
--      purchase_returns      recordedBy
--      vendor_payments       recordedBy
--      credit_notes          recordedBy
--      distributor_payments  recordedBy
--      grn                   receivedBy
--
--  Two do not store it at all — `expenses` and `purchase_orders`. Both carry
--  `assignedTo`, which is a different question: on an expense that is who the
--  money is for, and on a purchase order it is who owns the order. Neither is
--  who typed it in, and reporting one as the other would put the wrong name
--  beside somebody else's mistake.
--
--  WHY NOT RENAME THE OTHER FIVE TO MATCH
--
--  Because it would be a migration that changes nothing anybody can see, on
--  columns that already hold the right data, with five places in the
--  application to update in step. The application reads whichever column a
--  record happens to carry instead (utils/attribution.js), which costs one
--  small function and no downtime.
--
--  NOT A FOREIGN KEY
--
--  Deliberately. `createdBy` is a note of who did something, and it has to
--  survive that person leaving: an expense from 2024 should still say who
--  entered it after their account is deleted. A foreign key with ON DELETE SET
--  NULL would quietly erase exactly the fact this column exists to keep, and
--  RESTRICT would make removing a former employee impossible.
--
--  Old rows stay NULL. Nothing can invent who entered them, and the screens
--  say "Not recorded" rather than guessing.
-- ════════════════════════════════════════════════════════════════════════


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['expenses', 'purchase_orders']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "createdBy" TEXT', t);
    RAISE NOTICE 'createdBy added to %', t;
  END LOOP;
END $$;


NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Expected: has_created_by = 1 for both.
SELECT c.relname AS table_name,
       count(*) FILTER (WHERE a.attname = 'createdBy') AS has_created_by
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped
WHERE  n.nspname = 'public' AND c.relname IN ('expenses', 'purchase_orders')
GROUP  BY c.relname
ORDER  BY c.relname;

-- How much history has no author, which is everything written before today.
-- Nothing can fill these in; the screens say "Not recorded".
SELECT 'expenses' AS table_name,
       count(*) FILTER (WHERE "createdBy" IS NULL) AS unattributed,
       count(*)                                    AS total
FROM   public.expenses
UNION ALL
SELECT 'purchase_orders',
       count(*) FILTER (WHERE "createdBy" IS NULL),
       count(*)
FROM   public.purchase_orders;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('031_created_by.sql',
        'createdBy on expenses and purchase_orders — the two transactional tables with no record of who entered the row; not a foreign key, so it survives the person leaving')
ON CONFLICT (filename) DO NOTHING;
