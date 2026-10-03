-- RISK-ATT: lead attachments (read-only)
SELECT 'bucket' k, (SELECT row_to_json(b)::text FROM (SELECT id, public, file_size_limit, allowed_mime_types FROM storage.buckets WHERE id='lead-attachments') b) v
UNION ALL SELECT 'all_buckets', (SELECT json_agg(x)::text FROM (SELECT b.id, b.public, (SELECT count(*) FROM storage.objects o WHERE o.bucket_id=b.id) objects FROM storage.buckets b) x)
UNION ALL SELECT 'policies', (SELECT json_agg(x)::text FROM (SELECT polname, polcmd, pg_get_expr(polqual, polrelid) q, pg_get_expr(polwithcheck, polrelid) wc FROM pg_policy WHERE polrelid='storage.objects'::regclass) x)
UNION ALL SELECT 'objects', (SELECT json_agg(x)::text FROM (SELECT o.name, (o.metadata->>'size')::int size, o.metadata->>'mimetype' mime, o.created_at::date d,
     EXISTS (SELECT 1 FROM leads l WHERE l.id = split_part(o.name,'/',1)) lead_exists FROM storage.objects o WHERE o.bucket_id='lead-attachments' ORDER BY o.created_at) x)
UNION ALL SELECT 'lead_cols', (SELECT string_agg(column_name||':'||data_type, ',' ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='leads');
