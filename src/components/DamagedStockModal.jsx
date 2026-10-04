import { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, PackageX, Undo2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/DialogContext';

const inputCls = 'w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600';
const labelCls = 'block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide';

/**
 * Damaged units leaving a batch (Gap 16, migration 087): written off, or sent
 * back to a vendor as a purchase return. Both need a reason and are recorded
 * as a stock movement; the database checks who may do it and how many.
 * mode: 'writeoff' | 'vendor'.
 */
export default function DamagedStockModal({ item, mode, onClose }) {
  const { writeOffDamaged, returnDamagedToVendor, vendors } = useData();
  const toast = useToast();
  const max = Number(item.damaged) || 0;
  const [quantity, setQuantity] = useState(String(max));
  const [reason, setReason] = useState('');
  const [vendorId, setVendorId] = useState('');
  const [unitCost, setUnitCost] = useState(item.unitCost != null ? String(item.unitCost) : '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const toVendor = mode === 'vendor';

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    const qty = Number(quantity);
    if (!Number.isInteger(qty) || qty <= 0 || qty > max) { setError(`Enter a whole number from 1 to ${max}.`); return; }
    if (reason.trim().length < 3) { setError('Give the reason.'); return; }
    if (toVendor && !vendorId) { setError('Choose the vendor the goods go back to.'); return; }
    if (toVendor && (unitCost === '' || Number(unitCost) < 0)) { setError('Enter the unit cost (zero or more).'); return; }
    setSaving(true);
    const r = toVendor
      ? await returnDamagedToVendor(item.id, vendorId, qty, Number(unitCost), reason.trim())
      : await writeOffDamaged(item.id, qty, reason.trim());
    setSaving(false);
    if (!r.ok) { setError(r.error); return; }
    toast(toVendor ? `${qty} damaged unit(s) returned to the vendor (${r.id}); the vendor is credited.` : `${qty} damaged unit(s) written off.`, 'success');
    onClose();
  };

  const Icon = toVendor ? Undo2 : PackageX;
  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-start justify-center p-4 pt-[8vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose()} />
      <form onSubmit={save} className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-white/10 z-10 p-6 space-y-4">
        <div className="flex justify-between items-start">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Icon size={18} className="text-rose-400" />{toVendor ? 'Return damaged to vendor' : 'Write off damaged'}</h3>
          <button type="button" title="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400">
          {item.product} · batch {item.batchNumber || '(no batch no.)'} · {max} damaged unit(s).{' '}
          {toVendor ? 'The units leave the damaged count and the vendor is credited, like a purchase return. This cannot be withdrawn.' : 'The units leave the damaged count for good.'}
        </p>
        {toVendor && (
          <div>
            <label htmlFor="dmg-vendor" className={labelCls}>Vendor</label>
            <select id="dmg-vendor" required value={vendorId} onChange={e => setVendorId(e.target.value)} className={inputCls}>
              <option value="" className="bg-brand-primary">Choose…</option>
              {(vendors || []).map(v => <option key={v.id} value={v.id} className="bg-brand-primary">{v.name}</option>)}
            </select>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="dmg-qty" className={labelCls}>Quantity</label>
            <input id="dmg-qty" type="number" min="1" max={max} step="1" required value={quantity} onChange={e => setQuantity(e.target.value)} className={inputCls} />
          </div>
          {toVendor && (
            <div>
              <label htmlFor="dmg-cost" className={labelCls}>Unit cost (₹)</label>
              <input id="dmg-cost" type="number" min="0" step="0.01" required value={unitCost} onChange={e => setUnitCost(e.target.value)} className={inputCls} />
            </div>
          )}
        </div>
        <div>
          <label htmlFor="dmg-reason" className={labelCls}>Reason (required)</label>
          <textarea id="dmg-reason" rows="2" required value={reason} onChange={e => setReason(e.target.value)}
            placeholder={toVendor ? 'e.g. Leaking tubes, vendor agreed to credit' : 'e.g. Crushed cartons, destroyed on 4 Oct'} className={`${inputCls} resize-none`} />
        </div>
        {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
        <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
          <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : toVendor ? 'Return to vendor' : 'Write off'}</button>
        </div>
      </form>
    </div>, document.body);
}
