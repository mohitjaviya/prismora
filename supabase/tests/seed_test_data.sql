-- ════════════════════════════════════════════════════════════════════════
--  Test data for browser testing. Everything is named TEST… (ids TEST-… or
--  U-TEST-…) so supabase/tests/delete_test_data.sql can remove it cleanly.
--  Needs the test accounts (scripts/create-test-accounts.mjs) and 039/040.
--  Rows written here are recorded in the audit log as "System": nobody
--  signed in wrote them.
-- ════════════════════════════════════════════════════════════════════════
begin;

-- ── Products and stock ──────────────────────────────────────────────────
insert into products (id, name, category, "hsnCode", "gstPct", mrp, "distributorPrice", "dealerPrice", "retailerPrice", uom, status, "createdAt") values
  ('TEST-P-1', 'TEST Neem Face Wash 100ml', 'Face Care', '33049990', 18, 180, 110, 125, 140, 'BOTTLE', 'Active', now()),
  ('TEST-P-2', 'TEST Herbal Shampoo 200ml', 'Hair Care', '33051090', 12, 240, 150, 170, 190, 'BOTTLE', 'Active', now()),
  ('TEST-P-3', 'TEST Unrated Balm 25g',     'Wellness',  null,       null, 90,  50,  60,  70, 'TUBE',  'Active', now())
on conflict (id) do nothing;

insert into inventory (id, product, "batchNumber", "expiryDate", quantity, reserved, warehouse, "unitCost", "createdAt") values
  ('TEST-INV-1', 'TEST Neem Face Wash 100ml', 'TEST-B1', now() + interval '400 days', 500, 0, 'Main', 70, now()),
  ('TEST-INV-2', 'TEST Herbal Shampoo 200ml', 'TEST-B2', now() + interval '300 days', 300, 0, 'Main', 90, now()),
  ('TEST-INV-3', 'TEST Unrated Balm 25g',     'TEST-B3', null,                        50,  0, 'Main', 30, now())
on conflict (id) do nothing;

-- ── Orders, at each stage ───────────────────────────────────────────────
-- Ids come from the order sequence (039); each is kept in a setting so the
-- delivered one can be found below.
DO $seed$
DECLARE v text;
BEGIN
  -- Pending, multi-item, distributor-linked: for advance billing by Accounts.
  insert into orders ("customerName", "companyName", product, quantity, value, status, "distributorId", "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Distributor Pvt Ltd', 'TEST Distributor Pvt Ltd', 'TEST Neem Face Wash 100ml +1 more item', 30, 4050, 'Pending', 'D-TEST-1', 'U-TEST-SALES-EXEC-1', now(), now(),
    '[{"name":"TEST Neem Face Wash 100ml","quantity":20,"unitPrice":110,"total":2200},{"name":"TEST Herbal Shampoo 200ml","quantity":10,"unitPrice":185,"total":1850}]',
    'TEST 1 Ring Road', '395003', 'Gujarat', 'Surat');

  -- Processing, dealer-linked.
  insert into orders ("customerName", product, quantity, value, status, "dealerId", "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Dealer Traders', 'TEST Herbal Shampoo 200ml', 12, 2040, 'Processing', 'DL-TEST-1', 'U-TEST-SALES-EXEC-1', now(), now(), '[]',
    'TEST 2 Station Road', '395002', 'Gujarat', 'Surat');

  -- Ready for dispatch, single product.
  insert into orders ("customerName", product, quantity, value, status, "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Walk-in Chemist', 'TEST Neem Face Wash 100ml', 8, 1120, 'Ready for Dispatch', 'U-TEST-SALES-EXEC-2', now(), now(), '[]',
    'TEST 9 Lake View', '395007', 'Gujarat', 'Surat');

  -- Shipped, multi-item, retailer-linked: for Dispatch to deliver in the browser.
  insert into orders ("customerName", product, quantity, value, status, "retailerId", "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Retail Pharmacy', 'TEST Neem Face Wash 100ml +1 more item', 15, 2560, 'Shipped', 'R-TEST-1', 'U-TEST-SALES-EXEC-1', now(), now(),
    '[{"name":"TEST Neem Face Wash 100ml","quantity":10,"unitPrice":140,"total":1400},{"name":"TEST Herbal Shampoo 200ml","quantity":5,"unitPrice":232,"total":1160}]',
    'TEST 3 Market Lane', '395001', 'Gujarat', 'Surat');

  -- Shipped, the product with no GST rate: delivers fine, cannot convert.
  insert into orders ("customerName", product, quantity, value, status, "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Balm Buyer', 'TEST Unrated Balm 25g', 4, 280, 'Shipped', 'U-TEST-SALES-EXEC-2', now(), now(), '[]',
    'TEST 4 Hill Road', '395004', 'Gujarat', 'Surat');

  -- Delivered here, so the database raises its proforma now.
  insert into orders ("customerName", "companyName", "leadId", product, quantity, value, status, "assignedTo", "createdAt", date, items, "deliveryAddress", "deliveryPincode", state, city)
  values ('TEST Contact Person', 'TEST Hospital Supplies LLP', null, 'TEST Herbal Shampoo 200ml', 6, 1020, 'Shipped', 'U-TEST-SALES-EXEC-2', now(), now(), '[]',
    'TEST 5 Civil Lines', '395005', 'Gujarat', 'Surat')
  returning id into v;
  update orders set status = 'Delivered' where id = v;
