-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 088: audit log retention (Gap 5, owner 2026-10-14).
--  Needs 040 (audit_log, audit_row) and 057 (pg_cron). Safe to run more than once.
--
--  WHAT WAS WRONG
--
--  audit_log grows forever: nothing ever removes a row.
--
--  WHAT THIS DOES
--
--  Routine entries are removed after 90 days; important ones are kept for
--  good. What is RECORDED does not change: audit_row() is untouched.
--
--    · audit_retention_settings (one row): days to keep, batch size, cap per
--      run, dry_run, and the "important" rules. The only place they live.
--      Readable by audit viewers; changed only by a Super Admin (or SQL).
--      Changes to it are audited and kept.
--    · audit_importance(table, action, changes, via): the reason a row is
--      important, or NULL for a routine row. Reads the settings row.
--    · audit_log.important / important_reason: set when the row is written
--      (BEFORE INSERT trigger on audit_log) and filled in for existing rows.
--      NULL = not classified = never removed.
--    · purge_audit_log(p_dry_run): removes rows with important = false,
--      older than the days to keep, still routine under today's rules, in
--      batches up to the cap. A row a later rule makes important is marked
--      important instead. With dry_run on (setting or argument) it only
--      counts. Every run is written to audit_retention_runs, kept for good.
--      No app role may run it.
--    · audit_retention_info(): days, dry_run, last run, for the screen.
--    · pg_cron job audit-retention-nightly at 19:30 UTC (01:00 IST).
--
--  IMPORTANT (kept for good), from the owner's list:
--    deletes of any record; money (invoices, credit notes, partner and vendor
--    payments, refunds, bank entries, expenses, sales and purchase returns,
--    goods receipts, scheme claims, incentives); users and roles; company
--    settings and this retention setting; products and schemes created;
--    price / discount / rate / GST / balance / amount / value / items fields;
--    stock adjustments, counts, write-offs, returns to vendor, condition
--    corrections; staff order receipts; invoice conversion / finalisation;
--    migrations, corrections and other maintenance.
--  ROUTINE (removed after 90 days): everything else (order status, leads,
--  field work, new orders, deliveries, scheme/PO status, stock transfers …).
--  Logins, exports and failed logins are not recorded in audit_log at all
--  (a later gap).
--
--  dry_run starts ON. To start removing rows (owner decides):
--    UPDATE public.audit_retention_settings SET dry_run = false WHERE id = 1;
-- ════════════════════════════════════════════════════════════════════════

-- ── The setting ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_retention_settings (
  id                   int PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  keep_days            int NOT NULL DEFAULT 90 CHECK (keep_days BETWEEN 30 AND 3650),
  batch_size           int NOT NULL DEFAULT 1000 CHECK (batch_size BETWEEN 100 AND 10000),
  max_per_run          int NOT NULL DEFAULT 50000 CHECK (max_per_run BETWEEN 100 AND 1000000),
  dry_run              boolean NOT NULL DEFAULT true,
  -- any action on these tables
  important_tables     text[] NOT NULL,
  -- a new row on these tables (it sets a price)
  important_on_create  text[] NOT NULL,
  -- "via" (what a database function was doing), case-insensitive regex
  important_via        text NOT NULL CHECK (('x' ~* important_via) IS NOT NULL),
  -- a changed field whose name matches (case-sensitive regex)
  important_fields     text NOT NULL CHECK (('x' ~ important_fields) IS NOT NULL),
  -- a changed field named here, per table
  important_fields_by_table jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(important_fields_by_table) = 'object'),
  "updatedBy"          text,
  "updatedAt"          timestamptz
);

INSERT INTO public.audit_retention_settings
  (id, important_tables, important_on_create, important_via, important_fields, important_fields_by_table)
VALUES (1,
  ARRAY['invoices', 'credit_notes', 'distributor_payments', 'vendor_payments', 'partner_refunds',
        'bank_transactions', 'expenses', 'sales_returns', 'purchase_returns', 'grn',
        'scheme_claims', 'distributor_incentives',
        'users', 'roles', 'company_settings', 'audit_retention_settings'],
  ARRAY['products', 'schemes'],
  '^(stock adjustment|cycle count|damaged |expired |return .* corrected|purchase return|sales return'
    || '|receipt recorded by staff|staff receipt withdrawn'
    || '|finalisation of|conversion of|payment |credit note|refund |invoice |incentive|vendor payment|goods receipt|balance corrected'
    || '|migration|correction|reconciliation|security|maintenance)',
  '([Pp]rice|[Mm]rp|MRP|[Dd]iscount|[Gg]st|GST|[Tt]ax|[Mm]argin|[Cc]reditLimit|[Oo]utstanding|[Aa]mount|^value$|Value$'
    || '|[Ff]reeGoods|[Ii]ncentive|[Cc]ommission|^rate|Rate|^items$)',
  '{"inventory": ["damaged", "expiryDate"], "orders": ["receiptRecordedBy", "receiptRecordedById"]}'::jsonb)
ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.audit_retention_settings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_retention_settings FROM PUBLIC, anon, authenticated;
GRANT SELECT, UPDATE ON public.audit_retention_settings TO authenticated;

