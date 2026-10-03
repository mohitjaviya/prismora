-- P4-INT-01 (part 2): each source document vs the stock it moved (audit_log on inventory, tagged by via).
WITH inv_audit AS (
  SELECT coalesce(via,'') via,
         CASE action WHEN 'created' THEN (changes->>'quantity')::numeric
                     WHEN 'changed' THEN (changes->'quantity'->>1)::numeric - (changes->'quantity'->>0)::numeric
                     ELSE -(changes->>'quantity')::numeric END d
  FROM audit_log WHERE table_name = 'inventory' AND (action <> 'changed' OR changes ? 'quantity')
),
grn_lines AS (
  SELECT g.id, g."poId", g."createdAt", sum(coalesce(nullif(l->>'receivedQty','')::numeric, nullif(l->>'quantity','')::numeric, 0)) qty
  FROM grn g LEFT JOIN LATERAL jsonb_array_elements(coalesce(g.items,'[]')) l ON true GROUP BY 1,2,3
),
grn_chk AS (
  SELECT 'GRN' kind, g.id doc, g."createdAt"::date dt, g.qty doc_qty, NULL::numeric movements,
         (SELECT sum(d) FROM inv_audit a WHERE a.via = 'goods receipt ' || g.id) stock_moved
  FROM grn_lines g
),
deliv AS (
  SELECT 'delivery' kind, o.id doc, o."fulfilledAt"::date dt,
         coalesce(nullif(o."deliveredQty",0), CASE WHEN jsonb_array_length(coalesce(o.items,'[]')) > 0
              THEN (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(o.items) x) ELSE o.quantity END) doc_qty,
         (SELECT sum(quantity) FROM stock_movements m WHERE m."orderId" = o.id AND m.kind = 'delivery') movements,
         (SELECT -sum(d) FROM inv_audit a WHERE a.via = 'delivery of order ' || o.id) stock_moved
  FROM orders o WHERE o.status = 'Delivered'
),
sret AS (
  SELECT 'sales return' kind, r.id doc, r."createdAt"::date dt,
         (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(coalesce(r.lines,'[]')) x) doc_qty,
         (SELECT sum(quantity) FROM stock_movements m WHERE m."returnId" = r.id AND m.kind = 'return') movements,
         (SELECT sum(d) FROM inv_audit a WHERE a.via LIKE 'sales return ' || r.id || '%') stock_moved
  FROM sales_returns r
),
pret AS (
  SELECT 'purchase return' kind, p.id doc, p."createdAt"::date dt,
         (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(coalesce(p.items,'[]')) x) doc_qty,
         (SELECT sum(quantity) FROM stock_movements m WHERE m."returnId" = p.id AND m.kind = 'purchase_return') movements,
         (SELECT -sum(d) FROM inv_audit a WHERE a.via LIKE 'purchase return ' || p.id || ' to%') stock_moved
  FROM purchase_returns p
)
SELECT kind, doc, dt, doc_qty, movements, stock_moved,
  CASE WHEN coalesce(doc_qty,0) = 0 AND coalesce(stock_moved,0) = 0 THEN 'no items'
       WHEN stock_moved IS NULL THEN 'NO STOCK MOVE'
       WHEN stock_moved <> doc_qty THEN 'QTY MISMATCH'
       WHEN kind <> 'GRN' AND movements IS DISTINCT FROM stock_moved THEN 'movement log differs'
       ELSE 'ok' END verdict
FROM (SELECT * FROM grn_chk UNION ALL SELECT * FROM deliv UNION ALL SELECT * FROM sret UNION ALL SELECT * FROM pret) x
ORDER BY 7 DESC, 1, 3, 2;
