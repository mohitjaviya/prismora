-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — clear the test data, keep the catalogue and the configuration.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--
--  ⚠ THIS DELETES BUSINESS DATA AND CANNOT BE UNDONE.
--
--  A full dump of all 29 tables was taken first:
--      backup-before-wipe-2026-09-20T13-42-42-238Z.json   (130 KB, repo root)
--  Every row removed below is in that file.
--
--  KEPT                            DELETED
--    products   24  the catalogue    leads 1, orders 4, invoices 8, expenses 6
--    masters    75  dropdown options inventory 9, purchase_orders 1, grn 6
--    users       6  the accounts     schemes 4, scheme_claims 1, incentives 7
--    roles      15  the permissions  payments 1, complaints 1, attendance 2
--                                    beat_plans 8, visit_reports 11, sfa_expenses 1
--                                    distributors 3, dealers 5, retailers 8
--                                    vendors 1, territories 3, events 230
--
--  ── WHY THE ORDER MATTERS ───────────────────────────────────────────────
--
--  Three foreign keys already exist and will refuse a delete in the wrong
--  order: invoices → orders, grn → purchase_orders, purchase_orders → vendors.
--  Children go first throughout. The partner hierarchy is unwound the same
--  way -- retailers, then dealers, then distributors -- so that it still works
--  if ADD_FOREIGN_KEYS.sql has been run by the time you get here.
--
--  Wrapped in a transaction: it all happens or none of it does. A single
--  refusal rolls the whole thing back rather than leaving half a database.
-- ════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── The audit log first: it narrates everything below ───────────────────
DELETE FROM public.events;

-- ── Money, children before parents ──────────────────────────────────────
DELETE FROM public.credit_notes;
DELETE FROM public.invoices;              -- before orders (FK exists)
DELETE FROM public.distributor_incentives;
DELETE FROM public.scheme_claims;
DELETE FROM public.distributor_payments;
DELETE FROM public.expenses;

-- ── Field work ──────────────────────────────────────────────────────────
DELETE FROM public.visit_reports;         -- before beat_plans
DELETE FROM public.sfa_expenses;
DELETE FROM public.attendance;
DELETE FROM public.beat_plans;

-- ── Support ─────────────────────────────────────────────────────────────
DELETE FROM public.complaints;

-- ── Sales ───────────────────────────────────────────────────────────────
DELETE FROM public.orders;
DELETE FROM public.leads;

-- ── Stock ───────────────────────────────────────────────────────────────
DELETE FROM public.inventory;

-- ── Purchasing, children before parents ─────────────────────────────────
DELETE FROM public.purchase_returns;
DELETE FROM public.vendor_payments;
DELETE FROM public.grn;                   -- before purchase_orders (FK exists)
DELETE FROM public.purchase_orders;       -- before vendors (FK exists)
DELETE FROM public.vendors;

-- ── Offers ──────────────────────────────────────────────────────────────
DELETE FROM public.schemes;

-- ── The partner hierarchy, bottom up ────────────────────────────────────
DELETE FROM public.retailers;
DELETE FROM public.dealers;
DELETE FROM public.distributors;

-- ── Geography ───────────────────────────────────────────────────────────
DELETE FROM public.territories;


-- ── The accounts are kept, but their party links are not ────────────────
-- dist@prismora.com carries distributorId DIST-1, which no longer exists.
-- Left as it is, that account signs in to a portal that cannot find its own
-- company: no name, no territory, no credit limit, and My Orders resolving
-- against nothing. Clearing the link at least makes the state honest.
--
-- The account still holds the Distributor role, so it will sign in and land
-- on a portal with nothing behind it. Give it a new distributorId once you
-- create a real distributor, or change its role, or delete the account.
UPDATE public.users
SET    "distributorId" = NULL,
       "dealerId"      = NULL,
       "retailerId"    = NULL
WHERE  "distributorId" IS NOT NULL
   OR  "dealerId"      IS NOT NULL
   OR  "retailerId"    IS NOT NULL;

COMMIT;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT 'products'     AS t, count(*) FROM public.products
UNION ALL SELECT 'masters',      count(*) FROM public.masters
UNION ALL SELECT 'users',        count(*) FROM public.users
UNION ALL SELECT 'roles',        count(*) FROM public.roles
UNION ALL SELECT '-- deleted --', 0
UNION ALL SELECT 'orders',       count(*) FROM public.orders
UNION ALL SELECT 'leads',        count(*) FROM public.leads
UNION ALL SELECT 'invoices',     count(*) FROM public.invoices
UNION ALL SELECT 'inventory',    count(*) FROM public.inventory
UNION ALL SELECT 'distributors', count(*) FROM public.distributors
UNION ALL SELECT 'dealers',      count(*) FROM public.dealers
UNION ALL SELECT 'retailers',    count(*) FROM public.retailers
UNION ALL SELECT 'vendors',      count(*) FROM public.vendors
UNION ALL SELECT 'schemes',      count(*) FROM public.schemes
UNION ALL SELECT 'territories',  count(*) FROM public.territories
UNION ALL SELECT 'events',       count(*) FROM public.events
ORDER BY 1;
-- Expected: products 24, masters 75, users 6, roles 15. Everything else 0.
