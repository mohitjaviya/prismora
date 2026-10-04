-- Batch 16 TEST rows removed (owner's OK, 2026-10-04). One block: each step must remove exactly its row(s),
-- or the whole block aborts and nothing changes. Every step is tagged for the audit log.
-- Kept as history: stock movements 304/305 (2 free units out, then put back: net 0), audit_log and events rows.
DO $$
DECLARE n int;
BEGIN
  PERFORM set_config('app.via', 'cleanup batch 16 TEST rows (owner OK 2026-10-04): claim CLM-1791083968009', true);
  DELETE FROM public.scheme_claims WHERE id = 'CLM-1791083968009' AND "schemeName" = 'TEST B16 10pct Balm'
    AND "incentiveId" = 'INC-1791083849440-SCH-TEST-B16-PCT' AND amount = 30;
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'claim: % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', 'cleanup batch 16 TEST rows (owner OK 2026-10-04): expense EXP-INC-1791083849440-SCH-TEST-B16-PCT', true);
  DELETE FROM public.expenses WHERE id = 'EXP-INC-1791083849440-SCH-TEST-B16-PCT' AND amount = 30 AND category = 'Scheme Claim';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'expense: % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', 'cleanup batch 16 TEST rows (owner OK 2026-10-04): incentives of O318', true);
  DELETE FROM public.distributor_incentives
   WHERE id IN ('INC-1791083849440-SCH-TEST-B16-PCT', 'INC-1791083849440-SCH-TEST-B16-FG') AND "orderId" = 'O318'
     AND "schemeId" IN ('SCH-TEST-B16-FG', 'SCH-TEST-B16-PCT');
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 2 THEN RAISE EXCEPTION 'incentives: % rows, expected 2', n; END IF;

  PERFORM set_config('app.via', 'cleanup batch 16 TEST rows (owner OK 2026-10-04): order O318', true);
  DELETE FROM public.orders WHERE id = 'O318' AND "customerName" = 'TEST B16 order' AND status = 'Pending' AND "distributorId" = 'D-TEST-1';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 1 THEN RAISE EXCEPTION 'order: % rows, expected 1', n; END IF;

  PERFORM set_config('app.via', 'cleanup batch 16 TEST rows (owner OK 2026-10-04): TEST schemes', true);
  DELETE FROM public.schemes WHERE id IN ('SCH-TEST-B16-FG', 'SCH-TEST-B16-PCT') AND name LIKE 'TEST B16 %' AND status = 'Inactive';
  GET DIAGNOSTICS n = ROW_COUNT; IF n <> 2 THEN RAISE EXCEPTION 'schemes: % rows, expected 2', n; END IF;

  PERFORM set_config('app.via', '', true);
  -- REHEARSAL-LINE
END $$;
