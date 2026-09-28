import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { Card } from '../ui';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

/**
 * Every partner whose stored balance differs from its invoices − payments −
 * credit notes (partner_balance_drift, 048).
 *
 * The five balances reconciled on 2026-09-28 had been wrong for days before
 * anyone looked. This asks the database the same question each time the
 * Accounting screen opens, or its figures change, so a drift is seen the day
 * it happens. The database answers only Accounting viewers.
 *
 * `watch` is anything that changes when money moves (invoice and payment
 * counts), so the check re-runs after a save on this screen.
 */
export default function BalanceCheckPanel({ watch }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let live = true;
    supabase.rpc('partner_balance_drift').then(({ data, error: err }) => {
      if (!live) return;
      if (err) { setError(err.message || 'The balance check could not run.'); setRows([]); return; }
      setError('');
      setRows(data || []);
    });
    return () => { live = false; };
  }, [watch, tick]);

  const loading = rows === null;
  const clean = !loading && !error && rows.length === 0;

  return (
    <Card padding="p-4" className={clean ? '' : 'border-amber-500/25 bg-amber-500/5'}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 min-w-0">
          {clean
            ? <CheckCircle2 size={15} className="text-emerald-400 flex-shrink-0" />
            : <AlertTriangle size={15} className={loading ? 'text-slate-500 flex-shrink-0' : 'text-amber-400 flex-shrink-0'} />}
          <h3 className="text-sm font-bold text-white">Balance check</h3>
          <span className="text-xs text-slate-400">
            {loading ? 'Checking…'
              : error ? error
                : clean ? 'All balances match'
                  : `${rows.length} partner balance${rows.length === 1 ? '' : 's'} differ from invoices − payments − credit notes`}
          </span>
        </div>
        <button type="button" onClick={() => { setRows(null); setTick(t => t + 1); }}
          className="text-[11px] font-semibold text-brand-accent hover:underline inline-flex items-center gap-1">
          <RefreshCw size={11} /> Check again
        </button>
      </div>

      {!loading && rows.length > 0 && (
        <div className="mt-3 overflow-x-auto custom-scrollbar">
          <table className="w-full min-w-[520px] text-xs">
            <thead>
              <tr className="text-slate-400 text-left border-b border-white/5">
                <th scope="col" className="py-1.5 pr-3 font-semibold">Partner</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Stored</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Should be</th>
                <th scope="col" className="py-1.5 font-semibold text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-3 text-white">{r.name} <span className="text-slate-500">· {r.kind} {r.id}</span></td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{formatCurrency(r.stored)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{formatCurrency(r.derived)}</td>
                  <td className="py-1.5 text-right font-bold text-amber-400">{formatCurrency(r.difference)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">Open the partner's Ledger to see the entries, and use "Correct balance" there once the cause is understood.</p>
        </div>
      )}
    </Card>
  );
}
