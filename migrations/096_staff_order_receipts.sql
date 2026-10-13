-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 096: staff-recorded order receipts saved by the database (Gap 19)
--  Prepared 2026-10-13. Independent of 085–095.
--
--  WHAT WAS WRONG
--
--  "Record receipt" on Orders (a customer told an employee the delivery
--  arrived) was a direct UPDATE of six receipt columns on `orders` from the
--  browser. orders_update (043) lets only full-Orders roles update an order
--  (Super Admin, Admin, Warehouse Manager, Dispatch Team). For everyone else —
--  Sales Executive, Sales Manager, Accounts — row-level security filtered the
--  row out: no error, 0 rows changed. The screen showed the tick and "Receipt
--  recorded", logged the event, and nothing was stored, so nobody else (and,
--  after a reload, not even the person who recorded it) ever saw it. Live
--  example: O329 (Accounts, 10 Oct). Withdrawing failed the same way. The
--  recorder was stored as a name only, so "only the person who recorded it
--  may withdraw it" could not be checked.
--
--  WHAT THIS DOES
--
--  * orders."receiptRecordedById": the user who recorded a staff receipt.
--    The 14 staff receipts recorded before this keep it empty.
--  * record_order_receipt(order, evidence, note) — the only way staff record a
--    receipt. Owner rights, so the order's salesperson can save it although
--    they cannot otherwise change the order. Allowed (owner, 2026-10-13):
--      - Admin, Super Admin, Accounts, Warehouse Manager, Dispatch Team;
--      - a sales-level user (Leads or SFA full) on an order assigned to or
--        created by them;
--      - a manager-level user with Leads or SFA full (Sales Manager; not
--        Purchase Manager) on an order assigned to or created by them or by
--        someone they manage (can_see_rep).
--    Not partners, Director, Customer Support, Purchase Manager. The order
--    must be Shipped or Delivered with no receipt yet; evidence one of the
--    listed kinds; "Other" needs a note. Name, user id and time come from the
--    database, never the browser. Only the receipt columns are written, so
--    the invoiced/delivered locks (061, 062, 077) are not involved.
--  * withdraw_order_receipt(order) — a staff receipt only (a customer's own
--    confirmation stays theirs). Allowed for the user whose id is on it, or
--    Admin / Super Admin. Receipts without an id (before 096): Admin only.
--  * order_receipt_columns_guard (BEFORE INSERT OR UPDATE, invoker): a
--    signed-in app user cannot write the receipt columns directly any more;
--    the two functions above and the partner's confirm_my_order_receipt (043)
--    run with owner rights and pass. Maintenance is unaffected.
--  * order_receipt_enabled() tells the screen 096 is in place.
--
--  Existing rows are not changed. Who can READ an order is unchanged
--  (orders_select): Admin, Accounts and the salesperson's manager already
--  see the row; the partner sees its own orders.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS "receiptRecordedById" text;


