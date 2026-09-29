import { useEffect, useState } from 'react';
import { CheckCircle2, AlertTriangle, RefreshCw } from 'lucide-react';
import { supabase } from '../../supabaseClient';
import { Card } from '../ui';
import { useConfirm, useToast } from '../../context/DialogContext';

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
 *
 * Vendors too (vendor_balance_drift, 065): what we owe each vendor against
 * its goods receipts − purchase returns − payments.
 */
const summary = (rows) => {
  const vendors = rows.filter(r => r.kind === 'Vendor').length, partners = rows.length - vendors;
  return [
    partners && `${partners} partner balance${partners === 1 ? '' : 's'} differ from invoices − payments − credit notes`,
    vendors && `${vendors} vendor balance${vendors === 1 ? '' : 's'} differ from goods receipts − returns − payments`,
  ].filter(Boolean).join('; ');
};

export default function BalanceCheckPanel({ watch }) {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);
  const confirm = useConfirm();
  const toast = useToast();
  // A vendor's balance set to its receipts − returns − payments (067); the
  // database allows Accounts and administrators only, and audits it.
  const correctVendor = async (r) => {
    if (!await confirm({
      title: `Correct ${r.name}'s balance?`,
      body: `Stored ${formatCurrency(r.stored)} becomes ${formatCurrency(r.derived)} — goods receipts − returns − payments. The change is recorded in the audit log. Only do this once the cause is understood.`,
      confirmLabel: 'Correct balance',
    })) return;
    const { data, error: err } = await supabase.rpc('correct_vendor_balance', { p_id: r.id });
    if (err) { toast(err.message || 'The balance could not be corrected.', 'error'); return; }
    toast(`${r.name}: balance corrected to ${formatCurrency(data)}.`, 'success');
    setRows(null); setTick(t => t + 1);
  };

  useEffect(() => {
    let live = true;
    Promise.all([supabase.rpc('partner_balance_drift'), supabase.rpc('vendor_balance_drift')]).then(([p, v]) => {
      if (!live) return;
      const err = p.error || v.error;
      if (err) { setError(err.message || 'The balance check could not run.'); setRows([]); return; }
      setError('');
      setRows([...(p.data || []), ...(v.data || []).map(r => ({ ...r, kind: 'Vendor' }))]);
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
                  : summary(rows)}
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
                <th scope="col" className="py-1.5 pr-3 font-semibold">Partner / vendor</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Stored</th>
                <th scope="col" className="py-1.5 pr-3 font-semibold text-right">Should be</th>
                <th scope="col" className="py-1.5 font-semibold text-right">Difference</th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={`${r.kind}-${r.id}`} className="border-b border-white/5 last:border-0">
                  <td className="py-1.5 pr-3 text-white">{r.name} <span className="text-slate-500">· {r.kind} {r.id}</span></td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{formatCurrency(r.stored)}</td>
                  <td className="py-1.5 pr-3 text-right text-slate-300">{formatCurrency(r.derived)}</td>
                  <td className="py-1.5 text-right font-bold text-amber-400">
                    {formatCurrency(r.difference)}
                    {r.kind === 'Vendor' && (
                      <button type="button" onClick={() => correctVendor(r)} className="ml-2 text-[11px] font-semibold text-brand-accent hover:underline">Correct</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="text-[11px] text-slate-500 mt-2">For a partner, open its Ledger to see the entries and use "Correct balance" there; for a vendor, check its ledger under Purchases → Vendors and use "Correct" here — once the cause is understood.</p>
        </div>
      )}
    </Card>
  );
}
