-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — per-role RLS, part 4: the last table left wide open.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  RUN RLS_1_FOUNDATION.sql FIRST. This calls is_partner().
--
--  WHAT IT CLOSES
--
--  SECURE_RLS_POLICIES.sql set `users_read ... USING (true)` -- every signed-in
--  session reads every account. Measured as the Distributor on 2026-09-20,
--  after parts 1 to 3 had scoped everything else:
--
--      users   5 rows   every colleague's name, email and role
--
--  A channel partner has no business holding the office's address book. Staff
--  do: the assignment dropdowns, the manager hierarchies and the "who owns this
--  record" checks are all built from this table, and a sales manager who cannot
--  see their own team cannot assign anything.
--
--  So the line is drawn at partner, not at role: staff keep the full list,
--  partners get exactly one row -- their own.
--
--  WHY THIS DOES NOT LOCK A PARTNER OUT OF THEIR OWN PORTAL
--
--  Checked before writing it, rather than hoped:
--
--    canAccessData()       reads the signed-in user's own object, never the
--                          list, so it is unaffected.
--    getAssignableUsers()  returns [] for anything that is not an admin or a
--                          manager, so a partner already got nothing from it.
--    Profile.jsx           is the only partner-reachable screen touching the
--                          list at all, and both uses -- managedTeam and
--                          myManager -- sit behind isManagerRole / isSalesRole
--                          guards that a partner fails.
--
--  my_role_name() also reads this table, and still works: it matches on the
--  caller's own email, which is precisely the row the new policy still allows.
--
--  WRITES ARE UNTOUCHED. users_insert, users_update and users_delete stay
--  exactly as SECURE_RLS_POLICIES.sql left them -- including the self-service
--  registration path and the stored_role(id) check that stops somebody editing
--  their own profile into a promotion. Only reading changes here.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_read ON public.users;

-- ── Why this asks for a role and not just "is not a partner" ────────────
--
-- The first version of this policy read:
--
--     NOT public.is_partner() OR lower(email) = public.current_app_email()
--
-- and it leaked the whole table to an account that had no row here at all.
--
-- Signing in is Supabase Auth; having a role is this table. Nothing ties the
-- two together, so an auth account can outlive its row -- which is exactly
-- what happened to dist@prismora.com. is_partner() reads the level from a row
-- that is not there, gets NULL, and answers false. "Not a partner" then reads
-- as "therefore staff", and the account saw all five colleagues.
--
-- Everywhere else that phrase appears it is joined to can_view(...), which
-- returns 'none' for an account with no role, so those policies already fail
-- closed. This was the one place it granted on its own.
--
-- Now: you always see yourself, and you see everybody only if the database can
-- say what you are. An account with no role sees nothing, which is the right
-- answer to "who is this?" when there is no answer.
CREATE POLICY users_read ON public.users
  FOR SELECT TO authenticated
  USING (
    lower(email) = public.current_app_email()
    OR (public.my_role_name() IS NOT NULL AND NOT public.is_partner())
  );


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT policyname, cmd, qual, with_check
FROM   pg_policies
WHERE  schemaname = 'public' AND tablename = 'users'
ORDER  BY policyname;
-- Expected: four policies. users_read now carries the partner test; the other
-- three are unchanged from SECURE_RLS_POLICIES.sql.
--
-- Then sign in as a partner and confirm the account still loads. If the portal
-- comes up blank, the rollback below restores the old behaviour immediately:
--
--     DROP POLICY IF EXISTS users_read ON public.users;
--     CREATE POLICY users_read ON public.users
--       FOR SELECT TO authenticated USING (true);
