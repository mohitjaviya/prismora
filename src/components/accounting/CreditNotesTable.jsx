import { DataTable, Badge, ShortId, ClampText } from '../ui';
import { attributionFor } from '../../utils/attribution';
import { lastChangedBy } from '../../utils/audit';

/** Accounting → Credit Notes, on the shared DataTable. */
export default function CreditNotesTable({ creditNotes, users, formatCurrency, formatDate, renderActions }) {
  const columns = [
    {
      key: 'id', header: 'Credit note', sort: c => c.id,
      render: c => <ShortId id={c.id} className="font-bold text-white text-xs" />,
    },
    {
      key: 'customer', header: 'Customer', sort: c => c.customerName,
      render: c => <ClampText text={c.customerName} lines={1} width="w-40" className="font-medium text-slate-200" />,
    },
    {
      key: 'invoice', header: 'Against invoice', sort: c => c.invoiceId || '',
      render: c => (c.invoiceId ? <ShortId id={c.invoiceId} className="text-[11px] text-slate-400" /> : <span className="text-slate-600">—</span>),
    },
    {
      key: 'reason', header: 'Reason', sort: c => c.reason,
      render: c => <Badge tone="danger">{c.reason}</Badge>,
    },
    {
      key: 'date', header: 'Date', sort: c => c.createdAt,
      render: c => <span className="whitespace-nowrap text-slate-400">{formatDate(c.createdAt)}</span>,
    },
    {
      // recordedBy has been stored since credit notes existed, and was shown nowhere.
      key: 'recordedBy', header: 'Recorded by', sort: c => attributionFor(c, users).name,
      render: c => {
        const who = attributionFor(c, users);
        const last = lastChangedBy(c, users);
        return (
          <div className="whitespace-nowrap">
            <div className={who.id ? 'text-slate-300' : 'text-slate-500 italic'}>{who.name}</div>
            {last && last.id !== who.id && <div className="text-[10px] text-slate-500">changed by {last.name}</div>}
          </div>
        );
      },
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sort: c => Number(c.amount || 0),
      render: c => <span className="tabular-nums whitespace-nowrap font-bold text-emerald-400">{formatCurrency(c.amount)}</span>,
    },
    { key: 'actions', header: '', align: 'right', render: c => renderActions(c) },
  ];

  return (
    <DataTable
      title="Credit Notes"
      columns={columns}
      rows={creditNotes}
      dense
      search={c => `${c.id} ${c.customerName || ''} ${c.invoiceId || ''} ${c.reason || ''}`}
      searchPlaceholder="Search credit notes"
      empty={{ title: 'No credit notes issued yet', hint: 'Use "Credit Note" above to record a sales return or adjustment.' }}
    />
  );
}
