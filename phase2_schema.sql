-- ============================================================================
-- PRISMORA ENTERPRISE DMS/ERP — PHASE 2 UNIFIED DATABASE SCHEMA
-- Run this script in your Supabase SQL Editor to create all Phase 2 tables.
-- ============================================================================

-- ── MODULE 8: ENHANCED PRODUCT CATALOG & PRICING TIERS ──────────────────────
-- Recreates or alters the products table to support detailed attributes
CREATE TABLE IF NOT EXISTS products_new (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "category" TEXT DEFAULT 'Wellness',
  "hsnCode" TEXT DEFAULT '30049011',
  "gstPct" NUMERIC DEFAULT 12,
  "mrp" NUMERIC DEFAULT 200,
  "distributorPrice" NUMERIC DEFAULT 100,
  "dealerPrice" NUMERIC DEFAULT 120,
  "retailerPrice" NUMERIC DEFAULT 140,
  "uom" TEXT DEFAULT 'BOTTLE',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Copy existing names if the old table had products, then drop old and rename
DO $$
BEGIN
  IF EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'products') THEN
    -- Try copying from existing products if any
    INSERT INTO products_new ("id", "name")
    SELECT 'P-' || REPLACE(name, ' ', ''), name FROM products
    ON CONFLICT DO NOTHING;
    
    DROP TABLE products CASCADE;
  END IF;
  
  ALTER TABLE products_new RENAME TO products;
END $$;

-- Seed default Ayurvedic catalog products if empty
INSERT INTO products ("id", "name", "category", "hsnCode", "gstPct", "mrp", "distributorPrice", "dealerPrice", "retailerPrice", "uom")
VALUES
  ('P1', 'Herbal Hair Oil 100ml', 'Hair Care', '30049011', 12, 250, 150, 180, 200, 'BOTTLE'),
  ('P2', 'Aloevera Skin Gel 150g', 'Skin Care', '30049012', 12, 180, 100, 125, 140, 'TUBE'),
  ('P3', 'Tulsi Cough Syrup 100ml', 'Wellness', '30049013', 5, 120, 70, 85, 95, 'BOTTLE'),
  ('P4', 'Neem Face Wash 100ml', 'Skin Care', '30049014', 18, 150, 90, 105, 120, 'BOTTLE'),
  ('P5', 'Triphala Capsules 60s', 'Wellness', '30049015', 12, 300, 180, 210, 240, 'BOTTLE')
ON CONFLICT ("name") DO UPDATE SET
  "category" = EXCLUDED.category,
  "hsnCode" = EXCLUDED."hsnCode",
  "gstPct" = EXCLUDED."gstPct",
  "mrp" = EXCLUDED.mrp,
  "distributorPrice" = EXCLUDED."distributorPrice",
  "dealerPrice" = EXCLUDED."dealerPrice",
  "retailerPrice" = EXCLUDED."retailerPrice",
  "uom" = EXCLUDED.uom;


-- ── MODULE 7: SALES FORCE AUTOMATION (SFA) ──────────────────────────────────
-- 1. Daily/Weekly Beat Plans
CREATE TABLE IF NOT EXISTS beat_plans (
  "id" TEXT PRIMARY KEY,
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "date" DATE NOT NULL,
  "territory" TEXT,
  "outlets" JSONB DEFAULT '[]'::jsonb, -- Array of outlets scheduled for visit
  "status" TEXT DEFAULT 'Planned', -- Planned / Visited / Missed
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 2. Daily Attendance & Leave Logs
CREATE TABLE IF NOT EXISTS attendance (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL, -- Present / Absent / On Leave / Half Day
  "checkInTime" TEXT,
  "checkOutTime" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- 3. Field Visit Submissions
CREATE TABLE IF NOT EXISTS visit_reports (
  "id" TEXT PRIMARY KEY,
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "outletName" TEXT NOT NULL,
  "outletContact" TEXT,
  "visitDate" DATE NOT NULL,
  "productsShown" JSONB DEFAULT '[]'::jsonb, -- Array of products pitched
  "orderPlaced" BOOLEAN DEFAULT false,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  "nextFollowUp" DATE,
  "notes" TEXT,
  "status" TEXT DEFAULT 'Submitted', -- Submitted / Reviewed / Approved
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── MODULE 10: IN-APP SYSTEM NOTIFICATIONS ──────────────────────────────────
CREATE TABLE IF NOT EXISTS notifications (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- critical_stock, overdue_payment, new_complaint, lead_assigned, info
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT, -- Path to navigate to in frontend
  "isRead" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── MODULE 13: TERRITORY ASSIGNMENTS ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS territories (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "state" TEXT NOT NULL,
  "districts" JSONB DEFAULT '[]'::jsonb, -- Selected districts under this territory
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── MODULE 14: MULTI-WAREHOUSE & TRANSFERS ──────────────────────────────────
-- 1. Warehouse Master list
CREATE TABLE IF NOT EXISTS warehouses (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "location" TEXT,
  "manager" TEXT,
  "type" TEXT DEFAULT 'Main', -- Main / Cold Storage / Secondary
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Populate default warehouses
INSERT INTO warehouses ("id", "name", "location", "manager", "type")
VALUES
  ('W1', 'Main Warehouse', 'Anand, Gujarat', 'Janki Shah', 'Main'),
  ('W2', 'Secondary Warehouse', 'Mumbai, Maharashtra', 'Rohan Mehta', 'Secondary'),
  ('W3', 'Cold Storage', 'Ahmedabad, Gujarat', 'Amit Patel', 'Cold Storage')
ON CONFLICT DO NOTHING;

-- 2. Inter-Warehouse Stock Transfers
CREATE TABLE IF NOT EXISTS stock_transfers (
  "id" TEXT PRIMARY KEY,
  "fromWarehouse" TEXT NOT NULL,
  "toWarehouse" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK (quantity > 0),
  "reason" TEXT,
  "status" TEXT DEFAULT 'Pending', -- Pending / Dispatched / Received / Cancelled
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── MODULE 12: BANK RECONCILIATION TRANSACTIONS ─────────────────────────────
CREATE TABLE IF NOT EXISTS bank_transactions (
  "id" TEXT PRIMARY KEY,
  "date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "credit" NUMERIC DEFAULT 0, -- Money received
  "debit" NUMERIC DEFAULT 0,  -- Money paid
  "balance" NUMERIC NOT NULL,
  "invoiceId" TEXT REFERENCES invoices(id) ON DELETE SET NULL, -- Matched invoice
  "isReconciled" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
