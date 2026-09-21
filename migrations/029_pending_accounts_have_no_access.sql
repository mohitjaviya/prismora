-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — an unapproved account has no access, decided by the database
--  rather than by the browser.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  A partner who signs up is created with status 'Pending' and cannot get past
--  the sign-in screen: login() reads the profile and, on 'Pending', signs them
--  straight back out again.
--
--  That check is in the browser. The anon key and the project URL are in the
--  public bundle, so anybody can authenticate against /auth/v1/token directly,
--  get a perfectly valid JWT, and talk to /rest/v1 without ever loading the
--  application. At that point the only thing deciding what they can read is
--  row-level security -- and nothing in 017 through 020 looks at status:
--
--      my_role_name()  ->  SELECT role FROM users WHERE lower(email) = …
--
--  No status test. So an unapproved partner's token resolves to the Distributor
--  role, app_access() hands out that role's permissions, and is_partner() plus
--  owns_party_row() let them read and write their own orders. Sign-up to
--  working API access, with no approval anywhere in between.
--
--  WHERE THE FIX GOES
--
--  One place. Everything else derives from my_role_name():
--
--      my_role_level()  ← my_role_name()
--      is_partner()     ← my_role_level()      → false when the name is NULL
--      app_access()     ← my_role_name()       → 'none' when the name is NULL
--      can_view/can_edit ← app_access()        → false
--
--  So a status test inside my_role_name() closes every policy at once, and
--  closes them the way they were already written to fail.
--
--  The partner-scoped helpers get the same test even though they are now
--  unreachable for a blocked account. A future policy should not have to know
--  the cascade to be safe.
--
--  WHAT IS DELIBERATELY STILL ALLOWED
--
--  Reading your own row in `users`. users_read grants that on email alone, and
--  it has to keep working: login() reads the profile to discover the account is
--  Pending, and that is how the visitor gets told "awaiting approval" instead
--  of a blank screen. Blocking it would turn a clear message into a bug report.
--
--  WHICH STATUSES ARE BLOCKED, AND WHY NOT A WHITELIST
--
--  'Pending' and 'Rejected' -- exactly the two the application already refuses
--  at sign-in. Matching it keeps one answer to "may this account in?" instead
--  of two that can drift apart.
--
--  Not `status = 'Active'`. That would be a whitelist, and any row carrying
--  NULL or some spelling nobody remembers introducing would lose all access the
--  moment this ran -- including, possibly, the only administrator. A lockout is
--  a worse failure here than an unexpected status staying as permissive as it
--  was yesterday. The query at the bottom prints what is actually in the column
--  so the decision can be revisited with the facts in hand.
-- ════════════════════════════════════════════════════════════════════════


-- ── What the database thinks of this account ────────────────────────────
-- Exposed as its own function so the answer can be asked for directly, in a
-- policy or in a diagnosis, rather than inferred from a screen being empty.
CREATE OR REPLACE FUNCTION public.my_account_status()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT status FROM public.users
  WHERE lower(email) = public.current_app_email()
  LIMIT 1
$$;

COMMENT ON FUNCTION public.my_account_status() IS
  'The status on the calling account''s profile row, or NULL if it has none.';

CREATE OR REPLACE FUNCTION public.account_is_blocked()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(public.my_account_status() IN ('Pending', 'Rejected'), false)
$$;

COMMENT ON FUNCTION public.account_is_blocked() IS
  'True for an account awaiting approval or refused. Blocklist, not whitelist: an unexpected or missing status stays as permissive as it was, because locking every administrator out is worse than one unknown status.';


-- ── The one function everything else hangs off ──────────────────────────
-- Unchanged apart from the status test. A blocked account gets NULL, and NULL
-- is what every function above it was already written to fail closed on.
CREATE OR REPLACE FUNCTION public.my_role_name()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected')
  LIMIT 1
$$;


-- ── Defence in depth for the partner helpers ────────────────────────────
-- app_access() is already 'none' and is_partner() already false by the time
-- these are consulted, so nothing reaches them for a blocked account today.
-- They carry the test anyway: the next policy somebody writes should be safe
-- because the function is, not because of a chain they have to hold in mind.
CREATE OR REPLACE FUNCTION public.my_distributor_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "distributorId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_dealer_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "dealerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected')
  LIMIT 1
$$;

CREATE OR REPLACE FUNCTION public.my_retailer_id()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT "retailerId" FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected')
  LIMIT 1
$$;


NOTIFY pgrst, 'reload schema';


-- ── Look before you trust it ────────────────────────────────────────────
-- 1. Every status in use, and how many accounts hold it. Anything here other
--    than Active, Pending, Rejected or Inactive is worth understanding before
--    this is relied on.
SELECT coalesce(status, '(null)') AS status, count(*) AS accounts
FROM   public.users
GROUP  BY status
ORDER  BY accounts DESC;

-- 2. Nobody should be locked out who was not meant to be. This lists every
--    account that this migration has just cut off. Expect only self-signed-up
--    partners awaiting approval, and anybody previously rejected.
SELECT id, name, email, role, status
FROM   public.users
WHERE  status IN ('Pending', 'Rejected')
ORDER  BY status, email;

-- 3. The functions answer.
SELECT p.proname, p.prosecdef AS is_definer
FROM   pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE  n.nspname = 'public'
AND    p.proname IN ('my_account_status', 'account_is_blocked', 'my_role_name',
                     'my_distributor_id', 'my_dealer_id', 'my_retailer_id')
ORDER  BY p.proname;


-- ── Rollback ────────────────────────────────────────────────────────────
-- If an approved account loses access, this restores the previous behaviour
-- immediately. It reopens the hole, so it is a way to stay working while the
-- cause is found, not a resting place.
--
--   CREATE OR REPLACE FUNCTION public.my_role_name()
--   RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
--   AS $rollback$
--     SELECT role FROM public.users
--     WHERE lower(email) = public.current_app_email()
--     LIMIT 1
--   $rollback$;
--   NOTIFY pgrst, 'reload schema';


-- ── Record ──────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('029_pending_accounts_have_no_access.sql',
        'my_role_name() and the partner helpers ignore Pending/Rejected accounts, so the approval gate is in the database and not only in login()')
ON CONFLICT (filename) DO NOTHING;
