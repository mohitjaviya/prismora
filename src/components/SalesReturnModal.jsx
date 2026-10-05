import { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { Undo2, X, Plus, Trash2 } from 'lucide-react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/DialogContext';
import { returnsForOrder, conditionForReason, RETURN_CONDITIONS } from '../utils/salesReturns';
import OrderReturnsList from './OrderReturnsList';
import { FieldError, ErrorSummary, useFieldCheck } from './ui';
import { quantityProblem, isBlank } from '../utils/formRules';

const REASONS = ['Damaged in transit', 'Expired / near expiry', 'Wrong product', 'Quality complaint', 'Excess stock', 'Other'];
const inputCls = 'w-full glass-input rounded-lg px-2.5 py-2 text-xs text-white';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 2 }).format(val || 0);

/**
 * Goods coming back on a delivered order (D-19, D-22).
 *
 * A delivered order is never cancelled — the goods left, the invoice stands.
 * What came back is recorded here, line by line, and the database does the
 * rest in one step (record_sales_return, 054): the units go back into the
 * batch they left from, a credit note is raised for what was billed (the
 * partner's balance moves once), and nothing can come back beyond what was
 * delivered. The form offers only what is still returnable, and the
 * database checks it again.
 */
export default function SalesReturnModal({ order, onClose }) {
  const { getOrderReturnable, recordSalesReturn, inventory, salesReturns, salesReturnConditionSupported } = useData();
  const { users } = useAuth();
  const toast = useToast();
  const previous = returnsForOrder(salesReturns, order.id);
  const [position, setPosition] = useState(null);
  const [lines, setLines] = useState([]);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const lineCheck = useFieldCheck();
  // Condition of the goods (086). Off until the database says it has the
  // column; while off, the form and what it sends are exactly as before 086.
  const [conditionOn, setConditionOn] = useState(false);
  useEffect(() => {
    let live = true;
    salesReturnConditionSupported().then(ok => { if (live) setConditionOn(ok); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    let live = true;
    getOrderReturnable(order.id).then(({ data, error: err }) => {
      if (!live) return;
      if (err) { setError(err); setPosition([]); return; }
      setPosition(data);
      const first = data.find(p => p.returnable > 0);
      if (first) setLines([blankLine(first)]);
    });
    return () => { live = false; };
  }, [order.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Batches a line may go back to: the ones this order was delivered from, when
  // they were recorded; otherwise any batch of the product on record.
  const batchesFor = (product) => {
    const pos = position?.find(p => p.product === product);
    if (pos?.batches?.length) {
      return pos.batches.map(b => ({ id: b.inventoryId, label: `${b.batchNumber || '(no batch no.)'} — delivered ${b.delivered}, returnable ${b.returnable}`, max: Number(b.returnable) }));
    }
    return (inventory || []).filter(b => b.product === product)
      .map(b => ({ id: b.id, label: `${b.batchNumber || '(no batch no.)'} — ${b.warehouse || ''}`, max: null }));
  };
  function blankLine(pos) {
    const b = pos.batches?.find(x => Number(x.returnable) > 0) || null;
    return { product: pos.product, inventoryId: b?.inventoryId || '', quantity: '', reason: REASONS[0], condition: conditionForReason(REASONS[0]) };
  }

  const returnable = useMemo(() => (position || []).filter(p => Number(p.returnable) > 0), [position]);
  const setLine = (i, patch) => setLines(ls => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  // A line with a quantity typed is a line to return: whole units, more than 0,
  // no more than what can still come back (the database refuses the same).
  // Lines left blank are ignored, as long as one line has a quantity.
  const lineExtra = (f) => {
    const out = {};
    const used = f.lines.map(l => !isBlank(l.quantity));
    f.lines.forEach((l, i) => {
      if (!used[i]) {
        if (!used.some(Boolean) && i === 0) out['lines.0.quantity'] = 'Enter the quantity to return (whole units)';
        return;
      }
      const max = lineMax(l);
      const problem = quantityProblem(l.quantity, 'Quantity');
      if (problem) out[`lines.${i}.quantity`] = problem;
      else if (Number.isFinite(max) && Number(l.quantity) > max) out[`lines.${i}.quantity`] = `Only ${max} can still be returned`;
      if (!l.inventoryId) out[`lines.${i}.inventoryId`] = 'Choose the batch this line goes back to';
    });
    return out;
  };
  const lineMax = (l) => {
    const pos = position?.find(p => p.product === l.product);
    const batchMax = batchesFor(l.product).find(b => b.id === l.inventoryId)?.max;
    return Math.min(Number(pos?.returnable || 0), batchMax ?? Infinity);
  };
  const lineErrors = lineCheck.errors({ lines }, {}, lineExtra);

  const save = async (e) => {
    e.preventDefault();
    if (saving) return;
    setError('');
    if (!lineCheck.ok({ lines }, {}, lineExtra)) return;
    const clean = lines.filter(l => !isBlank(l.quantity));
    setSaving(true);
    // Without 086 the lines are what they always were; with it, each carries its condition.
    const result = await recordSalesReturn(order.id, clean.map(l => ({
      product: l.product, inventoryId: l.inventoryId, quantity: Number(l.quantity), reason: l.reason,
      ...(conditionOn ? { condition: l.condition || 'Good' } : {}),
    })), note);
    setSaving(false);
    if (!result.ok) { setError(result.error); return; }
    const held = conditionOn && clean.some(l => l.condition && l.condition !== 'Good');
    toast(`Return ${result.returnId} recorded: ${held ? 'good units back on sale, damaged/expired units held as damaged (not sellable)' : 'stock put back'}, credit note ${result.creditNoteId} for ${formatCurrency(result.value)}.`, 'success');
    onClose(true);
  };

  return createPortal(
    <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[6vh]">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !saving && onClose(false)} />
      <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[88vh] rounded-2xl shadow-2xl border border-brand-accent/30 z-10 flex flex-col overflow-hidden">
        <div className="flex justify-between items-center p-5 border-b border-white/5">
          <h3 className="text-lg font-bold text-white flex items-center gap-2"><Undo2 size={18} className="text-brand-accent" />Sales return — {order.id}</h3>
          <button type="button" title="Close" onClick={() => onClose(false)} className="p-1 text-slate-400 hover:text-white"><X size={18} /></button>
        </div>
        <form onSubmit={save} noValidate className="flex-1 overflow-y-auto custom-scrollbar p-5 space-y-4">
          {previous.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Previous returns</p>
              <OrderReturnsList returns={previous} users={users} />
            </div>
          )}
          <p className="text-xs text-slate-400">
            {order.customerName}. Returned units go back into the batch they left from, and a credit note for what was billed
            is raised against the partner's account. Nothing can come back beyond what was delivered.
          </p>
          {position === null ? <p className="text-sm text-slate-500">Loading what was delivered…</p> : (
            <>
              <div className="rounded-xl border border-white/5 p-3 text-xs text-slate-300 space-y-1">
                {position.map(p => (
                  <div key={p.product} className="flex justify-between gap-3">
                    <span>{p.product}</span>
                    <span className="text-slate-500">delivered {p.delivered} · returned {p.returned} · <span className="text-white font-semibold">returnable {p.returnable}</span></span>
                  </div>
                ))}
              </div>
              {returnable.length === 0 ? <p className="text-sm text-amber-400">Everything delivered on this order has already come back.</p> : lines.map((l, i) => {
                const batchOpts = batchesFor(l.product);
                return (
                  <div key={i} className="grid grid-cols-12 gap-2 items-end bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                    <div className="col-span-12 sm:col-span-5">
                      <label htmlFor={`sr-product-${i}`} className="block text-[10px] text-slate-500 mb-1">Product</label>
                      <select id={`sr-product-${i}`} className={inputCls} value={l.product}
                        onChange={e => { const p = returnable.find(x => x.product === e.target.value); setLine(i, blankLine(p)); }}>
                        {returnable.map(p => <option key={p.product} value={p.product} className="bg-brand-primary">{p.product}</option>)}
                      </select>
                    </div>
                    {/* Gap 11: the batch label ("B1 — delivered 2, returnable 1")
                        gets a wide field of its own and its full text as a tooltip. */}
                    <div className="col-span-12 sm:col-span-7">
                      <label htmlFor={`sr-batch-${i}`} className="block text-[10px] text-slate-500 mb-1">Back into batch</label>
                      <select id={`sr-batch-${i}`} className={inputCls} value={l.inventoryId} onChange={e => setLine(i, { inventoryId: e.target.value })}
                        title={batchOpts.find(b => b.id === l.inventoryId)?.label || 'Choose the batch the goods go back to'}>
                        <option value="" className="bg-brand-primary">Choose…</option>
                        {batchOpts.map(b => <option key={b.id} value={b.id} title={b.label} className="bg-brand-primary">{b.label}</option>)}
                      </select>
                      <FieldError errors={lineErrors} field={`lines.${i}.inventoryId`} />
                    </div>
                    <div className={`col-span-4 ${conditionOn ? 'sm:col-span-2' : 'sm:col-span-3'}`}>
                      <label htmlFor={`sr-qty-${i}`} className="block text-[10px] text-slate-500 mb-1">Qty</label>
                      <input id={`sr-qty-${i}`} type="number" className={inputCls}
                        value={l.quantity} onChange={e => setLine(i, { quantity: e.target.value })} />
                      <FieldError errors={lineErrors} field={`lines.${i}.quantity`} />
                    </div>
                    <div className={`col-span-7 ${conditionOn ? 'sm:col-span-5' : 'sm:col-span-8'}`}>
                      <label htmlFor={`sr-reason-${i}`} className="block text-[10px] text-slate-500 mb-1">Reason</label>
                      <select id={`sr-reason-${i}`} className={inputCls} value={l.reason} onChange={e => setLine(i, { reason: e.target.value, condition: conditionForReason(e.target.value) })}>
                        {REASONS.map(r => <option key={r} value={r} className="bg-brand-primary">{r}</option>)}
                      </select>
                    </div>
                    {conditionOn && (
                      // 086: Damaged/Expired units go to the batch's damaged count, not back on sale.
                      <div className="col-span-11 sm:col-span-4">
                        <label htmlFor={`sr-condition-${i}`} className="block text-[10px] text-slate-500 mb-1">Condition</label>
                        <select id={`sr-condition-${i}`} className={inputCls} value={l.condition || 'Good'} onChange={e => setLine(i, { condition: e.target.value })}
                          title="Good goes back on sale; Damaged and Expired are held as damaged stock (not sellable)">
                          {RETURN_CONDITIONS.map(c => <option key={c} value={c} className="bg-brand-primary">{c === 'Good' ? 'Good (back on sale)' : `${c} (not sellable)`}</option>)}
                        </select>
                      </div>
                    )}
                    <div className="col-span-1 flex justify-end">
                      {lines.length > 1 && <button type="button" title="Remove line" onClick={() => setLines(ls => ls.filter((_, j) => j !== i))} className="p-2 text-slate-500 hover:text-rose-400"><Trash2 size={14} /></button>}
                    </div>
                  </div>
                );
              })}
              {returnable.length > 0 && (
                <button type="button" onClick={() => setLines(ls => [...ls, blankLine(returnable[0])])} className="text-xs font-semibold text-brand-accent inline-flex items-center gap-1"><Plus size={12} /> Add a line</button>
              )}
              <div>
                <label htmlFor="sr-note" className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Note (optional)</label>
                <textarea id="sr-note" rows="2" value={note} onChange={e => setNote(e.target.value)} className="w-full glass-input rounded-xl px-3 py-2 text-sm text-white resize-none" />
              </div>
            </>
          )}
          <ErrorSummary errors={lineErrors} />
          {error && <p className="text-xs text-rose-400 bg-rose-500/10 border border-rose-500/20 rounded-lg px-3 py-2">{error}</p>}
          <div className="flex justify-end gap-3 pt-2 border-t border-white/5">
            <button type="button" onClick={() => onClose(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
            <button type="submit" disabled={saving || !returnable.length} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving ? 'Saving…' : 'Record return'}</button>
          </div>
        </form>
      </div>
    </div>, document.body);
}
