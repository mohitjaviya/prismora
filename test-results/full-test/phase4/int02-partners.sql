-- P4-INT-02: every partner's stored balance vs invoices (amount+tax, proforma and tax) - payments - credit notes.
-- Built independently of partner_derived_balance(): partner taken from the invoice's own columns first, else its order.
WITH p AS (
  SELECT 'Distributor' kind, id, name, "outstandingAmount" stored FROM distributors
  UNION ALL SELECT 'Dealer', id, name, "outstandingAmount" FROM dealers
  UNION ALL SELECT 'Retailer', id, name, "outstandingAmount" FROM retailers
),
inv AS (
  SELECT coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") pid,
         sum(coalesce(i.amount,0) + coalesce(i.tax,0)) FILTER (WHERE i."invoiceType" = 'tax_invoice') tax_inv,
         sum(coalesce(i.amount,0) + coalesce(i.tax,0)) FILTER (WHERE i."invoiceType" IS DISTINCT FROM 'tax_invoice') proforma,
         count(*) n
  FROM invoices i LEFT JOIN orders o ON o.id = i."orderId" GROUP BY 1
),
pay AS (SELECT coalesce("distributorId","dealerId","retailerId") pid, sum(amount) v, count(*) n FROM distributor_payments GROUP BY 1),
cn  AS (SELECT coalesce("distributorId","dealerId","retailerId") pid, sum(amount) v, count(*) n FROM credit_notes GROUP BY 1)
SELECT p.kind, p.id, p.name, coalesce(inv.tax_inv,0) tax_inv, coalesce(inv.proforma,0) proforma, coalesce(pay.v,0) paid, coalesce(cn.v,0) credited,
       round(coalesce(inv.tax_inv,0)+coalesce(inv.proforma,0)-coalesce(pay.v,0)-coalesce(cn.v,0), 2) derived,
       coalesce(p.stored,0) stored,
       round(coalesce(p.stored,0) - (coalesce(inv.tax_inv,0)+coalesce(inv.proforma,0)-coalesce(pay.v,0)-coalesce(cn.v,0)), 2) diff,
       round(public.partner_derived_balance(p.id), 2) db_helper
FROM p LEFT JOIN inv ON inv.pid = p.id LEFT JOIN pay ON pay.pid = p.id LEFT JOIN cn ON cn.pid = p.id
ORDER BY abs(coalesce(p.stored,0) - (coalesce(inv.tax_inv,0)+coalesce(inv.proforma,0)-coalesce(pay.v,0)-coalesce(cn.v,0))) DESC, p.kind, p.id;
