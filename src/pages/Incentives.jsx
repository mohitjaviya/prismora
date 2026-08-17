import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Gift, Search, CheckCircle, Clock, Percent, Package } from 'lucide-react';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

// Maps a portal role to the id field its records carry on shared tables.
const PARTY_ID_FIELD = { Distributor: 'distributorId', Dealer: 'dealerId', Retailer: 'retailerId' };

export default function Incentives() {
  const { distributorIncentives, markIncentivePaid, distributors, dealers, retailers } = useData();
  const { user, canAccess } = useAuth();

  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;
  const canManage = canAccess('incentives', 'full') && !isParty;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const visible = useMemo(() => {
    // A party whose own record can't be resolved must see nothing. Without this,
    // `i[field] === party?.id` becomes `undefined === undefined`, which matches
    // every unassigned incentive and leaks it to them.
    if (isParty && !party?.id) return [];
    const base = isParty
      ? distributorIncentives.filter(i => i[PARTY_ID_FIELD[user?.role]] === party.id)
      : distributorIncentives;
    return base.filter(i => {
      const matchSearch = !search || i.schemeName.toLowerCase().includes(search.toLowerCase()) || i.orderId?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || i.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [distributorIncentives, isParty, party, user, search, statusFilter]);

  const kpis = useMemo(() => {
    const cashRows = visible.filter(i => i.incentiveType !== 'Free Goods');
    return {
      earned: cashRows.filter(i => i.status === 'Earned').reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
      paid: cashRows.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
      count: visible.length,
    };
  }, [visible]);

  const partyName = (incentive) => {
    if (incentive.distributorId) return { name: distributors?.find(d => d.id === incentive.distributorId)?.name || 'Unknown', type: 'Distributor' };
    if (incentive.dealerId) return { name: dealers?.find(d => d.id === incentive.dealerId)?.name || 'Unknown', type: 'Dealer' };
    if (incentive.retailerId) return { name: retailers?.find(r => r.id === incentive.retailerId)?.name || 'Unknown', type: 'Retailer' };
    return { name: 'Unknown', type: '' };
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Gift size={24} className="text-brand-accent" /> {isParty ? 'My Incentives' : 'Distributor, Dealer & Retailer Incentives'}
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          {isParty ? 'Auto-calculated incentives earned from qualifying scheme orders.' : 'Incentives auto-generated across distributors/dealers/retailers from active schemes.'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Awaiting Payout', value: formatCurrency(kpis.earned), color: 'text-amber-400' },
          { label: 'Paid Out', value: formatCurrency(kpis.paid), color: 'text-emerald-400' },
          { label: 'Total Incentives', value: kpis.count, color: 'text-blue-400' },
        ].map((k, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</p>
            <p className={`text-xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by scheme or order ID..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        <div className="flex gap-2">
          {['All', 'Earned', 'Paid'].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-white/5 text-slate-400 hover:text-white bg-brand-primary-lighter/40'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                {!isParty && <th className="p-4">Party</th>}
                <th className="p-4">Scheme</th>
                <th className="p-4">Order</th>
                <th className="p-4 text-right">Incentive</th>
                <th className="p-4 text-center">Status</th>
                {canManage && <th className="p-4 text-center">Actions</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {visible.length > 0 ? visible.map(i => (
                <tr key={i.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                  {!isParty && (
                    <td className="p-4">
                      <div className="font-medium text-white">{partyName(i).name}</div>
                      {partyName(i).type && <span className="text-[10px] text-slate-500 uppercase">{partyName(i).type}</span>}
                    </td>
                  )}
                  <td className="p-4">
                    <div className="text-white">{i.schemeName}</div>
                    <div className="text-xs text-slate-500">{formatDate(i.createdAt)}</div>
                  </td>
                  <td className="p-4 text-xs text-slate-400">{i.orderId || '—'}</td>
                  <td className="p-4 text-right font-semibold text-white">
                    <span className="inline-flex items-center gap-1">
                      {i.incentiveType === 'Free Goods' ? <Package size={12} className="text-purple-400" /> : <Percent size={12} className="text-brand-accent" />}
                      {i.incentiveType === 'Free Goods' ? `${i.incentiveValue} units` : formatCurrency(i.incentiveValue)}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${i.status === 'Paid' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-amber-500/10 text-amber-400 border-amber-500/20'}`}>
                      {i.status === 'Paid' ? <CheckCircle size={12} /> : <Clock size={12} />}{i.status}
                    </span>
                  </td>
                  {canManage && (
                    <td className="p-4 text-center">
                      {i.status === 'Earned' && (
                        <button onClick={() => markIncentivePaid(i.id)} className="text-xs font-semibold text-brand-accent hover:underline">Mark Paid</button>
                      )}
                    </td>
                  )}
                </tr>
              )) : (
                <tr><td colSpan={isParty ? 4 : 6} className="p-12 text-center text-slate-500">
                  <Gift size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No incentives yet. Place orders against active schemes to start earning.</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
