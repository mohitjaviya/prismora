-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — referential integrity for the partner hierarchy and the money.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once: each key is added only if it is not there.
--
--  WHAT IS MISSING TODAY
--
--  Nine foreign keys exist, all of them pointing at `users`. Eighteen more
--  relationships are enforced only by application code, and they are the ones
--  that matter: the whole partner hierarchy, and every link between a party
--  and its money.
--
--  Nothing in the database currently stops this:
--
--      delete from distributors where id = 'DIST-1';
--
--  Its dealers keep a parentDistributorId pointing at nothing. Its orders,
--  incentives, claims and payments all keep a distributorId pointing at
--  nothing. The ledger goes on totalling money against a party that no longer
--  exists, and no screen shows an error, because every one of those lookups
--  fails quietly and renders a blank.
--
--  CHECKED AGAINST LIVE DATA FIRST
--
--  A foreign key refuses to be created if one existing row violates it, so
--  every column below was counted before this file was written. Twenty-six of
--  twenty-seven are clean. The one that is not is handled in step 1.
--
--  ON DELETE, AND WHY
--
--    RESTRICT  for anything financial or structural. Deleting a party that
--              holds orders, invoices, payments, incentives or claims should
--              fail loudly and make somebody decide what happens to the money.
--              Silently cascading it away is how a ledger stops reconciling.
--
--    SET NULL  for soft references, where the child is a record in its own
--              right and only the link is lost -- a visit report outlives the
--              beat plan it was made under.
-- ════════════════════════════════════════════════════════════════════════


-- ── Step 1: the two rows that block a key ───────────────────────────────
-- VR-1789541105779 and VR-1789541112434 both carry beatId B-1789539831229,
-- a beat plan that no longer exists. The visits themselves are real and stay;
-- only the dangling link is cleared, which is what SET NULL would have done
-- had the key existed when the beat was deleted.
UPDATE public.visit_reports vr
SET    "beatId" = NULL
WHERE  vr."beatId" IS NOT NULL
AND    NOT EXISTS (SELECT 1 FROM public.beat_plans b WHERE b.id = vr."beatId");


-- ── Step 2: the keys ────────────────────────────────────────────────────
DO $$
DECLARE
  k record;
  nm text;
BEGIN
  FOR k IN SELECT * FROM (VALUES
      -- the partner hierarchy
      ('dealers',                'parentDistributorId', 'distributors', 'RESTRICT'),
      ('retailers',              'parentDealerId',      'dealers',      'RESTRICT'),

      -- orders against the party that placed them
      ('orders',                 'distributorId',       'distributors', 'RESTRICT'),
      ('orders',                 'dealerId',            'dealers',      'RESTRICT'),
      ('orders',                 'retailerId',          'retailers',    'RESTRICT'),

      -- money earned
      ('distributor_incentives', 'schemeId',            'schemes',      'RESTRICT'),
      ('distributor_incentives', 'distributorId',       'distributors', 'RESTRICT'),
      ('distributor_incentives', 'dealerId',            'dealers',      'RESTRICT'),
      ('distributor_incentives', 'retailerId',          'retailers',    'RESTRICT'),

      -- money claimed
      ('scheme_claims',          'schemeId',            'schemes',      'RESTRICT'),
      ('scheme_claims',          'distributorId',       'distributors', 'RESTRICT'),
      ('scheme_claims',          'orderId',             'orders',       'SET NULL'),

      -- money received
      ('distributor_payments',   'distributorId',       'distributors', 'RESTRICT'),
      ('distributor_payments',   'dealerId',            'dealers',      'RESTRICT'),
      ('distributor_payments',   'retailerId',          'retailers',    'RESTRICT'),

      -- purchase side
      ('purchase_returns',       'vendorId',            'vendors',      'RESTRICT'),
      ('vendor_payments',        'vendorId',            'vendors',      'RESTRICT'),
      ('credit_notes',           'invoiceId',           'invoices',     'RESTRICT'),

      -- support and field work: the record outlives what it points at
      ('complaints',             'distributorId',       'distributors', 'SET NULL'),
      ('complaints',             'dealerId',            'dealers',      'SET NULL'),
      ('complaints',             'retailerId',          'retailers',    'SET NULL'),
      ('visit_reports',          'beatId',              'beat_plans',   'SET NULL'),
      ('visit_reports',          'orderId',             'orders',       'SET NULL'),
      ('sfa_expenses',           'userId',              'users',        'RESTRICT')
    ) AS x(child, col, parent, on_delete)
  LOOP
    nm := 'fk_' || k.child || '_' || lower(k.col);

    -- Already there? Leave it. This file is meant to be re-runnable, and the
    -- three keys that predate it (invoices.orderId, grn.poId,
    -- purchase_orders.vendorId) are deliberately not in the list above.
    IF EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_class t ON t.oid = c.conrelid
      WHERE c.conname = nm AND t.relname = k.child
    ) THEN
      RAISE NOTICE 'skip %, already present', nm;
      CONTINUE;
    END IF;

    EXECUTE format(
      'ALTER TABLE public.%I ADD CONSTRAINT %I FOREIGN KEY (%I) REFERENCES public.%I(id) ON DELETE %s',
      k.child, nm, k.col, k.parent, k.on_delete);
    RAISE NOTICE 'added % -> %(id) on delete %', nm, k.parent, k.on_delete;
  END LOOP;
