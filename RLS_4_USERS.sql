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

CREATE POLICY users_read ON public.users
  FOR SELECT TO authenticated
  USING (
    NOT public.is_partner()
    OR lower(email) = public.current_app_email()
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
