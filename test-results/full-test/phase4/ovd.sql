-- RISK-OVD: is Overdue stored in the DB and current? (read-only)
WITH j AS (SELECT jobname, schedule, active FROM cron.job WHERE jobname = 'invoice-status-nightly'),
r AS (SELECT status, start_time, end_time FROM cron.job_run_details d JOIN cron.job c ON c.jobid = d.jobid
      WHERE c.jobname = 'invoice-status-nightly' ORDER BY start_time DESC LIMIT 5),
inv AS (
  SELECT i.id, i.status, i."dueDate", i."invoiceType", i."createdAt",
         (i."dueDate" AT TIME ZONE 'Asia/Kolkata')::date < (now() AT TIME ZONE 'Asia/Kolkata')::date AS past_due
  FROM invoices i)
SELECT 'job' k, (SELECT row_to_json(j)::text FROM j) v
UNION ALL SELECT 'last_runs', (SELECT json_agg(r)::text FROM r)
UNION ALL SELECT 'by_status', (SELECT json_agg(x)::text FROM (SELECT status, "invoiceType", count(*) n, count(*) FILTER (WHERE past_due) past_due, count(*) FILTER (WHERE "dueDate" IS NULL) no_due FROM inv GROUP BY 1,2 ORDER BY 1,2) x)
UNION ALL SELECT 'past_due_not_overdue_open', (SELECT json_agg(x)::text FROM (SELECT id, status, "invoiceType", "dueDate" FROM inv WHERE past_due AND status IN ('Unpaid','Partially Paid')) x)
UNION ALL SELECT 'overdue_not_past_due', (SELECT json_agg(x)::text FROM (SELECT id, status, "dueDate" FROM inv WHERE status='Overdue' AND NOT coalesce(past_due,false)) x)
UNION ALL SELECT 'status_values', (SELECT json_agg(DISTINCT status)::text FROM invoices)
UNION ALL SELECT 'invoice_cols', (SELECT string_agg(column_name, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='invoices');
