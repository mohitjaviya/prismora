import { useMemo } from 'react';
import { useData } from '../context/DataContext';
import {
  Sparkles, TrendingUp, TrendingDown, AlertTriangle, Boxes, Users,
  Target, Brain, Gauge, ArrowRight, Clock
} from 'lucide-react';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const compact = (n) => {
  n = Number(n || 0);
  if (Math.abs(n) >= 10000000) return `₹${(n / 10000000).toFixed(1)}Cr`;
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(1)}L`;
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(1)}k`;
  return `₹${Math.round(n)}`;
};

const daysAgo = (dateStr) => {
  if (!dateStr) return Infinity;
  return Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000);
};

const STAGE_WEIGHT = { 'Negotiation': 40, 'Distributor Approved': 45, 'Meeting': 30, 'Sample Sent': 25, 'Call': 15, 'Lead Created': 10 };

export default function AIInsights() {
  const { orders, inventory, productCatalog, distributors, leads } = useData();

  const liveOrders = useMemo(() => orders.filter(o => o.status !== 'Cancelled'), [orders]);

  // Explode orders into product line items with date
  const salesLines = useMemo(() => {
    const lines = [];
    liveOrders.forEach(o => {
      const date = o.date || o.createdAt;
      const items = Array.isArray(o.items) && o.items.length > 0
        ? o.items.map(i => ({ name: i.name, qty: Number(i.quantity || 0), value: Number(i.total || 0) }))
        : [{ name: o.product, qty: Number(o.quantity || 0), value: Number(o.value || 0) }];
      items.forEach(li => { if (li.name) lines.push({ ...li, date }); });
    });
    return lines;
  }, [liveOrders]);

  // ── Demand forecast: 3-month moving average per product ───────────────────
  const forecast = useMemo(() => {
    const now = new Date();
    const monthKey = (d) => `${d.getFullYear()}-${d.getMonth()}`;
    const last3 = [0, 1, 2].map(m => monthKey(new Date(now.getFullYear(), now.getMonth() - m, 1)));
    const prev3 = [3, 4, 5].map(m => monthKey(new Date(now.getFullYear(), now.getMonth() - m, 1)));

    const byProduct = {};
    salesLines.forEach(l => {
      const mk = monthKey(new Date(l.date));
      if (!byProduct[l.name]) byProduct[l.name] = { recent: 0, prior: 0 };
      if (last3.includes(mk)) byProduct[l.name].recent += l.qty;
      else if (prev3.includes(mk)) byProduct[l.name].prior += l.qty;
    });

    return Object.entries(byProduct)
      .map(([name, { recent, prior }]) => {
        const projected = Math.round(recent / 3); // next-month units ≈ 3-mo avg
        const recentAvg = recent / 3, priorAvg = prior / 3;
        const trendPct = priorAvg > 0 ? Math.round(((recentAvg - priorAvg) / priorAvg) * 100) : (recentAvg > 0 ? 100 : 0);
        return { name, projected, trendPct };
      })
      .filter(p => p.projected > 0)
      .sort((a, b) => b.projected - a.projected)
      .slice(0, 6);
  }, [salesLines]);

  // ── Distributor churn risk ────────────────────────────────────────────────
  const churnRisk = useMemo(() => {
    return distributors.filter(d => d.status === 'Active').map(d => {
      const dOrders = liveOrders.filter(o => o.distributorId === d.id).sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt));
      const recency = dOrders.length ? daysAgo(dOrders[0].date || dOrders[0].createdAt) : Infinity;
      // order counts: last 60d vs prior 60d
      const last60 = dOrders.filter(o => daysAgo(o.date || o.createdAt) <= 60).length;
      const prior60 = dOrders.filter(o => { const g = daysAgo(o.date || o.createdAt); return g > 60 && g <= 120; }).length;
      const declining = prior60 > 0 && last60 < prior60;
      let risk = 'Low', score = 0;
      if (recency === Infinity || recency > 60) { risk = 'High'; score = 90; }
      else if (recency > 30 || declining) { risk = 'Medium'; score = 55; }
      else { risk = 'Low'; score = 20; }
      return { name: d.name, recency: recency === Infinity ? null : recency, orders: dOrders.length, risk, score, declining };
    }).sort((a, b) => b.score - a.score);
  }, [distributors, liveOrders]);

  // ── Stock-out prediction (velocity-based) ─────────────────────────────────
  const stockout = useMemo(() => {
    const availByProduct = {};
    inventory.forEach(i => { availByProduct[i.product] = (availByProduct[i.product] || 0) + Math.max(0, (i.quantity || 0) - (i.reserved || 0)); });
    const sold30 = {};
    salesLines.forEach(l => { if (daysAgo(l.date) <= 30) sold30[l.name] = (sold30[l.name] || 0) + l.qty; });

    return productCatalog.map(p => {
      const avail = availByProduct[p.name] || 0;
      const velocity = (sold30[p.name] || 0) / 30; // units/day
      const daysLeft = velocity > 0 ? Math.round(avail / velocity) : (avail === 0 ? 0 : Infinity);
      return { name: p.name, avail, velocity: velocity.toFixed(1), daysLeft };
    }).filter(p => p.daysLeft !== Infinity && (p.daysLeft <= 21 || p.avail === 0))
      .sort((a, b) => a.daysLeft - b.daysLeft)
      .slice(0, 6);
  }, [inventory, productCatalog, salesLines]);

  // ── Dead / slow-moving stock ──────────────────────────────────────────────
  const deadStock = useMemo(() => {
    const sold60 = {};
    salesLines.forEach(l => { if (daysAgo(l.date) <= 60) sold60[l.name] = (sold60[l.name] || 0) + l.qty; });
    const byProduct = {};
    inventory.forEach(i => {
      if (!byProduct[i.product]) byProduct[i.product] = { qty: 0, value: 0, nearExpiry: false };
      byProduct[i.product].qty += i.quantity || 0;
      byProduct[i.product].value += (i.quantity || 0) * (i.unitCost || 0);
      if (i.expiryDate) {
        const dLeft = Math.ceil((new Date(i.expiryDate) - Date.now()) / 86400000);
        if (dLeft > 0 && dLeft <= 90) byProduct[i.product].nearExpiry = true;
      }
    });
    return Object.entries(byProduct)
      .map(([name, v]) => ({ name, ...v, sold: sold60[name] || 0 }))
      .filter(p => p.qty > 0 && p.sold === 0) // stock on hand, zero sales in 60d
      .sort((a, b) => b.value - a.value)
      .slice(0, 6);
  }, [inventory, salesLines]);

  // ── Smart lead prioritization ─────────────────────────────────────────────
  const priorityLeads = useMemo(() => {
    const open = leads.filter(l => !['Converted', 'Lost', 'Active', 'First Order'].includes(l.status));
    const maxVal = Math.max(...open.map(l => Number(l.dealValue || 0)), 1);
    return open.map(l => {
      const valScore = (Number(l.dealValue || 0) / maxVal) * 40;
      const stageScore = STAGE_WEIGHT[l.status] || 10;
      const recency = daysAgo(l.followUpDate || l.createdAt);
      const recencyScore = recency <= 3 ? 20 : recency <= 7 ? 12 : recency <= 14 ? 6 : 0;
      const score = Math.round(valScore + stageScore + recencyScore);
      return { name: l.name, company: l.company, status: l.status, dealValue: Number(l.dealValue || 0), score };
    }).sort((a, b) => b.score - a.score).slice(0, 6);
  }, [leads]);

  // ── Auto business summary ─────────────────────────────────────────────────
  const summary = useMemo(() => {
    const bullets = [];
    const totalRev = liveOrders.reduce((s, o) => s + Number(o.value || 0), 0);
    bullets.push(`Total booked sales stand at **${compact(totalRev)}** across **${liveOrders.length}** orders.`);
    if (forecast.length) {
      const top = forecast[0];
      bullets.push(`**${top.name}** is projected to lead next month at ~**${top.projected} units** (${top.trendPct >= 0 ? '+' : ''}${top.trendPct}% vs prior quarter).`);
    }
    const highRisk = churnRisk.filter(c => c.risk === 'High').length;
    if (highRisk > 0) bullets.push(`**${highRisk} distributor${highRisk === 1 ? '' : 's'}** flagged **high churn risk** — no recent orders. Prioritise re-engagement.`);
    if (stockout.length) bullets.push(`**${stockout.length} product${stockout.length === 1 ? '' : 's'}** are near stock-out — **${stockout[0].name}** in ~${stockout[0].daysLeft} days at current velocity.`);
    if (deadStock.length) bullets.push(`**${compact(deadStock.reduce((s, d) => s + d.value, 0))}** of stock is slow-moving (no sales in 60 days) — review for clearance schemes.`);
    if (priorityLeads.length) bullets.push(`Top conversion opportunity: **${priorityLeads[0].name}** (${priorityLeads[0].company || 'lead'}) — worth ${compact(priorityLeads[0].dealValue)}.`);
    return bullets;
  }, [liveOrders, forecast, churnRisk, stockout, deadStock, priorityLeads]);

  const renderBold = (text) => text.split(/(\*\*.*?\*\*)/g).map((part, i) =>
    part.startsWith('**') ? <strong key={i} className="text-white">{part.slice(2, -2)}</strong> : part);

  const riskCls = (r) => r === 'High' ? 'bg-rose-500/10 text-rose-400 border-rose-500/20' : r === 'Medium' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Brain size={24} className="text-brand-accent" /> AI Insights
        </h1>
        <p className="text-slate-400 text-sm mt-1">Predictive analytics & recommendations derived from your live business data.</p>
      </div>

      {/* Business Summary */}
      <div className="glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-gradient-to-br from-brand-accent/[0.06] to-transparent">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3 flex items-center gap-2"><Sparkles size={16} className="text-brand-accent" />AI Business Summary</h3>
        <ul className="space-y-2">
          {summary.map((b, i) => (
            <li key={i} className="flex items-start gap-2 text-sm text-slate-300">
              <ArrowRight size={14} className="text-brand-accent flex-shrink-0 mt-0.5" />
              <span>{renderBold(b)}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Demand Forecast */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Gauge size={16} className="text-brand-accent" />Demand Forecast <span className="text-[10px] text-slate-500 normal-case">next month, 3-mo avg</span></h3>
          {forecast.length > 0 ? (
            <div className="space-y-2.5">
              {forecast.map(p => (
                <div key={p.name} className="flex items-center gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-200 truncate">{p.name}</p>
                  </div>
                  <span className={`text-[10px] font-bold flex items-center gap-0.5 ${p.trendPct >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                    {p.trendPct >= 0 ? <TrendingUp size={11} /> : <TrendingDown size={11} />}{p.trendPct >= 0 ? '+' : ''}{p.trendPct}%
                  </span>
                  <span className="text-sm font-bold text-white w-20 text-right">~{p.projected} <span className="text-[10px] text-slate-500">units</span></span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500 text-center py-6">Not enough sales history to forecast yet.</p>}
        </div>

        {/* Churn Risk */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Users size={16} className="text-brand-accent" />Distributor Churn Risk</h3>
          {churnRisk.length > 0 ? (
            <div className="space-y-2">
              {churnRisk.slice(0, 6).map(c => (
                <div key={c.name} className="flex items-center gap-3 text-sm">
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border flex-shrink-0 ${riskCls(c.risk)}`}>{c.risk}</span>
                  <span className="flex-1 min-w-0 truncate text-slate-200">{c.name}</span>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{c.recency === null ? 'never ordered' : `${c.recency}d ago`}{c.declining ? ' · declining' : ''}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-slate-500 text-center py-6">No active distributors to assess.</p>}
        </div>

        {/* Stock-out Prediction */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-400" />Stock-out Prediction</h3>
          {stockout.length > 0 ? (
            <div className="space-y-2.5">
              {stockout.map(p => (
                <div key={p.name} className="flex items-center gap-3 text-sm">
                  <Clock size={13} className={`flex-shrink-0 ${p.daysLeft <= 7 ? 'text-rose-400' : 'text-amber-400'}`} />
                  <span className="flex-1 min-w-0 truncate text-slate-200">{p.name}</span>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{p.avail} left · {p.velocity}/day</span>
                  <span className={`text-xs font-bold flex-shrink-0 w-16 text-right ${p.daysLeft <= 7 ? 'text-rose-400' : 'text-amber-400'}`}>{p.daysLeft === 0 ? 'OUT' : `~${p.daysLeft}d`}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-emerald-400 text-center py-6">✓ No imminent stock-outs predicted.</p>}
        </div>

        {/* Dead Stock */}
        <div className="glass-panel rounded-2xl p-5 border border-white/5">
          <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Boxes size={16} className="text-brand-accent" />Slow / Dead Stock <span className="text-[10px] text-slate-500 normal-case">no sales 60d</span></h3>
          {deadStock.length > 0 ? (
            <div className="space-y-2.5">
              {deadStock.map(p => (
                <div key={p.name} className="flex items-center gap-3 text-sm">
                  <span className="flex-1 min-w-0 truncate text-slate-200">{p.name}{p.nearExpiry && <span className="ml-1.5 text-[9px] bg-rose-500/10 text-rose-400 border border-rose-500/20 px-1.5 py-0.5 rounded-full">expiring</span>}</span>
                  <span className="text-[11px] text-slate-500 flex-shrink-0">{p.qty} units</span>
                  <span className="text-xs font-bold text-rose-400 flex-shrink-0 w-16 text-right">{compact(p.value)}</span>
                </div>
              ))}
            </div>
          ) : <p className="text-xs text-emerald-400 text-center py-6">✓ All stock is moving — no dead inventory.</p>}
        </div>
      </div>

      {/* Smart Lead Prioritization */}
      <div className="glass-panel rounded-2xl p-5 border border-white/5">
        <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4 flex items-center gap-2"><Target size={16} className="text-brand-accent" />Smart Lead Prioritization <span className="text-[10px] text-slate-500 normal-case">ranked by likelihood-to-convert</span></h3>
        {priorityLeads.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {priorityLeads.map((l, i) => (
              <div key={i} className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[10px] font-bold text-brand-accent">#{i + 1}</span>
                  <span className="text-[10px] font-bold text-white bg-brand-accent/15 px-2 py-0.5 rounded-full">Score {l.score}</span>
                </div>
                <p className="text-sm font-semibold text-white truncate">{l.name}</p>
                <p className="text-[11px] text-slate-500 truncate">{l.company || '—'} · {l.status}</p>
                <p className="text-xs text-brand-accent font-bold mt-1">{compact(l.dealValue)}</p>
              </div>
            ))}
          </div>
        ) : <p className="text-xs text-slate-500 text-center py-6">No open leads to prioritise.</p>}
      </div>

      <p className="text-[11px] text-slate-600 text-center">These insights use heuristic models over your live data (moving averages, recency & velocity). Treat as decision support, not guarantees.</p>
    </div>
  );
}