-- Who may record a staff receipt on this order. Shared by the function and
-- order_receipt_allowed() (the screen asks nothing; it mirrors this in
-- utils/receipts.js).
CREATE OR REPLACE FUNCTION public.can_record_order_receipt(p_owner text, p_creator text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN coalesce(public.is_partner(), true) THEN false
    WHEN public.my_role_name() IN ('Admin', 'Super Admin', 'Accounts', 'Warehouse Manager', 'Dispatch Team') THEN true
    WHEN NOT (public.can_edit('leads') OR public.can_edit('sfa')) THEN false
    WHEN public.my_role_level() = 'sales' THEN
         p_owner = public.my_user_id() OR p_creator = public.my_user_id()
    WHEN public.my_role_level() = 'manager' THEN
         (p_owner IS NOT NULL AND public.can_see_rep(p_owner))
      OR (p_creator IS NOT NULL AND public.can_see_rep(p_creator))
    ELSE false
  END IS TRUE
$$;
REVOKE ALL ON FUNCTION public.can_record_order_receipt(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.can_record_order_receipt(text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.record_order_receipt(
  p_order_id text,
  p_evidence text,
  p_note     text DEFAULT NULL
) RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o        public.orders;
  v_me     text := public.my_user_id();
  v_name   text;
  v_ev     text := btrim(coalesce(p_evidence, ''));
  v_note   text := btrim(coalesce(p_note, ''));
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % was not found.', p_order_id USING ERRCODE = 'P0001';
  END IF;
  IF v_me IS NULL OR NOT public.can_record_order_receipt(o."assignedTo", o."createdBy") THEN
    RAISE EXCEPTION 'Your role cannot record a receipt on order %. The order''s salesperson, their manager, Accounts, the warehouse, dispatch or an administrator can.', p_order_id
      USING ERRCODE = 'P0001';
  END IF;
  IF o.status NOT IN ('Shipped', 'Delivered') THEN
    RAISE EXCEPTION 'Order % is %, so a receipt can be recorded once it has been shipped.', p_order_id, o.status
      USING ERRCODE = 'P0001';
  END IF;
  IF coalesce(o."receivedByDistributor", false) THEN
    RAISE EXCEPTION 'A receipt is already recorded on order %.', p_order_id USING ERRCODE = 'P0001';
  END IF;
  IF v_ev NOT IN ('Phone call', 'WhatsApp confirmation', 'Signed delivery note',
                  'Driver proof of delivery', 'Confirmed in person', 'Other') THEN
    RAISE EXCEPTION 'Say how you know the delivery arrived (choose one of the listed kinds of evidence).' USING ERRCODE = 'P0001';
  END IF;
  IF v_ev = 'Other' AND v_note = '' THEN
    RAISE EXCEPTION 'Describe the evidence, since it is not one of the listed kinds.' USING ERRCODE = 'P0001';
  END IF;

  SELECT name INTO v_name FROM public.users WHERE id = v_me;
  PERFORM set_config('app.via', format('receipt recorded by staff for order %s', p_order_id), true);
  UPDATE public.orders
     SET "receivedByDistributor" = true,
         "receivedAt"            = now(),
         "receiptSource"         = 'staff',
         "receiptRecordedBy"     = coalesce(v_name, 'Staff'),
         "receiptRecordedById"   = v_me,
         "receiptEvidence"       = v_ev,
         "receiptNote"           = v_note,
         "updatedBy"             = v_me
   WHERE id = p_order_id
  RETURNING * INTO o;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.record_order_receipt(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_order_receipt(text, text, text) TO authenticated;


CREATE OR REPLACE FUNCTION public.withdraw_order_receipt(p_order_id text)
RETURNS public.orders
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  o    public.orders;
  v_me text := public.my_user_id();
BEGIN
  SELECT * INTO o FROM public.orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Order % was not found.', p_order_id USING ERRCODE = 'P0001';
  END IF;
  IF NOT coalesce(o."receivedByDistributor", false) OR o."receiptSource" IS DISTINCT FROM 'staff' THEN
    RAISE EXCEPTION 'Order % has no receipt recorded by staff to withdraw. A customer''s own confirmation cannot be withdrawn.', p_order_id
      USING ERRCODE = 'P0001';
  END IF;
  IF v_me IS NULL OR coalesce(public.is_partner(), true)
     OR NOT (public.my_role_name() IN ('Admin', 'Super Admin')
             OR (o."receiptRecordedById" IS NOT NULL AND o."receiptRecordedById" = v_me)) THEN
    RAISE EXCEPTION 'Only the person who recorded this receipt, or an administrator, can withdraw it.' USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.via', format('staff receipt withdrawn on order %s', p_order_id), true);
  UPDATE public.orders
     SET "receivedByDistributor" = false,
         "receivedAt"            = NULL,
         "receiptSource"         = NULL,
         "receiptRecordedBy"     = NULL,
         "receiptRecordedById"   = NULL,
         "receiptEvidence"       = NULL,
         "receiptNote"           = NULL,
         "updatedBy"             = v_me
   WHERE id = p_order_id
  RETURNING * INTO o;
  RETURN o;
END $$;
REVOKE ALL ON FUNCTION public.withdraw_order_receipt(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.withdraw_order_receipt(text) TO authenticated;


-- Receipt columns move only through the functions (owner rights, so
-- current_user is the owner there and this passes).
CREATE OR REPLACE FUNCTION public.order_receipt_columns_guard()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN
    RETURN NEW;
  END IF;
  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW."receivedByDistributor", false) OR NEW."receiptRecordedById" IS NOT NULL THEN
      RAISE EXCEPTION 'A new order cannot start with a receipt recorded. Record it once the order has been shipped.' USING ERRCODE = 'P0001';
    END IF;
    RETURN NEW;
  END IF;
  IF NEW."receivedByDistributor" IS DISTINCT FROM OLD."receivedByDistributor"
     OR NEW."receivedAt"          IS DISTINCT FROM OLD."receivedAt"
     OR NEW."receiptSource"       IS DISTINCT FROM OLD."receiptSource"
     OR NEW."receiptRecordedBy"   IS DISTINCT FROM OLD."receiptRecordedBy"
     OR NEW."receiptRecordedById" IS DISTINCT FROM OLD."receiptRecordedById"
     OR NEW."receiptEvidence"     IS DISTINCT FROM OLD."receiptEvidence"
     OR NEW."receiptNote"         IS DISTINCT FROM OLD."receiptNote" THEN
    RAISE EXCEPTION 'Order % receipt can only be recorded or withdrawn with Record receipt / Withdraw receipt. Reload the page and try again.', OLD.id
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_receipt_columns_guard ON public.orders;
CREATE TRIGGER order_receipt_columns_guard
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_receipt_columns_guard();


CREATE OR REPLACE FUNCTION public.order_receipt_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $$ SELECT true $$;
REVOKE ALL ON FUNCTION public.order_receipt_enabled() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.order_receipt_enabled() TO authenticated;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('096_staff_order_receipts.sql',
        'Gap 19: record_order_receipt / withdraw_order_receipt (salesperson, manager, Accounts, WM, Dispatch, Admin; withdraw = recorder or Admin), receiptRecordedById, direct receipt writes refused')
ON CONFLICT (filename) DO NOTHING;

NOTIFY pgrst, 'reload schema';
