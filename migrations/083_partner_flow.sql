-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 083: fix batch 16, partner flow (owner decisions 2026-10-04)
-- ════════════════════════════════════════════════════════════════════════
--
--  1. Paying an incentive is one database operation, pay_incentive(id):
--     a cash/discount incentive books its expense (EXP-<incentive id>, the id the app already uses), a
--     free-goods incentive takes its units out of sellable stock (earliest
--     expiry first) with a 'free_goods' movement row; then it reads Paid.
--     Before, the browser did three separate writes, and free goods paid by
--     Accounts (no Inventory access) never left stock (carry-over finding 2).
--     Short of sellable stock: refused with the numbers; the incentive stays
--     Earned. An app user can no longer change an incentive's status, value or
--     owner directly, nor insert one (they are earned by the order trigger).
--
--  2. A claim names one of the partner's own Earned incentives:
--     scheme_claims."incentiveId"; scheme, order and partner are taken from
--     the incentive; the amount is at most the incentive's value (0 for free
--     goods, which are paid in goods); one open claim per incentive. Settling
--     a claim pays its incentive through the same operation, for the claimed
--     amount, so an incentive can never be paid twice (expense
--     EXP-<incentive id>, category Scheme Claim). A settled claim is final. Paying an incentive directly is
--     refused while a claim for it is open (settle the claim instead).
--
--  3. A complaint raised by a partner is unassigned (Customer Support picks it
--     up); before, it was assigned to the partner's own user.
--
--  4. Partners read only the schemes that apply to them: Active, and for their
--     partner type or All.
--
--  Sign-up address/pincode are in the partner-signup Edge Function and the
--  sign-up pages (no schema change: the columns exist).
--  Proof before applying: test-results/full-test/fix-batch-16/dryrun.mjs.
-- ════════════════════════════════════════════════════════════════════════

ALTER TABLE public.stock_movements DROP CONSTRAINT IF EXISTS stock_movements_kind_check;
ALTER TABLE public.stock_movements ADD CONSTRAINT stock_movements_kind_check CHECK (kind = ANY (ARRAY[
  'delivery', 'return', 'purchase_return', 'purchase_return_withdrawn',
  'adjustment', 'cycle_count', 'transfer_out', 'transfer_in', 'grn', 'grn_reversed', 'free_goods']));
ALTER TABLE public.stock_movements ADD COLUMN IF NOT EXISTS "incentiveId" text;

