-- ============================================================
-- PRISMORA Phase 1 Enterprise Schema Extension
-- Run this in your Supabase SQL editor (Dashboard > SQL Editor)
-- ============================================================

-- ── Inventory Batches ────────────────────────────────────────
CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  "batchNumber" TEXT DEFAULT '',
  "expiryDate" TIMESTAMP,
  quantity INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  transit INTEGER DEFAULT 0,
  damaged INTEGER DEFAULT 0,
  "reorderLevel" INTEGER DEFAULT 10,
  warehouse TEXT DEFAULT 'Main Warehouse',
  "unitCost" NUMERIC DEFAULT 0,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Vendor Management ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  "contactPerson" TEXT DEFAULT '',
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Purchase Orders ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT,
  "vendorName" TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Draft',
  "expectedDate" TIMESTAMP,
  notes TEXT DEFAULT '',
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Goods Receipt Notes (GRN) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS grn (
  id TEXT PRIMARY KEY,
  "poId" TEXT,
  "vendorName" TEXT NOT NULL,
  items JSONB DEFAULT '[]',
  "receivedDate" TIMESTAMP NOT NULL,
  notes TEXT DEFAULT '',
  "receivedBy" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Distributors ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS distributors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  state TEXT DEFAULT '',
  city TEXT DEFAULT '',
  territory TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  "contactPerson" TEXT DEFAULT '',
  "outstandingAmount" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 100000,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Schemes & Promotions ───────────────────────────────────────
CREATE TABLE IF NOT EXISTS schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  "discountPct" NUMERIC DEFAULT 0,
  "freeGoodsQty" INTEGER DEFAULT 0,
  "minOrderValue" NUMERIC DEFAULT 0,
  "applicableTo" TEXT DEFAULT 'All',
  products TEXT[] DEFAULT '{}',
  states TEXT[] DEFAULT '{}',
  "validFrom" TIMESTAMP,
  "validTo" TIMESTAMP,
  status TEXT DEFAULT 'Active',
  description TEXT DEFAULT '',
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Complaints ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT DEFAULT '',
  product TEXT DEFAULT '',
  "batchNumber" TEXT DEFAULT '',
  "complaintType" TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'Registered',
  resolution TEXT DEFAULT '',
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP DEFAULT NOW()
);

-- ── Disable Row Level Security (matches all PRISMORA tables) ───
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE grn DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributors DISABLE ROW LEVEL SECURITY;
ALTER TABLE schemes DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints DISABLE ROW LEVEL SECURITY;

-- ── Seed: Default Vendor (Janki Herbals) ───────────────────────
INSERT INTO vendors (id, name, gstin, phone, email, address, "contactPerson", status)
VALUES (
  'V1', 'Janki Herbals', '24AAACJ1234M1Z5',
  '9876543200', 'orders@jankiherbals.com',
  '112, GIDC Industrial Estate, Anand, Gujarat - 388001',
  'Janki Shah', 'Active'
) ON CONFLICT (id) DO NOTHING;

-- ── Seed: Sample Inventory Batch ───────────────────────────────
INSERT INTO inventory (id, product, "batchNumber", "expiryDate", quantity, reserved, transit, damaged, "reorderLevel", warehouse, "unitCost")
VALUES
  ('INV-ITEM-1', 'Rose Blossom Hand Wash', 'RBH-2025-001', '2027-06-01', 500, 50, 0, 5, 100, 'Main Warehouse', 85),
  ('INV-ITEM-2', 'Lavender Body Wash', 'LBW-2025-001', '2027-03-01', 200, 20, 30, 0, 50, 'Main Warehouse', 120),
  ('INV-ITEM-3', 'Vitamin - C Face Wash', 'VCF-2025-001', '2026-09-01', 80, 0, 0, 2, 100, 'Main Warehouse', 150),
  ('INV-ITEM-4', 'Suns Shield Sunscreen SPF 50', 'SSS-2025-001', '2026-08-15', 40, 10, 0, 0, 100, 'Main Warehouse', 200),
  ('INV-ITEM-5', 'Coconut + Hibiscus Hair Oil', 'CHO-2025-001', '2027-12-01', 350, 0, 50, 0, 75, 'Main Warehouse', 95)
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Sample Distributor ────────────────────────────────────
INSERT INTO distributors (id, name, gstin, state, city, territory, phone, email, "contactPerson", "outstandingAmount", "creditLimit", status)
VALUES
  ('DIST-1', 'Gujarat Super Stockist', '24AABCG1234D1Z3', 'Gujarat', 'Ahmedabad', 'Gujarat North', '9876501234', 'info@gujstockist.com', 'Nilesh Patel', 45000, 200000, 'Active'),
  ('DIST-2', 'Maharashtra Prime Dist.', '27AABCM9876F1Z1', 'Maharashtra', 'Mumbai', 'Maharashtra West', '9876502345', 'ops@mahaprime.com', 'Rahul Mehta', 120000, 500000, 'Active'),
  ('DIST-3', 'Karnataka Wellness Dist.', '29AABCK5432H1Z7', 'Karnataka', 'Bangalore', 'Karnataka South', '9876503456', 'orders@karndist.com', 'Priya Nair', 0, 300000, 'Active')
ON CONFLICT (id) DO NOTHING;

-- ── Seed: Sample Scheme ─────────────────────────────────────────
INSERT INTO schemes (id, name, type, "discountPct", "minOrderValue", "applicableTo", "validFrom", "validTo", status, description)
VALUES
  ('SCH-1', 'Monsoon Mega Sale', 'Flat Discount', 10, 50000, 'Distributor', '2026-06-01', '2026-08-31', 'Active', '10% flat discount on all orders above ₹50,000 during monsoon season'),
  ('SCH-2', 'Retailer Festive Offer', 'Cash Discount', 5, 10000, 'Retailer', '2026-10-01', '2026-11-15', 'Active', '5% cash discount for retailers during Diwali season')
ON CONFLICT (id) DO NOTHING;
