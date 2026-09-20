-- ========================================================================
--  PRISMORA -- roles and permissions as data.
--  Supabase dashboard -> SQL Editor -> New query -> paste -> Run.
--  Safe to run more than once.
--
--  Who may see what was written into AuthContext.jsx: fifteen roles against
--  twenty-one modules, each 'full', 'view' or 'none'. Changing any of it --
--  letting Accounts see purchases, say -- meant a developer and a deployment.
--  It lives here now.
--
--  The name is the key. `users.role` stores it, so renaming a role would
--  orphan every account holding it. The screen locks the name for that reason
--  and lets everything else be edited, exactly as the master lists do.
--
--  `level` replaces three hardcoded lists of role names -- isAdminRole,
--  isManagerRole and isSalesRole, which between them are consulted in 59
--  places. A new role can now be made an admin or a manager without touching
--  any of them.
--
--  Seeded from the values in the code today, so nothing changes on the day
--  this runs.
-- ========================================================================


CREATE TABLE IF NOT EXISTS roles (
  id            TEXT PRIMARY KEY,
  name          TEXT NOT NULL,
  -- admin | manager | sales | staff | partner
  level         TEXT NOT NULL DEFAULT 'staff',
  description   TEXT DEFAULT '',
  -- { "orders": "full", "leads": "view", ... } -- one entry per module
  permissions   JSONB NOT NULL DEFAULT '{}'::jsonb,
  sort          INTEGER DEFAULT 0,
  active        BOOLEAN DEFAULT true,
  -- A role that shipped with the system. It cannot be deleted, because
  -- accounts hold its name and the code checks its level.
  "isSystem"    BOOLEAN DEFAULT false,
  "createdAt"   TIMESTAMP WITH TIME ZONE DEFAULT TIMEZONE('utc'::text, NOW()) NOT NULL
);

CREATE INDEX IF NOT EXISTS roles_level_idx ON roles (level);


-- -- Row-level security, matching every other table ----------------------
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS roles_read  ON roles;
DROP POLICY IF EXISTS roles_write ON roles;

-- Everyone signed in reads them: the app cannot decide what to show without.
CREATE POLICY roles_read ON roles
  FOR SELECT TO authenticated USING (true);

-- Only an administrator changes them. Anyone who could write here could grant
-- themselves the run of the system.
CREATE POLICY roles_write ON roles
  FOR ALL TO authenticated
  USING (public.is_app_admin()) WITH CHECK (public.is_app_admin());


