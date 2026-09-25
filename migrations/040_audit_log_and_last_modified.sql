-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — who created, who last changed, and a full audit trail, from
--  one source of truth.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 034 (my_user_id). Independent of 039.
--
--  TEST ON A STAGING COPY FIRST. Adds a trigger to 30 tables.
--
--  WHAT WAS WRONG
--
--  The Audit Log screen read `events`, which the browser writes by calling
--  logEvent() after an action. Three problems:
--
--    · It never recorded who did it. Its person field is whatever the caller
--      passed — usually the record's owner (a beat plan a manager created was
--      logged against the rep), and on 15 of 27 event types, nobody.
--    · Writing to it needs full Reports access, and nothing checked the write.
--      Every action by Sales, Sales Executive, Dispatch, Warehouse, Purchase
--      Manager and Customer Support was silently not logged.
--    · Whole kinds of change were never logged at all: partner edits, role
--      permission changes, user edits, and deletions of orders, leads,
--      expenses and invoices.
--
--  And no table recorded who last changed a row.
--
--  WHAT THIS DOES
--
--  One trigger pair on every covered table, in the database, so it cannot be
--  skipped by a screen that forgot and does not depend on the person's role:
--
--    · BEFORE INSERT/UPDATE stamps "updatedBy" and "updatedAt" (new columns).
--    · AFTER INSERT/UPDATE/DELETE writes one audit_log row: who (id, name,
--      role, at the time), what (table, record, created/changed/deleted, and
--      each changed field old → new), when, and "via" when it was a knock-on
--      of something else (e.g. stock taken by the delivery of O6).
--
--  Both read the person from the same function, audit_actor(), so "last
--  modified by" and the audit log cannot disagree.
--
--  WHO "THE PERSON" IS
--
--    · A signed-in user: their own id, from their session. Anything the
--      browser sends in "updatedBy" is ignored — it cannot be forged.
--    · Our own server functions, which write with the service key and so have
--      no signed-in user: they pass the real person in "updatedBy" /
--      "createdBy" (create-user: the admin who asked; partner-signup: the
--      partner registering). Accepted only from a service-key request.
--    · Nothing at all (a scheduled job, a change made in the SQL editor):
--      recorded as nobody, shown as "System".
--
--  `events` stays as it is, as the readable Activity feed.
--
--  Only Super Admin, Admin and Director can read audit_log. Nobody can change
--  or delete it: there are no write policies, and the triggers write as the
--  table owner.
-- ════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          bigserial PRIMARY KEY,
  at          timestamptz NOT NULL DEFAULT now(),
  actor_id    text,
  actor_name  text,
  actor_role  text,
  table_name  text NOT NULL,
  row_id      text,
  action      text NOT NULL CHECK (action IN ('created', 'changed', 'deleted')),
  changes     jsonb NOT NULL DEFAULT '{}'::jsonb,
  via         text
);

CREATE INDEX IF NOT EXISTS audit_log_at       ON public.audit_log (at DESC);
CREATE INDEX IF NOT EXISTS audit_log_actor    ON public.audit_log (actor_id, at DESC);
CREATE INDEX IF NOT EXISTS audit_log_record   ON public.audit_log (table_name, row_id, at DESC);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_log_select ON public.audit_log;
CREATE POLICY audit_log_select ON public.audit_log
  FOR SELECT TO authenticated
  USING (public.my_role_name() IN ('Super Admin', 'Admin', 'Director'));

REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.audit_log FROM PUBLIC, anon, authenticated;

-- ── Who did it ──────────────────────────────────────────────────────────
-- Whether this request came from our own server functions (the service key).
CREATE OR REPLACE FUNCTION public.is_service_request()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role', '') = 'service_role'
$$;

-- The person behind this change: the signed-in user; else, on a service-key
-- request only, the person the server function named; else nobody.
CREATE OR REPLACE FUNCTION public.audit_actor(p_named text)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT coalesce(
    public.my_user_id(),
    CASE WHEN public.is_service_request() THEN nullif(btrim(p_named), '') END
  )
$$;

