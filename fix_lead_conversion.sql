-- PRISMORA — lead conversion repair. Run once in the Supabase SQL editor.
--
-- Two columns the application writes that were never declared.
--
-- leads."orderCreated" is set when a lead is converted, to stop a second order
-- being raised for the same lead. Because the column does not exist, PostgREST
-- rejects the whole UPDATE (PGRST204 / 42703) — so converting a lead currently
-- creates the order but never saves the lead's new status. On the next refresh
-- the lead reappears in its old column, and converting it again raises another
-- duplicate order.
--
-- orders."leadId" records which lead an order came from. Without it, rolling a
-- lead back out of conversion has to find its order by matching the customer
-- name, which can delete the wrong order.
--
-- Safe to run more than once.

ALTER TABLE leads  ADD COLUMN IF NOT EXISTS "orderCreated" BOOLEAN DEFAULT false;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "leadId" TEXT;

-- Existing leads predate the flag; treat them as not yet converted.
UPDATE leads SET "orderCreated" = false WHERE "orderCreated" IS NULL;
