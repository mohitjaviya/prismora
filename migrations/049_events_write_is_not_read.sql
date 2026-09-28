-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the activity feed's write policy no longer grants reading.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 048.
--
--  048 hid payment, invoice and credit-note entries from roles without
--  Accounting view in events_select. But events_write was FOR ALL, and a
--  FOR ALL policy also grants SELECT: every role with Reports full (Sales
--  Manager, Manager) still read all of them through it. Found by the 048
--  verification as the Sales Manager's own login (32 entries visible).
--
--  Writing is split into INSERT, UPDATE and DELETE, and the money entries are
--  out of reach of the last two for the same roles.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.is_money_event(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE
AS $$
  SELECT coalesce(p_type, '') IN ('distributor_payment', 'dealer_payment', 'retailer_payment',
                                  'invoice_new', 'invoice_status_update', 'invoice_converted',
                                  'credit_note', 'credit_note_deleted', 'balance_corrected')
$$;

DROP POLICY IF EXISTS events_select ON public.events;
CREATE POLICY events_select ON public.events
  FOR SELECT TO authenticated
  USING (public.can_view('reports') AND (public.can_view('accounting') OR NOT public.is_money_event(type)));

DROP POLICY IF EXISTS events_write  ON public.events;
DROP POLICY IF EXISTS events_insert ON public.events;
DROP POLICY IF EXISTS events_update ON public.events;
DROP POLICY IF EXISTS events_delete ON public.events;

CREATE POLICY events_insert ON public.events
  FOR INSERT TO authenticated
  WITH CHECK (public.can_edit('reports'));

CREATE POLICY events_update ON public.events
  FOR UPDATE TO authenticated
  USING      (public.can_edit('reports') AND (public.can_view('accounting') OR NOT public.is_money_event(type)))
  WITH CHECK (public.can_edit('reports') AND (public.can_view('accounting') OR NOT public.is_money_event(type)));

CREATE POLICY events_delete ON public.events
  FOR DELETE TO authenticated
  USING (public.can_edit('reports') AND (public.can_view('accounting') OR NOT public.is_money_event(type)));

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('049_events_write_is_not_read.sql',
        'events_write (FOR ALL) split into insert/update/delete so it no longer grants reading money entries to Reports-full roles')
ON CONFLICT (filename) DO NOTHING;