-- ── 1. Paying an incentive ──────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.pay_incentive_internal(p_id text, p_category text DEFAULT 'Scheme Incentive', p_amount numeric DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  i public.distributor_incentives;
  b record;
  v_qty numeric; v_have numeric; v_take numeric; v_need numeric;
BEGIN
  SELECT * INTO i FROM public.distributor_incentives WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incentive % no longer exists.', p_id USING ERRCODE = 'P0001';
  END IF;
  IF i.status IS DISTINCT FROM 'Earned' THEN
    RAISE EXCEPTION 'Incentive % is %, so it cannot be paid again.', p_id, coalesce(i.status, 'blank') USING ERRCODE = 'P0001';
  END IF;
  PERFORM set_config('app.via', format('incentive %s paid', p_id), true);

  IF i."incentiveType" = 'Free Goods' THEN
    v_qty := coalesce(i."incentiveValue", 0);
    IF v_qty > 0 AND nullif(btrim(coalesce(i."incentiveProduct", '')), '') IS NULL THEN
      RAISE EXCEPTION 'Incentive % gives % free units but does not say of what, so they cannot be taken out of stock. Name the product on the scheme.', p_id, v_qty
        USING ERRCODE = 'P0001';
    END IF;
    IF v_qty > 0 THEN
      PERFORM 1 FROM public.inventory WHERE product = i."incentiveProduct" FOR UPDATE;
      SELECT coalesce(sum(quantity), 0) INTO v_have FROM public.inventory
       WHERE product = i."incentiveProduct" AND quantity > 0 AND public.batch_is_sellable("expiryDate");
      IF v_have < v_qty THEN
        RAISE EXCEPTION 'Only % sellable units of % are in stock, and incentive % gives % free. It stays Earned until there is stock.',
          v_have, i."incentiveProduct", p_id, v_qty USING ERRCODE = 'P0001';
      END IF;
      v_need := v_qty;
      FOR b IN
        SELECT id, "batchNumber", quantity FROM public.inventory
         WHERE product = i."incentiveProduct" AND quantity > 0 AND public.batch_is_sellable("expiryDate")
         ORDER BY "expiryDate" ASC NULLS LAST, "createdAt" ASC, id
      LOOP
        v_take := least(b.quantity, v_need);
        UPDATE public.inventory SET quantity = quantity - v_take WHERE id = b.id;
        INSERT INTO public.stock_movements (kind, "inventoryId", product, "batchNumber", quantity, "incentiveId", note, "createdBy")
        VALUES ('free_goods', b.id, i."incentiveProduct", b."batchNumber", v_take, i.id,
                format('free goods on incentive %s (%s)', i.id, coalesce(i."schemeName", 'scheme')), public.my_user_id());
        v_need := v_need - v_take;
        EXIT WHEN v_need <= 0;
      END LOOP;
    END IF;
  ELSIF coalesce(p_amount, i."incentiveValue", 0) > 0 THEN
    INSERT INTO public.expenses (id, category, amount, description, date, "createdAt")
    VALUES ('EXP-' || i.id, p_category, least(coalesce(p_amount, i."incentiveValue"), i."incentiveValue"),
            coalesce(i."schemeName", 'Scheme incentive') || coalesce(' on order ' || i."orderId", ''), now(), now())
    ON CONFLICT (id) DO NOTHING;
  END IF;

  PERFORM set_config('app.incentive_payout', 'on', true);
  UPDATE public.distributor_incentives SET status = 'Paid' WHERE id = i.id;
  PERFORM set_config('app.incentive_payout', 'off', true);
  PERFORM set_config('app.via', '', true);
  RETURN jsonb_build_object('id', i.id, 'type', i."incentiveType", 'value', i."incentiveValue", 'product', i."incentiveProduct");
END $$;
REVOKE EXECUTE ON FUNCTION public.pay_incentive_internal(text, text, numeric) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.pay_incentive(p_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_claim text;
BEGIN
  IF NOT public.can_edit('incentives') OR coalesce(public.is_partner(), false) THEN
    RAISE EXCEPTION 'Paying an incentive needs full Incentives access.' USING ERRCODE = '42501';
  END IF;
  SELECT id INTO v_claim FROM public.scheme_claims
   WHERE "incentiveId" = p_id AND status IN ('Pending', 'Approved') LIMIT 1;
  IF v_claim IS NOT NULL THEN
    RAISE EXCEPTION 'Incentive % has an open claim (%): settle the claim instead, which pays it.', p_id, v_claim USING ERRCODE = 'P0001';
  END IF;
  RETURN public.pay_incentive_internal(p_id, 'Scheme Incentive');
END $$;
REVOKE EXECUTE ON FUNCTION public.pay_incentive(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.pay_incentive(text) TO authenticated;

-- App users cannot pay, revalue or re-own an incentive by a direct write, nor
-- create one (orders earn them, 070). Invoker: current_user tells a direct
-- write from one inside the definer functions above.
CREATE OR REPLACE FUNCTION public.incentives_written_by_db()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF TG_OP = 'INSERT' THEN
    RAISE EXCEPTION 'Incentives are earned by orders; they cannot be added by hand.' USING ERRCODE = '42501';
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status OR NEW."incentiveValue" IS DISTINCT FROM OLD."incentiveValue"
     OR NEW."incentiveType" IS DISTINCT FROM OLD."incentiveType" OR NEW."incentiveProduct" IS DISTINCT FROM OLD."incentiveProduct"
     OR NEW."distributorId" IS DISTINCT FROM OLD."distributorId" OR NEW."dealerId" IS DISTINCT FROM OLD."dealerId"
     OR NEW."retailerId" IS DISTINCT FROM OLD."retailerId" THEN
    RAISE EXCEPTION 'Incentive % is paid with Mark Paid (or by settling its claim), which records the payout; it cannot be edited directly.', OLD.id
      USING ERRCODE = '42501';
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS incentives_written_by_db ON public.distributor_incentives;
CREATE TRIGGER incentives_written_by_db BEFORE INSERT OR UPDATE ON public.distributor_incentives
  FOR EACH ROW EXECUTE FUNCTION public.incentives_written_by_db();

-- ── 2. Claims name an Earned incentive ──────────────────────────────────
ALTER TABLE public.scheme_claims ADD COLUMN IF NOT EXISTS "incentiveId" text
  REFERENCES public.distributor_incentives(id);
CREATE UNIQUE INDEX IF NOT EXISTS scheme_claims_one_open_per_incentive
  ON public.scheme_claims ("incentiveId") WHERE "incentiveId" IS NOT NULL AND status <> 'Rejected';

CREATE OR REPLACE FUNCTION public.claims_tied_to_incentive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  i public.distributor_incentives;
  v_open text;
  v_claim_party text := coalesce(NEW."distributorId", NEW."dealerId", NEW."retailerId");
BEGIN
  IF public.current_app_email() IS NULL THEN RETURN NEW; END IF;   -- maintenance
  IF nullif(btrim(coalesce(NEW."incentiveId", '')), '') IS NULL THEN
    RAISE EXCEPTION 'A claim must name the incentive it is for: choose one of the incentives you have earned.' USING ERRCODE = 'P0001';
  END IF;
  SELECT * INTO i FROM public.distributor_incentives WHERE id = NEW."incentiveId" FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Incentive % does not exist.', NEW."incentiveId" USING ERRCODE = 'P0001';
  END IF;
  IF v_claim_party IS NOT NULL
     AND v_claim_party IS DISTINCT FROM coalesce(i."distributorId", i."dealerId", i."retailerId") THEN
    RAISE EXCEPTION 'Incentive % belongs to another partner.', i.id USING ERRCODE = '42501';
  END IF;
  IF i.status IS DISTINCT FROM 'Earned' THEN
    RAISE EXCEPTION 'Incentive % is %, so it cannot be claimed.', i.id, coalesce(i.status, 'blank') USING ERRCODE = 'P0001';
  END IF;
  SELECT id INTO v_open FROM public.scheme_claims
   WHERE "incentiveId" = i.id AND status <> 'Rejected' LIMIT 1;
  IF v_open IS NOT NULL THEN
    RAISE EXCEPTION 'Incentive % already has claim %.', i.id, v_open USING ERRCODE = '23505';
  END IF;

  IF i."incentiveType" = 'Free Goods' THEN
    NEW.amount := 0;                                   -- paid in goods, not cash
  ELSIF NEW.amount IS NULL OR NEW.amount <= 0 THEN
    NEW.amount := i."incentiveValue";
  ELSIF NEW.amount > coalesce(i."incentiveValue", 0) THEN
    RAISE EXCEPTION 'Incentive % is worth ₹%, so a claim on it can be at most that (₹% entered).', i.id, i."incentiveValue", NEW.amount
      USING ERRCODE = 'P0001';
  END IF;
  NEW."distributorId" := i."distributorId";
  NEW."dealerId" := i."dealerId";
  NEW."retailerId" := i."retailerId";
  NEW."schemeId" := i."schemeId";
  NEW."schemeName" := i."schemeName";
  NEW."orderId" := i."orderId";
  NEW.status := 'Pending';
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_tied_to_incentive ON public.scheme_claims;
CREATE TRIGGER claims_tied_to_incentive BEFORE INSERT ON public.scheme_claims
  FOR EACH ROW EXECUTE FUNCTION public.claims_tied_to_incentive();

CREATE OR REPLACE FUNCTION public.claims_settle_pays_incentive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF public.current_app_email() IS NULL THEN RETURN NEW; END IF;   -- maintenance
  IF OLD.status = 'Settled' AND NEW.status IS DISTINCT FROM 'Settled' THEN
    RAISE EXCEPTION 'Claim % is settled: its incentive has been paid. A settled claim is final.', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW."incentiveId" IS DISTINCT FROM OLD."incentiveId" OR NEW.amount IS DISTINCT FROM OLD.amount
     OR NEW."distributorId" IS DISTINCT FROM OLD."distributorId" OR NEW."dealerId" IS DISTINCT FROM OLD."dealerId"
     OR NEW."retailerId" IS DISTINCT FROM OLD."retailerId" OR NEW."schemeId" IS DISTINCT FROM OLD."schemeId" THEN
    RAISE EXCEPTION 'Claim %: the incentive, amount and partner are fixed once submitted.', OLD.id USING ERRCODE = 'P0001';
  END IF;
  IF NEW.status = 'Settled' AND OLD.status IS DISTINCT FROM 'Settled' THEN
    IF NEW."incentiveId" IS NULL THEN
      RAISE EXCEPTION 'Claim % was made before claims were tied to incentives, so settling it cannot pay one. Reject it, and the partner can claim the incentive itself.', OLD.id
        USING ERRCODE = 'P0001';
    END IF;
    PERFORM public.pay_incentive_internal(NEW."incentiveId", 'Scheme Claim', NEW.amount);
    PERFORM set_config('app.via', '', true);
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS claims_settle_pays_incentive ON public.scheme_claims;
CREATE TRIGGER claims_settle_pays_incentive BEFORE UPDATE ON public.scheme_claims
  FOR EACH ROW EXECUTE FUNCTION public.claims_settle_pays_incentive();

-- ── 3. A partner's complaint is unassigned ──────────────────────────────
CREATE OR REPLACE FUNCTION public.complaints_partner_unassigned()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(public.is_partner(), false) THEN NEW."assignedTo" := NULL; END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS complaints_partner_unassigned ON public.complaints;
CREATE TRIGGER complaints_partner_unassigned BEFORE INSERT ON public.complaints
  FOR EACH ROW EXECUTE FUNCTION public.complaints_partner_unassigned();

-- ── 4. Partners read only the schemes that apply to them ────────────────
DROP POLICY IF EXISTS schemes_select ON public.schemes;
CREATE POLICY schemes_select ON public.schemes FOR SELECT USING (
  public.can_view('schemes') AND (
    NOT public.is_partner()
    OR (status = 'Active' AND "applicableTo" IN (public.my_role_name(), 'All'))
  )
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('083_partner_flow.sql',
        'batch 16: pay_incentive in the DB (free goods leave stock for any payer); claims tied to an Earned incentive, settling pays it once; partner complaints unassigned; partners read only applicable Active schemes')
ON CONFLICT (filename) DO NOTHING;
