import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Wallet, ShoppingCart, Tag, Gift, ArrowRight, CreditCard, UserX } from 'lucide-react';
import { PageHeader, Card, StatCard, EmptyState } from '../components/ui';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export default function RetailerDashboard() {
  const { orders, schemes, distributorIncentives, retailers } = useData();
  const { user } = useAuth();

  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);

  const myOrders = useMemo(() => orders.filter(o => o.retailerId === retailer?.id), [orders, retailer]);

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
      ['Retailer', 'All'].includes(s.applicableTo) &&
      s.status === 'Active' &&
      (!s.validFrom || new Date(s.validFrom) <= now) &&
      (!s.validTo || new Date(s.validTo) >= now)
    ).length;
  }, [schemes]);

  const incentivesPending = useMemo(() =>
    distributorIncentives
      .filter(i => i.retailerId === retailer?.id && i.status === 'Earned' && i.incentiveType !== 'Free Goods')
      .reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
    [distributorIncentives, retailer]
  );

  const utilizationPct = retailer?.creditLimit ? Math.min(100, Math.round(((retailer.outstandingAmount || 0) / retailer.creditLimit) * 100)) : 0;

  if (!retailer) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader icon={UserX} title="Account not linked" />
        <Card padding="p-0">
          <EmptyState
            icon={UserX}
            title="Your retailer profile could not be found"
            hint="This login is not linked to a retailer record, so there is no account to show. An administrator can link it from the Retailers screen — it takes a moment and nothing is lost in the meantime."
          />
        </Card>
      </div>
    );
  }

  const kpiCards = [
    { label: 'Outstanding', tone: 'danger', value: formatCurrency(retailer.outstandingAmount || 0), icon: Wallet, sub: `${utilizationPct}% of ${formatCurrency(retailer.creditLimit)} limit` },
    { label: 'Orders This Month', tone: 'accent', value: ordersThisMonth.length, icon: ShoppingCart, sub: `${formatCurrency(ordersThisMonth.reduce((s, o) => s + Number(o.value || 0), 0))} total value` },
    { label: 'Active Schemes', tone: 'info', value: activeSchemesCount, icon: Tag, sub: 'currently available to you' },
    { label: 'Incentives Pending', tone: 'success', value: formatCurrency(incentivesPending), icon: Gift, sub: 'awaiting payout' },
  ];

  const quickLinks = [
    { label: 'Place an Order', to: '/orders', icon: <ShoppingCart size={16} /> },
    { label: 'View Ledger', to: '/ledger', icon: <CreditCard size={16} /> },
    { label: 'Browse Schemes', to: '/schemes', icon: <Tag size={16} /> },
    { label: 'My Incentives', to: '/incentives', icon: <Gift size={16} /> },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        title={`Welcome back, ${retailer.name}`}
        subtitle="A snapshot of your account with Janki Herbals."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpiCards.map(k => (
          <StatCard key={k.label} label={k.label} value={k.value} icon={k.icon} tone={k.tone} hint={k.sub} />
        ))}
      </div>

      <Card>
        <h3 className="text-sm font-bold text-white mb-4">Quick Actions</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {quickLinks.map(link => (
            <Link key={link.to} to={link.to} className="flex items-center justify-between gap-2 bg-brand-primary-lighter/30 hover:bg-brand-accent/10 border border-white/5 hover:border-brand-accent/30 rounded-xl px-4 py-3 text-sm text-slate-300 hover:text-brand-accent transition-all group">
              <span className="flex items-center gap-2">{link.icon}{link.label}</span>
              <ArrowRight size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />
            </Link>
          ))}
        </div>
      </Card>
    </div>
  );
}
