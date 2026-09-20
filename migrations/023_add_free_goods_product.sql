-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — which product a free-goods scheme actually gives away.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS MISSING
--
--  A scheme can offer free goods, and records how many:
--
--      schemes.freeGoodsQty   5
--
--  It does not record five of what. So when the scheme fires, the incentive
--  written against the order carries a quantity and no product either:
--
--      incentiveType  'Free Goods'
--      incentiveValue  5
--
--  Nothing downstream can act on that. Marking the incentive paid cannot take
--  the units out of inventory, because it has no idea which batch to take them
--  from. Free goods are the one payout in the system that moves physical stock
--  and the only one that never does -- the units leave the warehouse in real
--  life and the system goes on believing they are there.
--
--  Two columns fix it. No table is restructured and nothing existing changes
--  meaning: a scheme with no product named behaves exactly as it does today.
-- ════════════════════════════════════════════════════════════════════════


-- What the scheme gives away.
ALTER TABLE public.schemes
  ADD COLUMN IF NOT EXISTS "freeGoodsProduct" TEXT;

-- What a particular award consisted of, copied at the time it was earned.
-- Copied rather than looked up through schemeId on purpose: a scheme edited
-- next quarter must not silently rewrite what was given away last quarter.
ALTER TABLE public.distributor_incentives
  ADD COLUMN IF NOT EXISTS "incentiveProduct" TEXT;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT 'schemes with free goods but no product named' AS check,
       count(*) AS rows
FROM   public.schemes
WHERE  coalesce("freeGoodsQty", 0) > 0 AND "freeGoodsProduct" IS NULL
UNION ALL
SELECT 'free-goods incentives with no product recorded',
       count(*)
FROM   public.distributor_incentives
WHERE  "incentiveType" = 'Free Goods' AND "incentiveProduct" IS NULL;
-- Any rows here are schemes and awards made before this column existed. They
-- keep working; they simply cannot move stock until somebody says what the
-- goods are. Editing the scheme and naming the product is enough.


-- ── Record that this ran ────────────────────────────────────────────────
-- Every migration from here on ends with this. It is the whole point of
-- migrations/000_baseline.sql: the answer to "has this been applied?" should
-- be a query, not an audit.
--
-- The table is created here if it is missing rather than assumed. Running this
-- file before the baseline used to fail on the INSERT with
--
--     42P01: relation "public.schema_migrations" does not exist
--
-- after the ALTER TABLEs above had already succeeded -- so the change was made
-- and not recorded, which is precisely the state this whole scheme exists to
-- prevent. A migration must not depend on being run in the right order to be
-- able to say that it ran.
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('023_add_free_goods_product.sql',
        'schemes.freeGoodsProduct and distributor_incentives.incentiveProduct')
ON CONFLICT (filename) DO NOTHING;
