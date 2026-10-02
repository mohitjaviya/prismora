DO $dry$ DECLARE rep text := ''; st text; qty numeric; qty0 numeric; bal numeric; bal0 numeric; n int; BEGIN
  SELECT coalesce(sum(quantity),0) INTO qty0 FROM inventory WHERE product = 'TEST Neem Face Wash 100ml';
  SELECT "outstandingAmount" INTO bal0 FROM vendors WHERE id = 'TEST-V-1';
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
