import { returnLineRows } from '../utils/salesReturns';

const fmtDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/**
 * The returns recorded on one order, a row per returned line (Gap 11).
 * Shown in the order's details and at the top of the Sales Return popup.
 */
export default function OrderReturnsList({ returns, users }) {
  const rows = returnLineRows(returns);
  if (!rows.length) return null;
  const who = (id) => (users || []).find(u => u.id === id)?.name || id || '—';
  return (
    <div className="overflow-x-auto custom-scrollbar rounded-xl border border-white/5">
      <table className="w-full text-xs text-left">
        <thead className="text-[10px] uppercase tracking-wide text-slate-500 bg-white/5">
          <tr>
            <th className="px-2.5 py-2 font-semibold">Date</th>
            <th className="px-2.5 py-2 font-semibold">Product</th>
            <th className="px-2.5 py-2 font-semibold">Batch</th>
            <th className="px-2.5 py-2 font-semibold text-right">Qty</th>
            <th className="px-2.5 py-2 font-semibold">Reason</th>
            <th className="px-2.5 py-2 font-semibold">Credit note</th>
            <th className="px-2.5 py-2 font-semibold">Note</th>
            <th className="px-2.5 py-2 font-semibold">Recorded by</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-white/5 text-slate-300">
          {rows.map(r => (
            <tr key={r.key} title={`Return ${r.returnId}`}>
              <td className="px-2.5 py-2 whitespace-nowrap">{fmtDate(r.date)}</td>
              <td className="px-2.5 py-2">{r.product || '—'}</td>
              <td className="px-2.5 py-2 whitespace-nowrap">{r.batch || '—'}</td>
              <td className="px-2.5 py-2 text-right font-semibold text-white">{r.quantity}</td>
              <td className="px-2.5 py-2">{r.reason || '—'}</td>
              <td className="px-2.5 py-2 whitespace-nowrap">{r.creditNoteId || '—'}</td>
              <td className="px-2.5 py-2">{r.note || '—'}</td>
              <td className="px-2.5 py-2 whitespace-nowrap">{who(r.createdBy)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
