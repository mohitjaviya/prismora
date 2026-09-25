import { DataTable, Badge, ShortId, ClampText } from '../ui';
import { attributionFor } from '../../utils/attribution';
import { lastChangedBy } from '../../utils/audit';
import { expenseSource } from '../../utils/ids';

/**
 * Accounting → Expenses, on the shared DataTable.
 *
 * It was one-off markup: a description "truncated" on the cell itself (which
 * cells ignore, so the column grew instead), ids up to forty characters wide,
 * and no search or sort. Ids are shortened with the full one a click away,
 * descriptions clamp to two lines with "Show more", and an expense the system
 * booked says what it came from.
 */
export default function ExpensesTable({ expenses, users, formatCurrency, formatDate, renderActions }) {
  const columns = [
    {
      key: 'id', header: 'Expense', sort: e => e.id,
      render: e => {
        const source = expenseSource(e.id);
        return (
          <div className="whitespace-nowrap">
            <ShortId id={e.id} className="font-bold text-white text-xs" />
            {source && <div className="mt-1"><Badge size="sm" tone="neutral">From {source.toLowerCase()}</Badge></div>}
          </div>
        );
      },
    },
    {
      key: 'date', header: 'Date', sort: e => e.date,
      render: e => <span className="whitespace-nowrap text-slate-400">{formatDate(e.date)}</span>,
    },
    {
      key: 'category', header: 'Category', sort: e => e.category,
      render: e => <span className="whitespace-nowrap font-semibold text-brand-accent">{e.category}</span>,
    },
    {
      key: 'description', header: 'Description',
      render: e => <ClampText text={e.description} empty="No description" width="w-64" className="text-slate-300 italic" />,
    },
    {
      key: 'recordedBy', header: 'Recorded by', sort: e => attributionFor(e, users).name,
      render: e => {
        const who = attributionFor(e, users);
        const last = lastChangedBy(e, users);
        return (
          <div className="whitespace-nowrap">
            <div className={who.automatic || !who.id ? 'text-slate-500 italic' : 'text-slate-300'}>{who.name}</div>
            {last && last.id !== who.id && <div className="text-[10px] text-slate-500">changed by {last.name}</div>}
          </div>
        );
      },
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sort: e => Number(e.amount || 0),
      render: e => <span className="tabular-nums whitespace-nowrap font-bold text-white">{formatCurrency(e.amount)}</span>,
    },
    { key: 'actions', header: '', align: 'right', render: e => renderActions(e) },
  ];

  return (
    <DataTable
      title="Expenses"
      columns={columns}
      rows={expenses}
      dense
      search={e => `${e.id} ${e.category || ''} ${e.description || ''} ${attributionFor(e, users).name}`}
      searchPlaceholder="Search expenses"
      empty={{ title: 'No expenses logged yet', hint: 'Use "Log Expense" above. Paid incentives, settled claims and approved field expenses appear here on their own.' }}
    />
  );
}
