import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, ShieldAlert } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/DialogContext';
import { correctableQty } from '../utils/salesReturns';

const inputCls = 'w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600';
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide';

/**
 * "Correct condition of an earlier return" (migration 089): units of a returned
 * line that went back on sale move to the batch's damaged count. The credit
 * note and the partner's balance do not change. The database refuses it if
 * those units are no longer sellable (sold, reserved or moved since).
 * `row` is a returnLineRows() row.
 */
export default function CorrectReturnModal({ row, onClose }) {
  const { correctReturnCondition } = useData();
  const toast = useToast();
  const max = correctableQty(row);
  const [quantity, setQuantity] = useState(String(max));
  const [condition, setCondition] = useState('Damaged');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > max) { setError(`Enter a whole number from 1 to ${max}.`); return; }
    if (reason.trim().length < 3) { setError('Give the reason.'); return; }
    setSaving(true);
    const r = await correctReturnCondition(row.returnId, row.product, row.inventoryId, qty, condition, reason.trim());
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    toast(`${qty} unit(s) of ${row.product} moved from sellable stock to damaged (${condition}). Credit note unchanged.`, 'success');
    onClose();
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-start justify-center p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <form onSubmit={save} className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-white/10 z-10 p-6 space-y-4">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShieldAlert size={18} className="text-amber-400" />Correct condition of a return</h3>
          <button type="button" title="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400">
          Return {row.returnId}: {row.quantity} × {row.product}, batch {row.batch || '(no batch no.)'}, reason “{row.reason || '—'}”.
          These units went back on sale. Moving them to damaged takes them out of sellable stock; the credit note and the
          partner's balance stay as they are. Up to {max} can be corrected.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="cr-qty" className={labelCls}>Quantity</label>
            <input id="cr-qty" type="number" min="1" max={max} step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls} />
          </div>
          <div>
            <label htmlFor="cr-cond" className={labelCls}>Actual condition</label>
            <select id="cr-cond" value={condition} onChange={e => setCondition(e.target.value)} className={inputCls}>
              <option value="Damaged" className="bg-brand-primary">Damaged</option>
              <option value="Expired" className="bg-brand-primary">Expired</option>
            </select>
          </div>
        </div>
        <div>
          <label htmlFor="cr-reason" className={labelCls}>Reason (required)</label>
          <textarea id="cr-reason" rows="2" required value={reason} onChange={e => setReason(e.target.value)}
            placeholder="e.g. Returned damaged in transit; recorded before conditions were kept" className={`${inputCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : 'Move to damaged'}</button>
        </div>
      </form>
    </div>, document.body);
}
