-- ════════════════════════════════════════════════════════════════════════
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
