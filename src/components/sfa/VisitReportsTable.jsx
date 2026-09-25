import { useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { DataTable, Badge } from '../ui';

/**
 * The SFA Visit Reports list, on the shared DataTable.
 *
 * It was one-off markup: its own header styles, its own padding, and two cells
 * that let the row decide the table's shape — tags that wrapped onto a second
 * line, and a note that stretched its column until the table scrolled
 * sideways with nothing to say more was there. Every cell here has a fixed
 * footprint instead: one line of tags, two lines of note.
 */

// Two tags, then a count. Three wrapped onto a second line and made that row
// twice the height of its neighbours; the full list is in the tooltip.
const TAGS_SHOWN = 2;

function ProductsCell({ products }) {
  const [open, setOpen] = useState(false);
  const list = Array.isArray(products) ? products.filter(Boolean) : [];
  if (list.length === 0) return <span className="text-[11px] text-slate-600 italic">None</span>;
  const extra = list.length - TAGS_SHOWN;
  // Collapsed, one line: the row keeps its height. "+N more" is a button, not
  // just a tooltip — hovering names the rest, clicking lists them all here.
  const shown = open ? list : list.slice(0, TAGS_SHOWN);
  return (
    <div className={`flex items-center gap-1 min-w-0 ${open ? 'flex-wrap max-w-[16rem]' : 'flex-nowrap'}`}>
      {shown.map((p, i) => (
        <span key={i} title={p} className={`inline-block ${open ? '' : 'max-w-[6rem] truncate'} bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[10px] px-1.5 py-0.5 rounded`}>
          {p}
        </span>
      ))}
      {extra > 0 && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          title={open ? 'Show fewer' : list.slice(TAGS_SHOWN).join(', ')}
          aria-expanded={open}
          className="flex-shrink-0 text-[10px] font-semibold text-brand-accent bg-brand-accent/5 border border-brand-accent/25 hover:bg-brand-accent/15 px-1.5 py-0.5 rounded transition-colors"
        >
          {open ? 'Show less' : `+${extra} more`}
        </button>
      )}
    </div>
  );
}

// Two lines, then "Show more". The note used to be one truncated line in a
// cell that ignored its own max-width, so it both hid the text and pushed the
// table wider than the screen.
function NoteCell({ note }) {
  const [open, setOpen] = useState(false);
  const text = String(note || '').trim();
  if (!text) return <span className="text-slate-600">—</span>;
  const long = text.length > 90;
  return (
    <div className="w-52 max-w-full">
      <p className={`text-[11px] text-slate-400 italic leading-snug whitespace-normal break-words ${open ? '' : 'line-clamp-2'}`} title={open ? undefined : text}>
        {text}
      </p>
      {long && (
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="mt-0.5 text-[10px] font-semibold text-brand-accent hover:underline"
          aria-expanded={open}
        >
          {open ? 'Show less' : 'Show more'}
        </button>
      )}
    </div>
  );
}

function FollowUpCell({ date, fmtDate }) {
  if (!date) return <span className="text-[11px] text-slate-600 italic">None set</span>;
  const due = new Date(date);
  const days = Math.ceil((due - new Date(new Date().toDateString())) / 86400000);
  const tone = days < 0 ? 'text-rose-400' : days === 0 ? 'text-amber-400' : 'text-slate-300';
  const when = days < 0 ? `${Math.abs(days)}d overdue` : days === 0 ? 'Today' : `in ${days}d`;
  return (
    <div className="whitespace-nowrap">
      <div className={`text-xs font-bold ${tone}`}>{fmtDate(date)}</div>
      <div className={`text-[10px] ${tone}`}>{when}</div>
    </div>
  );
}

export default function VisitReportsTable({ reports, getRepName, fmtDate }) {
  const columns = [
    {
      key: 'outlet', header: 'Outlet', sort: r => r.outletName,
      render: r => (
        <div className="min-w-0 max-w-[10rem]">
          <div className="font-semibold text-white truncate" title={r.outletName}>{r.outletName}</div>
          <div className="text-[10px] text-slate-500 mt-0.5 truncate">{r.outletContact || 'No contact'}</div>
        </div>
      ),
    },
    {
      // Who and when, one above the other: two narrow columns side by side
      // were what pushed Notes off the edge of the page.
      key: 'rep', header: 'Rep / Date', sort: r => r.visitDate,
      render: r => (
        <div className="whitespace-nowrap">
          <div className="text-slate-200">{getRepName(r.executiveId)}</div>
          <div className="text-[10px] text-slate-500 mt-0.5">{fmtDate(r.visitDate)}</div>
        </div>
      ),
    },
    {
      key: 'outcome', header: 'Outcome', sort: r => r.outcome,
      render: r => (
        <div className="flex flex-col items-start gap-1">
          {r.outcome === 'Not Visited'
            ? <Badge tone="danger" title={r.notVisitedReason || undefined}>Not visited</Badge>
            : <Badge tone="success">Visited</Badge>}
          {r.orderPlaced
            ? <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400 whitespace-nowrap"><ShoppingCart size={10} />Order placed</span>
            : r.outcome !== 'Not Visited' && <span className="text-[10px] text-slate-500 italic whitespace-nowrap">Pitched only</span>}
        </div>
      ),
    },
    {
      key: 'products', header: 'Products Pitched',
      render: r => <ProductsCell products={r.productsShown} />,
    },
    {
      key: 'followUp', header: 'Follow-up', hideBelow: 'md', sort: r => r.nextFollowUp || null,
      render: r => <FollowUpCell date={r.nextFollowUp} fmtDate={fmtDate} />,
    },
    {
      key: 'notes', header: 'Notes',
      render: r => <NoteCell note={r.outcome === 'Not Visited' && r.notVisitedReason
        ? `Not visited: ${r.notVisitedReason}${r.notes ? ` — ${r.notes}` : ''}`
        : r.notes} />,
    },
  ];

  return (
    <DataTable
      title="Visit Reports"
      columns={columns}
      rows={reports}
      search={r => `${r.outletName} ${getRepName(r.executiveId)} ${(r.productsShown || []).join(' ')} ${r.notes || ''}`}
      searchPlaceholder="Search outlet, rep, product"
      dense
      empty={{ title: 'No visit reports yet', hint: 'Reports appear here as reps check in on their beats.' }}
    />
  );
}
