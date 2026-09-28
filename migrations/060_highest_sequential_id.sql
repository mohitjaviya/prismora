-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — found while testing Batch 4: a Sales Executive could not add a
--  lead.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT WAS WRONG
--
--  New leads, expenses, purchase orders, GRNs and complaints get the next
--  number (L11, EXP-7 …) worked out in the browser from the rows the user can
--  see, and on a clash the app asks the table for its highest id. Since the
--  access rules (043) a Sales Executive sees only their own leads, so both
--  answers stop short of ids other reps already hold: L1–L8 were all taken,
--  every try clashed, and the app gave up — "The lead could not be saved."
--  The same would hit any role that sees part of one of those tables.
--
--  WHAT THIS DOES
--
--  · highest_sequential_id(table, prefix): the highest number in use for that
--    prefix across the whole table. It returns one number and no rows, for
--    the five tables above only, to signed-in users only.
--  · The app asks it on a clash and jumps past it (DataContext).
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.highest_sequential_id(p_table text, p_prefix text)
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_highest integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Sign in first.' USING ERRCODE = '42501';
  END IF;
  IF p_table NOT IN ('leads', 'expenses', 'purchase_orders', 'grn', 'complaints') THEN
    RAISE EXCEPTION 'No numbering for %.', p_table USING ERRCODE = '22023';
  END IF;
  EXECUTE format(
    'SELECT COALESCE(MAX(substr(id, $2)::integer), 0) FROM public.%I
      WHERE left(id, $1) = $3 AND substr(id, $2) ~ ''^[0-9]{1,9}$''', p_table)
    INTO v_highest
    USING length(p_prefix), length(p_prefix) + 1, p_prefix;
  RETURN v_highest;
END;
$$;

REVOKE ALL ON FUNCTION public.highest_sequential_id(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.highest_sequential_id(text, text) TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('060_highest_sequential_id.sql',
        'Next ids (leads, expenses, POs, GRNs, complaints) found from the whole table, not only the rows the user can see; a Sales Executive could not add a lead')
ON CONFLICT (filename) DO NOTHING;
