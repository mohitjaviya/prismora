import { Fragment, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Download, Scale, ChevronDown, ChevronRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Badge, Button, SearchInput, Select } from './ui';
import { downloadExcel } from '../utils/exportUtils';
import { reconcileAll, reconciliationExportRows, RECONCILIATION_EXPORT_TYPES, MOVEMENT_LABELS, movementEffect } from '../utils/stockReconciliation';

const TONE = { OK: 'success', Difference: 'danger', 'History incomplete': 'warning' };
const fmtDateTime = (d) => (d ? new Date(d).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const signed = (n) => (n > 0 ? `+${n}` : String(n));
const cell = (n) => (n === null || n === undefined ? '—' : n);

/**
 * Batch Stock Reconciliation (Gap 15): every batch's movements added up and
 * set against what it holds. Screen-only; opened from Inventory, so only
 * roles with Inventory access reach it.
 */
export default function StockReconciliation({ onClose }) {
  const { inventory, getStockMovements } = useData();
  const [movements, setMovements] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('All');
  const [open, setOpen] = useState(null);

  useEffect(() => {
    let live = true;
    getStockMovements().then(({ data, error: err }) => {
      if (!live) return;
      if (err) setError(err);
      setMovements(data);
    });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const rows = useMemo(() => (movements ? reconcileAll(inventory, movements) : []), [inventory, movements]);
  const counts = useMemo(() => rows.reduce((c, r) => ({ ...c, [r.status]: (c[r.status] || 0) + 1 }), {}), [rows]);
  const shown = rows.filter(r => (status === 'All' || r.status === status)
    && `${r.product} ${r.batch} ${r.warehouse}`.toLowerCase().includes(search.trim().toLowerCase()));

  const exportRows = () => downloadExcel(reconciliationExportRows(shown), 'PRISMORA_Stock_Reconciliation', { types: RECONCILIATION_EXPORT_TYPES });

  const th = 'px-2.5 py-2 font-semibold whitespace-nowrap';
  const num = 'px-2.5 py-2 text-right tabular-nums whitespace-nowrap';
  return createPortal(
    <div className="fixed inset-0 z-[150] flex items-start justify-center p-3 sm:p-6">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative glass-panel bg-brand-primary w-full max-w-7xl max-h-[92vh] rounded-2xl shadow-2xl border border-white/10 z-10 flex flex-col overflow-hidden">
        <div className="flex justify-between items-start gap-3 p-5 border-b border-white/5">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2"><Scale size={18} className="text-brand-accent" />Batch stock reconciliation</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-3xl">
              What each batch should hold according to its recorded movements, against what it holds. Any difference is stock that
              moved without a record. Batches whose opening stock was never recorded are marked “History incomplete” instead of
              showing a difference that would be made up.
            </p>
          </div>
          <button type="button" title="Close" onClick={onClose} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 p-4 border-b border-white/5">
          <SearchInput placeholder="Search product, batch, warehouse" value={search} onChange={e => setSearch(e.target.value)} />
          <Select value={status} onChange={e => setStatus(e.target.value)} className="sm:w-56" aria-label="Status">
            <option value="All">All batches ({rows.length})</option>
            {['Difference', 'OK', 'History incomplete'].map(s => <option key={s} value={s}>{s} ({counts[s] || 0})</option>)}
          </Select>
          <Button icon={Download} onClick={exportRows} disabled={!shown.length}>Export</Button>
        </div>

        <div className="flex-1 overflow-auto custom-scrollbar">
          {movements === null ? <p className="p-6 text-sm text-slate-500">Loading stock movements…</p>
            : error ? <p className="p-6 text-sm text-rose-400">{error}</p>
            : (
              <table className="w-full text-xs text-left">
                <thead className="text-[10px] uppercase tracking-wide text-slate-500 bg-brand-primary sticky top-0 z-10">
                  <tr>
                    <th className={th} />
                    <th className={th}>Product / Batch</th>
                    <th className={`${th} text-right`}>Opening</th>
                    <th className={`${th} text-right`}>Received</th>
                    <th className={`${th} text-right`}>Delivered</th>
                    <th className={`${th} text-right`} title="Sales returns back on sale">Ret. good</th>
                    <th className={`${th} text-right`} title="Sales returns held as damaged (086)">Ret. damaged</th>
                    <th className={`${th} text-right`}>Adjust</th>
                    <th className={`${th} text-right`}>Transfers</th>
                    <th className={`${th} text-right`}>To vendor</th>
                    <th className={`${th} text-right`}>Free goods</th>
                    <th className={`${th} text-right`} title="Damaged written off or returned to the vendor (087)">Damaged out</th>
                    <th className={`${th} text-right`} title="Expired units written off (091)">Expired out</th>
                    <th className={`${th} text-right`}>Qty exp. / actual</th>
                    <th className={`${th} text-right`}>Damaged exp. / actual</th>
                    <th className={th}>Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {shown.map(r => (
                    <Fragment key={r.id}>
                      <tr className="hover:bg-white/5 cursor-pointer" onClick={() => setOpen(open === r.id ? null : r.id)}>
                        <td className="pl-2.5 py-2 text-slate-500">{open === r.id ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</td>
                        <td className="px-2.5 py-2">
                          <div className="font-semibold text-white">{r.product}</div>
                          <div className="text-[11px] text-slate-500">{r.batch || '(no batch no.)'} · {r.warehouse}</div>
                        </td>
                        <td className={num}>{r.opening || '—'}</td>
                        <td className={num}>{r.received}</td>
                        <td className={num}>{r.delivered}</td>
                        <td className={num}>{r.returnedGood}</td>
                        <td className={num}>{r.returnedDamaged}</td>
                        <td className={num}>{signed(r.adjustments)}</td>
                        <td className={num}>{signed(r.transfers)}</td>
                        <td className={num}>{r.toVendor}</td>
                        <td className={num}>{r.freeGoods}</td>
                        <td className={num}>{r.damagedOut}</td>
                        <td className={num}>{r.expiredOut}</td>
                        <td className={num}>
                          {cell(r.expectedQty)} / <span className="text-white font-semibold">{r.actualQty}</span>
                          {r.qtyDiff ? <div className="text-rose-400 font-semibold">{signed(r.qtyDiff)}</div> : null}
                        </td>
                        <td className={num}>
                          {cell(r.expectedDamaged)} / <span className="text-white font-semibold">{r.actualDamaged}</span>
                          {r.damagedDiff ? <div className="text-rose-400 font-semibold">{signed(r.damagedDiff)}</div> : null}
                        </td>
                        <td className="px-2.5 py-2" title={r.note || undefined}>
                          <Badge tone={TONE[r.status]} size="sm">{r.status}</Badge>
                        </td>
                      </tr>
                      {open === r.id && (
                        <tr className="bg-white/[0.02]">
                          <td />
                          <td colSpan={15} className="px-2.5 py-3">
                            {r.note && <p className="text-[11px] text-amber-400 mb-2">{r.note}</p>}
                            {r.movements.length === 0 ? <p className="text-slate-500">No movements recorded for this batch.</p> : (
                              <table className="w-full text-[11px]">
                                <thead className="text-slate-500"><tr>
                                  <th className="text-left py-1 pr-3 font-semibold">When</th><th className="text-left py-1 pr-3 font-semibold">Movement</th>
                                  <th className="text-right py-1 pr-3 font-semibold">Stock</th><th className="text-right py-1 pr-3 font-semibold">Damaged</th>
                                  <th className="text-left py-1 pr-3 font-semibold">Reference</th><th className="text-left py-1 font-semibold">Note</th>
                                </tr></thead>
                                <tbody>
                                  {r.movements.map(m => {
                                    const e = movementEffect(m);
                                    return (
                                      <tr key={m.id} className="border-t border-white/5">
                                        <td className="py-1 pr-3 whitespace-nowrap">{fmtDateTime(m.at)}</td>
                                        <td className="py-1 pr-3">{MOVEMENT_LABELS[m.kind] || m.kind}{m.condition ? ` (${m.condition})` : ''}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{e && e.qty ? signed(e.qty) : ''}</td>
                                        <td className="py-1 pr-3 text-right tabular-nums">{e && e.damaged ? signed(e.damaged) : ''}</td>
                                        <td className="py-1 pr-3 whitespace-nowrap">{[m.orderId, m.grnId, m.returnId, m.incentiveId].filter(Boolean).join(' · ') || '—'}</td>
                                        <td className="py-1">{m.note || ''}</td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  ))}
                  {!shown.length && <tr><td colSpan={16} className="p-6 text-center text-slate-500">No batches match.</td></tr>}
                </tbody>
              </table>
            )}
        </div>
      </div>
    </div>, document.body);
}
