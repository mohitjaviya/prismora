import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { IndianRupee, X, AlertTriangle, Paperclip } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/DialogContext';
import { FieldError, ErrorSummary, useFieldCheck } from './ui';
import { PARTNER_PAYMENT_SPEC } from '../utils/partnerForms';
import { openInvoicesForParty, againstInvoiceProblem, paymentFieldFor } from '../utils/settlement';
import {
  PAYMENT_MODES, LEGACY_MODES, MODE_FIELDS, CHEQUE_STATUSES, blankPaymentForm, paymentDetailProblems,
  paymentDetailsArg, paymentReferenceArg, duplicateReferenceWarning, allocationText, receivedIntoSuggestions,
} from '../utils/paymentDetails';
import { PROOF_ACCEPT, proofFileProblem } from '../utils/paymentProofs';
import { indiaDay } from '../utils/orderDate';

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";
const r2 = (n) => Math.round(Number(n || 0) * 100) / 100;
const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const day = (v) => (v ? new Date(v).toLocaleDateString('en-IN') : '—');

/**
 * The one payment form (Gap 8): the partner drawer's "Record Payment" and
 * Accounting's "Mark as Paid" open this, with the same fields and checks.
 *
 * - From an invoice (`invoice`): it is chosen, the amount is its balance due
 *   and may be lowered. The full due is Mark as Paid (PAY-INV-<id>, undone by
 *   Mark unpaid); less is a payment against the invoice (not undone by it).
 * - From the partner: their unpaid invoices oldest first; "Against invoice"
 *   as in Gap 21, otherwise the database pays the oldest first.
 *
 * With 099 the mode's own fields are shown and required (the database checks
 * them again); without it the old fields and none of the mode checks.
 */