END $seed$;

-- ── Field work ──────────────────────────────────────────────────────────
insert into beat_plans (id, "executiveId", date, "territoryId", status, outlets, "outletVisits", "createdAt") values
  ('TEST-B-TODAY',  'U-TEST-SALES-EXEC-1', app_today(),     'T-1790057083440', 'Planned', '["TEST Shiv Medicals","TEST Krishna Pharma","TEST Radhe Wellness"]', '{}', now()),
  ('TEST-B-FUTURE', 'U-TEST-SALES-EXEC-1', app_today() + 2, 'T-1790057083440', 'Planned', '["TEST Kamrej Chemist"]', '{}', now()),
  ('TEST-B-PAST',   'U-TEST-SALES-EXEC-2', app_today() - 2, 'T-1790057083440', 'Planned', '["TEST Om Medical","TEST Patel Pharma"]', '{}', now())
on conflict (id) do nothing;

insert into visit_reports (id, "executiveId", "beatId", "outletName", "outletContact", "visitDate", outcome, "notVisitedReason", "productsShown", "orderPlaced", notes, status, "createdAt") values
  ('TEST-VR-1', 'U-TEST-SALES-EXEC-1', null, 'TEST Krishna Pharma', '9000000011', app_today() - 1, 'Visited', '',
   '["TEST Neem Face Wash 100ml","TEST Herbal Shampoo 200ml","TEST Unrated Balm 25g"]', false,
   'Owner keen on the face wash; wants a scheme for 200+ units before Diwali and asked for samples of the shampoo for his two other branches in Adajan and Vesu.', 'Submitted', now()),
  ('TEST-VR-2', 'U-TEST-SALES-EXEC-2', null, 'TEST Om Medical', '9000000012', app_today() - 1, 'Visited', '',
   '["TEST Herbal Shampoo 200ml"]', false, 'Call back next week.', 'Submitted', now())
on conflict (id) do nothing;

insert into attendance (id, "userId", date, status, "checkInTime", "checkOutTime", notes, "createdAt") values
  ('TEST-ATT-1', 'U-TEST-SALES-EXEC-1', app_today(),     'Present', '09:12', null,    null, now()),
  ('TEST-ATT-2', 'U-TEST-SALES-EXEC-2', app_today() - 1, 'Present', '09:40', '18:05',
   'Left early for the Vadodara distributor meeting; covered two outlets on the way back and logged both visits in the evening.', now())
on conflict (id) do nothing;

insert into sfa_expenses (id, "userId", date, category, amount, description, status, "createdAt") values
  ('TEST-EXP-FLD-1', 'U-TEST-SALES-EXEC-1', now() - interval '1 day', 'Travel', 650,
   'Cab from Surat station to Kamrej and back for the TEST Kamrej Chemist beat, because the bus was cancelled.', 'Pending', now())
on conflict (id) do nothing;

-- ── Sales and support ───────────────────────────────────────────────────
insert into leads (id, name, company, phone, email, "productInterest", "leadSource", "assignedTo", status, "dealValue", state, city, "territoryId", "createdAt", "createdBy") values
  ('TEST-L-1', 'TEST Ravi Mehta', 'TEST Mehta Medicals', '9000000021', 'test.lead1@prismora.test', array['TEST Neem Face Wash 100ml'], 'Field Visit', 'U-TEST-SALES-EXEC-1', 'Negotiation', 12000, 'Gujarat', 'Surat', 'T-1790057083440', now(), 'U-TEST-SALES-EXEC-1'),
  ('TEST-L-2', 'TEST Priya Shah', 'TEST Shah Wellness', '9000000022', 'test.lead2@prismora.test', array['TEST Herbal Shampoo 200ml'], 'Referral', 'U-TEST-SALES-EXEC-1', 'Meeting', 8000, 'Gujarat', 'Surat', 'T-1790057083440', now(), 'U-TEST-SALES-EXEC-1'),
  ('TEST-L-3', 'TEST Amit Patel', null, '9000000023', 'test.lead3@prismora.test', array['TEST Neem Face Wash 100ml'], 'Cold Call', 'U-TEST-SALES-EXEC-2', 'Lead Created', 5000, 'Gujarat', 'Surat', 'T-1790057083440', now(), 'U-TEST-SALES-EXEC-2')
