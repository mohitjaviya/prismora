import { useMemo, useState } from 'react';
import { Paperclip } from 'lucide-react';
import { useData } from '../../context/DataContext';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/DialogContext';
import { partyForInvoice } from '../../utils/settlement';
import { invoiceParty } from '../../utils/distributorUtils';
import { paymentApplications, paymentModeText, paymentReferenceText, CHEQUE_STATUSES } from '../../utils/paymentDetails';

const rupees = (n) => `₹${Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * An invoice's payments (Gap 8): date, amount applied here, mode, reference.
 * Payments tied to the invoice count here; the others where the database
 * applied them (oldest open invoice first). Shown on screen only, not printed.
 * A cheque's status can be moved on by Accounts; it is a label, no money moves.
 */
export default function InvoicePaymentHistory({ invoice }) {
  const { invoices, orders, distributors, dealers, retailers, distributorPayments, creditNotes, setChequeStatus, openPaymentProof } = useData();
  const { canAccess } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const canEdit = canAccess('accounting', 'full') || canAccess('ledger', 'full');
  const canProof = canAccess('accounting', 'full');

  const rows = useMemo(() => {
    const { party } = partyForInvoice(invoice, { distributors, dealers, retailers, orders });
    if (!party) return null;
    const orderById = new Map((orders || []).map(o => [o.id, o]));
    const apps = paymentApplications(party.id, invoices, distributorPayments, creditNotes, inv => invoiceParty(inv, orderById));
    return (distributorPayments || [])
      .map(p => ({ p, part: apps.get(p.id)?.applied.find(a => a.invoiceId === invoice.id) }))
      .filter(x => x.part)
      .sort((a, b) => String(a.p.date || a.p.createdAt || '').localeCompare(String(b.p.date || b.p.createdAt || '')));
  }, [invoice, invoices, orders, distributors, dealers, retailers, distributorPayments, creditNotes]);

  if (!rows) return null;   // walk-in: no partner payments

  const changeStatus = async (p, status) => {
    setBusy(p.id);
    try {
      const result = await setChequeStatus(p.id, status);
      toast(result.ok ? `Cheque ${p.instrumentNumber || p.id} is now ${status}.` : result.error, result.ok ? 'success' : 'error');
    } finally {
      setBusy(null);
    }
  };
  const openProof = async (path) => {
    const result = await openPaymentProof(path);
    if (!result.ok) toast(result.error, 'error');
  };

  return (
    <div className="no-print border-t border-slate-200 bg-slate-50 px-6 py-4 text-xs text-slate-700" data-payment-history>
      <p className="font-bold text-slate-800 mb-2">Payment history</p>
      {rows.length === 0 ? (
        <p className="text-slate-500">No payments recorded against this invoice yet.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="text-slate-500 text-left">
              <tr>
                <th className="py-1 pr-3 font-semibold">Date</th>
                <th className="py-1 pr-3 font-semibold text-right">Amount</th>
                <th className="py-1 pr-3 font-semibold">Mode</th>
                <th className="py-1 pr-3 font-semibold">Reference</th>
                <th className="py-1 pr-3 font-semibold">Received into</th>
                <th className="py-1 font-semibold">Payment</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(({ p, part }) => (
                <tr key={p.id} className="border-t border-slate-200 align-top">
                  <td className="py-1.5 pr-3 whitespace-nowrap">{p.date || p.createdAt ? new Date(p.date || p.createdAt).toLocaleDateString('en-IN') : '—'}</td>
                  <td className="py-1.5 pr-3 text-right whitespace-nowrap">{rupees(part.amount)}{Number(p.amount) > part.amount + 0.005 && <span className="block text-[10px] text-slate-400">of {rupees(p.amount)}</span>}</td>
                  <td className="py-1.5 pr-3">
                    {paymentModeText({ ...p, chequeStatus: null })}
                    {p.method === 'Cheque' && p.chequeStatus && (canEdit ? (
                      <select aria-label={`Cheque status for ${p.id}`} value={p.chequeStatus} disabled={busy === p.id} onChange={e => changeStatus(p, e.target.value)}
                        className={`ml-1 rounded border px-1 py-0.5 text-[11px] ${p.chequeStatus === 'Bounced' ? 'border-rose-300 bg-rose-50 text-rose-700' : 'border-slate-300 bg-white'}`}>
                        {CHEQUE_STATUSES.map(s => <option key={s} value={s}>{s}</option>)}
                      </select>
                    ) : (
                      <span className={`ml-1 rounded px-1 py-0.5 text-[10px] font-bold ${p.chequeStatus === 'Bounced' ? 'bg-rose-100 text-rose-700' : 'bg-slate-200'}`}>{p.chequeStatus}</span>
                    ))}
                  </td>
                  <td className="py-1.5 pr-3 font-mono break-all">{paymentReferenceText(p)}</td>
                  <td className="py-1.5 pr-3">{p.receivedInto || 'Not recorded'}</td>
                  <td className="py-1.5 font-mono whitespace-nowrap">
                    {p.id}
                    {p.proofPath && canProof && <button type="button" onClick={() => openProof(p.proofPath)} className="ml-1 inline-flex items-center gap-0.5 text-brand-accent hover:underline"><Paperclip size={11} />Proof</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="mt-2 text-[10px] text-slate-400">Payments not made against one invoice pay the oldest open invoice first; they are shown where they were applied. A bounced cheque is a label only: it does not change the balance.</p>
    </div>
  );
}
