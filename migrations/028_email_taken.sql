-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — "is this email already registered?" answered yes or no,
--  without handing anybody the list.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  All three signup pages guard against a duplicate account like this:
--
--      if (users.some(u => u.email.toLowerCase() === form.email.toLowerCase()))
--
--  `users` comes from the app's own table, and the visitor filling in a signup
--  form has no account yet, so that read is anonymous and returns zero rows.
--  The check therefore always passes. The real rejection comes later, from
--  supabase.auth.signUp, as a message about the auth system rather than a
--  sentence telling somebody they already have an account.
--
--  WHY NOT JUST LET anon READ users
--
--  Because that publishes every staff and partner email address in the
--  business to anyone who opens the signup page. The question the form needs
--  answered is one bit wide. This returns that bit and nothing else: it takes
--  an address the visitor has already typed and says whether it is spoken for.
--
--  WHAT IT CHECKS
--
--  Both places an account can exist:
--
--    auth.users    the sign-in credential. This is what signUp collides with,
--                  so it is the authoritative answer.
--    public.users  the profile row. Normally created alongside, but the two
--                  can drift -- an auth account whose profile insert failed
--                  leaves an email that is taken while `users` says it is free.
--
--  Checking only one would give an answer that is right most of the time,
--  which for a duplicate-account check is the same as being unreliable.
--
--  WHAT IT DOES NOT SOLVE
--
--  Anything that answers this question is an oracle: ask it repeatedly and you
--  learn which addresses have accounts. That is inherent to telling somebody
--  they have already signed up, and this application already leaks the same
--  fact more slowly -- a signup attempt against a registered address fails.
--  Narrowing it to a boolean does not close it.
--
--  If that matters later, the fix is a rate limit in front of the RPC, not a
--  change here. Worth knowing about rather than discovering.
-- ════════════════════════════════════════════════════════════════════════


CREATE OR REPLACE FUNCTION public.email_taken(p_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
-- An empty search_path, not `public` like the functions in 017. Those are
-- called by RLS policies on behalf of signed-in users; this one is callable by
-- anyone on the internet, so every name below is schema-qualified and nothing
-- is resolved by lookup.
SET search_path = ''
AS $$
  SELECT EXISTS (
           SELECT 1 FROM auth.users
           WHERE lower(email) = lower(btrim(coalesce(p_email, '')))
             AND btrim(coalesce(p_email, '')) <> ''
         )
      OR EXISTS (
           SELECT 1 FROM public.users
           WHERE lower(email) = lower(btrim(coalesce(p_email, '')))
             AND btrim(coalesce(p_email, '')) <> ''
         );
$$;

COMMENT ON FUNCTION public.email_taken(text) IS
  'True when an account already exists for this address, in auth.users or public.users. Callable by anon so the signup forms can say so before submitting. Returns one boolean and never a row.';


-- ── Who may call it ──────────────────────────────────────────────────────
-- Revoked from PUBLIC first. A SECURITY DEFINER function is executable by
-- everyone the moment it is created, which is not a default to inherit
-- silently on something that reads auth.users.
REVOKE ALL ON FUNCTION public.email_taken(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.email_taken(text) TO anon, authenticated;


-- PostgREST caches the schema; without this the RPC 404s until it rebuilds,
-- which looks exactly like the migration not having run.
NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Expected: is_definer true, search_path_locked true, anon_can_execute true,
-- public_can_execute false.
SELECT p.proname,
       p.prosecdef                                             AS is_definer,
       coalesce(array_to_string(p.proconfig, ','), '')
         LIKE '%search_path=%'                                 AS search_path_locked,
       has_function_privilege('anon',   p.oid, 'EXECUTE')       AS anon_can_execute,
       has_function_privilege('public', p.oid, 'EXECUTE')       AS public_can_execute
FROM   pg_proc p
JOIN   pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public' AND p.proname = 'email_taken';

-- And that it actually answers. The first should be false, the second true if
-- that address has an account -- put a real one in to check.
SELECT public.email_taken('definitely-nobody-' || gen_random_uuid() || '@example.com') AS should_be_false,
       public.email_taken('')                                                          AS blank_is_false,
       public.email_taken(NULL)                                                        AS null_is_false;


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('028_email_taken.sql',
        'email_taken(text) -> boolean, SECURITY DEFINER, anon EXECUTE — the signup duplicate-account check, without exposing the email list')
ON CONFLICT (filename) DO NOTHING;