on conflict (id) do nothing;

insert into complaints (id, "customerName", "customerPhone", product, "complaintType", description, status, "createdAt") values
  ('TEST-CMP-1', 'TEST Retail Pharmacy', '9000000003', 'TEST Herbal Shampoo 200ml', 'Product Quality', 'TEST: two bottles leaked in transit.', 'Open', now())
on conflict (id) do nothing;

-- ── Money ───────────────────────────────────────────────────────────────
insert into expenses (id, category, amount, description, date, "createdAt", "createdBy") values
  ('TEST-EXP-1', 'Office Supplies', 2350, 'TEST printer cartridges and A4 paper for the Surat office', now(), now(), 'U-TEST-ACCOUNTS')
on conflict (id) do nothing;

insert into credit_notes (id, "customerName", amount, reason, "createdAt", "recordedBy") values
  ('TEST-CN-1', 'TEST Retail Pharmacy', 280, 'Sales Return', now(), 'U-TEST-ACCOUNTS')
on conflict (id) do nothing;

insert into distributor_payments (id, "distributorId", amount, method, reference, date, notes, "recordedBy", "createdAt") values
  ('TEST-PAY-1', 'D-TEST-1', 1500, 'Bank Transfer', 'TEST-UTR-0001', now(), 'TEST partner receipt', 'U-TEST-ACCOUNTS', now())
on conflict (id) do nothing;

-- ── Purchasing ──────────────────────────────────────────────────────────
insert into vendors (id, name, phone, email, address, "contactPerson", status, "createdAt", "outstandingAmount") values
  ('TEST-V-1', 'TEST Herbal Raw Materials Co', '9000000031', 'test.vendor@prismora.test', 'TEST 7 GIDC Estate', 'TEST Vendor Contact', 'Active', now(), 0)
on conflict (id) do nothing;

insert into purchase_orders (id, "vendorId", "vendorName", items, total, status, "expectedDate", notes, "assignedTo", "createdAt", "createdBy") values
  ('TEST-PO-1', 'TEST-V-1', 'TEST Herbal Raw Materials Co',
   '[{"product":"TEST Neem Face Wash 100ml","quantity":200,"unitCost":70,"batchNumber":"TEST-B4","expiryDate":""}]', 14000, 'Ordered', now() + interval '5 days',
   'TEST purchase order', 'U-TEST-PURCHASE-MANAGER', now(), 'U-TEST-PURCHASE-MANAGER'),
  ('TEST-PO-2', 'TEST-V-1', 'TEST Herbal Raw Materials Co',
   '[{"product":"TEST Herbal Shampoo 200ml","quantity":100,"unitCost":90,"batchNumber":"TEST-B5","expiryDate":""}]', 9000, 'Closed', now() - interval '3 days',
   'TEST received order', 'U-TEST-PURCHASE-MANAGER', now() - interval '6 days', 'U-TEST-PURCHASE-MANAGER')
on conflict (id) do nothing;

insert into grn (id, "poId", "vendorName", items, "receivedDate", notes, "receivedBy", "createdAt") values
  ('TEST-GRN-1', 'TEST-PO-2', 'TEST Herbal Raw Materials Co',
   '[{"product":"TEST Herbal Shampoo 200ml","quantity":100,"receivedQty":100,"unitCost":90,"batchNumber":"TEST-B5","expiryDate":""}]', now() - interval '3 days', 'TEST goods receipt', 'U-TEST-WAREHOUSE', now())
on conflict (id) do nothing;

insert into purchase_returns (id, "vendorId", "vendorName", reason, items, value, notes, date, "recordedBy", "createdAt") values
  ('TEST-RET-1', 'TEST-V-1', 'TEST Herbal Raw Materials Co', 'Damaged', '[{"product":"TEST Herbal Shampoo 200ml","quantity":4,"unitCost":90}]', 360, 'TEST damaged in transit', now(), 'U-TEST-PURCHASE-MANAGER', now())
on conflict (id) do nothing;

insert into vendor_payments (id, "vendorId", amount, method, reference, date, notes, "recordedBy", "createdAt") values
  ('TEST-VPAY-1', 'TEST-V-1', 5000, 'Bank Transfer', 'TEST-UTR-9001', now(), 'TEST vendor payment', 'U-TEST-PURCHASE-MANAGER', now())
on conflict (id) do nothing;

select (select count(*) from orders where "customerName" like 'TEST%') orders,
       (select count(*) from invoices i join orders o on o.id = i."orderId" where o."customerName" like 'TEST%') proformas,
       (select sum(quantity) from inventory where product = 'TEST Herbal Shampoo 200ml') shampoo_stock_after_delivery;
commit;
