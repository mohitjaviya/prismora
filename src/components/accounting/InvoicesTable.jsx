import { CheckCircle, Clock, AlertCircle, CircleDot } from 'lucide-react';
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

// From the database (057): Unpaid · Partially Paid · Settled · Overdue.
// "Paid" is the old name for Settled.
const STATUS_ICON = { Settled: CheckCircle, Paid: CheckCircle, 'Partially Paid': CircleDot, Unpaid: Clock, Overdue: AlertCircle };
const STATUS_TONE = { Settled: 'success', Paid: 'success', 'Partially Paid': 'info', Unpaid: 'warning', Overdue: 'danger' };

export default function InvoicesTable({ invoices, formatCurrency, formatDate, raisedBy, renderActions, toolbar, creditedFor }) {
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
        const paid = Number(inv.amountPaid || 0);
        // amountPaid counts credit notes as well as payments (057), so a
        // "Partially Paid" invoice may have had no money in at all; say which.
        const credited = Math.min(paid, Number(creditedFor?.(inv) || 0));
        return (
          <div className="flex flex-col items-center gap-0.5">
            <Badge tone={STATUS_TONE[inv.status] || 'neutral'}>{Icon && <Icon size={11} />}{inv.status === 'Paid' ? 'Settled' : inv.status}</Badge>
            {paid > 0 && paid < total(inv) - 0.005 && (
              <span className="text-[10px] text-slate-500 whitespace-nowrap">
                {credited >= paid - 0.005
                  ? `${formatCurrency(paid)} of ${formatCurrency(total(inv))} by credit note, nothing paid`
                  : credited > 0
                    ? `${formatCurrency(paid - credited)} paid + ${formatCurrency(credited)} credit note, of ${formatCurrency(total(inv))}`
                    : `${formatCurrency(paid)} of ${formatCurrency(total(inv))} paid`}
              </span>
            )}
          </div>
        );
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
