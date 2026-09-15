-- PRISMORA — delivery addresses. Run once in the Supabase SQL editor.
--
-- Goods cannot be dispatched to a state and a city. Vendors — the people we buy
-- FROM — already carry a full address; the distributors, dealers and retailers
-- we deliver TO carry only state and city, and an order carries no address at
-- all. Dispatch marks an order Shipped and Delivered with nothing on file
-- saying where it went.
--
-- Two levels, because they answer different questions:
--   the partner's registered address — where they normally receive goods
--   the order's delivery address     — where this consignment actually goes,
--                                      which is often a godown rather than the
--                                      registered office, or the shop itself
--                                      for an order taken on a field visit
--
-- Safe to run more than once.

ALTER TABLE distributors ADD COLUMN IF NOT EXISTS "address" TEXT DEFAULT '';
ALTER TABLE distributors ADD COLUMN IF NOT EXISTS "pincode" TEXT DEFAULT '';

ALTER TABLE dealers      ADD COLUMN IF NOT EXISTS "address" TEXT DEFAULT '';
ALTER TABLE dealers      ADD COLUMN IF NOT EXISTS "pincode" TEXT DEFAULT '';

ALTER TABLE retailers    ADD COLUMN IF NOT EXISTS "address" TEXT DEFAULT '';
ALTER TABLE retailers    ADD COLUMN IF NOT EXISTS "pincode" TEXT DEFAULT '';

ALTER TABLE orders       ADD COLUMN IF NOT EXISTS "deliveryAddress" TEXT DEFAULT '';
ALTER TABLE orders       ADD COLUMN IF NOT EXISTS "deliveryPincode" TEXT DEFAULT '';
