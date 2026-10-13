import { useEffect, useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { openInvoicesForParty, againstInvoiceProblem } from '../utils/settlement';

/**
 * "Against invoice" on a partner's Record Payment form (Gap 21, 098).
 *
 * Without a choice the payment goes into the partner's pool, which pays their
 * invoices oldest first (057). Choosing one ties the payment to it, so e.g. the
 * GST a Convert added can be paid on that invoice. The amount may not be more
 * than its due; the extra is recorded as a separate payment. Shown only once
 * the database has 098 (invoice_payment_link_enabled()); before that, nothing.
 */
export default function PaymentInvoiceSelect({ party, value, amount, onChange, idPrefix, inputCls, labelCls }) {
  const { invoices, orders, invoicePaymentLinkSupported } = useData();
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let live = true;
    invoicePaymentLinkSupported().then(ok => { if (live) setEnabled(ok); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const options = useMemo(() => openInvoicesForParty(invoices, party, orders), [invoices, party, orders]);
  if (!enabled) return null;

  const chosen = options.find(o => o.id === value);
  const problem = value && amount !== '' && amount != null ? againstInvoiceProblem(amount, value, chosen?.due ?? 0) : null;
  const id = `${idPrefix}-against-invoice`;

  return (
    <div>
      <label htmlFor={id} className={labelCls}>Against invoice</label>
      <select id={id} value={value || ''} onChange={e => onChange(e.target.value)} className={inputCls}>
        <option value="" className="bg-brand-primary">Not against an invoice (pays the oldest open invoices first)</option>
        {options.map(o => <option key={o.id} value={o.id} className="bg-brand-primary">{o.label}</option>)}
      </select>
      {chosen && !problem && <p className="mt-1 text-[11px] text-slate-400">Up to ₹{chosen.due.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} can be recorded against this invoice.</p>}
      {problem && <p role="alert" className="mt-1 text-[11px] text-red-400">{problem}</p>}
    </div>
  );
}