-- ── The triggers ────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.stamp_modified()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  named text := to_jsonb(NEW) ->> 'updatedBy';
BEGIN
  IF TG_OP = 'INSERT' THEN
    named := coalesce(named, to_jsonb(NEW) ->> 'createdBy');
  END IF;
  NEW."updatedBy" := public.audit_actor(named);
  NEW."updatedAt" := now();
  RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION public.audit_row()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  old_row jsonb := CASE WHEN TG_OP IN ('UPDATE', 'DELETE') THEN to_jsonb(OLD) END;
  new_row jsonb := CASE WHEN TG_OP IN ('INSERT', 'UPDATE') THEN to_jsonb(NEW) END;
  diff jsonb := '{}'::jsonb;
  k text;
  actor text;
  who record;
  -- Bookkeeping and secrets are never listed as "what changed".
  skip text[] := ARRAY['updatedAt', 'updatedBy', 'password', 'encrypted_password'];
BEGIN
  IF TG_OP = 'UPDATE' THEN
    FOR k IN SELECT jsonb_object_keys(new_row) LOOP
      CONTINUE WHEN k = ANY (skip);
      IF (old_row -> k) IS DISTINCT FROM (new_row -> k) THEN
        diff := diff || jsonb_build_object(k, jsonb_build_array(old_row -> k, new_row -> k));
      END IF;
    END LOOP;
    IF diff = '{}'::jsonb THEN
      RETURN NULL;   -- saved with nothing actually different
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    diff := new_row - skip;
  ELSE
    diff := old_row - skip;
  END IF;

  actor := public.audit_actor(coalesce(new_row ->> 'updatedBy', new_row ->> 'createdBy'));
  SELECT u.name, u.role INTO who FROM public.users u WHERE u.id = actor;

  INSERT INTO public.audit_log (actor_id, actor_name, actor_role, table_name, row_id, action, changes, via)
  VALUES (
    actor, who.name, who.role, TG_TABLE_NAME,
    coalesce(new_row ->> 'id', old_row ->> 'id'),
    CASE TG_OP WHEN 'INSERT' THEN 'created' WHEN 'UPDATE' THEN 'changed' ELSE 'deleted' END,
    diff,
    nullif(current_setting('app.via', true), '')
  );
  RETURN NULL;
END $$;

REVOKE ALL ON FUNCTION public.audit_actor(text) FROM PUBLIC, anon, authenticated;

-- ── The tables it covers ────────────────────────────────────────────────
DO $$
DECLARE
  t text;
  covered text[] := ARRAY[
    -- sales
    'orders', 'invoices', 'leads',
    -- purchasing
    'purchase_orders', 'grn', 'purchase_returns', 'vendors',
    -- money and ledgers: expenses, credit notes, receipts from partners,
    -- payments to vendors, bank lines
    'expenses', 'credit_notes', 'distributor_payments', 'vendor_payments', 'bank_transactions',
    -- partners
    'distributors', 'dealers', 'retailers',
    -- access
    'roles', 'users',
    -- stock and catalogue
    'inventory', 'stock_transfers', 'products',
    -- schemes and incentives
    'schemes', 'scheme_claims', 'distributor_incentives',
    -- customer support
    'complaints',
    -- territory and field work
    'territories', 'sfa_expenses', 'attendance', 'beat_plans', 'visit_reports', 'beat_checkin_requests'
  ];
BEGIN
  FOREACH t IN ARRAY covered LOOP
    IF to_regclass('public.' || t) IS NULL THEN
      RAISE NOTICE 'audit: table % does not exist here, skipped', t;
      CONTINUE;
    END IF;
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "updatedBy" text', t);
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS "updatedAt" timestamptz', t);
    EXECUTE format('DROP TRIGGER IF EXISTS stamp_modified ON public.%I', t);
    EXECUTE format('CREATE TRIGGER stamp_modified BEFORE INSERT OR UPDATE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.stamp_modified()', t);
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row ON public.%I', t);
    EXECUTE format('CREATE TRIGGER audit_row AFTER INSERT OR UPDATE OR DELETE ON public.%I
                    FOR EACH ROW EXECUTE FUNCTION public.audit_row()', t);
  END LOOP;
END $$;

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('040_audit_log_and_last_modified.sql',
        'audit_log and updatedBy/updatedAt on 30 tables, from one trigger pair; person from the session, or named by our own server functions')
ON CONFLICT (filename) DO NOTHING;
