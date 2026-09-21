-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the same question, asked of the three biggest tables.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHY A SECOND FILE
--
--  031 did expenses and purchase_orders, which is where the question was
--  first asked. Orders, invoices and leads are the three tables people
--  actually spend the day in, and none of them records who entered a row
--  either.
--
--  All three carry `assignedTo`, and it is not the same thing. On a lead it is
--  the rep working it; on an order the rep who owns it; on an invoice who it
--  is filed under. A lead can be entered by whoever answered the telephone and
--  assigned to somebody else in the same breath, and an order raised from a
--  field visit is assigned to the executive whether or not they raised it.
--  Reporting one as the other would put the wrong name against the entry.
--
--  ORDERS ARE ALSO WRITTEN BY PARTNERS
--
--  A distributor placing their own order through the portal is the one writing
--  the row, and `createdBy` will hold their user id rather than a colleague's.
--  That is the honest answer to "who raised this" and worth having: it tells a
--  self-service order from one somebody keyed in over the phone.
--
--  NOT A FOREIGN KEY
--
--  Same reasoning as 031. It is a note of who did something and has to survive
--  that person leaving: an order from 2024 should still say who took it after
--  the account is deleted. ON DELETE SET NULL would erase exactly the fact the
--  column exists to keep, and RESTRICT would make removing a former employee
--  impossible.
--
--  Old rows stay NULL, and the screens say "Not recorded" rather than guessing.
-- ════════════════════════════════════════════════════════════════════════


DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['orders', 'invoices', 'leads']
  LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "createdBy" TEXT', t);
    RAISE NOTICE 'createdBy added to %', t;
  END LOOP;
END $$;


NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Expected: has_created_by = 1 on all five tables, 031's two included.
SELECT c.relname AS table_name,
       count(*) FILTER (WHERE a.attname = 'createdBy')  AS has_created_by,
       count(*) FILTER (WHERE a.attname = 'assignedTo') AS has_assigned_to
FROM   pg_class c
JOIN   pg_namespace n ON n.oid = c.relnamespace
LEFT   JOIN pg_attribute a ON a.attrelid = c.oid AND NOT a.attisdropped
WHERE  n.nspname = 'public'
AND    c.relname IN ('orders', 'invoices', 'leads', 'expenses', 'purchase_orders')
GROUP  BY c.relname
ORDER  BY c.relname;

-- How much history has no author. Nothing can fill these in.
SELECT 'orders'   AS table_name, count(*) FILTER (WHERE "createdBy" IS NULL) AS unattributed, count(*) AS total FROM public.orders
UNION ALL SELECT 'invoices', count(*) FILTER (WHERE "createdBy" IS NULL), count(*) FROM public.invoices
UNION ALL SELECT 'leads',    count(*) FILTER (WHERE "createdBy" IS NULL), count(*) FROM public.leads;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('032_created_by_part_two.sql',
        'createdBy on orders, invoices and leads — assignedTo on all three is who owns the row, not who entered it; not a foreign key, so it survives the person leaving')
ON CONFLICT (filename) DO NOTHING;
