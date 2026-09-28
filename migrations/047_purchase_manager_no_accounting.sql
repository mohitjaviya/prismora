-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Purchase Manager loses Accounting view (least access).
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 046.
--
--  046 restored Purchase Manager to 010's setup, which includes Accounting
--  view. That lets the role read every partner payment, invoice and credit
--  note — customer money a buyer does not need to do the job (Phase 1 D-01,
--  rated CRITICAL). The owner decided on 2026-09-28: Accounting none. Nothing
--  else about the role changes; vendor bills and payments stay under
--  Purchases.
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM set_config('app.via', 'migration 047: Purchase Manager Accounting view → none (least access; owner decision 2026-09-28)', true);
  UPDATE public.roles
     SET permissions = jsonb_set(permissions, '{accounting}', '"none"')
   WHERE id = 'Purchase Manager'
     AND permissions ->> 'accounting' IS DISTINCT FROM 'none';
END $$;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('047_purchase_manager_no_accounting.sql',
        'Purchase Manager accounting: view → none (least access; it read every partner payment, invoice and credit note)')
ON CONFLICT (filename) DO NOTHING;
