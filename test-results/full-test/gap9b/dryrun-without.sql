BEGIN;

-- BEFORE 095: an old lead with a bad phone cannot be edited at all (094's CHECK is tested on every update).
DO $$
BEGIN
  BEGIN
    UPDATE public.leads SET notes = notes WHERE id = 'L26';
    RAISE NOTICE 'PRE-1 old bad-phone lead update before 095: allowed';
  EXCEPTION WHEN check_violation THEN
    RAISE NOTICE 'PRE-1 old bad-phone lead update before 095: REFUSED (094 CHECK)';
  END;
END $$;

CREATE TEMP TABLE t_res (n text, ok boolean, detail text) ON COMMIT DROP;

CREATE OR REPLACE FUNCTION pg_temp.expect(n text, sql text, pat text) RETURNS void LANGUAGE plpgsql AS $f$
BEGIN
  BEGIN
    EXECUTE sql;
    INSERT INTO t_res VALUES (n, pat IS NULL, CASE WHEN pat IS NULL THEN 'allowed' ELSE 'NOT REFUSED' END);
  EXCEPTION WHEN OTHERS THEN
    INSERT INTO t_res VALUES (n, pat IS NOT NULL AND SQLERRM ILIKE '%'||pat||'%', left(SQLERRM, 110));
  END;
END $f$;

-- mobile rule
SELECT pg_temp.expect('M1 9876543210 ok', $q$SELECT 1 WHERE public.is_indian_mobile('9876543210') OR (1/0)=1$q$, NULL);
SELECT pg_temp.expect('M2 +91 98765-43210 ok', $q$SELECT 1 WHERE public.is_indian_mobile('+91 98765-43210') OR (1/0)=1$q$, NULL);
SELECT pg_temp.expect('M3 919876543210 ok', $q$SELECT 1 WHERE public.is_indian_mobile('919876543210') OR (1/0)=1$q$, NULL);
SELECT pg_temp.expect('M4 09876543210 ok', $q$SELECT 1 WHERE public.is_indian_mobile('09876543210') OR (1/0)=1$q$, NULL);
SELECT pg_temp.expect('M5 landline 02212345678 refused', $q$SELECT 1 WHERE NOT public.is_indian_mobile('02212345678') OR (1/0)=1$q$, NULL);
SELECT pg_temp.expect('M6 1234567890 refused', $q$SELECT 1 WHERE NOT public.is_indian_mobile('1234567890') OR (1/0)=1$q$, NULL);

-- old bad rows stay editable, a changed bad phone is refused
SELECT pg_temp.expect('L1 old bad-phone lead, other edit allowed', $q$UPDATE public.leads SET notes = notes WHERE id = 'L26'$q$, NULL);
SELECT pg_temp.expect('L2 lead bad phone refused', $q$UPDATE public.leads SET phone = '12345' WHERE id = 'L26'$q$, 'not valid');
SELECT pg_temp.expect('L3 lead spaced mobile allowed', $q$UPDATE public.leads SET phone = '98765 43210' WHERE id = 'L26'$q$, NULL);
SELECT pg_temp.expect('L4 lead bad email refused', $q$UPDATE public.leads SET email = 'bad' WHERE id = 'L26'$q$, 'not valid');
SELECT pg_temp.expect('L5 lead deal value over 10 crore refused', $q$UPDATE public.leads SET "dealValue" = 100000001 WHERE id = 'L1'$q$, 'leads_deal_value_max');
SELECT pg_temp.expect('L6 lead deal value 0 allowed', $q$UPDATE public.leads SET "dealValue" = 0 WHERE id = 'L1'$q$, NULL);

-- orders
SELECT pg_temp.expect('O1 old bad-phone order, other edit allowed', $q$UPDATE public.orders SET "deliveryAddress" = "deliveryAddress" WHERE id = 'O5'$q$, NULL);
SELECT pg_temp.expect('O2 order bad phone refused', $q$UPDATE public.orders SET phone = '123' WHERE id = 'O5'$q$, 'not valid');
SELECT pg_temp.expect('O3 order +91 phone allowed', $q$UPDATE public.orders SET phone = '+91 9876543210' WHERE id = 'O5'$q$, NULL);
SELECT pg_temp.expect('O4 order bad email refused', $q$UPDATE public.orders SET email = 'x@y' WHERE id = 'O5'$q$, 'not valid');
SELECT pg_temp.expect('O5 order value 0 refused', $q$UPDATE public.orders SET value = 0 WHERE id = 'O5'$q$, 'orders_value_positive');
SELECT pg_temp.expect('O6 order value over 10 crore refused', $q$UPDATE public.orders SET value = 100000001 WHERE id = 'O5'$q$, 'orders_value_max');
SELECT pg_temp.expect('O7 order quantity over 1,00,000 refused', $q$UPDATE public.orders SET quantity = 100001 WHERE id = 'O5'$q$, 'orders_quantity_max');
SELECT pg_temp.expect('O8 order line decimal refused', $q$UPDATE public.orders SET items = '[{"name":"X","quantity":1.5,"unitPrice":10}]'::jsonb WHERE id = 'O5'$q$, 'whole number');
SELECT pg_temp.expect('O9 order line over 1,00,000 refused', $q$UPDATE public.orders SET items = '[{"name":"X","quantity":100001,"unitPrice":1}]'::jsonb WHERE id = 'O5'$q$, '1,00,000');
SELECT pg_temp.expect('O10 order line 0 refused', $q$UPDATE public.orders SET items = '[{"name":"X","quantity":0,"unitPrice":1}]'::jsonb WHERE id = 'O5'$q$, 'above 0');

-- complaints
SELECT pg_temp.expect('C1 old bad-phone complaint, other edit allowed', $q$UPDATE public.complaints SET description = description WHERE id = 'CMP-1'$q$, NULL);
SELECT pg_temp.expect('C2 complaint bad phone refused', $q$UPDATE public.complaints SET "customerPhone" = '555' WHERE id = 'CMP-1'$q$, 'not valid');

-- partners and vendors: no landlines
SELECT pg_temp.expect('P1 old bad-phone dealer, other edit allowed', $q$UPDATE public.dealers SET "contactPerson" = "contactPerson" WHERE id = 'DEAL-1790054296840'$q$, NULL);
SELECT pg_temp.expect('P2 dealer landline refused', $q$UPDATE public.dealers SET phone = '02212345678' WHERE id = 'DEAL-1790054296840'$q$, 'not valid');
SELECT pg_temp.expect('P3 dealer mobile allowed', $q$UPDATE public.dealers SET phone = '9876543210' WHERE id = 'DEAL-1790054296840'$q$, NULL);
SELECT pg_temp.expect('P4 vendor landline refused', $q$UPDATE public.vendors SET phone = '07926543210x' WHERE id = 'V1790054615576'$q$, 'not valid');
SELECT pg_temp.expect('P5 distributor bad email refused', $q$UPDATE public.distributors SET email = 'nope' WHERE id = 'DIST-1789982501250'$q$, 'not valid');

-- stock
SELECT pg_temp.expect('S1 batch quantity over 1,00,000 refused', $q$UPDATE public.inventory SET quantity = 100001 WHERE id = (SELECT id FROM public.inventory LIMIT 1)$q$, 'inventory_counts_max');
SELECT pg_temp.expect('S2 batch quantity NULL refused', $q$UPDATE public.inventory SET quantity = NULL WHERE id = (SELECT id FROM public.inventory LIMIT 1)$q$, 'inventory_quantity_required');
SELECT pg_temp.expect('S3 adjustment movement over 1,00,000 refused', $q$INSERT INTO public.stock_movements (kind, "inventoryId", product, quantity, note) SELECT 'adjustment', id, product, 100001, 'x' FROM public.inventory LIMIT 1$q$, 'cannot be more than 1,00,000');
SELECT pg_temp.expect('S4 adjustment movement -100001 refused', $q$INSERT INTO public.stock_movements (kind, "inventoryId", product, quantity, note) SELECT 'adjustment', id, product, -100001, 'x' FROM public.inventory LIMIT 1$q$, 'cannot be more than 1,00,000');
SELECT pg_temp.expect('S5 adjustment movement 5 allowed', $q$INSERT INTO public.stock_movements (kind, "inventoryId", product, quantity, note) SELECT 'adjustment', id, product, 5, 'x' FROM public.inventory LIMIT 1$q$, NULL);

-- amounts
SELECT pg_temp.expect('A1 payment over 10 crore refused', $q$UPDATE public.distributor_payments SET amount = 100000001 WHERE id = (SELECT id FROM public.distributor_payments LIMIT 1)$q$, 'distributor_payments_amount_max');
SELECT pg_temp.expect('A2 expense over 10 crore refused', $q$UPDATE public.expenses SET amount = 100000001 WHERE id = (SELECT id FROM public.expenses LIMIT 1)$q$, 'expenses_amount_max');
SELECT pg_temp.expect('A3 product price over 10 crore refused', $q$UPDATE public.products SET mrp = 100000001 WHERE id = (SELECT id FROM public.products LIMIT 1)$q$, 'products_prices_max');
SELECT pg_temp.expect('A4 scheme discount over 100 refused (already 078)', $q$UPDATE public.schemes SET "discountPct" = 101 WHERE id = (SELECT id FROM public.schemes LIMIT 1)$q$, 'schemes_discount_0_100');

SELECT n, ok, detail FROM t_res ORDER BY n;

ROLLBACK;
