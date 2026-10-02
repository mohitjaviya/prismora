DO $dry$ DECLARE rep text := ''; n int; BEGIN
  EXECUTE $mig$-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 8: a user's e-mail cannot be edited (Phase 2 G gap).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 071/072.
--
--  WHAT WAS WRONG
--
--  A person's sign-in is matched to their profile by e-mail (every policy asks
--  "does this profile's e-mail equal the e-mail on my token?"). Team Members let
--  an administrator edit the profile's e-mail only; the sign-in (in Supabase
--  Auth) kept the old one. The profile then matched no sign-in: the person was
--  locked out, and deleting the profile later left the old sign-in behind.
--
--  WHAT THIS DOES
--
--  users_email_locked (BEFORE UPDATE OF email on users): a signed-in app user
--  cannot change a profile's e-mail, whoever they are. The service key and
--  database maintenance are not app actions and pass. A different e-mail means
--  a new account: create it, then deactivate or delete the old one.
--  It is an ordinary (invoker) function, like 072: a definer function would
--  never see current_user as 'authenticated' and so would never apply.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.users_email_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') OR public.is_service_request() THEN
    RETURN NEW;
  END IF;
  IF NEW.email IS DISTINCT FROM OLD.email THEN
    RAISE EXCEPTION 'A user''s e-mail cannot be changed: it is what their sign-in is matched to, so the person would be locked out. Create a new account for the new e-mail and deactivate this one.'
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS users_email_locked ON public.users;
CREATE TRIGGER users_email_locked
  BEFORE UPDATE OF email ON public.users
  FOR EACH ROW EXECUTE FUNCTION public.users_email_locked();

REVOKE ALL ON FUNCTION public.users_email_locked() FROM PUBLIC, anon, authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('073_user_email_locked.sql',
        'a profile''s e-mail cannot be edited by an app user (it is the key to their sign-in); change = new account')
ON CONFLICT (filename) DO NOTHING;
$mig$;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''moved@example.test'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A1 Admin changes an ordinary user''s e-mail [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A1 Admin changes an ordinary user''s e-mail [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=upper(email) WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A2 Admin changes only the CASE of an e-mail [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A2 Admin changes only the CASE of an e-mail [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''me@example.test'' WHERE id=''U-TEST-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'A3 Admin changes another Admin''s e-mail (own row) [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'A3 Admin changes another Admin''s e-mail (own row) [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''moved@example.test'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S1 Super Admin changes an ordinary user''s e-mail [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S1 Super Admin changes an ordinary user''s e-mail [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''sa@example.test'' WHERE id=''U-TEST-SUPER-ADMIN'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'S2 Super Admin changes their own e-mail [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'S2 Super Admin changes their own e-mail [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.sales.exec.1@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=''se@example.test'' WHERE id=''U-TEST-SALES-EXEC-1'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'E1 Sales Executive changes their own e-mail [want refused] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'E1 Sales Executive changes their own e-mail [want refused] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET name=''x'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B1 Admin edits a name (e-mail untouched) [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B1 Admin edits a name (e-mail untouched) [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET email=email WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B2 Admin saves the SAME e-mail [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B2 Admin saves the SAME e-mail [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET role=''Sales Executive'', status=''Active'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B3 Admin edits role + status (e-mail untouched) [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B3 Admin edits role + status (e-mail untouched) [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.super.admin@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET name=''y'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B4 Super Admin edits a name [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B4 Super Admin edits a name [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.sales.exec.1@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'UPDATE users SET name=''z'' WHERE id=''U-TEST-SALES-EXEC-1'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'B5 Sales Executive edits their own name [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'B5 Sales Executive edits their own name [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"service_role","email":"svc@example.test"}', true);
    EXECUTE 'SET LOCAL ROLE service_role';
    EXECUTE 'UPDATE users SET email=''svc-moved@example.test'' WHERE id=''U-TEST-ACCOUNTS'''; GET DIAGNOSTICS n = ROW_COUNT;
    rep := rep || E'\n' || 'V1 service key (Edge function) may still change an e-mail [want ok] => DONE rows=' || n;
    RAISE EXCEPTION 'STEP-ROLLBACK';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM <> 'STEP-ROLLBACK' THEN rep := rep || E'\n' || 'V1 service key (Edge function) may still change an e-mail [want ok] => REFUSED: ' || left(SQLERRM, 110); END IF;
  END;
  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;
END $dry$;
