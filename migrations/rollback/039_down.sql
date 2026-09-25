-- Undo 039_delivery_invoicing_in_database.sql. Safe to run more than once.
-- Delivery goes back to the browser, invoices lose their type and lines,
-- order ids go back to "highest + 1" (run with the app code from before 039).
DROP TRIGGER IF EXISTS orders_on_delivery ON public.orders;
DROP TRIGGER IF EXISTS orders_assign_id ON public.orders;
DROP FUNCTION IF EXISTS public.orders_on_delivery();
DROP FUNCTION IF EXISTS public.orders_assign_id();
DROP FUNCTION IF EXISTS public.convert_to_tax_invoice(text);
DROP FUNCTION IF EXISTS public.create_invoice(text, text, numeric, boolean, numeric, timestamptz);
DROP FUNCTION IF EXISTS public.can_raise_invoices();
DROP FUNCTION IF EXISTS public.insert_invoice_for_order(public.orders, text, boolean, timestamptz, text);
DROP FUNCTION IF EXISTS public.deduct_stock(text, jsonb);
DROP FUNCTION IF EXISTS public.charge_party(text, text, text, numeric);
DROP FUNCTION IF EXISTS public.gst_total(jsonb);
DROP FUNCTION IF EXISTS public.lines_with_gst(jsonb);
DROP FUNCTION IF EXISTS public.lines_missing_tax_details(jsonb);
DROP FUNCTION IF EXISTS public.order_lines(public.orders);
ALTER TABLE public.orders ALTER COLUMN id DROP DEFAULT;
DROP FUNCTION IF EXISTS public.next_order_id();
DROP SEQUENCE IF EXISTS public.order_number_seq;
DROP INDEX IF EXISTS public.invoices_one_per_order;
ALTER TABLE public.invoices DROP CONSTRAINT IF EXISTS invoices_invoice_type_check;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS "invoiceType";
ALTER TABLE public.invoices DROP COLUMN IF EXISTS lines;
ALTER TABLE public.invoices DROP COLUMN IF EXISTS "contactName";
ALTER TABLE public.invoices DROP COLUMN IF EXISTS "convertedAt";
ALTER TABLE public.invoices DROP COLUMN IF EXISTS "convertedBy";
DELETE FROM public.schema_migrations WHERE filename = '039_delivery_invoicing_in_database.sql';
