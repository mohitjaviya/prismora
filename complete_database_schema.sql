-- ============================================================================
-- PRISMORA ENTERPRISE DMS, ERP, CRM, ACCOUNTING & SFA COMPLETE DATABASE SCHEMA
-- Run this entire script in your Supabase SQL Editor to set up all tables.
-- ============================================================================

-- ── 1. CORE & CRM USER ENTITIES ─────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE NOT NULL,
  role TEXT NOT NULL, -- 'Admin', 'Manager', 'Sales'
  password TEXT NOT NULL,
  "managedUsers" TEXT[] DEFAULT '{}'::text[]
);

CREATE TABLE IF NOT EXISTS leads (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  company TEXT,
  phone TEXT,
  email TEXT,
  "productInterest" TEXT[],
  "leadSource" TEXT,
  "assignedTo" TEXT REFERENCES users(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'New', -- 'New', 'Contacted', 'Qualified', 'Lost', 'Won'
  "followUpDate" TIMESTAMP WITH TIME ZONE,
  notes TEXT,
  "dealValue" NUMERIC DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  "customerName" TEXT NOT NULL,
  "companyName" TEXT,
  product TEXT,
  quantity INTEGER,
  value NUMERIC,
  state TEXT,
  city TEXT,
  status TEXT DEFAULT 'Pending', -- 'Pending', 'Processing', 'Delivered', 'Cancelled'
  "assignedTo" TEXT REFERENCES users(id) ON DELETE SET NULL,
  date TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  message TEXT NOT NULL,
  "assignedTo" TEXT,
  "dataId" TEXT,
  timestamp TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 2. PRODUCT CATALOG (MODULE 8 PRICING TIERS) ──────────────────────────────

CREATE TABLE IF NOT EXISTS products (
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


-- ── 3. INVENTORY & VENDOR OPERATIONS ──────────────────────────────────────────

CREATE TABLE IF NOT EXISTS inventory (
  id TEXT PRIMARY KEY,
  product TEXT NOT NULL,
  "batchNumber" TEXT DEFAULT '',
  "expiryDate" TIMESTAMP WITH TIME ZONE,
  quantity INTEGER DEFAULT 0,
  reserved INTEGER DEFAULT 0,
  transit INTEGER DEFAULT 0,
  damaged INTEGER DEFAULT 0,
  "reorderLevel" INTEGER DEFAULT 10,
  warehouse TEXT DEFAULT 'Main Warehouse',
  "unitCost" NUMERIC DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS vendors (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  gstin TEXT DEFAULT '',
  phone TEXT DEFAULT '',
  email TEXT DEFAULT '',
  address TEXT DEFAULT '',
  "contactPerson" TEXT DEFAULT '',
  "outstandingAmount" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS purchase_orders (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  "vendorName" TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  total NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Draft', -- 'Draft', 'Ordered', 'Completed', 'Cancelled'
  "expectedDate" TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS grn (
  id TEXT PRIMARY KEY,
  "poId" TEXT REFERENCES purchase_orders(id) ON DELETE SET NULL,
  "vendorName" TEXT NOT NULL,
  items JSONB DEFAULT '[]'::jsonb,
  "receivedDate" TIMESTAMP WITH TIME ZONE NOT NULL,
  notes TEXT DEFAULT '',
  "receivedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Vendor payables: outstandingAmount tracks money owed to a vendor (bumped up
-- when a GRN is recorded, down when a payment is made). For pre-existing installs:
ALTER TABLE vendors ADD COLUMN IF NOT EXISTS "outstandingAmount" NUMERIC DEFAULT 0;

CREATE TABLE IF NOT EXISTS vendor_payments (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT REFERENCES vendors(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL,
  method TEXT DEFAULT 'Bank Transfer',
  reference TEXT DEFAULT '',
  date TIMESTAMP WITH TIME ZONE,
  notes TEXT DEFAULT '',
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE vendor_payments DISABLE ROW LEVEL SECURITY;

-- Purchase returns: goods sent back to a vendor. Credits the vendor payable
-- and removes the returned units from inventory.
CREATE TABLE IF NOT EXISTS purchase_returns (
  id TEXT PRIMARY KEY,
  "vendorId" TEXT REFERENCES vendors(id) ON DELETE SET NULL,
  "vendorName" TEXT DEFAULT '',
  reason TEXT DEFAULT '',
  items JSONB DEFAULT '[]'::jsonb,
  value NUMERIC DEFAULT 0,
  notes TEXT DEFAULT '',
  date TIMESTAMP WITH TIME ZONE,
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE purchase_returns DISABLE ROW LEVEL SECURITY;


-- ── 4. LOGISTICS, SCHEMES & DISTRIBUTORS ──────────────────────────────────────

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
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS schemes (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL, -- 'Flat Discount', 'Free Goods', 'Cash Discount'
  "discountPct" NUMERIC DEFAULT 0,
  "freeGoodsQty" INTEGER DEFAULT 0,
  "minOrderValue" NUMERIC DEFAULT 0,
  "applicableTo" TEXT DEFAULT 'All', -- 'All', 'Distributor', 'Dealer', 'Retailer'
  products TEXT[] DEFAULT '{}'::text[],
  states TEXT[] DEFAULT '{}'::text[],
  "validFrom" TIMESTAMP WITH TIME ZONE,
  "validTo" TIMESTAMP WITH TIME ZONE,
  status TEXT DEFAULT 'Active',
  description TEXT DEFAULT '',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Product-specific scheme targeting. Note: the `products`/`states` TEXT[]
-- columns above were never wired up to any app logic (dead columns) — this
-- adds a fresh JSONB column matching the app's camelCase/JSONB convention
-- (see orders."items") instead of repurposing the ambiguous old ones.
ALTER TABLE schemes ADD COLUMN IF NOT EXISTS "applicableProducts" JSONB DEFAULT '[]'::jsonb;

-- ── 5. CUSTOMER SUPPORT ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS complaints (
  id TEXT PRIMARY KEY,
  "customerName" TEXT NOT NULL,
  "customerPhone" TEXT DEFAULT '',
  product TEXT DEFAULT '',
  "batchNumber" TEXT DEFAULT '',
  "complaintType" TEXT NOT NULL,
  description TEXT DEFAULT '',
  status TEXT DEFAULT 'Registered', -- 'Registered', 'Investigating', 'Resolved', 'Closed'
  resolution TEXT DEFAULT '',
  "assignedTo" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 6. ACCOUNTING & EXPENSES ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS invoices (
  id TEXT PRIMARY KEY,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  "customerName" TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  tax NUMERIC NOT NULL,
  status TEXT NOT NULL, -- 'Paid', 'Unpaid', 'Overdue'
  "dueDate" TIMESTAMP WITH TIME ZONE,
  "assignedTo" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Credit notes: sales-side returns/adjustments that reduce a customer's outstanding
CREATE TABLE IF NOT EXISTS credit_notes (
  id TEXT PRIMARY KEY,
  "invoiceId" TEXT,
  "customerName" TEXT NOT NULL,
  amount NUMERIC NOT NULL,
  reason TEXT DEFAULT '',
  "recordedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);
ALTER TABLE credit_notes DISABLE ROW LEVEL SECURITY;

CREATE TABLE IF NOT EXISTS expenses (
  id TEXT PRIMARY KEY,
  category TEXT NOT NULL, -- 'Raw Materials', 'Logistics', 'Marketing', 'Salaries', 'Rent', 'Other'
  amount NUMERIC NOT NULL,
  description TEXT,
  date TIMESTAMP WITH TIME ZONE NOT NULL,
  "assignedTo" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 7. SALES FORCE AUTOMATION (SFA) (MODULE 7) ──────────────────────────────

CREATE TABLE IF NOT EXISTS beat_plans (
  "id" TEXT PRIMARY KEY,
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "date" DATE NOT NULL,
  "territory" TEXT,
  "outlets" JSONB DEFAULT '[]'::jsonb,
  "status" TEXT DEFAULT 'Planned', -- 'Planned', 'Visited', 'Missed'
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS attendance (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  "date" DATE NOT NULL,
  "status" TEXT NOT NULL, -- 'Present', 'Absent', 'On Leave', 'Half Day'
  "checkInTime" TEXT,
  "checkOutTime" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS visit_reports (
  "id" TEXT PRIMARY KEY,
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "outletName" TEXT NOT NULL,
  "outletContact" TEXT,
  "visitDate" DATE NOT NULL,
  "productsShown" JSONB DEFAULT '[]'::jsonb,
  "orderPlaced" BOOLEAN DEFAULT false,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  "nextFollowUp" DATE,
  "notes" TEXT,
  "status" TEXT DEFAULT 'Submitted',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 8. TERRITORY MANAGEMENT (MODULE 13) ─────────────────────────────────────

CREATE TABLE IF NOT EXISTS territories (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "state" TEXT NOT NULL,
  "districts" JSONB DEFAULT '[]'::jsonb,
  "executiveId" TEXT REFERENCES users(id) ON DELETE SET NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 9. SYSTEM ALERTS & NOTIFICATIONS (MODULE 10) ─────────────────────────────

CREATE TABLE IF NOT EXISTS notifications (
  "id" TEXT PRIMARY KEY,
  "userId" TEXT REFERENCES users(id) ON DELETE CASCADE,
  "type" TEXT NOT NULL, -- 'critical_stock', 'overdue_payment', 'new_complaint', 'lead_assigned', 'info'
  "title" TEXT NOT NULL,
  "message" TEXT NOT NULL,
  "link" TEXT,
  "isRead" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 10. MULTI-WAREHOUSE DEPOTS (MODULE 14) ──────────────────────────────────

CREATE TABLE IF NOT EXISTS warehouses (
  "id" TEXT PRIMARY KEY,
  "name" TEXT NOT NULL UNIQUE,
  "location" TEXT,
  "manager" TEXT,
  "type" TEXT DEFAULT 'Main', -- 'Main', 'Cold Storage', 'Secondary'
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS stock_transfers (
  "id" TEXT PRIMARY KEY,
  "fromWarehouse" TEXT NOT NULL,
  "toWarehouse" TEXT NOT NULL,
  "product" TEXT NOT NULL,
  "quantity" INTEGER NOT NULL CHECK (quantity > 0),
  "reason" TEXT,
  "status" TEXT DEFAULT 'Pending', -- 'Pending', 'Dispatched', 'Received', 'Cancelled'
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 11. BANK RECONCILIATION TRANSACTIONS (MODULE 12) ──────────────────────────

CREATE TABLE IF NOT EXISTS bank_transactions (
  "id" TEXT PRIMARY KEY,
  "date" DATE NOT NULL,
  "description" TEXT NOT NULL,
  "credit" NUMERIC DEFAULT 0,
  "debit" NUMERIC DEFAULT 0,
  "balance" NUMERIC NOT NULL,
  "invoiceId" TEXT REFERENCES invoices(id) ON DELETE SET NULL,
  "isReconciled" BOOLEAN DEFAULT false,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);


-- ── 12. DISTRIBUTOR / DEALER / RETAILER PORTAL (Registration, Orders, Ledger, Claims, Incentives) ─

-- Self-service signup + linking a login to a distributor/dealer/retailer record
ALTER TABLE users ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Active'; -- 'Active', 'Pending', 'Rejected'
ALTER TABLE users ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS "retailerId" TEXT;

-- Distributor/dealer/retailer self-service orders can carry multiple line items
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "retailerId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "items" JSONB DEFAULT '[]'::jsonb;

-- Distributor's own confirmation that they physically received the order,
-- independent of internal staff marking it "Delivered"
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receivedByDistributor" BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "receivedAt" TIMESTAMP WITH TIME ZONE;

-- Links between an order and the backorder it was split into when there
-- wasn't enough stock to fulfill it in full
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "splitFromOrderId" TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "splitIntoOrderId" TEXT;

CREATE TABLE IF NOT EXISTS distributor_payments (
  id TEXT PRIMARY KEY,
  "distributorId" TEXT REFERENCES distributors(id) ON DELETE CASCADE,
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
  "distributorId" TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  "schemeId" TEXT REFERENCES schemes(id) ON DELETE SET NULL,
  "schemeName" TEXT NOT NULL,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  amount NUMERIC NOT NULL,
  notes TEXT DEFAULT '',
  status TEXT DEFAULT 'Pending', -- 'Pending', 'Approved', 'Rejected', 'Settled'
  "reviewNotes" TEXT DEFAULT '',
  "reviewedBy" TEXT,
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE TABLE IF NOT EXISTS distributor_incentives (
  id TEXT PRIMARY KEY,
  "distributorId" TEXT REFERENCES distributors(id) ON DELETE CASCADE,
  "schemeId" TEXT REFERENCES schemes(id) ON DELETE SET NULL,
  "schemeName" TEXT NOT NULL,
  "orderId" TEXT REFERENCES orders(id) ON DELETE SET NULL,
  "orderValue" NUMERIC DEFAULT 0,
  "incentiveType" TEXT DEFAULT 'Discount', -- 'Discount', 'Free Goods', 'Cash'
  "incentiveValue" NUMERIC DEFAULT 0,
  status TEXT DEFAULT 'Earned', -- 'Earned', 'Paid'
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Dealers table — same shape as distributors, plus a mandatory parent-distributor link
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
  "parentDistributorId" TEXT REFERENCES distributors(id) ON DELETE SET NULL,
  "outstandingAmount" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 100000,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Retailers table — same shape as dealers, plus a mandatory parent-dealer link
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
  "parentDealerId" TEXT REFERENCES dealers(id) ON DELETE SET NULL,
  "outstandingAmount" NUMERIC DEFAULT 0,
  "creditLimit" NUMERIC DEFAULT 50000,
  status TEXT DEFAULT 'Active',
  "createdAt" TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

-- Generalize the existing distributor-portal tables to carry dealer/retailer
-- rows too, instead of duplicating distributor_payments/scheme_claims/distributor_incentives
ALTER TABLE distributor_payments    ADD COLUMN IF NOT EXISTS "dealerId" TEXT REFERENCES dealers(id) ON DELETE CASCADE;
ALTER TABLE scheme_claims           ADD COLUMN IF NOT EXISTS "dealerId" TEXT REFERENCES dealers(id) ON DELETE CASCADE;
ALTER TABLE distributor_incentives  ADD COLUMN IF NOT EXISTS "dealerId" TEXT REFERENCES dealers(id) ON DELETE CASCADE;
ALTER TABLE distributor_payments    ADD COLUMN IF NOT EXISTS "retailerId" TEXT REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE scheme_claims           ADD COLUMN IF NOT EXISTS "retailerId" TEXT REFERENCES retailers(id) ON DELETE CASCADE;
ALTER TABLE distributor_incentives  ADD COLUMN IF NOT EXISTS "retailerId" TEXT REFERENCES retailers(id) ON DELETE CASCADE;

-- Backfills a pre-existing gap found while building the Dealer Portal: the
-- complaints table never got a distributorId column even though the app has
-- been reading/writing complaint.distributorId since the Distributor Portal
-- shipped, meaning ownership matching was silently falling back to
-- name-matching only in Supabase-backed environments.
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "distributorId" TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "dealerId" TEXT;
ALTER TABLE complaints ADD COLUMN IF NOT EXISTS "retailerId" TEXT;


-- ════════════════════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY DEACTIVATION & ACCESS PERMISSIONS
-- ════════════════════════════════════════════════════════════════════════════

ALTER TABLE users DISABLE ROW LEVEL SECURITY;
ALTER TABLE leads DISABLE ROW LEVEL SECURITY;
ALTER TABLE orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE events DISABLE ROW LEVEL SECURITY;
ALTER TABLE products DISABLE ROW LEVEL SECURITY;
ALTER TABLE inventory DISABLE ROW LEVEL SECURITY;
ALTER TABLE vendors DISABLE ROW LEVEL SECURITY;
ALTER TABLE purchase_orders DISABLE ROW LEVEL SECURITY;
ALTER TABLE grn DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributors DISABLE ROW LEVEL SECURITY;
ALTER TABLE schemes DISABLE ROW LEVEL SECURITY;
ALTER TABLE complaints DISABLE ROW LEVEL SECURITY;
ALTER TABLE invoices DISABLE ROW LEVEL SECURITY;
ALTER TABLE expenses DISABLE ROW LEVEL SECURITY;
ALTER TABLE beat_plans DISABLE ROW LEVEL SECURITY;
ALTER TABLE attendance DISABLE ROW LEVEL SECURITY;
ALTER TABLE visit_reports DISABLE ROW LEVEL SECURITY;
ALTER TABLE territories DISABLE ROW LEVEL SECURITY;
ALTER TABLE notifications DISABLE ROW LEVEL SECURITY;
ALTER TABLE warehouses DISABLE ROW LEVEL SECURITY;
ALTER TABLE stock_transfers DISABLE ROW LEVEL SECURITY;
ALTER TABLE bank_transactions DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE scheme_claims DISABLE ROW LEVEL SECURITY;
ALTER TABLE distributor_incentives DISABLE ROW LEVEL SECURITY;
ALTER TABLE dealers DISABLE ROW LEVEL SECURITY;
ALTER TABLE retailers DISABLE ROW LEVEL SECURITY;


-- ════════════════════════════════════════════════════════════════════════════
-- SYSTEM DEMO SEED RECORDS
-- ════════════════════════════════════════════════════════════════════════════

-- Seed 1: Primary Vendors (Manufacturing Base)
INSERT INTO vendors (id, name, gstin, phone, email, address, "contactPerson", status)
VALUES (
  'V1', 'Janki Herbals', '24AAACJ1234M1Z5',
  '9876543200', 'orders@jankiherbals.com',
  '112, GIDC Industrial Estate, Anand, Gujarat - 388001',
  'Janki Shah', 'Active'
) ON CONFLICT (id) DO NOTHING;

-- Seed 2: Rich Ayurvedic Products Catalog
INSERT INTO products ("id", "name", "category", "hsnCode", "gstPct", "mrp", "distributorPrice", "dealerPrice", "retailerPrice", "uom")
VALUES
  ('P1', 'Herbal Hair Oil 100ml', 'Hair Care', '30049011', 12, 250, 150, 180, 200, 'BOTTLE'),
  ('P2', 'Aloevera Skin Gel 150g', 'Skin Care', '30049012', 12, 180, 100, 125, 140, 'TUBE'),
  ('P3', 'Tulsi Cough Syrup 100ml', 'Wellness', '30049013', 5, 120, 70, 85, 95, 'BOTTLE'),
  ('P4', 'Neem Face Wash 100ml', 'Skin Care', '30049014', 18, 150, 90, 105, 120, 'BOTTLE'),
  ('P5', 'Triphala Capsules 60s', 'Wellness', '30049015', 12, 300, 180, 210, 240, 'BOTTLE')
ON CONFLICT (id) DO NOTHING;

-- Seed 3: Initial Inventory Batches
INSERT INTO inventory (id, product, "batchNumber", "expiryDate", quantity, reserved, transit, damaged, "reorderLevel", warehouse, "unitCost")
VALUES
  ('INV-ITEM-1', 'Herbal Hair Oil 100ml', 'HHO-2026-01', '2028-06-01', 500, 50, 0, 5, 100, 'Main Warehouse', 85),
  ('INV-ITEM-2', 'Aloevera Skin Gel 150g', 'ASG-2026-02', '2028-03-01', 200, 20, 30, 0, 50, 'Main Warehouse', 60),
  ('INV-ITEM-3', 'Tulsi Cough Syrup 100ml', 'TCS-2026-03', '2027-09-01', 80, 0, 0, 2, 100, 'Main Warehouse', 40),
  ('INV-ITEM-4', 'Neem Face Wash 100ml', 'NFW-2026-04', '2027-08-15', 40, 10, 0, 0, 100, 'Main Warehouse', 50),
  ('INV-ITEM-5', 'Triphala Capsules 60s', 'TRP-2026-05', '2028-12-01', 350, 0, 50, 0, 75, 'Main Warehouse', 110)
ON CONFLICT (id) DO NOTHING;

-- Seed 4: Super Stockists & Distributors
INSERT INTO distributors (id, name, gstin, state, city, territory, phone, email, "contactPerson", "outstandingAmount", "creditLimit", status)
VALUES
  ('DIST-1', 'Gujarat Super Stockist', '24AABCG1234D1Z3', 'Gujarat', 'Ahmedabad', 'Gujarat North', '9876501234', 'info@gujstockist.com', 'Nilesh Patel', 45000, 200000, 'Active'),
  ('DIST-2', 'Maharashtra Prime Dist.', '27AABCM9876F1Z1', 'Maharashtra', 'Mumbai', 'Maharashtra West', '9876502345', 'ops@mahaprime.com', 'Rahul Mehta', 120000, 500000, 'Active'),
  ('DIST-3', 'Karnataka Wellness Dist.', '29AABCK5432H1Z7', 'Karnataka', 'Bangalore', 'Karnataka South', '9876503456', 'orders@karndist.com', 'Priya Nair', 0, 300000, 'Active')
ON CONFLICT (id) DO NOTHING;

-- Seed 5: Active Business Promotions
INSERT INTO schemes (id, name, type, "discountPct", "minOrderValue", "applicableTo", "validFrom", "validTo", status, description)
VALUES
  ('SCH-1', 'Monsoon Ayurvedic Special', 'Flat Discount', 10, 50000, 'Distributor', '2026-06-01', '2026-08-31', 'Active', '10% flat discount on Ayurvedic packages above ₹50,000 during monsoon season'),
  ('SCH-2', 'Festive Herbal Booster Offer', 'Cash Discount', 5, 10000, 'Retailer', '2026-10-01', '2026-11-15', 'Active', '5% cash discount for herbal retailers during Diwali season')
ON CONFLICT (id) DO NOTHING;

-- Seed 6: Primary Warehouses
INSERT INTO warehouses ("id", "name", "location", "manager", "type")
VALUES
  ('W1', 'Main Warehouse', 'Anand, Gujarat', 'Janki Shah', 'Main'),
  ('W2', 'Secondary Warehouse', 'Mumbai, Maharashtra', 'Rohan Mehta', 'Secondary'),
  ('W3', 'Cold Storage', 'Ahmedabad, Gujarat', 'Amit Patel', 'Cold Storage')
ON CONFLICT ("name") DO UPDATE SET
  "location" = EXCLUDED.location,
  "manager" = EXCLUDED.manager,
  "type" = EXCLUDED.type;

-- Seed 7: Team Users (Admin, Manager, Sales Reps)
INSERT INTO users (id, name, email, role, password, "managedUsers")
VALUES
  ('U-admin', 'Prismora Admin', 'admin@prismora.com', 'Admin', 'password123', '{}'::text[]),
  ('U-mgr-1', 'Rajesh Kumar (North Manager)', 'rajesh@prismora.com', 'Manager', 'password123', ARRAY['U-sales-1', 'U-sales-2']),
  ('U-mgr-2', 'Sunita Rao (South Manager)', 'sunita@prismora.com', 'Manager', 'password123', ARRAY['U-sales-3', 'U-sales-4']),
  ('U-sales-1', 'Rahul Sharma (Gujarat Sales)', 'rahul@prismora.com', 'Sales', 'password123', '{}'::text[]),
  ('U-sales-2', 'Amit Patel (Delhi Sales)', 'amit@prismora.com', 'Sales', 'password123', '{}'::text[]),
  ('U-sales-3', 'Vikram Singh (Mumbai Sales)', 'vikram@prismora.com', 'Sales', 'password123', '{}'::text[]),
  ('U-sales-4', 'Kiran Nair (Bangalore Sales)', 'kiran@prismora.com', 'Sales', 'password123', '{}'::text[])
ON CONFLICT (id) DO NOTHING;

-- Seed 8: Leads
INSERT INTO leads (id, name, company, phone, email, "productInterest", "leadSource", "assignedTo", status, "followUpDate", notes, "dealValue")
VALUES
  ('L1', 'Ayush Pharmacy', 'Ayush Wellness', '9876543210', 'contact@ayush.com', ARRAY['Herbal Hair Oil 100ml'], 'Web Directory', 'U-sales-1', 'Contacted', NOW(), 'Very interested in stocking hair oil. Asked for distributor price catalog.', 25000),
  ('L2', 'Natures Cure Store', 'Natures Cure Retail', '9876543220', 'sales@naturescure.com', ARRAY['Triphala Capsules 60s', 'Tulsi Cough Syrup 100ml'], 'Trade Show', 'U-sales-2', 'Qualified', NOW() + INTERVAL '2 days', 'Interested in wellness combo packs. Bulk pricing terms sent.', 48000)
ON CONFLICT (id) DO NOTHING;

-- Seed 9: Orders
INSERT INTO orders (id, "customerName", "companyName", product, quantity, value, state, city, status, "assignedTo", date)
VALUES
  ('O1', 'Gujarat Super Stockist', 'Gujarat Stockist Group', 'Herbal Hair Oil 100ml', 200, 30000, 'Gujarat', 'Ahmedabad', 'Delivered', 'U-sales-1', NOW() - INTERVAL '2 days'),
  ('O2', 'Maharashtra Prime Dist.', 'Prime Distributors Ltd.', 'Triphala Capsules 60s', 150, 27000, 'Maharashtra', 'Mumbai', 'Processing', 'U-sales-3', NOW()),
  ('O3', 'Karnataka Wellness Dist.', 'Wellness Dist. Corp', 'Tulsi Cough Syrup 100ml', 100, 7000, 'Karnataka', 'Bangalore', 'Pending', 'U-sales-4', NOW())
ON CONFLICT (id) DO NOTHING;

-- Seed 10: Purchase Orders
INSERT INTO purchase_orders (id, "vendorId", "vendorName", items, total, status, "expectedDate", notes, "assignedTo")
VALUES
  ('PO-1', 'V1', 'Janki Herbals', '[{"name": "Herbal Hair Oil 100ml", "quantity": 500, "unitCost": 85, "total": 42500}, {"name": "Aloevera Skin Gel 150g", "quantity": 300, "unitCost": 60, "total": 18000}]'::jsonb, 60500, 'Completed', NOW() - INTERVAL '4 days', 'Initial raw shipment purchase', 'U-admin'),
  ('PO-2', 'V1', 'Janki Herbals', '[{"name": "Tulsi Cough Syrup 100ml", "quantity": 200, "unitCost": 40, "total": 8000}]'::jsonb, 8000, 'Ordered', NOW() + INTERVAL '3 days', 'Replenishment for winter cough syrup stocks', 'U-admin')
ON CONFLICT (id) DO NOTHING;

-- Seed 11: GRN (Good Receipt Notes)
INSERT INTO grn (id, "poId", "vendorName", items, "receivedDate", notes, "receivedBy")
VALUES
  ('GRN-1', 'PO-1', 'Janki Herbals', '[{"name": "Herbal Hair Oil 100ml", "quantity": 500, "unitCost": 85, "total": 42500}, {"name": "Aloevera Skin Gel 150g", "quantity": 300, "unitCost": 60, "total": 18000}]'::jsonb, NOW() - INTERVAL '4 days', 'All packaging clean and intact. Accepted.', 'U-admin')
ON CONFLICT (id) DO NOTHING;

-- Seed 12: Invoices
INSERT INTO invoices (id, "orderId", "customerName", amount, tax, status, "dueDate", "assignedTo")
VALUES
  ('INV-1001', 'O1', 'Gujarat Super Stockist', 30000, 3600, 'Paid', NOW() + INTERVAL '10 days', 'U-sales-1'),
  ('INV-1002', 'O2', 'Maharashtra Prime Dist.', 27000, 3240, 'Unpaid', NOW() - INTERVAL '18 days', 'U-sales-3'),
  ('INV-1003', 'O3', 'Karnataka Wellness Dist.', 7000, 350, 'Unpaid', NOW() + INTERVAL '14 days', 'U-sales-4')
ON CONFLICT (id) DO NOTHING;

-- Seed 13: Expenses
INSERT INTO expenses (id, category, amount, description, date, "assignedTo")
VALUES
  ('EXP-1', 'Raw Materials', 60500, 'PO-1 Shipment fulfillment pay to Janki Herbals', NOW() - INTERVAL '4 days', 'U-admin'),
  ('EXP-2', 'Logistics', 4500, 'Delivery truck fuel for Gujarat stockist shipment', NOW() - INTERVAL '2 days', 'U-sales-1'),
  ('EXP-3', 'Marketing', 15000, 'Ayurvedic wellness social media promo campaign', NOW() - INTERVAL '10 days', 'U-admin')
ON CONFLICT (id) DO NOTHING;

-- Seed 14: Territories
INSERT INTO territories (id, name, state, districts, "executiveId")
VALUES
  ('T-1', 'Gujarat North Hub', 'Gujarat', '["Anand", "Vadodara", "Ahmedabad"]'::jsonb, 'U-sales-1'),
  ('T-2', 'Delhi Hub', 'Delhi', '["New Delhi", "North Delhi", "West Delhi"]'::jsonb, 'U-sales-2'),
  ('T-3', 'Mumbai Central', 'Maharashtra', '["Mumbai City", "Mumbai Suburban"]'::jsonb, 'U-sales-3')
ON CONFLICT (id) DO NOTHING;

-- Seed 15: Beat Plans
INSERT INTO beat_plans (id, "executiveId", date, territory, outlets, status)
VALUES
  ('B-1', 'U-sales-1', CURRENT_DATE, 'Gujarat North Hub', '["Radhe Ayurvedic", "Vrindavan Wellness", "Janki Retailers"]'::jsonb, 'Planned'),
  ('B-2', 'U-sales-2', CURRENT_DATE, 'Delhi Hub', '["Delhi Herbal Emporium", "Capital Wellness"]'::jsonb, 'Visited'),
  ('B-3', 'U-sales-3', CURRENT_DATE - 1, 'Mumbai Central', '["Bombay Herbals", "Metro Retailers"]'::jsonb, 'Visited')
ON CONFLICT (id) DO NOTHING;

-- Seed 16: Attendance
INSERT INTO attendance (id, "userId", date, status, "checkInTime", "checkOutTime", notes)
VALUES
  ('ATT-1', 'U-sales-1', CURRENT_DATE, 'Present', '09:15 AM', NULL, 'Started beat visits at Anand'),
  ('ATT-2', 'U-sales-2', CURRENT_DATE, 'Present', '09:30 AM', '05:30 PM', 'Completed visits at Delhi Hub'),
  ('ATT-3', 'U-sales-3', CURRENT_DATE - 1, 'Present', '09:10 AM', '06:00 PM', 'Mumbai sales beats completed')
ON CONFLICT (id) DO NOTHING;

-- Seed 17: Visit Reports
INSERT INTO visit_reports (id, "executiveId", "outletName", "outletContact", "visitDate", "productsShown", "orderPlaced", "orderId", "nextFollowUp", notes)
VALUES
  ('VR-1', 'U-sales-1', 'Radhe Ayurvedic', '9876543210', CURRENT_DATE, '["Herbal Hair Oil 100ml", "Triphala Capsules 60s"]'::jsonb, TRUE, 'O1', CURRENT_DATE + 7, 'Owner placed order for hair oil, interested in face washes next check.'),
  ('VR-2', 'U-sales-2', 'Delhi Herbal Emporium', '9876543220', CURRENT_DATE, '["Tulsi Cough Syrup 100ml"]'::jsonb, FALSE, NULL, NULL, 'Sufficient stocks present. Revisit in next cycle.')
ON CONFLICT (id) DO NOTHING;
