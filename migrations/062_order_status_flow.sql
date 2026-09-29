-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix Batch 5, group 1 (Phase 2 finding A09): the order stages
--  are enforced by the database, for every role.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs my_role_name() (earlier migrations).
--
--  WHAT WAS WRONG
--
--  Who may move an order to which status, the order of the stages and the
--  delivery-address rule were checked only on the order screen. With its own
--  login the Warehouse Manager set Pending O113 — no address — straight to
--  Shipped through the API, and it was accepted.
--
--  WHAT THIS DOES (signed-in app users; maintenance with no user passes)
--
--  · One step at a time:
--      Pending → Processing → Ready for Dispatch → Shipped → Delivered
--      Shipped → Partially Delivered → (Partially Delivered …) → Delivered
--    Cancelled from Pending, Processing, Ready for Dispatch or Shipped.
--    Skipping a stage, going back a stage, or reviving a cancelled order is
--    refused. (After delivery 054 already refuses everything but a return.)
--  · Each step by its owner — the same table the order screen uses:
--      Processing           Sales Executive, Sales Manager, Sales, Manager
--      Ready for Dispatch   Warehouse Manager
--      Shipped, Partially Delivered, Delivered   Dispatch Team
--      Cancelled            the sales roles, and a partner for its own order
--    Admin and Super Admin may take any single step, but may not skip.
--    (A sales role still reaches this only through sales_move_order, which
--    keeps them to their own Pending orders.)
--  · From Processing on, the order must carry a delivery address and a
--    pincode, and they cannot be cleared later.
--  · A new order starts at Pending. The one exception is the backorder a
--    split creates (splitFromOrderId), which starts at Processing with its
--    address; its parent must not be delivered or cancelled.
--  · The address rule is checked when the stage or the address changes, so
--    older delivered orders without one can still take a receipt.
--
--  NOTE FOR THE OWNER: partner orders used to be taken by the Warehouse
--  straight from Pending to Ready for Dispatch. They now need the Processing
--  step first — a sales role (the Sales Manager for the team's partners) or
--  an Admin sends them to the warehouse.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.order_next_steps(p_status text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'Pending'             THEN ARRAY['Processing', 'Cancelled']
    WHEN 'Processing'          THEN ARRAY['Ready for Dispatch', 'Cancelled']
    WHEN 'Ready for Dispatch'  THEN ARRAY['Shipped', 'Cancelled']
    WHEN 'Shipped'             THEN ARRAY['Delivered', 'Partially Delivered', 'Cancelled']
    WHEN 'Partially Delivered' THEN ARRAY['Partially Delivered', 'Delivered']
    ELSE ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.order_stage_owners(p_status text)
RETURNS text[]
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE p_status
    WHEN 'Processing'          THEN ARRAY['Sales Executive', 'Sales Manager', 'Sales', 'Manager']
    WHEN 'Ready for Dispatch'  THEN ARRAY['Warehouse Manager']
    WHEN 'Shipped'             THEN ARRAY['Dispatch Team']
    WHEN 'Partially Delivered' THEN ARRAY['Dispatch Team']
    WHEN 'Delivered'           THEN ARRAY['Dispatch Team']
    WHEN 'Cancelled'           THEN ARRAY['Sales Executive', 'Sales Manager', 'Sales', 'Manager', 'Distributor', 'Dealer', 'Retailer']
    ELSE ARRAY[]::text[]
  END
$$;

CREATE OR REPLACE FUNCTION public.order_status_flow()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role text;
  v_needs_address boolean;
  v_parent public.orders;
BEGIN
  -- Only what a signed-in app user does. Maintenance has no user.
  IF auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_role := public.my_role_name();
  v_needs_address := NEW.status IN ('Processing', 'Ready for Dispatch', 'Shipped', 'Partially Delivered', 'Delivered');

  IF TG_OP = 'INSERT' THEN
    IF coalesce(NEW.status, 'Pending') = 'Pending' THEN
      NEW.status := 'Pending';
    ELSIF NEW.status = 'Processing' AND NEW."splitFromOrderId" IS NOT NULL THEN
      SELECT * INTO v_parent FROM public.orders WHERE id = NEW."splitFromOrderId";
      IF NOT FOUND OR v_parent.status NOT IN ('Pending', 'Processing', 'Ready for Dispatch', 'Shipped') THEN
        RAISE EXCEPTION 'A backorder can only be split from an order that is being fulfilled.' USING ERRCODE = '42501';
      END IF;
    ELSE
      RAISE EXCEPTION 'A new order starts at Pending, not %. Move it through the stages from there.', NEW.status
        USING ERRCODE = '42501';
    END IF;
  ELSIF NEW.status IS DISTINCT FROM OLD.status THEN
    IF OLD.status = 'Cancelled' THEN
      RAISE EXCEPTION 'Order % was cancelled, so it cannot be moved to %. Create a new order instead.', OLD.id, NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF NOT (NEW.status = ANY (public.order_next_steps(OLD.status))) THEN
      RAISE EXCEPTION 'Order % is %; the next step is %. It cannot go to % from here.',
        OLD.id, OLD.status,
        coalesce(array_to_string(array_remove(public.order_next_steps(OLD.status), 'Cancelled'), ' or '), 'none'),
        NEW.status
        USING ERRCODE = '42501';
    END IF;
    IF NOT (v_role IN ('Admin', 'Super Admin') OR v_role = ANY (public.order_stage_owners(NEW.status))) THEN
      RAISE EXCEPTION 'Only % can move an order to % (your role: %).',
        array_to_string(public.order_stage_owners(NEW.status) || ARRAY['Admin'], ', '), NEW.status, coalesce(v_role, 'none')
        USING ERRCODE = '42501';
    END IF;
  END IF;

  -- Checked when the stage or the address changes, so an older delivered order
  -- without one can still take a receipt or a note.
  IF v_needs_address
     AND (TG_OP = 'INSERT' OR NEW.status IS DISTINCT FROM OLD.status
          OR NEW."deliveryAddress" IS DISTINCT FROM OLD."deliveryAddress"
          OR NEW."deliveryPincode" IS DISTINCT FROM OLD."deliveryPincode")
     AND (nullif(btrim(NEW."deliveryAddress"), '') IS NULL OR nullif(btrim(NEW."deliveryPincode"), '') IS NULL) THEN
    RAISE EXCEPTION 'Order % needs a delivery address and a pincode before it can be %.', coalesce(NEW.id, 'this'), NEW.status
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS order_status_flow ON public.orders;
CREATE TRIGGER order_status_flow
  BEFORE INSERT OR UPDATE ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_status_flow();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('062_order_status_flow.sql',
        'A09: order stages enforced in the database for every role — one step at a time, each by its owner (Admin any single step, no skipping), address and pincode from Processing on, new orders start at Pending (backorders at Processing)')
ON CONFLICT (filename) DO NOTHING;
