-- PRISMORA — territory on orders. Run once in the Supabase SQL editor.
--
-- Orders record a state and a city but not the territory they belong to, so a
-- field order raised on a beat loses the one piece of routing information the
-- beat already knew. Territory coverage and geography reporting then have to
-- guess it back from the state, which is coarser and often wrong where one
-- state holds several territories.
--
-- Safe to run more than once.

ALTER TABLE orders ADD COLUMN IF NOT EXISTS "territory" TEXT;
