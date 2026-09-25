-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the sales team can raise the orders they take.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  orders_insert allows can_edit('orders'), and only Admin and Super Admin
--  have that. Every sales role has orders = 'view'. So the two places a sales
--  person raises an order were refused for all of them:
--
--    · a field visit with "Order placed" ticked (SFA → Beat Plan → check in)
--    · converting a lead into its first order (Leads)
--
--  The app then handed back the id it had tried ("O7") as if it had saved, and
--  the visit report naming that order was refused in turn by
--  visit_reports_orderId_fkey. The app now stops at the refused order; this
--  is what lets the order through in the first place.
--
--  WHAT THIS ALLOWS
--
--  Raising an order, and nothing more. Editing, advancing and deleting orders
--  stay with can_edit('orders') exactly as before.
--
--    · Who: a role that can edit leads or SFA — today Sales, Sales Executive,
--      Sales Manager and Manager. Purchase Manager, Dispatch, Accounts and the
--      rest are unaffected.
--    · At what status: Pending only. Moving it on is the order desk's job.
--    · For whom: a sales-level role only for themselves (assignedTo is their
--      own id). A manager may raise it for anyone, since converting a lead
--      raises the order for the rep who owns the lead.
--
--  It is a second permissive INSERT policy, so it adds to orders_insert rather
--  than replacing it; admins and partners are unchanged.
-- ════════════════════════════════════════════════════════════════════════

-- The signed-in user's own id, from the same row my_role_name() reads.
CREATE OR REPLACE FUNCTION public.my_user_id()
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT id FROM public.users
  WHERE lower(email) = public.current_app_email()
    AND coalesce(status, '') NOT IN ('Pending', 'Rejected')
  LIMIT 1
$$;

DROP POLICY IF EXISTS orders_insert_sales ON public.orders;
CREATE POLICY orders_insert_sales ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (
    (public.can_edit('leads') OR public.can_edit('sfa'))
    AND status = 'Pending'
    AND (
      public.my_role_level() = 'manager'
      OR "assignedTo" = public.my_user_id()
    )
  );

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('034_sales_raise_own_orders.sql',
        'sales roles may insert a Pending order (their own; managers for anyone) so field visits and lead conversions can raise one')
ON CONFLICT (filename) DO NOTHING;
