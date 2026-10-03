-- P4-INT-03: duplicates. Each row = one check; n = offending count; detail = the offenders.
WITH po_lines AS (
  SELECT po.id, l->>'product' product, sum(coalesce(nullif(l->>'quantity','')::numeric,0)) ordered
  FROM purchase_orders po, jsonb_array_elements(coalesce(po.items,'[]')) l GROUP BY 1,2
), grn_lines AS (
  SELECT g."poId" id, l->>'product' product, sum(coalesce(nullif(l->>'receivedQty','')::numeric, nullif(l->>'quantity','')::numeric, 0)) received, string_agg(DISTINCT g.id, ',') grns
  FROM grn g, jsonb_array_elements(coalesce(g.items,'[]')) l WHERE g."poId" IS NOT NULL GROUP BY 1,2
), checks AS (
  SELECT 'orders with >1 invoice' c, string_agg("orderId"||' x'||n, ', ') d, count(*) n FROM (SELECT "orderId", count(*) n FROM invoices WHERE "orderId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL SELECT 'orders with >1 tax invoice', string_agg("orderId", ', '), count(*) FROM (SELECT "orderId" FROM invoices WHERE "invoiceType"='tax_invoice' AND "orderId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL SELECT 'invoices pointing at a missing order', string_agg(i.id, ', '), count(*) FROM invoices i WHERE i."orderId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM orders o WHERE o.id = i."orderId")
  UNION ALL SELECT 'delivered orders with no invoice', string_agg(o.id, ', '), count(*) FROM orders o WHERE o.status='Delivered' AND NOT EXISTS (SELECT 1 FROM invoices i WHERE i."orderId" = o.id)
  UNION ALL SELECT 'GRN lines received > PO ordered', string_agg(g.id||' '||g.product||' '||g.received||'/'||coalesce(p.ordered,0)||' ('||g.grns||')', '; '), count(*) FROM grn_lines g LEFT JOIN po_lines p ON p.id=g.id AND lower(p.product)=lower(g.product) WHERE g.received > coalesce(p.ordered,0)
  UNION ALL SELECT 'GRNs pointing at a missing PO', string_agg(g.id||'->'||g."poId", ', '), count(*) FROM grn g WHERE g."poId" IS NOT NULL AND NOT EXISTS (SELECT 1 FROM purchase_orders p WHERE p.id=g."poId")
  UNION ALL SELECT 'GRN stock added more than once (audit)', string_agg(v, ', '), count(*) FROM (SELECT via v FROM audit_log WHERE table_name='inventory' AND via LIKE 'goods receipt%' GROUP BY via, row_id HAVING count(*) > 1) x
  UNION ALL SELECT 'same GRN content twice (PO+items within 10 min)', string_agg(a.id||'='||b.id, ', '), count(*) FROM grn a JOIN grn b ON a.id < b.id AND a."poId" IS NOT DISTINCT FROM b."poId" AND a.items = b.items AND abs(extract(epoch FROM a."createdAt"-b."createdAt")) < 600
  UNION ALL SELECT 'delivery stock taken twice per order+batch', string_agg("orderId"||'/'||"inventoryId", ', '), count(*) FROM (SELECT "orderId","inventoryId" FROM stock_movements WHERE kind='delivery' GROUP BY 1,2 HAVING count(*) > 1) x
  UNION ALL SELECT 'delivery audited twice per order (before log)', string_agg(v, ', '), count(*) FROM (SELECT via v FROM audit_log WHERE table_name='inventory' AND via LIKE 'delivery of order%' GROUP BY via, row_id HAVING count(*) > 1) x
  UNION ALL SELECT 'sales returns with >1 credit note / CN missing', string_agg(r.id, ', '), count(*) FROM sales_returns r WHERE (SELECT count(*) FROM credit_notes c WHERE c.id = r."creditNoteId") <> 1
  UNION ALL SELECT 'sales-return CNs with no return', string_agg(c.id, ', '), count(*) FROM credit_notes c WHERE c.id LIKE 'CN-SR-%' AND NOT EXISTS (SELECT 1 FROM sales_returns r WHERE r."creditNoteId" = c.id)
  UNION ALL SELECT 'returned qty > delivered qty per order', string_agg(x.o, ', '), count(*) FROM (
      SELECT r."orderId" o FROM sales_returns r, jsonb_array_elements(r.lines) l GROUP BY 1
      HAVING sum((l->>'quantity')::numeric) > (SELECT coalesce(nullif(o."deliveredQty",0), CASE WHEN jsonb_array_length(coalesce(o.items,'[]'))>0 THEN (SELECT sum((x->>'quantity')::numeric) FROM jsonb_array_elements(o.items) x) ELSE o.quantity END) FROM orders o WHERE o.id = r."orderId")) x
  UNION ALL SELECT 'payments per invoice (PAY-INV-…) > 1', string_agg(id, ', '), count(*) FROM (SELECT id FROM distributor_payments GROUP BY id HAVING count(*) > 1) x
  UNION ALL SELECT 'parents with >1 open backorder', string_agg("splitFromOrderId", ', '), count(*) FROM (SELECT "splitFromOrderId" FROM orders WHERE "splitFromOrderId" IS NOT NULL AND status NOT IN ('Delivered','Cancelled') GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL SELECT 'leads with >1 order', string_agg("leadId", ', '), count(*) FROM (SELECT "leadId" FROM orders WHERE "leadId" IS NOT NULL GROUP BY 1 HAVING count(*) > 1) x
  UNION ALL SELECT 'incentives earned twice for an order+scheme', string_agg(d, ', '), count(*) FROM (SELECT coalesce(i."orderId",'?')||'/'||coalesce(i."schemeId",'?') d FROM distributor_incentives i GROUP BY i."orderId", i."schemeId" HAVING count(*) > 1) x
  UNION ALL SELECT 'scheme claims settled twice (expense per claim)', string_agg(d, ', '), count(*) FROM (SELECT description d FROM expenses WHERE description ILIKE '%claim%' GROUP BY description, amount HAVING count(*) > 1) x
)
SELECT c check_name, n, left(coalesce(d,''), 400) detail FROM checks ORDER BY n DESC, c;
