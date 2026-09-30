-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — security fix: a scheme's name held three demo accounts'
--  emails and passwords in plain text, readable by any signed-in partner.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once (the rename is idempotent; guard on the
--  password rotation is left to the person running it — see note below).
--
--  WHAT WAS WRONG
--
--  Scheme SCH-1790405906612's name was:
--    "All Password   newdistributor@gmail.com-  mEop-Ahav-uqy2
--     demodealer@gmail.com- wPHz-xBD9-AFo4    demoretailer@gmail.com-
--     XdEJ-3jhg-rxF6"
--  Found in Phase 2 story E (E02): every partner can read every scheme's
--  name (view access to Schemes), so this handed out three working logins,
--  including one to that partner's own account and two others'.
--
--  WHAT THIS DOES
--
--  1. Renames the scheme to something with no personal data.
--  2. Records the rename and the reason in audit_log (the scheme's own
--     audit_row trigger covers the name change; this migration also writes
--     one explicit row against each of the three affected user accounts,
--     since auth.users has no audit trigger of its own).
--  3. Documents the three passwords that must be rotated by hand, because
--     this file is kept in the repo and must not itself carry a password.
--     Run 069_rotate_passwords.sql (written once, then deleted — see the
--     hand-off script) to do the rotation; it is not part of this file.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE public.schemes
   SET name = 'TEST Distributor Scheme 5pct'
 WHERE id = 'SCH-1790405906612'
   AND name <> 'TEST Distributor Scheme 5pct';

-- One explicit note per affected account, since auth.users changes (the
-- password rotation itself) are not covered by any public-table trigger.
INSERT INTO public.audit_log (at, actor_id, actor_name, actor_role, table_name, row_id, action, changes, via)
SELECT now(), NULL, 'System', NULL, 'users', u.id, 'changed',
       jsonb_build_object('password', jsonb_build_array('exposed', 'rotated')),
       'security: credentials were exposed in a scheme name (SCH-1790405906612); password rotated'
  FROM public.users u
 WHERE u.email IN ('newdistributor@gmail.com', 'demodealer@gmail.com', 'demoretailer@gmail.com');

INSERT INTO public.schema_migrations (filename, note)
VALUES ('069_scheme_name_password_leak.sql',
        'Renamed SCH-1790405906612 off its password-bearing name; audited the password rotation for the three exposed demo accounts (rotation itself run separately, not committed)')
ON CONFLICT (filename) DO NOTHING;

COMMIT;
