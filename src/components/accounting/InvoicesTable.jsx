import { CheckCircle, Clock, AlertCircle } from 'lucide-react';
import { DataTable, Badge } from '../ui';
import { invoiceTypeLabel, isProforma } from '../../utils/billing';

/**
 * The Accounting Hub invoice list, on the shared DataTable.
 *
 * It was one-off markup with its own header and padding, twelve columns wide.
 * Here the invoice's type sits under its number rather than in a column of
 * its own, the less-needed columns step aside on narrower screens, and money
 * is right-aligned in tabular figures so rupees line up down the column.
 *
 * Row actions stay with the page that owns them (renderActions); this only
 * decides how an invoice is laid out.
 */

const money = 'tabular-nums whitespace-nowrap';
const total = (inv) => Number(inv.amount || 0) + Number(inv.tax || 0);

const STATUS_ICON = { Paid: CheckCircle, Unpaid: Clock, Overdue: AlertCircle };
const STATUS_TONE = { Paid: 'success', Unpaid: 'warning', Overdue: 'danger' };

export default function InvoicesTable({ invoices, formatCurrency, formatDate, raisedBy, renderActions, toolbar }) {
  const columns = [
    {
      key: 'id', header: 'Invoice', sort: inv => inv.id,
      render: inv => (
        <div className="whitespace-nowrap">
          <div className="font-bold text-white">{inv.id}</div>
          <Badge size="sm" tone={isProforma(inv) ? 'warning' : 'success'} className="mt-1">{invoiceTypeLabel(inv)}</Badge>
        </div>
      ),
    },
    {
      key: 'customer', header: 'Customer', sort: inv => inv.customerName,
      render: inv => (
        <div className="min-w-0 max-w-[11rem]">
          <div className="font-medium text-slate-200 truncate" title={inv.customerName}>{inv.customerName}</div>
          <div className="text-[10px] text-slate-500 truncate">
            {inv.contactName ? `Attn: ${inv.contactName} · ` : ''}{inv.orderId ? `Order ${inv.orderId}` : 'Custom invoice'}
          </div>
        </div>
      ),
    },
    {
      // Due first, since that is what gets chased; when it was raised and by
      // whom underneath. Three columns of their own made the table wider than
      // the page, and the actions were cut off at the edge.
      key: 'due', header: 'Due', sort: inv => inv.dueDate,
      render: inv => (
        <div className="whitespace-nowrap">
          <div className="text-slate-200">{formatDate(inv.dueDate)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">
            raised {formatDate(inv.createdAt)}
            {/* Most are raised by delivery, which records nobody. */}
            {raisedBy(inv) && raisedBy(inv) !== 'Not recorded' ? ` · ${raisedBy(inv)}` : ''}
          </div>
        </div>
      ),
    },
    {
      key: 'amount', header: 'Base', align: 'right', sort: inv => Number(inv.amount || 0),
      render: inv => <span className={money}>{formatCurrency(inv.amount)}</span>,
    },
    {
      key: 'tax', header: 'GST', align: 'right', sort: inv => Number(inv.tax || 0),
      render: inv => (isProforma(inv)
        ? <span className="text-[11px] text-amber-400/80 whitespace-nowrap">none yet</span>
        : <span className={`${money} text-slate-400`}>{formatCurrency(inv.tax)}</span>),
    },
    {
      key: 'total', header: 'Total', align: 'right', sort: total,
      render: inv => <span className={`${money} font-bold text-white`}>{formatCurrency(total(inv))}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: inv => inv.status,
      render: inv => {
        const Icon = STATUS_ICON[inv.status];
        return <Badge tone={STATUS_TONE[inv.status] || 'neutral'}>{Icon && <Icon size={11} />}{inv.status}</Badge>;
      },
    },
    {
      key: 'actions', header: 'Actions', align: 'right',
      render: inv => renderActions(inv),
    },
  ];

  return (
    <DataTable
      title="Invoices"
      columns={columns}
      rows={invoices}
      toolbar={toolbar}
      search={inv => `${inv.id} ${inv.customerName || ''} ${inv.contactName || ''} ${inv.orderId || ''}`}
      searchPlaceholder="Search invoice, customer, order"
      dense
      empty={{ title: 'No invoices match this filter', hint: 'Try another status, or All.' }}
    />
  );
}
