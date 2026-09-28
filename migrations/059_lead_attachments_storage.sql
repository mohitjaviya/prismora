-- ════════════════════════════════════════════════════════════════════════
--  PRISMORA — Batch 4, D-21: lead attachments are stored, and guarded like
--  the lead they belong to.
--  Supabase dashboard → SQL Editor → New query → paste → Run.
--  Safe to run more than once. Needs 043 (sees_account_row).
--
--  WHAT WAS WRONG
--
--  The lead form invited uploads ("PDF, DOC, Images (Max 10MB)") and kept only
--  the file names in the browser. Nothing was uploaded, no column held them,
--  and every "attachment" was gone on save.
--
--  WHAT THIS DOES
--
--  · A private Storage bucket, lead-attachments: 10 MB a file; PDF, images
--    (JPEG, PNG, WebP, GIF, HEIC), Word (.doc, .docx) and Excel (.xls, .xlsx)
--    only — refused by Storage itself otherwise.
--  · Files live under the lead's id: <leadId>/<timestamp>-<file name>.
--  · Who may do what follows the lead exactly (the leads policies, 043):
--      open / list  — whoever can see the lead: a Sales Executive their own,
--                     a Sales Manager the team's, admin roles, Customer
--                     Support and Director (Leads view) all;
--      add / remove — whoever can edit the lead (Leads full, same scope).
--    Nobody may overwrite a file.
--  · A lead with files cannot be deleted until they are removed — Storage
--    only lets its own API delete a file, so the app removes them first and
--    this keeps a direct delete from leaving files behind with no lead.
-- ════════════════════════════════════════════════════════════════════════

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES ('lead-attachments', 'lead-attachments', false, 10485760, ARRAY[
  'application/pdf',
  'image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic',
  'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.ms-excel', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'])
ON CONFLICT (id) DO UPDATE SET public = false, file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

-- The lead's own rules, asked by id.
CREATE OR REPLACE FUNCTION public.can_view_lead(p_lead_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = p_lead_id
                 AND public.can_view('leads') AND public.sees_account_row(l."assignedTo", l."createdBy", false))
$$;
CREATE OR REPLACE FUNCTION public.can_edit_lead(p_lead_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT EXISTS (SELECT 1 FROM public.leads l WHERE l.id = p_lead_id
                 AND public.can_edit('leads') AND public.sees_account_row(l."assignedTo", l."createdBy", false))
$$;
GRANT EXECUTE ON FUNCTION public.can_view_lead(text), public.can_edit_lead(text) TO authenticated;

DROP POLICY IF EXISTS lead_attachments_select ON storage.objects;
CREATE POLICY lead_attachments_select ON storage.objects FOR SELECT TO authenticated
  USING (bucket_id = 'lead-attachments' AND public.can_view_lead((storage.foldername(name))[1]));
DROP POLICY IF EXISTS lead_attachments_insert ON storage.objects;
CREATE POLICY lead_attachments_insert ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (bucket_id = 'lead-attachments' AND public.can_edit_lead((storage.foldername(name))[1]));
DROP POLICY IF EXISTS lead_attachments_delete ON storage.objects;
CREATE POLICY lead_attachments_delete ON storage.objects FOR DELETE TO authenticated
  USING (bucket_id = 'lead-attachments' AND public.can_edit_lead((storage.foldername(name))[1]));

-- A lead goes only after its files.
CREATE OR REPLACE FUNCTION public.lead_delete_needs_files_gone()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM storage.objects WHERE bucket_id = 'lead-attachments' AND name LIKE OLD.id || '/%';
  IF n > 0 THEN
    RAISE EXCEPTION 'Lead % still has % attachment(s). Remove them first (the app does this when you delete the lead).', OLD.id, n
      USING ERRCODE = '23503';
  END IF;
  RETURN OLD;
END $$;
REVOKE ALL ON FUNCTION public.lead_delete_needs_files_gone() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS lead_delete_needs_files_gone ON public.leads;
CREATE TRIGGER lead_delete_needs_files_gone BEFORE DELETE ON public.leads
  FOR EACH ROW EXECUTE FUNCTION public.lead_delete_needs_files_gone();

NOTIFY pgrst, 'reload schema';

INSERT INTO public.schema_migrations (filename, note)
VALUES ('059_lead_attachments_storage.sql',
        'D-21: private lead-attachments bucket (10 MB; PDF, images, Word, Excel); access follows the lead (view to open, edit to add/remove); a lead with files cannot be deleted')
ON CONFLICT (filename) DO NOTHING;
