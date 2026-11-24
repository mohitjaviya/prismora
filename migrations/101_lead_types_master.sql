-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 101: Lead Type master
--  Owner-approved 2026-11-24. Independent of 085-100 (works on its own).
--
--  WHAT WAS WRONG
--
--  The Lead Type dropdown on Add/Edit Lead was a fixed list of four. Types
--  such as "Wholesaler" could not be added or removed without a code change.
--
--  WHAT THIS DOES
--
--  * Seeds the master list 'lead_type' with the four current types (only if
--    the list is empty): Distributor, Super Stockist, Dealer, Retailer.
--    Existing leads already hold exactly these texts, so no lead is changed.
--    The stored value is the key (= the name), as for every free list.
--  * Only Admin and Super Admin may add, rename, switch off or delete a Lead
--    Type (trigger masters_lead_type_rules, invoker; the maintenance role is
--    not affected).
--  * A type used by any lead cannot be deleted (named refusal; switch it
--    off instead, old leads keep showing it).
--  * The key of a type can change only through rename_lead_type(old, new),
--    which renames the master row and every lead that uses it in ONE
--    transaction. A direct key edit is refused.
--  * A lead's type must be an active type of the master — but only when the
--    lead is new or the type is changed (trigger leads_lead_type_rules,
--    invoker). An unchanged old value (including a switched-off type) never
--    blocks a save, and a blank type stays allowed.
--  * lead_types_enabled() lets the screen know this migration is in.
--
--  The screens keep working without this file (built-in four types; rename
--  falls back to a label-only change).
-- ════════════════════════════════════════════════════════════════════════

-- ── 1. Seed ─────────────────────────────────────────────────────────────
INSERT INTO public.masters (id, list, key, label, sort, active, locked)
SELECT v.id, 'lead_type', v.k, v.k, v.s, true, false
FROM (VALUES ('M-lead_type-1', 'Distributor', 0), ('M-lead_type-2', 'Super Stockist', 1),
             ('M-lead_type-3', 'Dealer', 2), ('M-lead_type-4', 'Retailer', 3)) AS v(id, k, s)
WHERE NOT EXISTS (SELECT 1 FROM public.masters WHERE list = 'lead_type');

-- ── 2. Who may change the list, in use / rename rules ───────────────────
CREATE OR REPLACE FUNCTION public.may_manage_lead_types()
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $fn$
  SELECT coalesce(public.my_role_name() IN ('Super Admin', 'Admin'), false)
     AND NOT coalesce(public.is_partner(), false);
$fn$;

CREATE OR REPLACE FUNCTION public.masters_lead_type_rules()
RETURNS trigger LANGUAGE plpgsql AS $fn$
DECLARE n integer;
BEGIN
  IF NOT ((TG_OP <> 'INSERT' AND OLD.list = 'lead_type') OR (TG_OP <> 'DELETE' AND NEW.list = 'lead_type')) THEN
    RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
  END IF;

  IF current_user IN ('authenticated', 'anon') AND NOT public.may_manage_lead_types() THEN
    RAISE EXCEPTION 'Only Admin or Super Admin can change the Lead Types.';
  END IF;

  IF TG_OP = 'INSERT' THEN
    IF nullif(btrim(NEW.key), '') IS NULL OR NEW.key <> btrim(NEW.key) THEN
      RAISE EXCEPTION 'A lead type needs a name without spaces at the ends.';
    END IF;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.list IS DISTINCT FROM OLD.list THEN
      RAISE EXCEPTION 'A lead type cannot be moved to another list.';
    END IF;
    IF NEW.key IS DISTINCT FROM OLD.key AND coalesce(current_setting('app.lead_type_rename', true), '') <> 'on' THEN
      RAISE EXCEPTION 'Rename a lead type from Masters (it updates the leads that use it too); its stored value cannot be edited directly.';
    END IF;
  ELSE -- DELETE
    SELECT count(*) INTO n FROM public.leads WHERE "leadType" = OLD.key;
    IF n > 0 THEN
      RAISE EXCEPTION 'Cannot remove the lead type "%": % lead(s) use it. Switch it off instead; old leads keep showing it.', OLD.key, n;
    END IF;
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END $fn$;

DROP TRIGGER IF EXISTS masters_lead_type_rules ON public.masters;
CREATE TRIGGER masters_lead_type_rules BEFORE INSERT OR UPDATE OR DELETE ON public.masters
  FOR EACH ROW EXECUTE FUNCTION public.masters_lead_type_rules();

-- ── 3. A lead's type must be an active master type (new or changed only) ─
CREATE OR REPLACE FUNCTION public.leads_lead_type_rules()
RETURNS trigger LANGUAGE plpgsql AS $fn$
BEGIN
  IF nullif(btrim(coalesce(NEW."leadType", '')), '') IS NULL THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND NEW."leadType" IS NOT DISTINCT FROM OLD."leadType" THEN RETURN NEW; END IF;
  IF current_user NOT IN ('authenticated', 'anon') THEN RETURN NEW; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.masters
                 WHERE list = 'lead_type' AND key = NEW."leadType" AND active IS DISTINCT FROM false) THEN
    RAISE EXCEPTION 'Lead type "%" is not an active lead type. Choose one from the list (Admin can add types in Masters).', NEW."leadType";
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS leads_lead_type_rules ON public.leads;
CREATE TRIGGER leads_lead_type_rules BEFORE INSERT OR UPDATE OF "leadType" ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.leads_lead_type_rules();

-- ── 4. Rename: master row + leads, one transaction ──────────────────────
CREATE OR REPLACE FUNCTION public.rename_lead_type(p_old text, p_new text)
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_new text := btrim(coalesce(p_new, '')); r public.masters; n integer;
BEGIN
  IF NOT public.may_manage_lead_types() THEN
    RAISE EXCEPTION 'Only Admin or Super Admin can change the Lead Types.';
  END IF;
  IF v_new = '' THEN RAISE EXCEPTION 'A lead type needs a name.'; END IF;
  SELECT * INTO r FROM public.masters WHERE list = 'lead_type' AND key = p_old FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'The lead type "%" no longer exists.', p_old; END IF;
  IF v_new = r.key THEN RETURN 0; END IF;
  IF EXISTS (SELECT 1 FROM public.masters WHERE list = 'lead_type' AND id <> r.id
             AND (lower(btrim(key)) = lower(v_new) OR lower(btrim(label)) = lower(v_new))) THEN
    RAISE EXCEPTION '"%" is already in the Lead Types.', v_new;
  END IF;
  PERFORM set_config('app.lead_type_rename', 'on', true);
  UPDATE public.masters SET key = v_new, label = v_new WHERE id = r.id;
  UPDATE public.leads SET "leadType" = v_new WHERE "leadType" = p_old;
  GET DIAGNOSTICS n = ROW_COUNT;
  PERFORM set_config('app.lead_type_rename', '', true);
  RETURN n;
END $fn$;

-- ── 5. Screen switch ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.lead_types_enabled()
RETURNS boolean LANGUAGE sql STABLE AS $fn$ SELECT true $fn$;

REVOKE ALL ON FUNCTION public.rename_lead_type(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.may_manage_lead_types() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.rename_lead_type(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.may_manage_lead_types() TO authenticated;
GRANT EXECUTE ON FUNCTION public.lead_types_enabled() TO authenticated, anon;
