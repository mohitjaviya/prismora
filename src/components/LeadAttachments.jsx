import { useEffect, useState } from 'react';
import { FileText, Paperclip, Trash2, Download } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast, useConfirm } from '../context/DialogContext';
import { ACCEPT_ATTR, ALLOWED_LABEL, attachmentError, attachmentDisplayName } from '../utils/leadAttachments';

/**
 * A lead's files (D-21), stored in Storage under the lead and guarded by the
 * lead's own rules in the database (059): whoever can see the lead can open
 * them; whoever can edit it can add and remove them.
 *
 * With a leadId the list is live — files upload as they are chosen. Without
 * one (a lead not saved yet) files are held in `pending` and uploaded by the
 * form once the lead exists.
 */
export default function LeadAttachments({ leadId, canEdit, pending, onPendingChange }) {
  const { listLeadAttachments, uploadLeadAttachment, removeLeadAttachment, openLeadAttachment } = useData();
  const toast = useToast();
  const confirm = useConfirm();
  const [files, setFiles] = useState(null);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    if (!leadId) return;
    const r = await listLeadAttachments(leadId);
    if (!r.ok) { toast(r.error, 'error'); setFiles([]); return; }
    setFiles(r.files);
  };
  useEffect(() => {
    if (!leadId) return undefined;
    let current = true;
    listLeadAttachments(leadId).then(r => {
      if (!current) return;
      if (!r.ok) toast(r.error, 'error');
      setFiles(r.ok ? r.files : []);
    });
    return () => { current = false; };
  }, [leadId]); // eslint-disable-line react-hooks/exhaustive-deps

  const choose = async (list) => {
    const chosen = Array.from(list || []);
    const bad = chosen.map(attachmentError).filter(Boolean);
    bad.forEach(msg => toast(msg, 'error'));
    const good = chosen.filter(f => !attachmentError(f));
    if (!good.length) return;
    if (!leadId) { onPendingChange?.([...(pending || []), ...good]); return; }
    setBusy(true);
    for (const f of good) {
      const r = await uploadLeadAttachment(leadId, f);
      toast(r.ok ? `${f.name} attached.` : r.error, r.ok ? 'success' : 'error');
    }
    setBusy(false);
    refresh();
  };

  const remove = async (name) => {
    if (!await confirm({ title: `Remove ${attachmentDisplayName(name)}?`, danger: true, confirmLabel: 'Remove' })) return;
    const r = await removeLeadAttachment(leadId, name);
    toast(r.ok ? 'Removed.' : r.error, r.ok ? 'success' : 'error');
    refresh();
  };

  const open = async (name) => {
    const r = await openLeadAttachment(leadId, name);
    if (!r.ok) toast(r.error, 'error');
  };

  return (
    <div className="space-y-2.5">
      {canEdit && (
        <label className={`block border-2 border-dashed border-slate-700 rounded-xl p-4 text-center hover:border-brand-accent/50 transition-colors relative cursor-pointer bg-brand-primary-lighter/10 ${busy ? 'opacity-60' : ''}`}>
          <input id={leadId ? `lead-attachments-${leadId}` : 'lead-attachments-new'} type="file" multiple accept={ACCEPT_ATTR} disabled={busy}
            className="absolute inset-0 opacity-0 cursor-pointer" onChange={e => { choose(e.target.files); e.target.value = ''; }} />
          <Paperclip className="mx-auto mb-2 text-slate-500" size={22} />
          <span className="text-xs text-slate-400 block">{busy ? 'Uploading…' : <>Drag files here, or <span className="text-brand-accent font-semibold underline">browse</span></>}</span>
          <span className="text-[10px] text-slate-600 block mt-1">{ALLOWED_LABEL}{!leadId ? ' — uploaded when the lead is saved' : ''}</span>
        </label>
      )}

      {!leadId && (pending || []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {pending.map((f, i) => (
            <span key={i} className="flex items-center gap-1.5 text-xs bg-slate-800 text-slate-300 px-2.5 py-1.5 rounded-lg border border-slate-700">
              {f.name}
              <button type="button" title="Remove" onClick={() => onPendingChange(pending.filter((_, j) => j !== i))} className="text-red-400 hover:text-red-300 font-bold ml-1">✕</button>
            </span>
          ))}
        </div>
      )}

      {leadId && (files === null ? <p className="text-xs text-slate-500">Loading files…</p>
        : files.length === 0 ? <p className="text-xs text-slate-500 italic">No files attached to this lead.</p>
        : (
          <ul className="space-y-1.5">
            {files.map(f => (
              <li key={f.name} className="flex items-center justify-between gap-2 text-xs bg-slate-800/80 text-slate-200 border border-slate-700/80 px-3 py-2 rounded-xl">
                <button type="button" onClick={() => open(f.name)} title="Open" className="flex items-center gap-2 min-w-0 text-left hover:text-brand-accent">
                  <FileText size={14} className="text-brand-accent flex-shrink-0" />
                  <span className="truncate">{attachmentDisplayName(f.name)}</span>
                  <span className="text-slate-500 flex-shrink-0">{f.size ? `${Math.max(1, Math.round(f.size / 1024))} KB` : ''}</span>
                </button>
                <span className="flex items-center gap-1 flex-shrink-0">
                  <button type="button" onClick={() => open(f.name)} title="Download" className="p-1 text-slate-400 hover:text-brand-accent"><Download size={13} /></button>
                  {canEdit && <button type="button" onClick={() => remove(f.name)} title="Remove file" className="p-1 text-slate-400 hover:text-rose-400"><Trash2 size={13} /></button>}
                </span>
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}
