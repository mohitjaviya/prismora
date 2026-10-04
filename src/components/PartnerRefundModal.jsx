import { useState } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, X } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useToast } from '../context/DialogContext';
import { refundableCredit, refundProblem } from '../utils/settlement';
import { indiaDay } from '../utils/orderDate';

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(val || 0);

/**
 * "Record refund" for a partner's credit balance (Gap 7 C, 093), shared by the
 * Distributors, Dealers and Retailers drawers. The database records it, checks
 * it against the balance at that moment and moves the balance toward 0.
 */
export default function PartnerRefundModal({ partyType, party, onClose }) {
  const { recordPartnerRefund } = useData();
  const toast = useToast();
  const today = indiaDay();
  const [form, setForm] = useState({ amount: '', date: today, method: 'Bank Transfer', reference: '', reason: '' });
  const [saving, setSaving] = useState(false);
  const credit = refundableCredit(party.outstandingAmount);
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    const problem = refundProblem(form, party.outstandingAmount, today);
    if (problem) { toast(problem, 'error'); return; }
    setSaving(true);
    try {
      // Open until the database has the refund; the balance moves with it there.
      const result = await recordPartnerRefund(partyType, party.id, form);
      if (!result.ok) { toast(result.error || 'The refund could not be saved. Nothing was recorded.', 'error'); return; }
      toast(`Refund of ${formatCurrency(result.row.amount)} recorded.`, 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Undo2 size={18} className="text-brand-accent" />Record Refund</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">
          Money paid back to {party.name}. Credit balance now: <span className="font-semibold text-emerald-400 whitespace-nowrap">{formatCurrency(credit)}</span>
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label htmlFor="refund-amount" className={labelCls}>Amount (₹) *</label>
            <input id="refund-amount" required type="number" min="0.01" step="0.01" max={credit} value={form.amount} onChange={set('amount')} className={inputCls} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label htmlFor="refund-method" className={labelCls}>Payment mode *</label>
              <select id="refund-method" required value={form.method} onChange={set('method')} className={inputCls}>
                {['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'].map(m => <option key={m} value={m} className="bg-brand-primary">{m}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="refund-date" className={labelCls}>Date *</label>
              <input id="refund-date" required type="date" max={today} value={form.date} onChange={set('date')} className={inputCls} style={{ colorScheme: 'dark' }} />
            </div>
          </div>
          <div>
            <label htmlFor="refund-reference" className={labelCls}>Reference (UTR / cheque no.) *</label>
            <input id="refund-reference" required type="text" value={form.reference} onChange={set('reference')} className={inputCls} />
          </div>
          <div>
            <label htmlFor="refund-reason" className={labelCls}>Reason *</label>
            <textarea id="refund-reason" required rows="2" value={form.reason} onChange={set('reason')} className={`${inputCls} resize-none`} />
          </div>
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : 'Record Refund'}</button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