export default function PartnerPaymentModal({ partyType, party, invoice = null, onClose, idPrefix = 'payment' }) {
  const {
    invoices, orders, distributorPayments, paymentDetailsSupported, invoicePaymentLinkSupported,
    addDistributorPayment, addDealerPayment, addRetailerPayment, updateInvoiceStatus, uploadPaymentProof, removePaymentProof,
  } = useData();
  const { canAccess } = useAuth();
  const toast = useToast();
  const check = useFieldCheck();
  const today = indiaDay();
  const [detailsOn, setDetailsOn] = useState(false);
  const [linkOn, setLinkOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [proof, setProof] = useState(null);
  const canProof = canAccess('accounting', 'full');

  useEffect(() => {
    let live = true;
    paymentDetailsSupported().then(ok => { if (live) setDetailsOn(ok); });
    invoicePaymentLinkSupported().then(ok => { if (live) setLinkOn(ok); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const open = useMemo(() => openInvoicesForParty(invoices, party, orders), [invoices, party, orders]);
  const fixed = invoice ? open.find(o => o.id === invoice.id) : null;
  const [form, setForm] = useState(() => blankPaymentForm(today, invoice ? { amount: String(fixed?.due ?? ''), invoiceId: invoice.id } : {}));
  const set = (k) => (e) => setForm(f => ({ ...f, [k]: e.target.value }));

  const againstId = invoice ? invoice.id : (linkOn ? form.invoiceId : '');
  const chosen = open.find(o => o.id === againstId);
  const suggestions = useMemo(() => receivedIntoSuggestions(distributorPayments), [distributorPayments]);
  const duplicate = detailsOn ? duplicateReferenceWarning(form, distributorPayments) : null;
  const preview = allocationText(form.amount, open, againstId || null);

  const extra = (f) => {
    const out = paymentDetailProblems(f, { today, detailsOn });
    if (againstId && !out.amount && f.amount !== '') {
      const problem = againstInvoiceProblem(f.amount, againstId, chosen?.due ?? 0);
      if (problem) out.amount = problem;
    }
    if (proof && proofFileProblem(proof)) out.proof = proofFileProblem(proof);
    return out;
  };
  const errors = check.errors(form, PARTNER_PAYMENT_SPEC, extra);
  const fields = detailsOn ? (MODE_FIELDS[form.method] || []) : [];

  const submit = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!check.ok(form, PARTNER_PAYMENT_SPEC, extra)) return;
    setSaving(true);
    let path = null;
    try {
      if (detailsOn && canProof && proof) {
        const up = await uploadPaymentProof(party.id, proof);
        if (!up.ok) { toast(up.error, 'error'); return; }
        path = up.path;
      }
      const payment = {
        amount: Number(form.amount),
        method: form.method,
        reference: detailsOn ? paymentReferenceArg(form) : form.reference,
        date: form.date ? new Date(form.date).toISOString() : new Date().toISOString(),
        notes: form.notes,
        ...(detailsOn ? { details: paymentDetailsArg(form, path) } : {}),
      };
      const fullDue = invoice && fixed && r2(form.amount) >= r2(fixed.due);
      let result;
      if (fullDue) {
        // Mark as Paid: the database records what is due (PAY-INV-<id>).
        result = await updateInvoiceStatus(invoice.id, 'Settled', payment);
      } else {
        const add = { Distributor: addDistributorPayment, Dealer: addDealerPayment, Retailer: addRetailerPayment }[partyType];
        result = await add({ ...payment, [paymentFieldFor(partyType)]: party.id, againstInvoiceId: againstId || null });
      }
      if (!result?.ok) {
        if (path) await removePaymentProof(path);
        toast(result?.error || 'The payment could not be saved. Nothing was recorded.', 'error');
        return;
      }
      const amount = result.amount ?? result.row?.amount ?? form.amount;
      toast(fullDue
        ? `${invoice.id} settled: ${rupees(amount)} recorded.`
        : `Payment of ${rupees(amount)} recorded${againstId ? ` against ${againstId}` : ''}.`, 'success');
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const id = (k) => `${idPrefix}-${k}`;

  return createPortal(
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[92vh] overflow-y-auto rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
        <div className="flex justify-between items-center mb-2">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><IndianRupee size={18} className="text-brand-accent" />{invoice ? `Mark ${invoice.id} as paid` : 'Record Payment'}</h3>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-white rounded-lg" aria-label="Close"><X size={18} /></button>
        </div>
        <p className="text-xs text-slate-400 mb-4">From {party.name} ({partyType}).{invoice && fixed ? ` Balance due on ${invoice.id}: ${rupees(fixed.due)}. Lower the amount for a part payment.` : ''}</p>

        <form onSubmit={submit} noValidate className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={id('amount')} className={labelCls}>Amount (₹) *</label>
              <input id={id('amount')} type="number" min="0.01" step="0.01" value={form.amount} onChange={set('amount')} className={inputCls} />
              <FieldError errors={errors} field="amount" />
            </div>
            <div>
              <label htmlFor={id('date')} className={labelCls}>Date *</label>
              <input id={id('date')} type="date" max={today} value={form.date} onChange={set('date')} className={inputCls} style={{ colorScheme: 'dark' }} />
              <FieldError errors={errors} field="date" />
            </div>
          </div>

          {!invoice && (
            <div>
              <p className={labelCls}>Unpaid invoices{linkOn ? ' — choose one to pay it, or leave "Oldest first"' : ' (paid oldest first)'}</p>
              {open.length === 0 ? (
                <p className="text-xs text-slate-400">No outstanding invoices.</p>
              ) : (
                <div className="overflow-x-auto rounded-xl border border-white/10">
                  <table className="w-full text-xs">
                    <thead className="text-slate-400 bg-white/5">
                      <tr>
                        {linkOn && <th className="px-2 py-1.5 text-left font-semibold">Pay</th>}
                        <th className="px-2 py-1.5 text-left font-semibold">Invoice</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Order</th>
                        <th className="px-2 py-1.5 text-left font-semibold">Date</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Total</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Paid</th>
                        <th className="px-2 py-1.5 text-right font-semibold">Due</th>
                      </tr>
                    </thead>
                    <tbody className="text-slate-200">
                      {linkOn && (
                        <tr className="border-t border-white/5">
                          <td className="px-2 py-1.5"><input type="radio" id={id('against-none')} name={id('against')} checked={!form.invoiceId} onChange={() => setForm(f => ({ ...f, invoiceId: '' }))} /></td>
                          <td colSpan={6} className="px-2 py-1.5"><label htmlFor={id('against-none')}>Oldest first (not against one invoice)</label></td>
                        </tr>
                      )}
                      {open.map(o => (
                        <tr key={o.id} className="border-t border-white/5">
                          {linkOn && <td className="px-2 py-1.5"><input type="radio" id={id(`against-${o.id}`)} name={id('against')} aria-label={`Against invoice ${o.id}`} checked={form.invoiceId === o.id} onChange={() => setForm(f => ({ ...f, invoiceId: o.id }))} /></td>}
                          <td className="px-2 py-1.5 font-mono">{o.id}</td>
                          <td className="px-2 py-1.5 font-mono">{o.orderId || '—'}</td>
                          <td className="px-2 py-1.5">{day(o.date)}</td>
                          <td className="px-2 py-1.5 text-right">{rupees(o.total)}</td>
                          <td className="px-2 py-1.5 text-right">{rupees(o.paid)}</td>
                          <td className="px-2 py-1.5 text-right font-semibold">{rupees(o.due)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label htmlFor={id('method')} className={labelCls}>Payment mode *</label>
              <select id={id('method')} value={form.method} onChange={set('method')} className={inputCls}>
                {(detailsOn ? PAYMENT_MODES : LEGACY_MODES.map(m => ({ value: m, label: m }))).map(m => <option key={m.value} value={m.value} className="bg-brand-primary">{m.label}</option>)}
              </select>
              <FieldError errors={errors} field="method" />
            </div>
            {!detailsOn && (
              <div>
                <label htmlFor={id('reference-utr')} className={labelCls}>Reference / UTR</label>
                <input id={id('reference-utr')} type="text" value={form.reference} onChange={set('reference')} className={inputCls} />
              </div>
            )}
            {fields.map(f => (
              <div key={`${form.method}-${f.field}`}>
                <label htmlFor={id(f.field === 'reference' ? 'reference-utr' : f.field)} className={labelCls}>{f.label}{f.required ? ' *' : ''}</label>
                {f.type === 'chequeStatus' ? (
                  <select id={id(f.field)} value={form.chequeStatus} onChange={set('chequeStatus')} className={inputCls}>
                    {CHEQUE_STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                ) : (
                  <input id={id(f.field === 'reference' ? 'reference-utr' : f.field)} type={f.type === 'date' ? 'date' : 'text'} value={form[f.field]} onChange={set(f.field)} className={inputCls} style={f.type === 'date' ? { colorScheme: 'dark' } : undefined} />
                )}
                <FieldError errors={errors} field={f.field} />
              </div>
            ))}
            {detailsOn && (
              <div>
                <label htmlFor={id('received-into')} className={labelCls}>Received into</label>
                <input id={id('received-into')} type="text" list={id('received-into-list')} placeholder="Our bank / cash account" value={form.receivedInto} onChange={set('receivedInto')} className={inputCls} />
                <datalist id={id('received-into-list')}>{suggestions.map(s => <option key={s} value={s} />)}</datalist>
                <FieldError errors={errors} field="receivedInto" />
              </div>
            )}
          </div>

          {duplicate && (
            <p role="status" className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />{duplicate}
            </p>
          )}

          <div>
            <label htmlFor={id('notes')} className={labelCls}>Notes</label>
            <textarea id={id('notes')} rows="2" value={form.notes} onChange={set('notes')} className={`${inputCls} resize-none`} />
          </div>

          {detailsOn && canProof && (
            <div>
              <label htmlFor={id('proof')} className={labelCls}><Paperclip size={12} className="inline mr-1" />Proof (optional)</label>
              <input id={id('proof')} type="file" accept={PROOF_ACCEPT} onChange={e => setProof(e.target.files?.[0] || null)} className="block w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-brand-primary-lighter file:px-3 file:py-1.5 file:text-slate-200" />
              <p className="mt-1 text-[11px] text-slate-500">PDF or image, up to 10 MB. Only Accounts can open it.</p>
              <FieldError errors={errors} field="proof" />
            </div>
          )}

          {preview && (
            <p data-payment-preview className="rounded-xl border border-brand-accent/30 bg-brand-accent/10 p-3 text-xs text-slate-200">{preview}</p>
          )}

          <ErrorSummary errors={errors} />
          <div className="flex gap-3 justify-end pt-2">
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
            <button type="submit" disabled={saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : invoice ? 'Record payment' : 'Record Payment'}</button>
          </div>
        </form>
      </div>
    </div>, document.body
  );
}
