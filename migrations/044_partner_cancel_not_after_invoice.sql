-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — a partner cannot cancel an invoiced order, or confirm receipt
--  of one that has not been shipped.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 043.
--
--  043's cancel_my_order allowed any Pending order. Testing found a Pending
--  order carrying an advance invoice (O6, INV-1790345339255, ₹4,050 unpaid):
--  the partner could cancel the order and leave the invoice standing, owed
--  for goods it no longer wanted. Once an invoice exists, cancelling is a
--  change for Accounts to make (credit note or reversal), not the partner.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cancel_my_order(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o public.orders;
  v_invoice text;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_partner(), false)
     OR NOT public.owns_party_row(o."distributorId", o."dealerId", o."retailerId") THEN
    RAISE EXCEPTION 'Order % is not one of yours.', p_order_id USING ERRCODE = '42501';
  END IF;
  IF o.status IS DISTINCT FROM 'Pending' THEN
    RAISE EXCEPTION 'Order % is % and can no longer be cancelled here. Contact us to change it.', p_order_id, o.status
      USING ERRCODE = '23514';
  END IF;
  SELECT id INTO v_invoice FROM public.invoices WHERE "orderId" = p_order_id LIMIT 1;
  IF v_invoice IS NOT NULL THEN
    RAISE EXCEPTION 'Order % has already been invoiced (%), so it cannot be cancelled here. Contact us to cancel it.', p_order_id, v_invoice
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.via', format('cancelled by the partner, order %s', p_order_id), true);
  UPDATE public.orders SET status = 'Cancelled' WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.cancel_my_order(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_my_order(text) TO authenticated;

-- And receipt can be confirmed only for goods that have been sent, which is
-- when the portal offers it (Shipped or Delivered). 043 allowed any order
-- that was not Cancelled, so a Pending order could be marked received.
CREATE OR REPLACE FUNCTION public.confirm_my_order_receipt(p_order_id text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE o public.orders;
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND OR NOT coalesce(public.is_partner(), false)
     OR NOT public.owns_party_row(o."distributorId", o."dealerId", o."retailerId") THEN
    RAISE EXCEPTION 'Order % is not one of yours.', p_order_id USING ERRCODE = '42501';
  END IF;
  IF o.status NOT IN ('Shipped', 'Delivered') THEN
    RAISE EXCEPTION 'Order % is % — receipt can be confirmed once it has been shipped.', p_order_id, o.status
      USING ERRCODE = '23514';
  END IF;
  PERFORM set_config('app.via', format('receipt confirmed for order %s', p_order_id), true);
  UPDATE public.orders
     SET "receivedByDistributor" = true, "receivedAt" = now(), "receiptSource" = 'partner'
   WHERE id = p_order_id;
END $$;

REVOKE ALL ON FUNCTION public.confirm_my_order_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.confirm_my_order_receipt(text) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('044_partner_cancel_not_after_invoice.sql',
        'cancel_my_order refuses an invoiced order; confirm_my_order_receipt only once Shipped or Delivered')
ON CONFLICT (filename) DO NOTHING;
