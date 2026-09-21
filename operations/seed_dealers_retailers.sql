-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — demo dealers and retailers.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--
--  Why this is a SQL file and not something the app did:
--    `dealers` and `retailers` are both blocked by row-level security, so a
--    write with the browser's anon key is refused — which is also why both
--    tables are empty today, and why adding one through the Dealers screen
--    fails. The SQL editor runs as the database owner and bypasses RLS, so
--    this works whether or not FIX_RLS_NOW.sql has been run yet.
--
--  Re-runnable: ON CONFLICT DO NOTHING, so running it twice changes nothing.
--
--  To remove all of it again:
--    DELETE FROM retailers WHERE id LIKE 'RTL-%';
--    DELETE FROM dealers   WHERE id LIKE 'DLR-%';
--    (retailers first — they point at the dealers)
-- ════════════════════════════════════════════════════════════════════════


-- 027 dropped the `territory` name column, so these now set "territoryId" by
-- looking the name up. A territory that does not exist yields NULL and the
-- partner seeds unassigned rather than the whole INSERT failing — check the
-- count query at the bottom, then Geography → Territories, if that matters.


-- ── Dealers — each one hangs off an existing distributor ─────────────────
-- Cities sit inside the districts Gujrat North Hub and Maharashtra Mega Zone
-- actually cover, so these partners appear under the right territory rather
-- than falling outside it.
--
-- DLR-3 is deliberately over its credit limit (1,18,000 against 1,00,000) so
-- the over-limit state on the Dealers screen has something to show.
-- DLR-5 is deliberately Inactive, for the same reason.
INSERT INTO dealers (id, name, gstin, state, city, "territoryId", phone, email, "contactPerson", address, pincode, "parentDistributorId", "outstandingAmount", "creditLimit", status, "createdAt") VALUES
  ('DLR-1', 'Shree Ayur Agencies',        '24AABCS1429B1Z5', 'Gujarat',     'Ahmedabad', (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9825011223', 'shree.ayur@example.com',      'Nilesh Shah',    '14, Ashram Road, Navrangpura', '380009', 'DIST-1',  42000, 150000, 'Active',   NOW()),
  ('DLR-2', 'Vadodara Herbal Traders',    '24AACCV7781K1Z2', 'Gujarat',     'Vadodara',  (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9825022334', 'vadodara.herbal@example.com', 'Reena Patel',    '8, Sayajigunj Main Road',      '390005', 'DIST-1',      0, 120000, 'Active',   NOW()),
  ('DLR-3', 'Anand Wellness Supply',      '24AADCA3312M1Z9', 'Gujarat',     'Anand',     (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9825033445', 'anand.wellness@example.com',  'Jigar Desai',    '22, Station Road',             '388001', 'DIST-1', 118000, 100000, 'Active',   NOW()),
  ('DLR-4', 'Pune Ayurveda Distributors', '27AAECP5590H1Z4', 'Maharashtra', 'Pune',      (SELECT id FROM territories WHERE name = 'Maharashtra Mega Zone'), '9822044556', 'pune.ayurveda@example.com',   'Sunil Kulkarni', '5, FC Road, Shivajinagar',     '411005', 'DIST-2',  65000, 200000, 'Active',   NOW()),
  ('DLR-5', 'Nagpur Health Traders',      '27AAFCN2204J1Z7', 'Maharashtra', 'Nagpur',    (SELECT id FROM territories WHERE name = 'Maharashtra Mega Zone'), '9822055667', 'nagpur.health@example.com',   'Amit Deshmukh',  '31, Sitabuldi Market',         '440012', 'DIST-2',      0, 150000, 'Inactive', NOW())
ON CONFLICT (id) DO NOTHING;


-- ── Retailers — each one hangs off a dealer above ────────────────────────
-- The first four are the outlets already on Surbhi's beat plans, so the visit
-- reports and the orders raised from them finally line up with a real retailer
-- record instead of being loose names on an order.
--
-- RTL-6 is deliberately over its limit (52,000 against 45,000).
INSERT INTO retailers (id, name, gstin, state, city, "territoryId", phone, email, "contactPerson", address, pincode, "parentDealerId", "outstandingAmount", "creditLimit", status, "createdAt") VALUES
  ('RTL-1', 'Krishna Pharma',     '24AAGCK8891P1Z3', 'Gujarat',     'Ahmedabad', (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426011001', 'krishna.pharma@example.com',    'Krishna Patel',  '3, Maninagar Char Rasta',    '380008', 'DLR-1', 12500, 50000, 'Active', NOW()),
  ('RTL-2', 'Radhe Medicals',     '24AAHCR4432Q1Z8', 'Gujarat',     'Amreli',    (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426022002', 'radhe.medicals@example.com',    'Bhavesh Joshi',  '11, Rajkamal Chowk',         '365601', 'DLR-1',     0, 50000, 'Active', NOW()),
  ('RTL-3', 'Shiv Pharma',        '24AAJCS6654R1Z1', 'Gujarat',     'Ahmedabad', (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426033003', 'shiv.pharma@example.com',       'Shivam Trivedi', '7, Bapunagar Main Road',     '380024', 'DLR-1',  8000, 40000, 'Active', NOW()),
  ('RTL-4', 'Vrindavan Wellness', '24AAKCV1178S1Z6', 'Gujarat',     'Amreli',    (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426044004', 'vrindavan.wellness@example.com','Mita Vyas',      '44, Lathi Road',             '365601', 'DLR-1', 21000, 60000, 'Active', NOW()),
  ('RTL-5', 'Om Medical Store',   '24AALCO9923T1Z4', 'Gujarat',     'Vadodara',  (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426055005', 'om.medical@example.com',        'Paresh Mehta',   '19, Alkapuri',               '390007', 'DLR-2',     0, 50000, 'Active', NOW()),
  ('RTL-6', 'Anand Medical Hall', '24AAMCA5567U1Z0', 'Gujarat',     'Anand',     (SELECT id FROM territories WHERE name = 'Gujrat North Hub'),      '9426066006', 'anand.medical@example.com',     'Hardik Soni',    '2, Vallabh Vidyanagar Road', '388120', 'DLR-3', 52000, 45000, 'Active', NOW()),
  ('RTL-7', 'Pune Herbal Corner', '27AANCP3345V1Z5', 'Maharashtra', 'Pune',      (SELECT id FROM territories WHERE name = 'Maharashtra Mega Zone'), '9822077007', 'pune.herbal@example.com',       'Rohit Jadhav',   '16, Kothrud Depot',          '411038', 'DLR-4', 15000, 50000, 'Active', NOW()),
  ('RTL-8', 'Nagpur Ayur Store',  '27AAOCN7789W1Z2', 'Maharashtra', 'Nagpur',    (SELECT id FROM territories WHERE name = 'Maharashtra Mega Zone'), '9822088008', 'nagpur.ayur@example.com',       'Priya Bhosale',  '9, Dharampeth',              '440010', 'DLR-5',     0, 40000, 'Active', NOW())
ON CONFLICT (id) DO NOTHING;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT 'dealers'   AS table_name, count(*) AS rows FROM dealers   WHERE id LIKE 'DLR-%'
UNION ALL
SELECT 'retailers' AS table_name, count(*) AS rows FROM retailers WHERE id LIKE 'RTL-%'
UNION ALL
SELECT 'seeded without a territory', count(*) FROM (
  SELECT 1 FROM dealers   WHERE id LIKE 'DLR-%' AND "territoryId" IS NULL
  UNION ALL SELECT 1 FROM retailers WHERE id LIKE 'RTL-%' AND "territoryId" IS NULL
) x;
-- Expected: dealers 5, retailers 8, and 0 without a territory. Anything above
-- zero on the last row means the territory names above do not exist.
