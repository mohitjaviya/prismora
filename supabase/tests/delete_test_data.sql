-- Remove everything seed_test_data.sql and the browser tests created.
-- Test accounts are kept; delete them with the last block if wanted.
begin;
delete from invoices where "orderId" in (select id from orders where "customerName" like 'TEST%') or "customerName" like 'TEST%';
delete from visit_reports where id like 'TEST-%' or "executiveId" like 'U-TEST-%';
delete from beat_checkin_requests where "requestedBy" like 'U-TEST-%';
delete from beat_plans where id like 'TEST-%' or "executiveId" like 'U-TEST-%';
delete from attendance where id like 'TEST-%' or "userId" like 'U-TEST-%';
delete from sfa_expenses where id like 'TEST-%' or "userId" like 'U-TEST-%';
delete from expenses where id like 'TEST-%' or id like 'EXP-FLD-TEST-%' or "createdBy" like 'U-TEST-%';
delete from orders where "customerName" like 'TEST%';
delete from leads where id like 'TEST-%' or name like 'TEST%';
delete from complaints where id like 'TEST-%' or "customerName" like 'TEST%';
delete from credit_notes where id like 'TEST-%' or "customerName" like 'TEST%';
delete from distributor_payments where id like 'TEST-%' or "distributorId" = 'D-TEST-1';
delete from vendor_payments where id like 'TEST-%' or "vendorId" = 'TEST-V-1';
delete from purchase_returns where id like 'TEST-%' or "vendorId" = 'TEST-V-1';
delete from grn where id like 'TEST-%' or "vendorName" like 'TEST%';
delete from purchase_orders where id like 'TEST-%' or "vendorId" = 'TEST-V-1';
delete from vendors where id like 'TEST-%';
delete from inventory where product like 'TEST%';
delete from products where id like 'TEST-%';
commit;
-- Test accounts and their partner records:
-- begin;
-- delete from auth.users where email like 'test.%@prismora.test';
-- delete from public.users where id like 'U-TEST-%';
-- delete from retailers where id = 'R-TEST-1'; delete from dealers where id = 'DL-TEST-1'; delete from distributors where id = 'D-TEST-1';
-- commit;
