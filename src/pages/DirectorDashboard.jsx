import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole } from '../context/AuthContext';
import {
  TrendingUp, Wallet, Network, Store, Building2, Package2, AlertTriangle,
  Target, Trophy, IndianRupee, ArrowUpRight, ArrowDownRight, Boxes, Users
} from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const compactCurrency = (val) => {
  const n = Number(val || 0);
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(2)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(2)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${n}`;
};

const CHART_COLORS = ['#D4186C', '#6366F1', '#A78BFA', '#38BDF8', '#34D399', '#FBBF24'];

export default function DirectorDashboard() {
  const {
    orders, invoices, expenses, inventory, productCatalog,
    distributors, dealers, retailers, leads,
  } = useData();
  const { users } = useAuth();

  const [target, setTarget] = useState(() => {
    const saved = localStorage.getItem('prismora_ytd_target');
    return saved ? Number(saved) : 5000000;
  });
  const [editingTarget, setEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState('');

  const now = useMemo(() => new Date(), []);
  const todayStr = now.toISOString().split('T')[0];
  const thisMonth = now.getMonth();
  const thisYear = now.getFullYear();

  const liveOrders = useMemo(() => orders.filter(o => o.status !== 'Cancelled'), [orders]);

  // ── Sales KPIs ────────────────────────────────────────────────────────────
  const sales = useMemo(() => {
    let today = 0, mtd = 0, ytd = 0;
    liveOrders.forEach(o => {
      const d = new Date(o.date || o.createdAt);
      const val = Number(o.value || 0);
      if (d.getFullYear() === thisYear) {
        ytd += val;
        if (d.getMonth() === thisMonth) mtd += val;
        if ((o.date || o.createdAt || '').split('T')[0] === todayStr) today += val;
      }
    });
    return { today, mtd, ytd };
  }, [liveOrders, thisMonth, thisYear, todayStr]);

  const targetPct = target > 0 ? Math.min(100, Math.round((sales.ytd / target) * 100)) : 0;

  // ── Monthly trend (this year) ─────────────────────────────────────────────
  const monthlyTrend = useMemo(() => {
    const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    const data = MONTHS.map(m => ({ month: m, sales: 0 }));
    liveOrders.forEach(o => {
      const d = new Date(o.date || o.createdAt);
      if (d.getFullYear() === thisYear) data[d.getMonth()].sales += Number(o.value || 0);
    });
    return data;
  }, [liveOrders, thisYear]);

  // ── Network ──────────────────────────────────────────────────────────────
  const network = useMemo(() => {
    const count = (arr) => ({
      total: arr.length,
      active: arr.filter(x => x.status === 'Active').length,
      pending: arr.filter(x => x.status === 'Pending').length,
    });
    return { dist: count(distributors), deal: count(dealers), ret: count(retailers) };
  }, [distributors, dealers, retailers]);

  // ── Collections (receivables across all channels + invoices) ─────────────
  const collections = useMemo(() => {
    const channelOutstanding =
      distributors.reduce((s, d) => s + (d.outstandingAmount || 0), 0) +
      dealers.reduce((s, d) => s + (d.outstandingAmount || 0), 0) +
      retailers.reduce((s, r) => s + (r.outstandingAmount || 0), 0);

    const unpaid = invoices.filter(i => i.status === 'Unpaid' || i.status === 'Overdue' || i.status === 'Pending');
    const overdueVal = unpaid.reduce((s, i) => {
      const due = i.dueDate ? new Date(i.dueDate) : null;
      return (due && due < now) ? s + Number(i.amount || 0) + Number(i.tax || 0) : s;
    }, 0);

    // Ageing buckets on unpaid invoices
    const buckets = { '0-30': 0, '30-60': 0, '60-90': 0, '90+': 0 };
    unpaid.forEach(i => {
      const created = new Date(i.createdAt);
      const days = Math.floor((now - created) / 86400000);
      const amt = Number(i.amount || 0) + Number(i.tax || 0);
      if (days <= 30) buckets['0-30'] += amt;
      else if (days <= 60) buckets['30-60'] += amt;
      else if (days <= 90) buckets['60-90'] += amt;
      else buckets['90+'] += amt;
    });

    return { channelOutstanding, overdueVal, overdueCount: unpaid.length, buckets };
  }, [distributors, dealers, retailers, invoices, now]);

  // ── Finance ──────────────────────────────────────────────────────────────
  const finance = useMemo(() => {
    const revenue = invoices.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.amount || 0) + Number(i.tax || 0), 0);
    const exp = expenses.reduce((s, e) => s + Number(e.amount || 0), 0);
    const profit = revenue - exp;
    const margin = revenue ? ((profit / revenue) * 100).toFixed(1) : 0;
    return { revenue, exp, profit, margin };
  }, [invoices, expenses]);

  // ── Inventory health ─────────────────────────────────────────────────────
  const invHealth = useMemo(() => {
    const stockValue = inventory.reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0);
    const byProduct = {};
    inventory.forEach(i => {
      byProduct[i.product] = (byProduct[i.product] || 0) + Math.max(0, (i.quantity || 0) - (i.reserved || 0));
    });
    const outOfStock = productCatalog.filter(p => (byProduct[p.name] || 0) === 0).length;
    const nearExpiry = inventory.filter(i => {
      if (!i.expiryDate) return false;
      const days = Math.ceil((new Date(i.expiryDate) - now) / 86400000);
      return days > 0 && days <= 60;
    }).length;
    return { stockValue, outOfStock, nearExpiry };
  }, [inventory, productCatalog, now]);

  // ── Top products (by revenue, this year) ─────────────────────────────────
  const topProducts = useMemo(() => {
    const byProduct = {};
    liveOrders.forEach(o => {
      const items = Array.isArray(o.items) && o.items.length > 0
        ? o.items.map(i => ({ name: i.name, value: Number(i.total || 0) }))
        : [{ name: o.product, value: Number(o.value || 0) }];
      items.forEach(({ name, value }) => {
        if (!name) return;
        byProduct[name] = (byProduct[name] || 0) + value;
      });
    });
    return Object.entries(byProduct)
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  }, [liveOrders]);

  // ── State-wise sales ─────────────────────────────────────────────────────
  const stateSales = useMemo(() => {
    const byState = {};
    liveOrders.forEach(o => {
      const s = o.state || 'Unknown';
      byState[s] = (byState[s] || 0) + Number(o.value || 0);
    });
    return Object.entries(byState).map(([state, value]) => ({ state, value })).sort((a, b) => b.value - a.value).slice(0, 6);
  }, [liveOrders]);

  // ── Sales leaderboard ────────────────────────────────────────────────────
  const leaderboard = useMemo(() => {
    return (users || []).filter(u => isSalesRole(u.role)).map(u => {
      const uOrders = liveOrders.filter(o => o.assignedTo === u.id);
      const uLeads = leads.filter(l => l.assignedTo === u.id);
      const converted = uLeads.filter(l => l.status === 'Converted').length;
      return {
        name: u.name,
        revenue: uOrders.reduce((s, o) => s + Number(o.value || 0), 0),
        orders: uOrders.length,
        convRate: uLeads.length ? Math.round((converted / uLeads.length) * 100) : 0,
      };
    }).sort((a, b) => b.revenue - a.revenue);
  }, [users, liveOrders, leads]);

  // ── Alerts ───────────────────────────────────────────────────────────────
  const alerts = useMemo(() => {
    const list = [];
    // Distributors with no order in 30 days
    const thirtyAgo = new Date(now.getTime() - 30 * 86400000);
    distributors.filter(d => d.status === 'Active').forEach(d => {
      const last = liveOrders.filter(o => o.distributorId === d.id).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt))[0];
      if (!last || new Date(last.date || last.createdAt) < thirtyAgo) {
        list.push({ type: 'dormant', text: `${d.name} hasn't ordered in 30+ days` });
      }
    });
    // Near stock-out
    const byProduct = {};
    inventory.forEach(i => { byProduct[i.product] = (byProduct[i.product] || 0) + Math.max(0, (i.quantity || 0) - (i.reserved || 0)); });
    productCatalog.forEach(p => {
      const avail = byProduct[p.name] || 0;
      if (avail === 0) list.push({ type: 'stock', text: `${p.name} is OUT of stock` });
      else if (avail <= 50) list.push({ type: 'stock', text: `${p.name} low — ${avail} units left` });
    });
    // Over-credit-limit channel partners
    [...distributors, ...dealers, ...retailers].forEach(c => {
      if ((c.outstandingAmount || 0) > (c.creditLimit || 0) && c.creditLimit) {
        list.push({ type: 'credit', text: `${c.name} is over credit limit (${compactCurrency(c.outstandingAmount)})` });
      }
    });
    return list.slice(0, 12);
  }, [distributors, dealers, retailers, liveOrders, inventory, productCatalog, now]);

  const saveTarget = () => {
    const t = Number(tempTarget);
    if (t > 0) { setTarget(t); localStorage.setItem('prismora_ytd_target', String(t)); }
    setEditingTarget(false);
  };

  const kpiCards = [
    { label: "Today's Sale", value: compactCurrency(sales.today), icon: <TrendingUp size={20} className="text-brand-accent" />, sub: 'orders placed today' },
    { label: 'This Month', value: compactCurrency(sales.mtd), icon: <TrendingUp size={20} className="text-blue-400" />, sub: `${now.toLocaleString('default', { month: 'long' })} ${thisYear}` },
    { label: 'This Year', value: compactCurrency(sales.ytd), icon: <TrendingUp size={20} className="text-emerald-400" />, sub: `${thisYear} to date` },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Trophy size={24} className="text-brand-accent" /> Executive Cockpit
        </h1>
        <p className="text-slate-400 text-sm mt-1">Complete business health at a glance — sales, network, collections, finance & alerts.</p>
      </div>

      {/* Sales KPIs + Target */}
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
        {/* Target vs Achievement */}
        <div className="glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-brand-accent/5">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1"><Target size={13} />YTD Target</span>
            <button onClick={() => { setEditingTarget(true); setTempTarget(String(target)); }} className="text-[10px] text-brand-accent hover:underline">Edit</button>
          </div>
          {editingTarget ? (
            <div className="flex gap-1.5">
              <input autoFocus type="number" value={tempTarget} onChange={e => setTempTarget(e.target.value)} onKeyDown={e => e.key === 'Enter' && saveTarget()} className="w-full glass-input rounded-lg px-2 py-1 text-sm text-white" />
              <button onClick={saveTarget} className="px-2 btn-accent rounded-lg text-xs font-bold">✓</button>
            </div>
          ) : (
            <>
              <div className="flex items-baseline justify-between">
                <p className="text-lg font-extrabold text-white">{targetPct}%</p>
                <p className="text-[11px] text-slate-400">{compactCurrency(sales.ytd)} / {compactCurrency(target)}</p>
              </div>
              <div className="mt-2 h-2 bg-brand-primary-lighter rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${targetPct >= 100 ? 'bg-emerald-500' : targetPct >= 60 ? 'bg-brand-accent' : 'bg-amber-500'}`} style={{ width: `${targetPct}%` }} />
              </div>
            </>
          )}
        </div>
      </div>

      {/* Network + Finance strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Distributors', icon: <Network size={18} className="text-purple-400" />, main: network.dist.active, sub: `${network.dist.total} total · ${network.dist.pending} pending` },
          { label: 'Dealers', icon: <Store size={18} className="text-amber-400" />, main: network.deal.active, sub: `${network.deal.total} total · ${network.deal.pending} pending` },
          { label: 'Retailers', icon: <Building2 size={18} className="text-emerald-400" />, main: network.ret.active, sub: `${network.ret.total} total · ${network.ret.pending} pending` },
          { label: 'Stock Value', icon: <Boxes size={18} className="text-blue-400" />, main: compactCurrency(invHealth.stockValue), sub: `${invHealth.outOfStock} out · ${invHealth.nearExpiry} near-expiry` },
        ].map((c, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{c.label}</span>
              {c.icon}
            </div>
            <p className="text-xl font-extrabold text-white">{c.main}</p>
            <p className="text-[10px] text-slate-500 mt-0.5">{c.sub}</p>
          </div>
        ))}
      </div>

      {/* Finance row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1"><IndianRupee size={12} />Revenue (Paid)</p>
          <p className="text-xl font-extrabold text-emerald-400 mt-1">{compactCurrency(finance.revenue)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1"><ArrowDownRight size={12} />Expenses</p>
          <p className="text-xl font-extrabold text-rose-400 mt-1">{compactCurrency(finance.exp)}</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1"><ArrowUpRight size={12} />Gross Profit</p>
          <p className={`text-xl font-extrabold mt-1 ${finance.profit >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{compactCurrency(finance.profit)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{finance.margin}% margin</p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wide flex items-center gap-1"><Wallet size={12} />Total Outstanding</p>
          <p className="text-xl font-extrabold text-amber-400 mt-1">{compactCurrency(collections.channelOutstanding)}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{collections.overdueCount} invoices unpaid</p>
        </div>
      </div>

      {/* Charts: monthly trend + top products */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><TrendingUp size={16} className="text-brand-accent" />Sales Trend — {thisYear}</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={monthlyTrend} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.4} vertical={false} />
                <XAxis dataKey="month" stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} />
                <YAxis stroke="#94a3b8" fontSize={11} tickLine={false} axisLine={false} tickFormatter={v => `${v / 1000}k`} />
                <Tooltip contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px' }} formatter={v => formatCurrency(v)} cursor={{ fill: 'rgba(212,24,108,0.08)' }} />
                <Bar dataKey="sales" fill="#D4186C" radius={[4, 4, 0, 0]} maxBarSize={34} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Package2 size={16} className="text-brand-accent" />Top Products</h3>
          {topProducts.length > 0 ? (
            <div className="space-y-3">
              {topProducts.map((p, i) => {
                const max = topProducts[0].value || 1;
                return (
                  <div key={p.name}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-slate-300 truncate pr-2">{i + 1}. {p.name}</span>
                      <span className="text-brand-accent font-bold flex-shrink-0">{compactCurrency(p.value)}</span>
                    </div>
                    <div className="h-1.5 bg-brand-primary-lighter rounded-full overflow-hidden">
                      <div className="h-full rounded-full" style={{ width: `${(p.value / max) * 100}%`, backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : <p className="text-xs text-slate-500 text-center py-8">No sales data yet.</p>}
        </div>
      </div>

      {/* Ageing + State sales + Leaderboard */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Receivables ageing */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Wallet size={16} className="text-brand-accent" />Receivables Ageing</h3>
          <div className="space-y-2.5">
            {Object.entries(collections.buckets).map(([bucket, amt]) => {
              const total = Object.values(collections.buckets).reduce((s, v) => s + v, 0) || 1;
              const colorMap = { '0-30': 'bg-emerald-500', '30-60': 'bg-amber-500', '60-90': 'bg-orange-500', '90+': 'bg-rose-500' };
              return (
                <div key={bucket}>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-slate-400">{bucket} days</span>
                    <span className="text-white font-semibold">{compactCurrency(amt)}</span>
                  </div>
                  <div className="h-1.5 bg-brand-primary-lighter rounded-full overflow-hidden">
                    <div className={`h-full rounded-full ${colorMap[bucket]}`} style={{ width: `${(amt / total) * 100}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
          <div className="mt-4 pt-3 border-t border-white/5 flex justify-between text-xs">
            <span className="text-slate-400">Overdue now</span>
            <span className="text-rose-400 font-bold">{compactCurrency(collections.overdueVal)}</span>
          </div>
        </div>

        {/* State-wise sales */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Users size={16} className="text-brand-accent" />Top States</h3>
          <div className="h-52">
            {stateSales.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stateSales} layout="vertical" margin={{ top: 0, right: 10, left: 10, bottom: 0 }}>
                  <XAxis type="number" hide />
                  <YAxis type="category" dataKey="state" stroke="#94a3b8" fontSize={10} tickLine={false} axisLine={false} width={70} />
                  <Tooltip contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px' }} formatter={v => formatCurrency(v)} cursor={{ fill: 'rgba(212,24,108,0.08)' }} />
                  <Bar dataKey="value" radius={[0, 4, 4, 0]} maxBarSize={20}>
                    {stateSales.map((s, i) => <Cell key={s.state} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-xs text-slate-500 text-center py-8">No sales data yet.</p>}
          </div>
        </div>

        {/* Sales leaderboard */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Trophy size={16} className="text-brand-accent" />Sales Leaderboard</h3>
          {leaderboard.length > 0 ? (
            <div className="space-y-2">
              {leaderboard.slice(0, 6).map((rep, i) => (
                <div key={rep.name} className="flex items-center gap-3 text-xs">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center font-bold text-[10px] flex-shrink-0 ${i === 0 ? 'bg-yellow-500/20 text-yellow-400' : i === 1 ? 'bg-slate-400/20 text-slate-300' : i === 2 ? 'bg-orange-500/20 text-orange-400' : 'bg-brand-primary-lighter text-slate-500'}`}>{i + 1}</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-200 font-medium truncate">{rep.name}</p>
                    <p className="text-[10px] text-slate-500">{rep.orders} orders · {rep.convRate}% conv</p>
                  </div>
                  <span className="text-brand-accent font-bold flex-shrink-0">{compactCurrency(rep.revenue)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500 text-center py-8">No sales reps found.</p>}
        </div>
      </div>

      {/* Alerts panel */}
      <div className="glass-panel rounded-2xl p-5 border border-amber-500/20 bg-amber-500/[0.03]">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" />Exception Alerts <span className="text-[10px] text-slate-500 normal-case">({alerts.length})</span></h3>
        {alerts.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {alerts.map((a, i) => {
              const iconColor = a.type === 'stock' ? 'text-rose-400' : a.type === 'credit' ? 'text-amber-400' : 'text-blue-400';
              return (
                <div key={i} className="flex items-start gap-2 text-xs bg-brand-primary-lighter/30 rounded-lg px-3 py-2">
                  <AlertTriangle size={12} className={`${iconColor} flex-shrink-0 mt-0.5`} />
                  <span className="text-slate-300">{a.text}</span>
                </div>
              );
            })}
          </div>
        ) : <p className="text-xs text-emerald-400 text-center py-4">✓ All clear — no exceptions flagged.</p>}
      </div>
    </div>
  );
}
