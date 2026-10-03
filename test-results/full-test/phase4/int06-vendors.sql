-- P4-INT-06: vendor balance = GRN value (qty x unit cost) - purchase returns - vendor payments, rebuilt without the DB helpers.
WITH g AS (
  SELECT coalesce(po."vendorId", (SELECT v.id FROM vendors v WHERE lower(btrim(v.name)) = lower(btrim(g."vendorName")) ORDER BY v.id LIMIT 1)) vid,
         count(*) n, count(*) FILTER (WHERE po.id IS NULL) by_name,
         sum((SELECT coalesce(sum(coalesce(nullif(l->>'quantity','')::numeric, nullif(l->>'receivedQty','')::numeric, 0) * coalesce(nullif(l->>'unitCost','')::numeric, 0)), 0)
              FROM jsonb_array_elements(coalesce(g.items,'[]')) l)) v
  FROM grn g LEFT JOIN purchase_orders po ON po.id = g."poId" GROUP BY 1
),
r AS (SELECT "vendorId" vid, sum(value) v, count(*) n FROM purchase_returns GROUP BY 1),
p AS (SELECT "vendorId" vid, sum(amount) v, count(*) n FROM vendor_payments GROUP BY 1)
SELECT v.id, v.name, coalesce(g.n,0) grns, coalesce(g.by_name,0) grn_by_name, coalesce(g.v,0) received, coalesce(r.v,0) returned, coalesce(p.v,0) paid,
       round(coalesce(g.v,0)-coalesce(r.v,0)-coalesce(p.v,0), 2) derived, coalesce(v."outstandingAmount",0) stored,
       round(coalesce(v."outstandingAmount",0)-(coalesce(g.v,0)-coalesce(r.v,0)-coalesce(p.v,0)), 2) diff
FROM vendors v LEFT JOIN g ON g.vid = v.id LEFT JOIN r ON r.vid = v.id LEFT JOIN p ON p.vid = v.id
UNION ALL
SELECT '(no vendor)', 'GRNs/returns/payments matching no vendor', g.n, g.by_name, g.v, NULL, NULL, NULL, NULL, NULL FROM g WHERE g.vid IS NULL
ORDER BY 10 DESC NULLS FIRST, 1;
