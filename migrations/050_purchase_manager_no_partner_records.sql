-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Purchase Manager no longer reaches partner records.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 047.
--
--  010 gave Purchase Manager full Distributors, Dealers and Retailers. A buyer
--  deals with vendors; partners are customers. With that access the role read
--  every partner's outstanding balance, and could add, edit, delete and
--  approve partners. Owner decision 2026-09-28 (option a): none for all three.
--  Least access; Purchases and Inventory are unchanged.
-- ════════════════════════════════════════════════════════════════════════

DO $$
BEGIN
  PERFORM set_config('app.via', 'migration 050: Purchase Manager Distributors/Dealers/Retailers → none (least access: partner balances and partner edits are not a buyer''s work; owner decision 2026-09-28)', true);
  UPDATE public.roles
     SET permissions = permissions || '{"distributors":"none","dealers":"none","retailers":"none"}'::jsonb
   WHERE id = 'Purchase Manager'
     AND (permissions ->> 'distributors', permissions ->> 'dealers', permissions ->> 'retailers')
         IS DISTINCT FROM ('none', 'none', 'none');
END $$;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('050_purchase_manager_no_partner_records.sql',
        'Purchase Manager distributors/dealers/retailers: full → none (least access; owner decision)')
ON CONFLICT (filename) DO NOTHING;
