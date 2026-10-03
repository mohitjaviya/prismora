-- P4-INT-01 (part 1): every inventory batch rebuilt from its audit trail.
-- opening = quantity when auditing first saw the row (0 if created after audit began on 2026-09-25)
-- flows by source (audit_log.via): goods receipt / delivery / sales return / purchase return (+withdrawn) / app (browser: add, adjust, count, transfer, edit) / other
-- gaps = a change whose "before" differs from the previous "after" (a write the audit did not see)
WITH ev AS (
  SELECT a.row_id, a.id, a.at, a.action, coalesce(a.via, '') via,
         CASE a.action WHEN 'created' THEN 0 WHEN 'changed' THEN (a.changes->'quantity'->>0)::numeric ELSE (a.changes->>'quantity')::numeric END q_old,
         CASE a.action WHEN 'created' THEN (a.changes->>'quantity')::numeric WHEN 'changed' THEN (a.changes->'quantity'->>1)::numeric ELSE 0 END q_new
  FROM audit_log a
  WHERE a.table_name = 'inventory' AND (a.action <> 'changed' OR a.changes ? 'quantity')
), ch AS (
  SELECT ev.*, lag(q_new) OVER w prev_new, row_number() OVER w rn, q_new - q_old d,
         CASE WHEN via LIKE 'goods receipt%' THEN 'grn' WHEN via LIKE 'delivery of order%' THEN 'delivery'
              WHEN via LIKE 'sales return%' THEN 'sales_return' WHEN via LIKE 'purchase return%withdrawn' THEN 'pr_withdrawn'
              WHEN via LIKE 'purchase return%' THEN 'purchase_return' WHEN via = '' THEN 'app' ELSE 'other' END src
  FROM ev WINDOW w AS (PARTITION BY row_id ORDER BY at, id)
), per AS (
  SELECT row_id,
    max(CASE WHEN rn = 1 THEN CASE WHEN action = 'created' THEN 0 ELSE q_old END END) opening,
    bool_or(rn = 1 AND action <> 'created') pre_audit,
    sum(d) FILTER (WHERE src = 'grn') grn, sum(d) FILTER (WHERE src = 'delivery') delivery,
    sum(d) FILTER (WHERE src = 'sales_return') sales_ret, sum(d) FILTER (WHERE src = 'purchase_return') purch_ret,
    sum(d) FILTER (WHERE src = 'pr_withdrawn') pr_withdrawn, sum(d) FILTER (WHERE src = 'app') app,
    sum(d) FILTER (WHERE src = 'other') other,
    count(*) FILTER (WHERE rn > 1 AND prev_new IS DISTINCT FROM q_old) gaps,
    (array_agg(q_new ORDER BY at DESC, id DESC))[1] last_after,
    bool_or(action = 'deleted') deleted
  FROM ch GROUP BY row_id
)
SELECT coalesce(i.id, p.row_id) id, coalesce(i.product, '(deleted)') product, i."batchNumber" batch,
       CASE WHEN p.row_id IS NULL THEN 'NO AUDIT' WHEN p.pre_audit THEN 'pre-audit' ELSE '' END hist,
       coalesce(p.opening, i.quantity) opening, coalesce(p.grn,0) grn, coalesce(p.delivery,0) deliv, coalesce(p.sales_ret,0) s_ret,
       coalesce(p.purch_ret,0) p_ret, coalesce(p.pr_withdrawn,0) p_wd, coalesce(p.app,0) app, coalesce(p.other,0) other,
       coalesce(p.opening,0)+coalesce(p.grn,0)+coalesce(p.delivery,0)+coalesce(p.sales_ret,0)+coalesce(p.purch_ret,0)+coalesce(p.pr_withdrawn,0)+coalesce(p.app,0)+coalesce(p.other,0) rebuilt,
       i.quantity now, coalesce(p.gaps,0) gaps,
       CASE WHEN i.id IS NULL THEN 'deleted row'
            WHEN p.row_id IS NULL THEN 'no audit trail'
            WHEN p.gaps > 0 THEN 'UNAUDITED WRITE'
            WHEN p.last_after <> i.quantity THEN 'END MISMATCH'
            ELSE 'ok' END verdict
FROM inventory i FULL JOIN per p ON p.row_id = i.id
ORDER BY 16 DESC, 2, 3;
