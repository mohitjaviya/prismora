-- ============================================================================
-- PRISMORA — production schema repair  (generated from a live audit of the
-- deployed Supabase database, verified table-by-table and column-by-column)
-- ----------------------------------------------------------------------------
-- Run this ONCE: Supabase Dashboard -> SQL Editor -> New query -> paste -> Run.
-- Every statement is idempotent, so re-running it is safe.
--
-- WHY DATA KEPT DISAPPEARING
-- --------------------------
-- PostgREST aborts an ENTIRE insert/update when the payload names a single
-- column the table does not have (error 42703) — it does not skip the unknown
-- key and save the rest. Eight tables were missing outright and five more were
-- missing columns, so those writes were rejected in full and the records only
-- ever existed in the browser's localStorage.
--
-- localStorage is not permanent storage. Safari evicts it after ~7 days without
-- a visit, Chrome and Android evict it under storage pressure, and any "clear
-- browsing data" wipes it. When it went, every record went with it — and because
-- the app re-seeds its DEFAULT_* demo rows whenever it finds both the table and
-- localStorage empty, the sample data came back while the real data did not.
-- ============================================================================

-- ── Tables that did not exist at all ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS dealers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  state TEXT DEFAULT '',
  city TEXT DEFAULT '',
  territory TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  "contactPerson" TEXT DEFAULT '',
  "parentDistributorId" TEXT,
  "outstandingAmount" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 100000,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS retailers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  state TEXT DEFAULT '',
  city TEXT DEFAULT '',
  territory TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  "contactPerson" TEXT DEFAULT '',
  "parentDealerId" TEXT,
  "outstandingAmount" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 50000,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vendor_payments (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT 'Bank Transfer',
  reference TEXT DEFAULT '',
  date TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT,
  "vendorName" TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  value NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  date TIMESTAMP WITH TIME ZONE,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  "invoiceId" TEXT,
  "customerName" TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT DEFAULT '',
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS distributor_payments (
  id TEXT PRIMARY KEY,
  "distributorId" TEXT,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT 'Bank Transfer',
  reference TEXT DEFAULT '',
  date TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS scheme_claims (
  id TEXT PRIMARY KEY,
  "distributorId" TEXT,
  "schemeId" TEXT,
  "schemeName" TEXT NOT NULL,
  "orderId" TEXT,
  amount NUMERIC NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected', 'Settled'
  "reviewNotes" TEXT DEFAULT '',
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS distributor_incentives (
  id TEXT PRIMARY KEY,
  "distributorId" TEXT,
  "schemeId" TEXT,
  "schemeName" TEXT NOT NULL,
  "orderId" TEXT,
  "orderValue" NUMERIC DEFAULT 0,
  "incentiveType" TEXT DEFAULT 'Discount', -- 'Discount', 'Free Goods', 'Cash'
  "incentiveValue" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Earned', -- 'Earned', 'Paid'
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- sfa_expenses is written by the SFA expense-claim screen but was never in
-- complete_database_schema.sql, so the table does not exist and every claim
-- was rejected and kept only in the submitting browser's localStorage.
CREATE TABLE IF NOT EXISTS sfa_expenses (
  id TEXT PRIMARY KEY,
  "userId" TEXT,
  date TIMESTAMP WITH TIME ZONE,
  category TEXT DEFAULT '',
  amount NUMERIC DEFAULT 0,
  description TEXT DEFAULT '',
  "receiptName" TEXT DEFAULT '',
  "receiptData" TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- ── Columns missing from tables that already exist ──────────────────────────


-- complaints
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

-- orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "email" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "items" JSONB DEFAULT '[]'::jsonb;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "phone" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP WITH TIME ZONE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receivedByDistributor" BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "splitFromOrderId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "splitIntoOrderId" TEXT;

-- schemes
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "applicableProducts" JSONB DEFAULT '[]'::jsonb;

-- users
ALTER TABLE users ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Active';

-- vendors
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS "outstandingAmount" NUMERIC DEFAULT 0;


-- Orders created before "deliveredQty" existed hold NULL, and `quantity - NULL`
-- is NULL — which the UI reads as "nothing delivered yet".
UPDATE orders SET "deliveredQty" = 0 WHERE "deliveredQty" IS NULL;

-- Users predating the approval flow have no status and can never sign in.
UPDATE users SET "status" = 'Active' WHERE "status" IS NULL;


-- ── Follow-up: partner links on the three tables created above ──────────────
-- These were missed the first time round: the generator only emitted ALTERs for
-- tables that already existed, and these three were created fresh in the same
-- run. Without them addDealerPayment, addRetailerPayment, scheme claims and
-- every partner incentive are rejected with 42703.
ALTER TABLE distributor_payments   ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE distributor_payments   ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
ALTER TABLE scheme_claims          ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE scheme_claims          ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
ALTER TABLE distributor_incentives ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE distributor_incentives ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

-- ── RLS off: the app uses the anon key and enforces roles itself. With RLS
-- on and no policies, every write is silently filtered to zero rows. ────────
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE beat_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints DISABLE ROW LEVEL SECURITY;
ALTER TABLE credit_notes DISABLE ROW LEVEL SECURITY;
ALTER TABLE dealers DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_incentives DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributors DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE grn DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_returns DISABLE ROW LEVEL SECURITY;
ALTER TABLE retailers DISABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE schemes DISABLE ROW LEVEL SECURITY;
ALTER TABLE sfa_expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE territories DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendor_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE visit_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY;
