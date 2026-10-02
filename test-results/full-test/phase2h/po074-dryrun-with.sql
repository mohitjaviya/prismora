DO $dry$ DECLARE rep text := ''; st text; qty numeric; qty0 numeric; bal numeric; bal0 numeric; n int; BEGIN
  SELECT coalesce(sum(quantity),0) INTO qty0 FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
  SELECT "outstandingAmount" INTO bal0 FROM vendors WHERE id = 'TEST-V-1';
  EXECUTE $mig$-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Phase 2 H8: the two purchase orders still in "Ordered".
--  Safe to run more than once (only rows still in "Ordered" change).
--
--  WHAT WAS WRONG
--
--  "Ordered" is the PO status the first seed data used (002) before
--  "Confirmed" existed. TEST-PO-1 and TEST-PO-PM kept it. Goods can be
--  received only against a Confirmed or Partially Received PO (051), so
--  nothing could ever be received against them; they also showed as Drafts
--  and were left out of "Pending GRN" (the screen now counts them).
--
--  WHAT THIS DOES
--
--  Renames the status of those two POs to "Confirmed". The purchase_orders
--  audit trigger records each change; app.via gives it the reason. Nothing
--  else changes: no stock, no vendor balance, no receipt.
-- ════════════════════════════════════════════════════════════════════════

SELECT set_config('app.via',
  'migration 074 (Phase 2 H8): legacy status "Ordered" (seed data, 002) renamed to Confirmed so goods can be received — GRNs are accepted only on Confirmed / Partially Received POs (051)',
  true);

UPDATE public.purchase_orders
   SET status = 'Confirmed'
 WHERE id IN ('TEST-PO-1', 'TEST-PO-PM')
   AND status = 'Ordered';

INSERT INTO public.schema_migrations (filename, note)
VALUES ('074_ordered_pos_to_confirmed.sql',
        'TEST-PO-1 and TEST-PO-PM: status Ordered (seed-data name) -> Confirmed, audited with the reason')
ON CONFLICT (filename) DO NOTHING;
$mig$;
  SELECT string_agg(id || '=' || status, ', ' ORDER BY id) INTO st FROM purchase_orders WHERE id IN ('TEST-PO-1','TEST-PO-PM');
  rep := rep || E'\n' || 'M1 after 074: ' || st;
  SELECT count(*) INTO n FROM audit_log WHERE table_name = 'purchase_orders' AND row_id IN ('TEST-PO-1','TEST-PO-PM') AND via LIKE 'migration 074%' AND changes->'status' = '["Ordered","Confirmed"]'::jsonb;
  rep := rep || E'\n' || 'M2 audit rows with the reason: ' || n;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.purchase.manager@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'INSERT INTO grn (id, "poId", "vendorName", items, "receivedDate", "receivedBy") VALUES (''TEST-GRN-DRY-1'', ''TEST-PO-1'', ''TEST dry run'', ''[{"product":"TEST Neem Face Wash 100ml","quantity":5,"unitCost":70,"batchNumber":"TEST-B4","expiryDate":null}]''::jsonb, now(), ''U-TEST-PURCHASE-MANAGER'')';
    EXECUTE 'RESET ROLE';
    SELECT status INTO st FROM purchase_orders WHERE id = 'TEST-PO-1';
    SELECT coalesce(sum(quantity),0) INTO qty FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
    SELECT "outstandingAmount" INTO bal FROM vendors WHERE id = 'TEST-V-1';
    rep := rep || E'\n' || 'G1 Purchase Manager receives 5 x TEST Neem on TEST-PO-1 => RECEIVED; TEST-PO-1 now ' || st || '; TEST Neem stock ' || qty0 || ' -> ' || qty || '; TEST-V-1 owed ' || bal0 || ' -> ' || bal;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || E'\n' || 'G1 Purchase Manager receives 5 x TEST Neem on TEST-PO-1 => REFUSED: ' || left(SQLERRM, 140);
  END;
  BEGIN
    EXECUTE 'RESET ROLE';
    PERFORM set_config('request.jwt.claims', '{"role":"authenticated","email":"test.purchase.manager@prismora.test"}', true);
    EXECUTE 'SET LOCAL ROLE authenticated';
    EXECUTE 'INSERT INTO grn (id, "poId", "vendorName", items, "receivedDate", "receivedBy") VALUES (''TEST-GRN-DRY-2'', ''TEST-PO-PM'', ''TEST dry run'', ''[{"product":"TEST Neem Face Wash 100ml","quantity":5,"unitCost":70,"batchNumber":"TEST-B4","expiryDate":null}]''::jsonb, now(), ''U-TEST-PURCHASE-MANAGER'')';
    EXECUTE 'RESET ROLE';
    SELECT status INTO st FROM purchase_orders WHERE id = 'TEST-PO-1';
    SELECT coalesce(sum(quantity),0) INTO qty FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
    SELECT "outstandingAmount" INTO bal FROM vendors WHERE id = 'TEST-V-1';
    rep := rep || E'\n' || 'G2 Purchase Manager receives 5 x TEST Neem on TEST-PO-PM (a PO with no lines) => RECEIVED; TEST-PO-1 now ' || st || '; TEST Neem stock ' || qty0 || ' -> ' || qty || '; TEST-V-1 owed ' || bal0 || ' -> ' || bal;
  EXCEPTION WHEN OTHERS THEN
    rep := rep || E'\n' || 'G2 Purchase Manager receives 5 x TEST Neem on TEST-PO-PM (a PO with no lines) => REFUSED: ' || left(SQLERRM, 140);
  END;
  RAISE EXCEPTION E'DRYRUN-REPORT%', rep;
END $dry$;
