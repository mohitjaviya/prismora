import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Wallet, ShoppingCart, Tag, Gift, ArrowRight, CreditCard } from 'lucide-react';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export default function DistributorDashboard() {
  const { orders, schemes, distributorIncentives, distributors } = useData();
  const { user } = useAuth();

  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);

  const myOrders = useMemo(() => orders.filter(o => o.distributorId === distributor?.id), [orders, distributor]);

  const ordersThisMonth = useMemo(() => {
    const now = new Date();
    return myOrders.filter(o => {
      const d = new Date(o.date || o.createdAt);
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    });
  }, [myOrders]);

  const activeSchemesCount = useMemo(() => {
    const now = new Date();
    return schemes.filter(s =>
      ['Distributor', 'All'].includes(s.applicableTo) &&
      s.status === 'Active' &&
      (!s.validFrom || new Date(s.validFrom) <= now) &&
      (!s.validTo || new Date(s.validTo) >= now)
    ).length;
  }, [schemes]);

  const incentivesPending = useMemo(() =>
    distributorIncentives
      .filter(i => i.distributorId === distributor?.id && i.status === 'Earned' && i.incentiveType !== 'Free Goods')
      .reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
    [distributorIncentives, distributor]
  );

  const utilizationPct = distributor?.creditLimit ? Math.min(100, Math.round(((distributor.outstandingAmount || 0) / distributor.creditLimit) * 100)) : 0;

  if (!distributor) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500">
        <p>Your distributor profile could not be found. Contact support.</p>
      </div>
    );
  }

  const kpiCards = [
    { label: 'Outstanding', value: formatCurrency(distributor.outstandingAmount || 0), icon: <Wallet size={22} className="text-rose-400" />, sub: `${utilizationPct}% of ${formatCurrency(distributor.creditLimit)} limit` },
    { label: 'Orders This Month', value: ordersThisMonth.length, icon: <ShoppingCart size={22} className="text-brand-accent" />, sub: `${formatCurrency(ordersThisMonth.reduce((s, o) => s + Number(o.value || 0), 0))} total value` },
    { label: 'Active Schemes', value: activeSchemesCount, icon: <Tag size={22} className="text-blue-400" />, sub: 'currently available to you' },
    { label: 'Incentives Pending', value: formatCurrency(incentivesPending), icon: <Gift size={22} className="text-emerald-400" />, sub: 'awaiting payout' },
  ];

  const quickLinks = [
    { label: 'Place an Order', to: '/orders', icon: <ShoppingCart size={16} /> },
    { label: 'View Ledger', to: '/ledger', icon: <CreditCard size={16} /> },
    { label: 'Browse Schemes', to: '/schemes', icon: <Tag size={16} /> },
    { label: 'My Incentives', to: '/incentives', icon: <Gift size={16} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white">Welcome back, {distributor.name}</h1>
        <p className="text-slate-400 text-sm mt-1">Here's a snapshot of your account with Janki Herbals.</p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {kpiCards.map((k, i) => (
          <div key={i} className="glass-panel rounded-2xl p-5 border border-white/5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</span>
              {k.icon}
            </div>
            <p className="text-2xl font-extrabold text-white">{k.value}</p>
            <p className="text-[11px] text-slate-500 mt-1">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="glass-panel rounded-2xl border border-white/5 p-5">
        <h3 className="text-sm font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLinks.map(link => (
            <Link key={link.to} to={link.to} className="flex items-center justify-between gap-2 bg-brand-primary-lighter/30 hover:bg-brand-accent/10 border border-white/5 hover:border-brand-accent/30 rounded-xl px-4 py-3 text-sm text-slate-300 hover:text-brand-accent transition-all group">
              <span className="flex items-center gap-2">{link.icon}{link.label}</span>
              <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
