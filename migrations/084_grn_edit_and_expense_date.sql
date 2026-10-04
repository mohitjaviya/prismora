-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 084: fix batch 17, two database rules
-- ════════════════════════════════════════════════════════════════════════
--
--  1. A goods receipt's items, PO and vendor can't be edited by app users.
--     Editing them (API only; no screen does it) moved the vendor balance
--     (vendor_balance_from_grn, 065) but not stock or stock_movements, so
--     the two disagreed. A wrong receipt is deleted (082 takes its stock
--     back out and reverses the balance) and recorded again. Notes and
--     received date can still be edited. Maintenance (service key / SQL)
--     is unaffected.
--
--  2. An expense can't be dated after today (India time) by an app user
--     (Phase 3 G6 LOW: future-dated expense). Checked only when the date is
--     entered or changed. The 17 existing expenses are all dated today or
--     earlier. Payout expenses booked by owner-rights functions are dated
--     now() and unaffected.
--
--  Invoker functions: current_user tells a direct app write
--  ('authenticated'/'anon') from one made inside an owner-rights function.
--  Proof before applying: test-results/full-test/fix-batch-17/dryrun.mjs.
-- ════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.grn_lines_locked()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND (NEW.items IS DISTINCT FROM OLD.items
          OR NEW."poId" IS DISTINCT FROM OLD."poId"
          OR NEW."vendorName" IS DISTINCT FROM OLD."vendorName") THEN
    RAISE EXCEPTION 'Goods receipt % cannot be changed after it is recorded: its items, PO and vendor moved stock and the vendor balance. Delete it (this takes its stock back out) and record it again.',
      OLD.id;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS grn_lines_locked ON public.grn;
CREATE TRIGGER grn_lines_locked BEFORE UPDATE ON public.grn
  FOR EACH ROW EXECUTE FUNCTION public.grn_lines_locked();

CREATE OR REPLACE FUNCTION public.expense_not_future()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
BEGIN
  IF current_user IN ('authenticated', 'anon')
     AND NEW.date IS NOT NULL
     AND (TG_OP = 'INSERT' OR NEW.date IS DISTINCT FROM OLD.date)
     AND (NEW.date AT TIME ZONE 'Asia/Kolkata')::date > (now() AT TIME ZONE 'Asia/Kolkata')::date THEN
    RAISE EXCEPTION 'The expense date (%) is in the future. Record an expense on or after the day it is incurred.',
      to_char(NEW.date AT TIME ZONE 'Asia/Kolkata', 'DD Mon YYYY');
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS expense_not_future ON public.expenses;
CREATE TRIGGER expense_not_future BEFORE INSERT OR UPDATE ON public.expenses
  FOR EACH ROW EXECUTE FUNCTION public.expense_not_future();

INSERT INTO public.schema_migrations (filename, note)
VALUES ('084_grn_edit_and_expense_date.sql',
        'batch 17: GRN items/PO/vendor not editable by app users (delete + re-record); expense date not after today IST')
ON CONFLICT (filename) DO NOTHING;
