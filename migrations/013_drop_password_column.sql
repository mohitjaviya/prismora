-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — delete the plain-text passwords.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--
--  RUN THIS ONLY AFTER every one of the 16 accounts has signed in
--  successfully through Supabase Auth. This is not reversible: once the
--  column is gone, those passwords are gone. Supabase Auth is the only
--  place a password lives after this, and it stores a hash, not the word.
--
--  Why it still matters after SECURE_RLS_POLICIES.sql:
--    Those policies stopped the public key reading this table. They did not
--    stop a signed-in colleague reading it — the app needs the user list for
--    assignment dropdowns, so any employee's session can select from `users`,
--    and today that includes a `password` column holding everyone's password
--    in plain text. The Sales rep can read the Director's password.
--
--    Nothing in the application reads this column any more. Sign-in stopped
--    using it when login moved to Supabase Auth.
-- ════════════════════════════════════════════════════════════════════════


-- ── 1. Look before deleting ─────────────────────────────────────────────
-- Run this on its own first. It shows how many accounts still carry a
-- password here, without printing any of them.
SELECT count(*) FILTER (WHERE password IS NOT NULL AND password <> '') AS accounts_with_stored_password,
       count(*)                                                        AS total_accounts
FROM   public.users;


-- ── 2. Delete the column ────────────────────────────────────────────────
ALTER TABLE public.users DROP COLUMN IF EXISTS password;


-- ── 3. Confirm: this must return no rows ────────────────────────────────
SELECT column_name
FROM   information_schema.columns
WHERE  table_schema = 'public'
  AND  table_name   = 'users'
  AND  column_name  = 'password';
