-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 2 (Phase 2 finding B07): a new lead is
--  numbered by the database, in the same statement that saves it.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 060 (highest_sequential_id).
--
--  WHAT WAS WRONG
--
--  The browser picked the next lead number from the leads it could see. A
--  Sales Executive sees only their own, so the first try usually clashed,
--  and saving a lead took several round trips (insert, clash, ask for the
--  highest number, insert again). A page refreshed part-way through lost the
--  lead with no trace — B07.
--
--  WHAT THIS DOES
--
--  · A lead inserted without an id gets L<highest + 1>, chosen under a lock
--    so two people saving at once can't get the same number. The app now
--    saves a new lead in one request and reads the number back.
--  · A lead inserted with an id keeps it (imports, TEST data).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.leads_assign_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF nullif(btrim(NEW.id), '') IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('public.leads_assign_id'));
    NEW.id := 'L' || (coalesce((
      SELECT max(substr(id, 2)::integer) FROM public.leads
       WHERE left(id, 1) = 'L' AND substr(id, 2) ~ '^[0-9]{1,9}$'), 0) + 1);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS leads_assign_id ON public.leads;
CREATE TRIGGER leads_assign_id
  BEFORE INSERT ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_assign_id();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('064_leads_numbered_by_database.sql',
        'B07: a lead inserted without an id is numbered L<highest+1> by the database under a lock, so a new lead saves in one request')
ON CONFLICT (filename) DO NOTHING;
