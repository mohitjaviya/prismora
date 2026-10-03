-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Fix batch 10 (Phase 3 findings): order ownership and splits.
--
--  WHAT WAS WRONG
--
--  1. Partner portal orders had no owner. The browser worked out the
--     territory executive, but partners cannot read `territories` (RLS), so
--     it always sent assignedTo = '' and territoryId = null. Only Admin and
--     Dispatch ever saw these orders; the Processing step (Batch 5) stalled.
--  2. A Sales Manager's own new order was saved with no owner (Assign To is
--     optional and blank by default) and vanished from the manager's list.
--  3. Split into Backorder, clicked twice, made two backorders: O189 50 ->
--     45 + 5 + 5 = 55 units, and the parent linked only one of them.
--  4. A dealer or retailer with no territory of its own was routed nowhere,
--     though its parent had one.
--
--  WHAT THIS DOES
--
--  1. order_route(distributor, dealer, retailer): the ordering party, then
--     whoever it buys through (retailer -> dealer -> distributor). For each:
--     its territory by link, else by place (state + city among a territory's
--     districts, only when exactly one territory matches). The owner is the
--     first such territory's executive who is an active user. The order's
--     territory is the first territory found. Reads `territories` as the
--     owner, so it works for partners.
--  2. orders_set_owner (BEFORE INSERT, after orders_partner_order_rules):
--       partner order  -> owner and territory always from order_route; what
--                         the browser sent is ignored.
--       staff order with no owner -> a manager- or sales-level user owns it
--                         themselves; anyone else (Admin) gets order_route
--                         when the order names a partner, else stays blank.
--       territoryId left empty on an order naming a partner is filled in.
--  3. One open backorder per parent: unique index on splitFromOrderId for
--     orders not Cancelled/Delivered (this is what stops two simultaneous
--     clicks), with a trigger in front of it that names the backorder.
--  4. partners_inherit_territory: a dealer saved with no territory takes its
--     distributor's; a retailer its dealer's, else that dealer's
--     distributor's. Existing rows: none can inherit today (checked), the
--     backfill below is a no-op kept for completeness.
--
--  Old ownerless orders are left as they are (owner's decision 2026-10-03).
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Routing ───────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.party_territory(p_territory text, p_state text, p_city text)
RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_id text;
  v_n  int;
BEGIN
  IF nullif(btrim(p_territory), '') IS NOT NULL THEN
    SELECT id INTO v_id FROM public.territories WHERE id = p_territory;
    IF FOUND THEN RETURN v_id; END IF;
  END IF;
  IF nullif(btrim(p_state), '') IS NULL OR nullif(btrim(p_city), '') IS NULL THEN
    RETURN NULL;
  END IF;
  SELECT count(*), min(t.id) INTO v_n, v_id
  FROM public.territories t
  WHERE lower(btrim(t.state)) = lower(btrim(p_state))
    AND jsonb_typeof(t.districts) = 'array'
    AND EXISTS (SELECT 1 FROM jsonb_array_elements_text(t.districts) d
                WHERE lower(btrim(d)) = lower(btrim(p_city)));
  -- Two territories claiming one city is a mistake in the map: pick neither.
  RETURN CASE WHEN v_n = 1 THEN v_id END;
END $$;

CREATE OR REPLACE FUNCTION public.order_route(
  p_distributor text, p_dealer text, p_retailer text,
  OUT territory_id text, OUT assigned_to text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r_ret  public.retailers;
  r_deal public.dealers;
  r_dist public.distributors;
  v_terr text;
  v_exec text;
  chain  text[] := '{}';
BEGIN
  IF nullif(p_retailer, '') IS NOT NULL THEN
    SELECT * INTO r_ret FROM public.retailers WHERE id = p_retailer;
    chain := chain || public.party_territory(r_ret."territoryId", r_ret.state, r_ret.city);
    p_dealer := coalesce(nullif(p_dealer, ''), r_ret."parentDealerId");
  END IF;
  IF nullif(p_dealer, '') IS NOT NULL THEN
    SELECT * INTO r_deal FROM public.dealers WHERE id = p_dealer;
    chain := chain || public.party_territory(r_deal."territoryId", r_deal.state, r_deal.city);
    p_distributor := coalesce(nullif(p_distributor, ''), r_deal."parentDistributorId");
  END IF;
  IF nullif(p_distributor, '') IS NOT NULL THEN
    SELECT * INTO r_dist FROM public.distributors WHERE id = p_distributor;
    chain := chain || public.party_territory(r_dist."territoryId", r_dist.state, r_dist.city);
  END IF;

  FOREACH v_terr IN ARRAY chain LOOP
    CONTINUE WHEN v_terr IS NULL;
    territory_id := coalesce(territory_id, v_terr);
    SELECT u.id INTO v_exec
    FROM public.territories t JOIN public.users u ON u.id = t."executiveId"
    WHERE t.id = v_terr
      AND coalesce(u.status, '') NOT IN ('Pending', 'Rejected', 'Inactive');
    IF v_exec IS NOT NULL THEN
      assigned_to := v_exec;
      RETURN;
    END IF;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.party_territory(text, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.order_route(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.party_territory(text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.order_route(text, text, text) TO authenticated;

-- ── 2. Every new order gets an owner where one can be worked out ─────────
-- Keys on is_partner()/my_role_level() (the signed-in user's token), never
-- on current_user, so SECURITY DEFINER (needed to read territories) is safe.
CREATE OR REPLACE FUNCTION public.orders_set_owner()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_terr text;
  v_exec text;
  v_level text := public.my_role_level();
  v_has_party boolean := coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId") IS NOT NULL;
BEGIN
  IF v_level IS NULL THEN
    RETURN NEW;                     -- database maintenance: as given
  END IF;

  IF v_has_party THEN
    SELECT r.territory_id, r.assigned_to INTO v_terr, v_exec
    FROM public.order_route(NEW."distributorId", NEW."dealerId", NEW."retailerId") r;
  END IF;

  -- No owner is NULL: assignedTo references users, so '' is refused.
  IF v_level = 'partner' THEN
    NEW."assignedTo"  := v_exec;
    NEW."territoryId" := v_terr;
    RETURN NEW;
  END IF;

  IF nullif(btrim(coalesce(NEW."assignedTo", '')), '') IS NULL THEN
    NEW."assignedTo" := NULL;
    IF v_level IN ('manager', 'sales') THEN
      NEW."assignedTo" := public.my_user_id();
    ELSIF v_exec IS NOT NULL THEN
      NEW."assignedTo" := v_exec;
    END IF;
  END IF;

  IF NEW."territoryId" IS NULL THEN
    NEW."territoryId" := v_terr;
  END IF;
  RETURN NEW;
END $$;

-- Fires after orders_partner_order_rules (alphabetical), which fixes the
-- partner's own ids first.
DROP TRIGGER IF EXISTS orders_set_owner ON public.orders;
CREATE TRIGGER orders_set_owner BEFORE INSERT ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.orders_set_owner();

-- ── 3. One open backorder per parent ────────────────────────────────────
CREATE OR REPLACE FUNCTION public.order_one_open_backorder()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_other text;
BEGIN
  IF NEW."splitFromOrderId" IS NULL OR NEW.status IN ('Cancelled', 'Delivered') THEN
    RETURN NEW;
  END IF;
  SELECT id INTO v_other FROM public.orders
  WHERE "splitFromOrderId" = NEW."splitFromOrderId"
    AND status NOT IN ('Cancelled', 'Delivered')
    AND id IS DISTINCT FROM NEW.id
  LIMIT 1;
  IF v_other IS NOT NULL THEN
    RAISE EXCEPTION 'Order % already has an open backorder (%). Finish or cancel it before splitting again.',
      NEW."splitFromOrderId", v_other USING ERRCODE = '23505';
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS order_one_open_backorder ON public.orders;
CREATE TRIGGER order_one_open_backorder
  BEFORE INSERT OR UPDATE OF "splitFromOrderId", status ON public.orders
  FOR EACH ROW EXECUTE FUNCTION public.order_one_open_backorder();

-- The trigger can't see a twin insert that hasn't committed; this can.
CREATE UNIQUE INDEX IF NOT EXISTS orders_one_open_backorder
  ON public.orders ("splitFromOrderId")
  WHERE "splitFromOrderId" IS NOT NULL AND status NOT IN ('Cancelled', 'Delivered');

-- ── 4. Dealers and retailers inherit their parent's territory ───────────
CREATE OR REPLACE FUNCTION public.partners_inherit_territory()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
BEGIN
  IF nullif(btrim(coalesce(NEW."territoryId", '')), '') IS NOT NULL THEN
    RETURN NEW;
  END IF;
  NEW."territoryId" := NULL;
  IF TG_TABLE_NAME = 'dealers' THEN
    SELECT "territoryId" INTO NEW."territoryId"
    FROM public.distributors WHERE id = NEW."parentDistributorId";
  ELSIF TG_TABLE_NAME = 'retailers' THEN
    SELECT coalesce(d."territoryId", di."territoryId") INTO NEW."territoryId"
    FROM public.dealers d LEFT JOIN public.distributors di ON di.id = d."parentDistributorId"
    WHERE d.id = NEW."parentDealerId";
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS partners_inherit_territory ON public.dealers;
CREATE TRIGGER partners_inherit_territory
  BEFORE INSERT OR UPDATE OF "territoryId", "parentDistributorId" ON public.dealers
  FOR EACH ROW EXECUTE FUNCTION public.partners_inherit_territory();

DROP TRIGGER IF EXISTS partners_inherit_territory ON public.retailers;
CREATE TRIGGER partners_inherit_territory
  BEFORE INSERT OR UPDATE OF "territoryId", "parentDealerId" ON public.retailers
  FOR EACH ROW EXECUTE FUNCTION public.partners_inherit_territory();

-- Backfill (no-op today): dealers first, so retailers can pick theirs up.
UPDATE public.dealers d SET "territoryId" = di."territoryId"
FROM public.distributors di
WHERE d."territoryId" IS NULL AND di.id = d."parentDistributorId" AND di."territoryId" IS NOT NULL;
UPDATE public.retailers r SET "territoryId" = coalesce(d."territoryId", di."territoryId")
FROM public.dealers d LEFT JOIN public.distributors di ON di.id = d."parentDistributorId"
WHERE r."territoryId" IS NULL AND d.id = r."parentDealerId"
  AND coalesce(d."territoryId", di."territoryId") IS NOT NULL;

COMMIT;
