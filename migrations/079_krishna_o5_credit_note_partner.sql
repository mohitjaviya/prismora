-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — 079: Krishna pharma's ₹12,600 credit note comes off its balance
--  (Phase 4 finding P4-F1, owner's OK 2026-10-03). Data correction only.
-- ════════════════════════════════════════════════════════════════════════
--
--  Order O5 (Krishna pharma, delivered 24 Sept) was entered with no partner.
--  The 28 Sept reconciliation linked only its invoice INV-1790265113364
--  (₹14,000 + ₹1,680) to DIST-1790265786389. The sales return of 29 Sept
--  (SR-1790658148634, ₹12,600, "Damaged in transit") took the partner from
--  the order, so it and its credit note CN-SR-1790658148634 belonged to
--  nobody: the ₹12,600 never came off the balance (₹15,680 instead of
--  ₹3,080) and Total Outstanding was ₹12,600 too high. Since 075 a return
--  must go to the invoice's partner, so this cannot recur.
--
--  Fix: link the order, the return and the credit note to Krishna pharma.
--  The existing triggers do the rest: credit_note_moves_balance takes
--  ₹12,600 off the balance (15,680 → 3,080) and the invoice status becomes
--  Partially Paid with ₹3,080 due. No incentive is earned (dry run). Every
--  step is tagged with the reason for the audit log. The block aborts unless
--  each step changes exactly one row and the balance ends at ₹3,080.
--  Proof before applying: test-results/full-test/phase4/fix079-dryrun.mjs
--  (rolled back). Order O113 is left as it is (owner's decision: it already
--  has its own settled tax invoice, and delivering it adds no invoice).
-- ════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  k constant text := 'DIST-1790265786389';
  n int;
  bal numeric;
BEGIN
  SELECT "outstandingAmount" INTO bal FROM public.distributors WHERE id = k;
  IF bal IS DISTINCT FROM 15680 THEN
    RAISE EXCEPTION '079: Krishna pharma balance is %, expected 15680 before the correction', bal;
  END IF;

  PERFORM set_config('app.via', 'correction 079: order O5 linked to Krishna pharma (P4-F1)', true);
  UPDATE public.orders SET "distributorId" = k WHERE id = 'O5' AND "distributorId" IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '079: order O5 changed % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', 'correction 079: sales return SR-1790658148634 linked to Krishna pharma (P4-F1)', true);
  UPDATE public.sales_returns SET "distributorId" = k WHERE id = 'SR-1790658148634' AND "distributorId" IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '079: sales return changed % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', 'correction 079: credit note CN-SR-1790658148634 linked to Krishna pharma (P4-F1)', true);
  UPDATE public.credit_notes SET "distributorId" = k WHERE id = 'CN-SR-1790658148634' AND "distributorId" IS NULL;
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION '079: credit note changed % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', '', true);

  SELECT "outstandingAmount" INTO bal FROM public.distributors WHERE id = k;
  IF bal IS DISTINCT FROM 3080 THEN
    RAISE EXCEPTION '079: Krishna pharma balance is % after the correction, expected 3080', bal;
  END IF;
END $$;

INSERT INTO public.schema_migrations (filename, note)
VALUES ('079_krishna_o5_credit_note_partner.sql',
        'P4-F1 data correction: O5, SR-1790658148634 and CN-SR-1790658148634 linked to Krishna pharma; balance 15,680 -> 3,080; audited with reason')
ON CONFLICT (filename) DO NOTHING;