DROP POLICY IF EXISTS audit_retention_settings_select ON public.audit_retention_settings;
CREATE POLICY audit_retention_settings_select ON public.audit_retention_settings
  FOR SELECT TO authenticated
  USING (public.my_role_name() IN ('Super Admin', 'Admin', 'Director'));

DROP POLICY IF EXISTS audit_retention_settings_update ON public.audit_retention_settings;
CREATE POLICY audit_retention_settings_update ON public.audit_retention_settings
  FOR UPDATE TO authenticated
  USING (public.my_role_name() = 'Super Admin')
  WITH CHECK (public.my_role_name() = 'Super Admin');

-- ── The record of every run (never removed) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_retention_runs (
  id              bigserial PRIMARY KEY,
  run_at          timestamptz NOT NULL DEFAULT now(),
  dry_run         boolean NOT NULL,
  keep_days       int NOT NULL,
  cutoff          timestamptz NOT NULL,
  would_delete    int NOT NULL DEFAULT 0,
  deleted         int NOT NULL DEFAULT 0,
  reclassified    int NOT NULL DEFAULT 0,
  kept_important  int NOT NULL DEFAULT 0,
  rows_after      bigint,
  batches         int NOT NULL DEFAULT 0,
  took_ms         int,
  error           text,
  run_by          text
);

ALTER TABLE public.audit_retention_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.audit_retention_runs FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.audit_retention_runs TO authenticated;

DROP POLICY IF EXISTS audit_retention_runs_select ON public.audit_retention_runs;
CREATE POLICY audit_retention_runs_select ON public.audit_retention_runs
  FOR SELECT TO authenticated
  USING (public.my_role_name() IN ('Super Admin', 'Admin', 'Director'));

-- ── The rule ────────────────────────────────────────────────────────────
-- Why a row is kept for good, or NULL for a routine row. No settings row =
-- everything important (nothing can be removed by mistake).
CREATE OR REPLACE FUNCTION public.audit_importance(p_table text, p_action text, p_changes jsonb, p_via text)
RETURNS text
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.audit_retention_settings;
  k text;
BEGIN
  SELECT * INTO s FROM public.audit_retention_settings WHERE id = 1;
  IF NOT FOUND THEN RETURN 'no retention settings'; END IF;

  IF p_action = 'deleted' THEN RETURN 'delete'; END IF;
  IF p_table = ANY (s.important_tables) THEN RETURN 'record type: ' || p_table; END IF;
  IF p_action = 'created' AND p_table = ANY (s.important_on_create) THEN RETURN 'created: ' || p_table; END IF;
  IF coalesce(p_via, '') ~* s.important_via THEN RETURN 'via: ' || left(p_via, 80); END IF;

  IF p_action = 'changed' AND jsonb_typeof(p_changes) = 'object' THEN
    FOR k IN SELECT jsonb_object_keys(p_changes) LOOP
      IF s.important_fields_by_table ? p_table AND (s.important_fields_by_table -> p_table) ? k THEN
        RETURN 'field: ' || k;
      END IF;
      IF k ~ s.important_fields THEN RETURN 'field: ' || k; END IF;
    END LOOP;
  END IF;
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.audit_importance(text, text, jsonb, text) FROM PUBLIC, anon, authenticated;

-- ── Marking rows ────────────────────────────────────────────────────────
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS important boolean;
ALTER TABLE public.audit_log ADD COLUMN IF NOT EXISTS important_reason text;

CREATE OR REPLACE FUNCTION public.audit_log_classify()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  NEW.important_reason := public.audit_importance(NEW.table_name, NEW.action, NEW.changes, NEW.via);
  NEW.important := NEW.important_reason IS NOT NULL;
  RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION public.audit_log_classify() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS audit_log_classify ON public.audit_log;
CREATE TRIGGER audit_log_classify BEFORE INSERT ON public.audit_log
  FOR EACH ROW EXECUTE FUNCTION public.audit_log_classify();

-- Existing rows, by the same rule.
UPDATE public.audit_log
   SET important_reason = public.audit_importance(table_name, action, changes, via)
 WHERE important IS NULL;
UPDATE public.audit_log
   SET important = important_reason IS NOT NULL
 WHERE important IS NULL;

CREATE INDEX IF NOT EXISTS audit_log_routine_at ON public.audit_log (at) WHERE important = false;

-- The setting's own changes are audited (and kept: it is in important_tables).
DROP TRIGGER IF EXISTS audit_row ON public.audit_retention_settings;
CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.audit_retention_settings
  FOR EACH ROW EXECUTE FUNCTION public.audit_row();

