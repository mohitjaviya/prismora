-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a partner also sees an invoice carrying its own party id.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 043.
--
--  043 dropped name matching (D-06) and left one route: the invoice's order.
--  But invoices carry their own distributorId / dealerId / retailerId (filled
--  by 039's invoicing, and the first thing the app's invoiceBelongsToParty
--  checks). A custom invoice, or one whose order names no partner, can only
--  reach its partner that way. Both routes are ids; neither is a name.
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS invoices_select ON public.invoices;
CREATE POLICY invoices_select ON public.invoices
  FOR SELECT TO authenticated
  USING (
    public.can_view('accounting')
    OR (public.is_partner() AND (
          public.owns_party_row(invoices."distributorId", invoices."dealerId", invoices."retailerId")
       OR EXISTS (
          SELECT 1 FROM public.orders o
          WHERE o.id = invoices."orderId"
            AND public.owns_party_row(o."distributorId", o."dealerId", o."retailerId"))))
  );

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('045_invoices_visible_by_own_party_id.sql',
        'invoices_select: a partner sees invoices carrying its own party id, or on its own orders; never by name')
ON CONFLICT (filename) DO NOTHING;
