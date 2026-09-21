-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — somewhere for partner-signup to remember who has been asking.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHY
--
--  partner-signup is public by necessity: the people it serves have no account
--  yet. It creates an auth account and two rows every time it succeeds, and an
--  Edge Function keeps nothing between invocations, so a throttle needs a table
--  or it has nothing to count.
--
--  Nothing is granted by flooding it — 029 means a Pending account has no
--  access at either layer — but a few thousand fake registrations would bury
--  the real ones, and every one of them is an auth account somebody has to
--  delete by hand.
--
--  WHAT IS STORED, AND WHAT IS NOT
--
--  The caller's IP is not stored. What is stored is a SHA-256 of it, salted
--  with a secret the function already holds. Two requests from one address
--  produce the same hash, which is all a throttle needs; the address itself
--  cannot be read back out, which matters because these are prospective
--  business contacts who have not agreed to anything yet.
--
--  An unsalted hash would not do. IPv4 is four billion values — small enough to
--  hash exhaustively — so an unsalted digest is a reversible record of who
--  visited, wearing a disguise.
--
--  The email is stored in full, deliberately. It is already in `users` for a
--  successful signup, and for a failed one it is the only way to answer "did my
--  registration go through?" when somebody telephones to ask.
--
--  WHO CAN READ IT
--
--  Nobody through the API. RLS is on and there are no policies, so every
--  request through PostgREST sees zero rows. The function reaches it with the
--  service key, which bypasses RLS; an administrator reads it in the SQL
--  editor. A deny-by-default table with no policies is not an oversight here,
--  it is the configuration.
-- ════════════════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS public.signup_attempts (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  ip_hash     text,
  email       text,
  kind        text,
  -- 'ok', 'refused', or 'throttled'. Kept apart so a person retrying a
  -- mistyped form is not counted the same way as a successful registration.
  outcome     text NOT NULL,
  reason      text
);

COMMENT ON TABLE public.signup_attempts IS
  'One row per call to the partner-signup Edge Function. Feeds its rate limit. ip_hash is a salted SHA-256 — the address itself is deliberately not stored.';

-- The two questions the throttle asks, both narrow and both time-bounded.
CREATE INDEX IF NOT EXISTS signup_attempts_ip_at  ON public.signup_attempts (ip_hash, at DESC);
CREATE INDEX IF NOT EXISTS signup_attempts_at     ON public.signup_attempts (at DESC);

ALTER TABLE public.signup_attempts ENABLE ROW LEVEL SECURITY;

-- Said out loud rather than left to be noticed: no policy is created, so no
-- role reaching this table through PostgREST can see a single row. Dropping a
-- policy that was never added is how a table like this quietly opens up.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'signup_attempts') THEN
    RAISE WARNING 'signup_attempts has a policy on it. It is meant to have none — check who added it.';
  ELSE
    RAISE NOTICE 'signup_attempts: RLS on, no policies. Readable only with the service key or in the SQL editor.';
  END IF;
END $$;


NOTIFY pgrst, 'reload schema';


-- ── Verify ───────────────────────────────────────────────────────────────
-- Expected: rls_enabled true, policies 0.
SELECT c.relname                AS table_name,
       c.relrowsecurity         AS rls_enabled,
       (SELECT count(*) FROM pg_policies p
         WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policies
FROM   pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE  n.nspname = 'public' AND c.relname = 'signup_attempts';


-- ── Reading it later ─────────────────────────────────────────────────────
-- What has been arriving, and from how many distinct sources:
--
--   SELECT date_trunc('hour', at) AS hour, outcome,
--          count(*) AS attempts, count(DISTINCT ip_hash) AS sources
--   FROM   public.signup_attempts
--   WHERE  at > now() - interval '7 days'
--   GROUP  BY 1, 2 ORDER BY 1 DESC;
--
-- Whether one address is responsible:
--
--   SELECT ip_hash, count(*), min(at), max(at)
--   FROM   public.signup_attempts
--   WHERE  at > now() - interval '24 hours'
--   GROUP  BY ip_hash HAVING count(*) > 5 ORDER BY 2 DESC;
--
-- The function deletes rows older than 30 days as it goes, so this table stays
-- small without anything scheduled. To clear it by hand:
--
--   DELETE FROM public.signup_attempts WHERE at < now() - interval '30 days';


-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('030_signup_attempts.sql',
        'signup_attempts — salted ip hash + outcome per partner-signup call, feeds the rate limit; RLS on with no policies, so only the service key reads it')
ON CONFLICT (filename) DO NOTHING;
