-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — the two product fields the screen collects and the table lacks.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS BROKEN WITHOUT THIS
--
--  The Product Catalogue form has an SKU / Barcode field and a Status field.
--  The products table has neither column. PostgREST does not ignore an unknown
--  key -- it refuses the whole statement -- so every save was rejected:
--
--      PATCH /rest/v1/products?id=eq.P1
--      {"code":"PGRST204","message":"Could not find the 'sku' column of
--       'products' in the schema cache"}
--
--  Confirmed against this database on 2026-09-20 with the exact payload the
--  form sends. Both columns fail on their own as well as together.
--
--  Nothing on screen said so. The edit appeared to work, localStorage kept it,
--  and the catalogue reverted on the next machine or the next cache clear.
--  This is the same failure that lost every Master Lists change until
--  ADD_MASTER_COLOURS.sql was run: an unknown column is not ignored, it is
--  fatal to the write.
--
--  SKU is also searched on and exported, so until now the search matched
--  nothing and the exported column was blank for every product.
-- ════════════════════════════════════════════════════════════════════════


ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "sku"    TEXT;
ALTER TABLE public.products ADD COLUMN IF NOT EXISTS "status" TEXT DEFAULT 'Active';


-- Everything already in the catalogue is being sold, so say so rather than
-- leaving the column null and letting each screen invent its own default.
UPDATE public.products SET "status" = 'Active' WHERE "status" IS NULL;


-- ── Confirm ─────────────────────────────────────────────────────────────
SELECT count(*)                                   AS products,
       count(*) FILTER (WHERE "status" IS NOT NULL) AS with_status,
       count(*) FILTER (WHERE "sku" IS NOT NULL)    AS with_sku
FROM   public.products;
-- Expected: products and with_status equal. with_sku is 0 until somebody types
-- one, which they can now do and have it stick.
