import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Wallet, ArrowUpCircle, ArrowDownCircle, CreditCard } from 'lucide-react';
import { buildLedgerEntries } from '../utils/distributorUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

export default function Ledger() {
  const { invoices, distributorPayments, distributors, dealers, retailers } = useData();
  const { user } = useAuth();

  const party = useMemo(() => {
    if (user?.role === 'Dealer') return dealers?.find(d => d.id === user?.dealerId);
    if (user?.role === 'Retailer') return retailers?.find(r => r.id === user?.retailerId);
    return distributors?.find(d => d.id === user?.distributorId);
  }, [distributors, dealers, retailers, user]);
  const entries = useMemo(() => buildLedgerEntries(party, invoices, distributorPayments), [party, invoices, distributorPayments]);

  if (!party) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500">
        <Wallet size={32} className="mx-auto mb-3 opacity-20" />
        <p>Your account profile could not be found. Contact support.</p>
      </div>
    );
  }

  const utilizationPct = party.creditLimit ? Math.min(100, Math.round(((party.outstandingAmount || 0) / party.creditLimit) * 100)) : 0;

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Wallet size={24} className="text-brand-accent" /> Outstanding Ledger
        </h1>
        <p className="text-slate-400 text-sm mt-1">Your invoices, payments, and running balance with Janki Herbals.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Current Outstanding</p>
          <p className={`text-2xl font-extrabold mt-1 ${(party.outstandingAmount || 0) > (party.creditLimit || 0) ? 'text-rose-400' : 'text-white'}`}>{formatCurrency(party.outstandingAmount || 0)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Credit Limit</p>
          <p className="text-2xl font-extrabold mt-1 text-emerald-400">{formatCurrency(party.creditLimit)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5"><CreditCard size={12} />Utilization</p>
          <div className="mt-2 h-2 bg-brand-primary-lighter rounded-full overflow-hidden">
            <div className={`h-full rounded-full ${utilizationPct > 90 ? 'bg-rose-500' : utilizationPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${utilizationPct}%` }} />
          </div>
          <p className="text-xs text-slate-500 mt-1">{utilizationPct}% used</p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Date</th>
                <th className="p-4">Description</th>
                <th className="p-4 text-right">Debit</th>
                <th className="p-4 text-right">Credit</th>
                <th className="p-4 text-right">Balance</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {entries.length > 0 ? entries.map(row => (
                <tr key={row.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                  <td className="p-4 text-xs text-slate-500">{formatDate(row.date)}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      {row.debit > 0 ? <ArrowUpCircle size={14} className="text-rose-400 flex-shrink-0" /> : <ArrowDownCircle size={14} className="text-emerald-400 flex-shrink-0" />}
                      {row.description}
                    </div>
                  </td>
                  <td className="p-4 text-right text-rose-400 font-medium">{row.debit > 0 ? formatCurrency(row.debit) : '—'}</td>
                  <td className="p-4 text-right text-emerald-400 font-medium">{row.credit > 0 ? formatCurrency(row.credit) : '—'}</td>
                  <td className="p-4 text-right font-bold text-white">{formatCurrency(row.balance)}</td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="p-12 text-center text-slate-500">
                  <Wallet size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No ledger activity yet.</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
