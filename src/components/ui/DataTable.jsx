import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown, ChevronsUpDown, ChevronLeft, ChevronRight } from 'lucide-react';
import { SearchInput, Select } from './Field';
import { CountBadge } from './Badge';
import EmptyState from './EmptyState';

/**
 * The list every screen shows, with the four things none of them had.
 *
 * There are 47 tables in the app and 19 different <th> styles between them, and
 * not one offered a row count, a search, a sortable column or a page. A list of
 * six orders does not need any of that; the same list in a year does, and the
 * point at which it starts to matter is exactly the point at which nobody has
 * time to go back and add it.
 *
 * Sorting, searching and paging happen here rather than in each page's state,
 * so a screen supplies rows and says how to draw them and gets the rest.
 *
 * Columns:
 *   key       required, unique
 *   header    the column title
 *   render    (row, index) => cell contents; defaults to row[key]
 *   sort      (row) => a comparable value. Omitted means the column cannot be
 *             sorted, which is the honest default for a cell holding markup.
 *   align     'left' | 'right' | 'center'
 *   width     a class, e.g. 'w-32'
 *   hideBelow 'sm' | 'md' | 'lg' — dropped on narrow screens rather than
 *             forcing a horizontal scroll through nine columns on a phone.
 */

const ALIGN = { left: 'text-left', right: 'text-right', center: 'text-center' };
const HIDE = { sm: 'hidden sm:table-cell', md: 'hidden md:table-cell', lg: 'hidden lg:table-cell' };

const compare = (a, b) => {
  if (a == null && b == null) return 0;
  if (a == null) return 1;          // blanks sort last whichever way the column points
  if (b == null) return -1;
  if (typeof a === 'number' && typeof b === 'number') return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });
};

