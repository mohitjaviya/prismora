-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — everyone who sells, invoices or handles orders can read the
--  product catalogue.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once.
--
--  WHAT IS WRONG
--
--  products_select allowed can_view on priceList, settings or inventory. Four
--  roles have none of the three — Sales, Sales Executive, Accounts and
--  Customer Support — so for them `products` returns no rows at all. Not an
--  error: an empty list, which every screen showed as "no products":
--
--    · Leads — "Products Interested In" and the convert-to-order dialog
--    · SFA — products pitched, and the order lines on a field visit
--    · Orders — the product picker
--    · Complaints — the product a complaint is about
--    · Accounting — the HSN code and GST rate an invoice takes from the
--      catalogue, which fell back to defaults instead
--
--  WHAT THIS DOES
--
--  Adds leads, sfa and orders to the modules that grant a read. Writing the
--  catalogue is unchanged: can_edit('settings') only.
--
--  What becomes readable is the whole row, price tiers included (MRP,
--  distributor, dealer and retailer price). A rep raising an order needs the
--  price to quote, and partners could already read these through priceList.
-- ════════════════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS products_select ON public.products;
CREATE POLICY products_select ON public.products
  FOR SELECT TO authenticated
  USING (
    public.can_view('priceList')
    OR public.can_view('settings')
    OR public.can_view('inventory')
    OR public.can_view('leads')
    OR public.can_view('sfa')
    OR public.can_view('orders')
  );

-- ── Record ───────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.schema_migrations (
  filename    text PRIMARY KEY,
  applied_at  timestamptz NOT NULL DEFAULT now(),
  note        text
);

INSERT INTO public.schema_migrations (filename, note)
VALUES ('036_products_readable_by_sales.sql',
        'products readable with leads, sfa or orders access, so sales, accounts and support see the catalogue')
ON CONFLICT (filename) DO NOTHING;
