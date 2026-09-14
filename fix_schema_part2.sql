-- PRISMORA — follow-up migration. Run once in the Supabase SQL editor.
--
-- Six columns the first migration missed. The three tables below were created
-- fresh in that run, so the ALTER statements that add their dealer/retailer
-- links were never applied. Without them addDealerPayment, addRetailerPayment,
-- scheme claims and every partner incentive are rejected with error 42703 and
-- the record survives only in the browser.
--
-- Safe to run more than once.

ALTER TABLE distributor_payments   ADD COLUMN IF NOT EXISTS "dealerId"   TEXT;
ALTER TABLE distributor_payments   ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

ALTER TABLE scheme_claims          ADD COLUMN IF NOT EXISTS "dealerId"   TEXT;
ALTER TABLE scheme_claims          ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

ALTER TABLE distributor_incentives ADD COLUMN IF NOT EXISTS "dealerId"   TEXT;
ALTER TABLE distributor_incentives ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