END $$;


-- ── Step 3: indexes on the new keys ─────────────────────────────────────
-- Postgres indexes the parent side of a foreign key automatically and the
-- child side not at all. Without these, every RESTRICT above has to scan the
-- whole child table before it will allow a delete, and the partner-scoped RLS
-- policies from part 2 filter on exactly these columns on every read.
CREATE INDEX IF NOT EXISTS idx_orders_distributor      ON public.orders("distributorId");
CREATE INDEX IF NOT EXISTS idx_orders_dealer           ON public.orders("dealerId");
CREATE INDEX IF NOT EXISTS idx_orders_retailer         ON public.orders("retailerId");
CREATE INDEX IF NOT EXISTS idx_dealers_parent          ON public.dealers("parentDistributorId");
CREATE INDEX IF NOT EXISTS idx_retailers_parent        ON public.retailers("parentDealerId");
CREATE INDEX IF NOT EXISTS idx_incentives_distributor  ON public.distributor_incentives("distributorId");
CREATE INDEX IF NOT EXISTS idx_incentives_scheme       ON public.distributor_incentives("schemeId");
CREATE INDEX IF NOT EXISTS idx_claims_distributor      ON public.scheme_claims("distributorId");
CREATE INDEX IF NOT EXISTS idx_payments_distributor    ON public.distributor_payments("distributorId");
CREATE INDEX IF NOT EXISTS idx_complaints_distributor  ON public.complaints("distributorId");
CREATE INDEX IF NOT EXISTS idx_visit_reports_beat      ON public.visit_reports("beatId");


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT c.conname                AS constraint_name,
       t.relname                AS child_table,
       p.relname                AS parent_table,
       CASE c.confdeltype WHEN 'r' THEN 'RESTRICT'
                          WHEN 'n' THEN 'SET NULL'
                          WHEN 'c' THEN 'CASCADE'
                          WHEN 'a' THEN 'NO ACTION'
                          ELSE c.confdeltype::text END AS on_delete
FROM   pg_constraint c
JOIN   pg_class t ON t.oid = c.conrelid
JOIN   pg_class p ON p.oid = c.confrelid
WHERE  c.contype = 'f'
AND    connamespace = 'public'::regnamespace
ORDER  BY t.relname, c.conname;
-- Expected: 33 rows -- the 9 that existed plus the 24 added here.


/*
  ── WHAT CHANGES FOR SOMEBODY USING THE APP ──────────────────────────────

  Deleting a distributor, dealer, retailer, scheme or vendor that still has
  history attached will now FAIL where it previously succeeded quietly. The
  application shows that as "could not be saved" rather than as anything
  helpful, because deleteDistributor and its siblings do not inspect the error.

  That is the correct trade -- a refused delete is recoverable, a silently
  orphaned ledger is not -- but the message wants improving, and the screens
  ought to say "this distributor has 3 orders and 7 incentives" before offering
  the button at all.

  ── NOT INCLUDED ─────────────────────────────────────────────────────────

  orders.leadId -> leads          orders outlive the lead they came from, and
                                  leads are routinely tidied up.
  inventory.product -> products   a product NAME, not an id. Making it a key
                                  means changing the column, which is a data
                                  migration rather than a constraint.
  invoices -> any party           invoices carry no party id at all; they are
                                  matched by customerName or through orderId.
                                  Same gap the RLS policy had to work around.
*/