export default function DataTable({
  columns,
  rows,
  rowKey = (r, i) => r?.id ?? i,
  rowClassName,           // (row) => extra classes, for things like a jumped-to row
  rowId,                  // (row) => a DOM id, so a page can scroll to one
  onRowClick,
  search,                 // (row) => string, or omit for no search box
  searchPlaceholder = 'Search',
  toolbar,                // extra controls beside the search box
  title,
  pageSize: initialPageSize = 25,
  paginate = true,
  empty = {},
  filteredEmpty = {},
  className = '',
  dense = false,
}) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: null, dir: 'asc' });
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const all = useMemo(() => rows || [], [rows]);

  const searched = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q || !search) return all;
    return all.filter(r => String(search(r) ?? '').toLowerCase().includes(q));
  }, [all, query, search]);

  const sorted = useMemo(() => {
    const col = columns.find(c => c.key === sort.key);
    if (!col?.sort) return searched;
    const copy = [...searched];
    copy.sort((a, b) => compare(col.sort(a), col.sort(b)) * (sort.dir === 'asc' ? 1 : -1));
    return copy;
  }, [searched, sort, columns]);

  const pageCount = paginate ? Math.max(1, Math.ceil(sorted.length / pageSize)) : 1;
  // A filter that shortens the list can leave you on a page that no longer
  // exists, which showed an empty table rather than the rows still matching.
  const safePage = Math.min(page, pageCount - 1);
  const visible = paginate ? sorted.slice(safePage * pageSize, safePage * pageSize + pageSize) : sorted;

  const toggleSort = (col) => {
    if (!col.sort) return;
    setSort(s => (s.key === col.key
      ? { key: col.key, dir: s.dir === 'asc' ? 'desc' : 'asc' }
      : { key: col.key, dir: 'asc' }));
    setPage(0);
  };

  const cellPad = dense ? 'px-3 py-2' : 'px-4 py-3';

  return (
    <div className={`glass-panel rounded-2xl border border-white/5 overflow-hidden ${className}`}>
      {(title || search || toolbar) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 flex-wrap">
          <div className="flex items-center gap-2 min-w-0">
            {title && <h3 className="text-sm font-bold text-white truncate">{title}</h3>}
            <CountBadge value={sorted.length} />
          </div>
          <div className="flex items-center gap-2 flex-wrap min-w-0 flex-1 sm:flex-initial sm:justify-end">
            {toolbar}
            {search && (
              <div className="min-w-0 w-full sm:w-56">
                <SearchInput
                  size="sm"
                  value={query}
                  onChange={e => { setQuery(e.target.value); setPage(0); }}
                  placeholder={searchPlaceholder}
                />
              </div>
            )}
          </div>
        </div>
      )}

      {all.length === 0 ? (
        <EmptyState {...empty} />
      ) : sorted.length === 0 ? (
        <EmptyState
          title="Nothing matches that"
          hint="Try a shorter search, or clear the filters above."
          {...filteredEmpty}
        />
      ) : (
        <>
          <div className="overflow-x-auto custom-scrollbar">
            {/* Narrow enough that a phone shows three or four columns rather than
                  two, and still wide enough that cells do not cramp on a laptop. */}
              <table className="w-full min-w-[520px]">
              <thead>
                <tr className="border-b border-white/5 bg-white/[0.02]">
                  {columns.map(col => {
                    const active = sort.key === col.key;
                    const Arrow = !col.sort ? null : active ? (sort.dir === 'asc' ? ChevronUp : ChevronDown) : ChevronsUpDown;
                    return (
                      <th
                        key={col.key}
                        scope="col"
                        aria-sort={!col.sort ? undefined : active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
                        className={`${cellPad} text-[10px] font-bold uppercase tracking-wide text-slate-400
                          ${ALIGN[col.align] || ALIGN.left} ${col.width || ''} ${HIDE[col.hideBelow] || ''}
                          ${col.sort ? 'cursor-pointer select-none hover:text-white transition-colors' : ''}`}
                        onClick={() => toggleSort(col)}
                      >
                        <span className={`inline-flex items-center gap-1 ${col.align === 'right' ? 'flex-row-reverse' : ''}`}>
                          {col.header}
                          {Arrow && <Arrow size={11} className={active ? 'text-brand-accent' : 'text-slate-600'} />}
                        </span>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {visible.map((row, i) => (
                  <tr
                    key={rowKey(row, i)}
                    id={rowId ? rowId(row) : undefined}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={`border-b border-white/5 last:border-0 transition-colors
                      ${onRowClick ? 'cursor-pointer' : ''} hover:bg-white/[0.03]
                      ${rowClassName ? rowClassName(row) : ''}`}
                  >
                    {columns.map(col => (
                      <td
                        key={col.key}
                        className={`${cellPad} text-xs text-slate-300 align-middle
                          ${ALIGN[col.align] || ALIGN.left} ${HIDE[col.hideBelow] || ''}`}
                      >
                        {col.render ? col.render(row, i) : row[col.key]}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {paginate && sorted.length > 10 && (
            <div className="flex items-center justify-between gap-3 px-4 py-3 border-t border-white/5 flex-wrap">
              <div className="flex items-center gap-2">
                <span className="text-[11px] text-slate-500">Rows</span>
                <Select
                  size="sm"
                  value={pageSize}
                  onChange={e => { setPageSize(Number(e.target.value)); setPage(0); }}
                  className="w-[4.5rem]"
                >
                  {[10, 25, 50, 100].map(n => <option key={n} value={n}>{n}</option>)}
                </Select>
                <span className="text-[11px] text-slate-500 whitespace-nowrap">
                  {safePage * pageSize + 1}&ndash;{Math.min((safePage + 1) * pageSize, sorted.length)} of {sorted.length}
                </span>
              </div>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => setPage(p => Math.max(0, p - 1))}
                  disabled={safePage === 0}
                  className="w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors"
                  aria-label="Previous page"
                >
                  <ChevronLeft size={14} />
                </button>
                <span className="text-[11px] text-slate-400 px-2 whitespace-nowrap">
                  {safePage + 1} / {pageCount}
                </span>
                <button
                  type="button"
                  onClick={() => setPage(p => Math.min(pageCount - 1, p + 1))}
                  disabled={safePage >= pageCount - 1}
                  className="w-8 h-8 rounded-lg border border-white/10 text-slate-400 hover:text-white hover:border-white/25 disabled:opacity-30 disabled:cursor-not-allowed inline-flex items-center justify-center transition-colors"
                  aria-label="Next page"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/**
 * The same shell, for a table that has to keep its own markup.
 *
 * Some tables have grouped headers, spanning cells or a footer of totals, and
 * rewriting them as columns would be a rewrite rather than a restyle. This
 * gives them the panel, the header row and the scroll behaviour without asking
 * for any of that.
 */
export function TableShell({ headers, children, title, actions, minWidth = 640, className = '' }) {
  return (
    <div className={`glass-panel rounded-2xl border border-white/5 overflow-hidden ${className}`}>
      {(title || actions) && (
        <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-white/5 flex-wrap">
          {title && <h3 className="text-sm font-bold text-white truncate">{title}</h3>}
          {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
        </div>
      )}
      <div className="overflow-x-auto custom-scrollbar">
        <table className="w-full" style={{ minWidth }}>
          {headers && (
            <thead>
              <tr className="border-b border-white/5 bg-white/[0.02]">
                {headers.map((h, i) => {
                  const label = typeof h === 'string' ? h : h.label;
                  const align = typeof h === 'string' ? 'left' : (h.align || 'left');
                  return (
                    <th
                      key={i}
                      scope="col"
                      className={`px-4 py-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${ALIGN[align]}`}
                    >
                      {label}
                    </th>
                  );
                })}
              </tr>
            </thead>
          )}
          {children}
        </table>
      </div>
    </div>
  );
}
