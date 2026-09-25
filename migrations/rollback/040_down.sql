-- Undo 040_audit_log_and_last_modified.sql. Safe to run more than once.
-- Drops the audit trail and the updatedBy/updatedAt columns it added.
DO $$
DECLARE t text;
BEGIN
  FOR t IN SELECT c.relname FROM pg_trigger g JOIN pg_class c ON c.oid = g.tgrelid
           JOIN pg_namespace n ON n.oid = c.relnamespace
           WHERE n.nspname = 'public' AND g.tgname IN ('audit_row', 'stamp_modified') GROUP BY c.relname
  LOOP
    EXECUTE format('DROP TRIGGER IF EXISTS audit_row ON public.%I', t);
    EXECUTE format('DROP TRIGGER IF EXISTS stamp_modified ON public.%I', t);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS "updatedBy"', t);
    EXECUTE format('ALTER TABLE public.%I DROP COLUMN IF EXISTS "updatedAt"', t);
  END LOOP;
END $$;
DROP FUNCTION IF EXISTS public.audit_row();
DROP FUNCTION IF EXISTS public.stamp_modified();
DROP FUNCTION IF EXISTS public.audit_actor(text);
DROP FUNCTION IF EXISTS public.is_service_request();
DROP TABLE IF EXISTS public.audit_log;
DELETE FROM public.schema_migrations WHERE filename = '040_audit_log_and_last_modified.sql';
