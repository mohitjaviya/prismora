-- P4-INT-02 (c): are stored invoice status/amountPaid what the DB's own rule gives today?
-- Snapshot, recompute for every partner and every partner-less invoice, compare, then RAISE so all of it rolls back.
DO $chk$
DECLARE r text; x record;
BEGIN
  CREATE TEMP TABLE snap AS SELECT id, status, "amountPaid" FROM invoices;
  FOR x IN SELECT id FROM distributors UNION ALL SELECT id FROM dealers UNION ALL SELECT id FROM retailers LOOP
    PERFORM public.recompute_invoice_statuses(x.id, NULL);
  END LOOP;
  FOR x IN SELECT i.id FROM invoices i LEFT JOIN orders o ON o.id = i."orderId"
           WHERE coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") IS NULL LOOP
    PERFORM public.recompute_invoice_statuses(NULL, x.id);
  END LOOP;
  SELECT coalesce(string_agg(format('%s | %s | %s -> %s | paid %s -> %s', i.id, i."customerName", s.status, i.status, s."amountPaid", i."amountPaid"), E'\n' ORDER BY i.id), '(none)')
    INTO r FROM invoices i JOIN snap s ON s.id = i.id
   WHERE s.status IS DISTINCT FROM i.status OR coalesce(s."amountPaid", 0) <> coalesce(i."amountPaid", 0);
  RAISE EXCEPTION E'P4REPORT\n%', r;
END $chk$;