-- -- Seed, from the matrix in the code today -----------------------------
INSERT INTO roles (id, name, level, description, permissions, sort, active, "isSystem") VALUES
  ('Super Admin', 'Super Admin', 'admin', 'Full access to everything, including settings and master data.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"full","geography":"full","orders":"full","inventory":"full","purchases":"full","distributors":"full","dealers":"full","retailers":"full","accounting":"full","schemes":"full","complaints":"full","reports":"full","settings":"full","ledger":"full","claims":"full","incentives":"full","stock":"full","priceList":"full"}'::jsonb, 0, true, true),
  ('Director', 'Director', 'admin', 'Sees the whole business and the accounts, but does not administer it.', '{"dashboard":"full","leads":"view","sfa":"view","customers":"view","geography":"view","orders":"view","inventory":"view","purchases":"view","distributors":"view","dealers":"view","retailers":"view","accounting":"full","schemes":"view","complaints":"view","reports":"full","settings":"none","ledger":"none","claims":"view","incentives":"view","stock":"none","priceList":"none"}'::jsonb, 1, true, true),
  ('Sales Manager', 'Sales Manager', 'manager', 'Runs the sales team, its leads and its field beats.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"full","geography":"full","orders":"view","inventory":"view","purchases":"none","distributors":"view","dealers":"view","retailers":"view","accounting":"none","schemes":"view","complaints":"view","reports":"full","settings":"none","ledger":"none","claims":"view","incentives":"view","stock":"none","priceList":"none"}'::jsonb, 2, true, true),
  ('Sales Executive', 'Sales Executive', 'sales', 'Works their own leads, visits and complaints.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"view","geography":"view","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 3, true, true),
  ('Purchase Manager', 'Purchase Manager', 'manager', 'Buying, stock and the partners goods are bought for.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"full","purchases":"full","distributors":"full","dealers":"full","retailers":"full","accounting":"view","schemes":"none","complaints":"none","reports":"view","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 4, true, true),
  ('Warehouse Manager', 'Warehouse Manager', 'staff', 'Stock and the orders that move it.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"full","inventory":"full","purchases":"view","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"none","complaints":"none","reports":"none","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 5, true, true),
  ('Accounts', 'Accounts', 'staff', 'Invoices, payments, claims and incentives.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"view","geography":"none","orders":"view","inventory":"none","purchases":"view","distributors":"view","dealers":"view","retailers":"view","accounting":"full","schemes":"view","complaints":"none","reports":"full","settings":"none","ledger":"none","claims":"full","incentives":"full","stock":"none","priceList":"none"}'::jsonb, 6, true, true),
  ('Dispatch Team', 'Dispatch Team', 'staff', 'Moves orders from packed to delivered.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"full","inventory":"view","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"none","complaints":"none","reports":"none","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 7, true, true),
  ('Customer Support', 'Customer Support', 'staff', 'Complaints and the customers behind them.', '{"dashboard":"full","leads":"view","sfa":"none","customers":"full","geography":"none","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 8, true, true),
  ('Distributor', 'Distributor', 'partner', 'Partner portal -- their own orders, ledger and claims.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"view","claims":"full","incentives":"view","stock":"view","priceList":"view"}'::jsonb, 9, true, true),
  ('Dealer', 'Dealer', 'partner', 'Partner portal -- their own orders, ledger and claims.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"view","claims":"full","incentives":"view","stock":"view","priceList":"view"}'::jsonb, 10, true, true),
  ('Retailer', 'Retailer', 'partner', 'Partner portal -- their own orders, ledger and claims.', '{"dashboard":"full","leads":"none","sfa":"none","customers":"none","geography":"none","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"view","claims":"full","incentives":"view","stock":"view","priceList":"view"}'::jsonb, 11, true, true),
  ('Admin', 'Admin', 'admin', 'Legacy administrator role, kept so existing accounts keep working.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"full","geography":"full","orders":"full","inventory":"full","purchases":"full","distributors":"full","dealers":"full","retailers":"full","accounting":"full","schemes":"full","complaints":"full","reports":"full","settings":"full","ledger":"full","claims":"full","incentives":"full","stock":"full","priceList":"full"}'::jsonb, 12, true, true),
  ('Manager', 'Manager', 'manager', 'Legacy manager role, kept so existing accounts keep working.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"full","geography":"full","orders":"view","inventory":"view","purchases":"none","distributors":"view","dealers":"view","retailers":"view","accounting":"none","schemes":"view","complaints":"view","reports":"full","settings":"none","ledger":"none","claims":"view","incentives":"view","stock":"none","priceList":"none"}'::jsonb, 13, true, true),
  ('Sales', 'Sales', 'sales', 'Legacy sales role, kept so existing accounts keep working.', '{"dashboard":"full","leads":"full","sfa":"full","customers":"view","geography":"view","orders":"view","inventory":"none","purchases":"none","distributors":"none","dealers":"none","retailers":"none","accounting":"none","schemes":"view","complaints":"full","reports":"none","settings":"none","ledger":"none","claims":"none","incentives":"none","stock":"none","priceList":"none"}'::jsonb, 14, true, true)
ON CONFLICT (id) DO NOTHING;


-- -- Confirm -------------------------------------------------------------
SELECT level, count(*) AS roles
FROM roles
GROUP BY level
ORDER BY level;
-- Expected: 15 roles -- admin 3, manager 3, partner 3, sales 2, staff 4.
