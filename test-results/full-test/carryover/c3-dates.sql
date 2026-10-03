-- C3: which rows sit in the 00:00-05:30 IST window that the Reports "from" date drops (read-only)
WITH ist AS (SELECT 'Asia/Kolkata'::text tz)
SELECT 'orders_by_date_type' k, (SELECT data_type FROM information_schema.columns WHERE table_name='orders' AND column_name='date') v
UNION ALL SELECT 'orders_with_date', (SELECT count(*)::text FROM orders WHERE coalesce("date"::text,'')<>'')
UNION ALL SELECT 'orders_early_ist', (SELECT count(*)::text FROM orders WHERE coalesce("date"::text,'')='' AND ("createdAt" AT TIME ZONE 'Asia/Kolkata')::time < '05:30')
UNION ALL SELECT 'invoices_early_ist', (SELECT count(*)::text||' e.g. '||coalesce(min(id),'-') FROM invoices WHERE ("createdAt" AT TIME ZONE 'Asia/Kolkata')::time < '05:30')
UNION ALL SELECT 'leads_early_ist', (SELECT count(*)::text FROM leads WHERE ("createdAt" AT TIME ZONE 'Asia/Kolkata')::time < '05:30')
UNION ALL SELECT 'credit_notes_early_ist', (SELECT count(*)::text FROM credit_notes WHERE ("createdAt" AT TIME ZONE 'Asia/Kolkata')::time < '05:30')
UNION ALL SELECT 'expenses_date_type', (SELECT data_type FROM information_schema.columns WHERE table_name='expenses' AND column_name='date')
UNION ALL SELECT 'invoice_days', (SELECT string_agg(d||':'||n, ' ') FROM (SELECT ("createdAt" AT TIME ZONE 'Asia/Kolkata')::date d, count(*) n FROM invoices WHERE ("createdAt" AT TIME ZONE 'Asia/Kolkata')::time < '05:30' GROUP BY 1 ORDER BY 1) x);
