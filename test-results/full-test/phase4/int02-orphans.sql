-- P4-INT-02 (b): money documents that point at no partner, or at a partner that no longer exists (they would fall out of every balance).
WITH ids AS (SELECT id FROM distributors UNION ALL SELECT id FROM dealers UNION ALL SELECT id FROM retailers)
SELECT 'invoice' doc, i.id, coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") pid,
       i."customerName" who, coalesce(i.amount,0)+coalesce(i.tax,0) v, i."invoiceType" t
FROM invoices i LEFT JOIN orders o ON o.id = i."orderId"
WHERE coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") IS NULL
   OR coalesce(i."distributorId", i."dealerId", i."retailerId", o."distributorId", o."dealerId", o."retailerId") NOT IN (SELECT id FROM ids)
UNION ALL
SELECT 'payment', id, coalesce("distributorId","dealerId","retailerId"), NULL, amount, NULL FROM distributor_payments
WHERE coalesce("distributorId","dealerId","retailerId") IS NULL OR coalesce("distributorId","dealerId","retailerId") NOT IN (SELECT id FROM ids)
UNION ALL
SELECT 'credit note', id, coalesce("distributorId","dealerId","retailerId"), "customerName", amount, "invoiceId" FROM credit_notes
WHERE coalesce("distributorId","dealerId","retailerId") IS NULL OR coalesce("distributorId","dealerId","retailerId") NOT IN (SELECT id FROM ids)
ORDER BY 1, 2;