-- ── The clean-up ────────────────────────────────────────────────────────
-- p_dry_run = true forces a count-only run; it can never turn the setting's
-- dry_run off. Returns the run's record.
CREATE OR REPLACE FUNCTION public.purge_audit_log(p_dry_run boolean DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  s public.audit_retention_settings;
  v_dry boolean;
  v_cutoff timestamptz;
  v_start timestamptz := clock_timestamp();
  v_would int := 0;
  v_deleted int := 0;
  v_reclass int := 0;
  v_kept int := 0;
  v_batches int := 0;
  v_n int;
  v_error text;
  v_run public.audit_retention_runs;
BEGIN
  SELECT * INTO s FROM public.audit_retention_settings WHERE id = 1;
  IF NOT FOUND THEN RAISE EXCEPTION 'audit retention: no settings row'; END IF;
  IF NOT pg_try_advisory_xact_lock(hashtext('purge_audit_log')) THEN
    RAISE EXCEPTION 'audit retention: another run is in progress';
  END IF;

  v_dry := s.dry_run OR coalesce(p_dry_run, false);
  v_cutoff := now() - make_interval(days => s.keep_days);

  BEGIN
    -- A routine row that today's rules call important is kept from now on.
    IF NOT v_dry THEN
      UPDATE public.audit_log a
         SET important = true,
             important_reason = public.audit_importance(a.table_name, a.action, a.changes, a.via)
       WHERE a.important = false AND a.at < v_cutoff
         AND public.audit_importance(a.table_name, a.action, a.changes, a.via) IS NOT NULL;
      GET DIAGNOSTICS v_reclass = ROW_COUNT;
    ELSE
      SELECT count(*) INTO v_reclass FROM public.audit_log a
       WHERE a.important = false AND a.at < v_cutoff
         AND public.audit_importance(a.table_name, a.action, a.changes, a.via) IS NOT NULL;
    END IF;

    SELECT count(*) INTO v_would FROM public.audit_log a
     WHERE a.important = false AND a.at < v_cutoff
       AND public.audit_importance(a.table_name, a.action, a.changes, a.via) IS NULL;

    IF NOT v_dry THEN
      LOOP
        EXIT WHEN v_deleted >= s.max_per_run;
        DELETE FROM public.audit_log
         WHERE id IN (
           SELECT a.id FROM public.audit_log a
            WHERE a.important = false AND a.at < v_cutoff
              AND public.audit_importance(a.table_name, a.action, a.changes, a.via) IS NULL
            ORDER BY a.at, a.id
            LIMIT least(s.batch_size, s.max_per_run - v_deleted));
        GET DIAGNOSTICS v_n = ROW_COUNT;
        EXIT WHEN v_n = 0;
        v_deleted := v_deleted + v_n;
        v_batches := v_batches + 1;
      END LOOP;
    END IF;

    SELECT count(*) INTO v_kept FROM public.audit_log a
     WHERE a.at < v_cutoff AND a.important IS DISTINCT FROM false;
  EXCEPTION WHEN OTHERS THEN
    v_error := SQLERRM;
    v_deleted := 0;
    v_batches := 0;
  END;

  INSERT INTO public.audit_retention_runs
    (dry_run, keep_days, cutoff, would_delete, deleted, reclassified, kept_important, rows_after, batches, took_ms, error, run_by)
  VALUES
    (v_dry, s.keep_days, v_cutoff, v_would, v_deleted, v_reclass, v_kept,
     (SELECT count(*) FROM public.audit_log), v_batches,
     (extract(epoch FROM clock_timestamp() - v_start) * 1000)::int, v_error,
     coalesce(public.my_user_id(), current_user::text))
  RETURNING * INTO v_run;

  RETURN to_jsonb(v_run);
END $$;

REVOKE ALL ON FUNCTION public.purge_audit_log(boolean) FROM PUBLIC, anon, authenticated;

-- ── For the screen ──────────────────────────────────────────────────────
-- Invoker: an audit viewer gets the setting and the last run; anyone else
-- gets NULLs (RLS).
CREATE OR REPLACE FUNCTION public.audit_retention_info()
RETURNS jsonb
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $$
  SELECT CASE WHEN s.id IS NULL THEN NULL ELSE jsonb_build_object(
    'keep_days', s.keep_days,
    'dry_run', s.dry_run,
    'last_run', (SELECT to_jsonb(r) FROM public.audit_retention_runs r ORDER BY r.run_at DESC, r.id DESC LIMIT 1)
  ) END
  FROM (SELECT 1) one
  LEFT JOIN public.audit_retention_settings s ON s.id = 1
$$;

REVOKE ALL ON FUNCTION public.audit_retention_info() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.audit_retention_info() TO authenticated;

-- ── Nightly ─────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS pg_cron;
DO $$
BEGIN
  PERFORM cron.unschedule(jobid) FROM cron.job WHERE jobname = 'audit-retention-nightly';
  PERFORM cron.schedule('audit-retention-nightly', '30 19 * * *', 'SELECT public.purge_audit_log()');   -- 01:00 IST
END $$;

-- ── Record ───────────────────────────────────────────────────────────────
INSERT INTO public.schema_migrations (filename, note)
VALUES ('088_audit_log_retention.sql',
        'audit_log retention: important rows kept for good (flag set on insert + existing rows), routine rows removed after keep_days (90) by nightly purge_audit_log in batches; one settings row; every run in audit_retention_runs; dry_run starts on')
ON CONFLICT (filename) DO NOTHING;
