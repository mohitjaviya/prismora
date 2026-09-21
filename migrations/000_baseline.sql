-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — migration 000: start recording what has been applied.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  RUN THIS FIRST, ONCE. Everything after it depends on the table it makes.
--
--  WHY
--
--  There were twenty-five .sql files in the repository root, in no order, with
--  no record of which had been run. Working out the real state took an audit:
--  probing the live database column by column to see which migrations had
--  landed and which had not. That found ADD_MASTER_COLOURS applied, its own
--  commit message claiming otherwise, and SECURE_ROLES_TABLE written but never
--  run while a privilege-escalation hole stayed open.
--
--  That is not a thing to do twice. This table makes the answer a query.
--
--  WHAT IT ASSUMES
--
--  The inserts below record the migrations verified as applied to THIS database
--  on 2026-09-20 and 21, each one confirmed by probing for what it creates --
--  the column, the function, the policy, the constraint -- not by reading a
--  file or trusting a commit message.
--
--  On a fresh database this file is wrong: nothing has been applied there, and
--  the inserts would claim otherwise. Run it with the inserts commented out
--  instead, then apply the numbered files in order. See migrations/README.md,
--  which is honest about how far that will get you.
-- ════════════════════════════════════════════════════════════════════════


CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

COMMENT ON TABLE public.schema_migrations IS
  'One row per migration file that has been run. Written by the file itself, '
  'as its last statement. If a file is not in here it has not been applied.';

ALTER TABLE public.schema_migrations ENABLE ROW LEVEL SECURITY;

-- Readable by anyone signed in -- knowing which migrations have run is not
-- sensitive, and being able to check without the dashboard is the point.
-- Written only by whoever is running SQL directly, which RLS does not gate.
DROP POLICY IF EXISTS schema_migrations_read ON public.schema_migrations;
CREATE POLICY schema_migrations_read ON public.schema_migrations
  FOR SELECT TO authenticated USING (true);


-- ── What this database already has ──────────────────────────────────────
-- Each verified by probing for its effect, on the dates given.
INSERT INTO public.schema_migrations (filename, note) VALUES
  ('001_supabase_schema.sql',          'pre-dates tracking; recorded from the audit'),
  ('002_complete_database_schema.sql', 'pre-dates tracking; creates 31 tables, 4 of which are not in this database'),
  ('003_phase1_schema.sql',            'pre-dates tracking; overlaps 002'),
  ('004_phase2_schema.sql',            'pre-dates tracking; overlaps 002'),
  ('005_accounting_schema.sql',        'pre-dates tracking; invoices and credit_notes exist'),
  ('006_fix_production_schema.sql',    'pre-dates tracking'),
  ('007_fix_schema_part2.sql',         'pre-dates tracking'),
  ('008_run_this_migration.sql',       'pre-dates tracking'),
  ('009_create_masters.sql',           'verified 2026-09-20: masters.list present, 75 rows'),
  ('010_create_roles.sql',             'verified 2026-09-20: roles.permissions and roles.level present, 15 rows'),
  ('011_fix_leads_and_attendance.sql', 'verified 2026-09-20: attendance.punchInLat and leads.assignedTo present'),
  ('012_add_master_colours.sql',       'verified 2026-09-20: masters.color and masters.description present'),
  ('013_drop_password_column.sql',     'verified 2026-09-20: users.password absent, which is the desired end state'),
  ('014_secure_rls_policies.sql',      'verified 2026-09-20: is_app_admin() and current_app_email() both callable'),
  ('015_secure_roles_table.sql',       'verified 2026-09-20: roles_signed_in gone, four admin-gated policies in its place'),
  ('016_add_receipt_evidence.sql',     'verified 2026-09-20: all four receipt columns present on orders'),
  ('017_rls_1_foundation.sql',         'verified 2026-09-20: app_access, can_view, is_partner, my_distributor_id all answer'),
  ('018_rls_2_partner_scoped.sql',     'verified 2026-09-20: a distributor saw 3 of 4 orders, not 4'),
  ('019_rls_3_remaining.sql',          'verified 2026-09-20: a distributor saw 1 distributor and 0 retailers'),
  ('020_rls_4_users.sql',              'verified 2026-09-21: an account with no role saw 0 users; re-run after the orphan fix'),
  ('021_add_foreign_keys.sql',         'verified 2026-09-21: inserting an order with a missing parent was refused with 23503'),
  ('022_add_product_columns.sql',      'verified 2026-09-21: products.sku and products.status present')
ON CONFLICT (filename) DO NOTHING;


-- ── What is in the ledger ───────────────────────────────────────────────
SELECT 'applied' AS state, count(*) AS files FROM public.schema_migrations;

SELECT filename, applied_at::date AS applied, note
FROM   public.schema_migrations
ORDER  BY filename;
-- The list above stops at 022 on purpose. Everything from 023 onward records
-- itself as its last statement, so this file never needs touching again --
-- 023 through 028 were run after this baseline and are in the table by their
-- own hand.
--
-- 000 has no row of its own, which is the one absence that cannot mislead: the
-- table is the thing this file makes, so if you can run this query at all, it
-- has been applied.
