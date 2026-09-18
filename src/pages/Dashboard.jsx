import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isAdminRole } from '../context/AuthContext';
import { Users, TrendingUp, ShoppingBag, DollarSign, Clock, ChevronLeft, Target, Edit3, LayoutDashboard, BarChart3 } from 'lucide-react';
import { PageHeader, StatCard, EmptyState } from '../components/ui';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';
import { CHART_TOOLTIP, CHART_GRID, CHART_AXIS, CHART_SINGLE, colorAt } from '../utils/chartTheme';
import { MONTHS, monthKey } from '../utils/months';
import DistributorDashboard from './DistributorDashboard';
import DealerDashboard from './DealerDashboard';
import RetailerDashboard from './RetailerDashboard';
import DirectorDashboard from './DirectorDashboard';


const Dashboard = () => {
  const { leads, orders } = useData();
  const { user, canAccessData } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(null);
  const [monthlyTarget, setMonthlyTarget] = useState(() => {
    const saved = localStorage.getItem('prismora_monthly_target');
    return saved ? Number(saved) : 100000;
  });
  const [editingTarget, setEditingTarget] = useState(false);
  const [tempTarget, setTempTarget] = useState('');

  if (user?.role === 'Distributor') return <DistributorDashboard />;
  if (user?.role === 'Dealer') return <DealerDashboard />;
  if (user?.role === 'Retailer') return <RetailerDashboard />;
  if (user?.role === 'Director') return <DirectorDashboard />;

  // Filter data based on role using the RBAC helper
  const visibleLeads = leads.filter(l => canAccessData(l.assignedTo));
  const visibleOrders = orders.filter(o => canAccessData(o.assignedTo));

  const totalLeads = visibleLeads.length;
  const convertedLeads = visibleLeads.filter(l => l.status === 'Converted').length;
  const conversionRate = totalLeads ? ((convertedLeads / totalLeads) * 100).toFixed(1) : 0;
  
  const pipelineValue = visibleLeads
    .filter(l => l.status !== 'Lost' && l.status !== 'Converted')
    .reduce((sum, lead) => sum + (lead.dealValue || 0), 0);

  const totalRevenue = visibleOrders
    .filter(o => o.status !== 'Cancelled')
    .reduce((sum, order) => sum + (order.value || 0), 0);

  const formatCurrency = (value) => {
    return new Intl.NumberFormat('en-IN', {
      style: 'currency',
      currency: 'INR',
      maximumFractionDigits: 0
    }).format(value);
  };

  // Calculate MoM (Month-over-Month) Growth Metrics
  const currentDate = new Date();
  const currentMonth = currentDate.getMonth(); // 0-11
  const currentYear = currentDate.getFullYear();
  
  const lastMonth = currentMonth === 0 ? 11 : currentMonth - 1;
  const lastMonthYear = currentMonth === 0 ? currentYear - 1 : currentYear;

  const getMonthYear = (dateStr) => {
    if (!dateStr) return { m: -1, y: -1 };
    const d = new Date(dateStr);
    return { m: d.getMonth(), y: d.getFullYear() };
  };

  // Leads MoM
  const currentMonthLeads = visibleLeads.filter(l => {
    const { m, y } = getMonthYear(l.createdAt);
    return m === currentMonth && y === currentYear;
  });
  const lastMonthLeads = visibleLeads.filter(l => {
    const { m, y } = getMonthYear(l.createdAt);
    return m === lastMonth && y === lastMonthYear;
  });
  
  const leadsMoM = lastMonthLeads.length 
    ? Math.round(((currentMonthLeads.length - lastMonthLeads.length) / lastMonthLeads.length) * 100) 
    : (currentMonthLeads.length > 0 ? 100 : 0);

  // Conversion Rate MoM (absolute point difference)
  const currentMonthConv = currentMonthLeads.length 
    ? (currentMonthLeads.filter(l => l.status === 'Converted').length / currentMonthLeads.length) * 100 : 0;
  const lastMonthConv = lastMonthLeads.length 
    ? (lastMonthLeads.filter(l => l.status === 'Converted').length / lastMonthLeads.length) * 100 : 0;
  const convMoM = Math.round(currentMonthConv - lastMonthConv);

  // Pipeline MoM
  const currentPipeline = currentMonthLeads
    .filter(l => l.status !== 'Lost' && l.status !== 'Converted')
    .reduce((sum, lead) => sum + (lead.dealValue || 0), 0);
  const lastPipeline = lastMonthLeads
    .filter(l => l.status !== 'Lost' && l.status !== 'Converted')
    .reduce((sum, lead) => sum + (lead.dealValue || 0), 0);
  const pipelineMoM = lastPipeline 
    ? Math.round(((currentPipeline - lastPipeline) / lastPipeline) * 100) 
    : (currentPipeline > 0 ? 100 : 0);

  // Revenue MoM
  const currentMonthOrders = visibleOrders.filter(o => {
    const { m, y } = getMonthYear(o.date || o.createdAt);
    return m === currentMonth && y === currentYear;
  });
  const lastMonthOrders = visibleOrders.filter(o => {
    const { m, y } = getMonthYear(o.date || o.createdAt);
    return m === lastMonth && y === lastMonthYear;
  });
  const currentRev = currentMonthOrders.filter(o => o.status !== 'Cancelled').reduce((sum, order) => sum + (order.value || 0), 0);
  const lastRev = lastMonthOrders.filter(o => o.status !== 'Cancelled').reduce((sum, order) => sum + (order.value || 0), 0);
  const revMoM = lastRev 
    ? Math.round(((currentRev - lastRev) / lastRev) * 100) 
    : (currentRev > 0 ? 100 : 0);

  const kpis = [
    { title: 'Total Leads', value: totalLeads.toLocaleString('en-IN'), icon: Users, tone: 'accent', mom: leadsMoM },
    { title: 'Conversion Rate', value: `${conversionRate}%`, icon: TrendingUp, tone: 'success', mom: convMoM },
    { title: 'Pipeline Value', value: formatCurrency(pipelineValue), icon: DollarSign, tone: 'info', mom: pipelineMoM },
    { title: 'Total Revenue', value: formatCurrency(totalRevenue), icon: ShoppingBag, tone: 'accent', mom: revMoM },
  ];

  // Prepare chart data from real database records
  const monthlyRevenue = {};
  visibleOrders.forEach(order => {
    if (order.status !== 'Cancelled' && order.date) {
      const date = new Date(order.date);
      const monthStr = monthKey(date);
      monthlyRevenue[monthStr] = (monthlyRevenue[monthStr] || 0) + (order.value || 0);
    }
  });
  const salesData = MONTHS
    .filter(m => monthlyRevenue[m] !== undefined)
    .map(month => ({
      month,
      revenue: monthlyRevenue[month]
    }));

  // Generate drilldown data for the selected month using real data
  const drilldownData = selectedMonth ? (() => {
    const productsInMonth = {};
    visibleOrders.forEach(order => {
      if (order.status !== 'Cancelled' && order.date) {
        const date = new Date(order.date);
        const monthStr = monthKey(date);
        if (monthStr === selectedMonth) {
          productsInMonth[order.product] = (productsInMonth[order.product] || 0) + (order.value || 0);
        }
      }
    });
    return Object.keys(productsInMonth).map(product => ({
      name: product,
      value: productsInMonth[product]
    })).sort((a, b) => b.value - a.value);
  })() : [];

  const handleBarClick = (data) => {
    if (data && data.activeLabel) {
      setSelectedMonth(data.activeLabel);
    }
  };

  // Product Demand Data
  const productDemandMap = visibleOrders.reduce((acc, order) => {
    acc[order.product] = (acc[order.product] || 0) + order.quantity;
    return acc;
  }, {});
  
  const productData = Object.keys(productDemandMap).map(key => ({
    name: key,
    demand: productDemandMap[key]
  }));

  // Lead Status Data
  const leadStatusCounts = visibleLeads.reduce((acc, lead) => {
    acc[lead.status] = (acc[lead.status] || 0) + 1;
    return acc;
  }, {});

  const leadStatusData = Object.keys(leadStatusCounts).map(key => ({
    name: key,
    value: leadStatusCounts[key]
  }));

  return (
    <div className="space-y-6">
      <PageHeader
        icon={LayoutDashboard}
        title="Dashboard Overview"
        subtitle="Welcome back to your PRISMORA sales intelligence hub."
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {kpis.map(k => (
          <StatCard
            key={k.title}
            label={k.title}
            value={k.value}
            icon={k.icon}
            tone={k.tone}
            // StatCard drops a zero trend. Every card used to read "0%" against
            // an empty database, which looks like a broken widget rather than
            // an honest absence of history to compare against.
            trend={k.mom}
          />
        ))}
      </div>

      {/* Monthly Target Progress Banner */}
      {(() => {
        const targetPct = monthlyTarget > 0 ? Math.min(100, Math.round((currentRev / monthlyTarget) * 100)) : 0;
        const remaining = Math.max(0, monthlyTarget - currentRev);
        return (
          <div className="glass-panel rounded-2xl p-5 border border-white/5 bg-gradient-to-r from-brand-accent/5 to-transparent">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4">
              <div className="flex items-center gap-3 flex-1">
                <div className="w-10 h-10 rounded-xl bg-brand-accent/15 border border-brand-accent/30 flex items-center justify-center text-brand-accent flex-shrink-0">
                  <Target size={20} />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">Monthly Revenue Target</span>
                    {isAdminRole(user?.role) && (
                      <button
                        onClick={() => { setEditingTarget(true); setTempTarget(String(monthlyTarget)); }}
                        className="p-1 text-slate-600 hover:text-brand-accent transition-colors"
                        title="Edit target"
                      >
                        <Edit3 size={12} />
                      </button>
                    )}
                  </div>
                  {editingTarget ? (
                    <form onSubmit={e => { e.preventDefault(); const v = Number(tempTarget); if (v > 0) { setMonthlyTarget(v); localStorage.setItem('prismora_monthly_target', String(v)); } setEditingTarget(false); }} className="flex items-center gap-2">
                      <input autoFocus type="number" min="1" value={tempTarget} onChange={e => setTempTarget(e.target.value)} className="w-32 glass-input rounded-lg px-3 py-1.5 text-sm text-white" />
                      <button type="submit" className="text-xs btn-accent px-3 py-1.5 rounded-lg">Set</button>
                      <button type="button" onClick={() => setEditingTarget(false)} className="text-xs text-slate-400 hover:text-white">Cancel</button>
                    </form>
                  ) : (
                    <div className="flex items-baseline gap-2">
                      <span className="text-lg font-extrabold text-white">{formatCurrency(currentRev)}</span>
                      <span className="text-xs text-slate-500">of {formatCurrency(monthlyTarget)} target</span>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-4 flex-shrink-0">
                <div className="text-right">
                  <div className={`text-2xl font-extrabold ${targetPct >= 100 ? 'text-brand-accent' : targetPct >= 70 ? 'text-amber-400' : 'text-slate-300'}`}>{targetPct}%</div>
                  <div className="text-[10px] text-slate-500">{targetPct >= 100 ? '🎉 Target Hit!' : `₹${remaining.toLocaleString('en-IN')} remaining`}</div>
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 bg-white/5 rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-700 ${
                      // Progress is the brand's own colour; amber once the month is
                      // close enough that the gap is worth acting on; emerald when
                      // the target is met. Blue said 'information' about a number
                      // that is really about progress.
                      targetPct >= 100 ? 'bg-emerald-400' : targetPct >= 70 ? 'bg-amber-400' : 'bg-brand-accent'
                    }`}
                  style={{ width: `${targetPct}%` }}
                />
              </div>
              <div className="flex justify-between text-[10px] text-slate-600 mt-1">
                <span>₹0</span>
                <span>{formatCurrency(monthlyTarget)}</span>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Charts Section */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          
          {/* Main Trend / Drilldown Chart */}
          <div className="glass-panel rounded-2xl p-6 hover:shadow-lg transition-shadow border border-white/5 relative">
            {selectedMonth && (
              <button 
                onClick={() => setSelectedMonth(null)}
                className="absolute top-6 right-6 text-xs bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-white transition-colors flex items-center gap-1"
              >
                <ChevronLeft size={14} /> Back to Trend
              </button>
            )}
            <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
              <TrendingUp size={20} className="text-brand-accent" />
              {selectedMonth ? `Product Breakdown: ${selectedMonth}` : 'Revenue Trend (YTD)'}
            </h3>
            <div className="h-72">
              {(selectedMonth ? drilldownData : salesData).length === 0 ? (
                <EmptyState
                  icon={BarChart3}
                  title="No revenue to chart yet"
                  hint="This fills in as orders are raised. An order counts from the day it is placed, and cancelled ones are left out."
                />
              ) : (
              <ResponsiveContainer width="100%" height={288}>
                {selectedMonth ? (
                  <PieChart>
                    <Pie
                      data={drilldownData}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {drilldownData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colorAt(index)} />
                      ))}
                    </Pie>
                    <Tooltip 
                      {...CHART_TOOLTIP}
                      formatter={(value) => `₹${value.toLocaleString()}`}
                    />
                    <Legend />
                  </PieChart>
                ) : (
                  <BarChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid {...CHART_GRID} />
                    <XAxis dataKey="month" {...CHART_AXIS} />
                    <YAxis {...CHART_AXIS} tickFormatter={(value) => `₹${value/1000}k`} />
                    <Tooltip 
                      {...CHART_TOOLTIP}
                    />
                    <Bar dataKey="revenue" fill={CHART_SINGLE} radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                )}
              </ResponsiveContainer>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Lead Status Chart */}
            <div className="glass-panel rounded-2xl p-6 hover:shadow-lg transition-shadow border border-white/5">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <Users size={20} className="text-green-400" />
                Lead Status
              </h3>
              <div className="h-64">
                {leadStatusData.length === 0 ? (
                  <EmptyState
                    compact
                    icon={Users}
                    title="No leads yet"
                    hint="Add a lead and this shows how they are spread across the pipeline."
                  />
                ) : (
                <ResponsiveContainer width="100%" height={256}>
                  <PieChart>
                    <Pie
                      data={leadStatusData}
                      cx="50%"
                      cy="50%"
                      innerRadius={40}
                      outerRadius={80}
                      paddingAngle={5}
                      dataKey="value"
                    >
                      {leadStatusData.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={colorAt(index)} />
                      ))}
                    </Pie>
                    <Tooltip 
                      {...CHART_TOOLTIP}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                )}
              </div>
            </div>

            {/* Product Demand Chart */}
            <div className="glass-panel rounded-2xl p-6 hover:shadow-lg transition-shadow border border-white/5">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <ShoppingBag size={20} className="text-blue-400" />
                Product Demand
              </h3>
              <div className="h-64">
                {productData.length > 0 ? (
                  <ResponsiveContainer width="100%" height={256}>
                    <LineChart data={productData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                      <CartesianGrid {...CHART_GRID} />
                      <XAxis dataKey="name" {...CHART_AXIS} />
                      <YAxis {...CHART_AXIS} />
                      <Tooltip 
                        {...CHART_TOOLTIP}
                      />
                      <Line type="monotone" dataKey="demand" stroke={CHART_SINGLE} strokeWidth={3} dot={{ r: 4, fill: 'var(--chart-tooltip-bg)', stroke: CHART_SINGLE, strokeWidth: 2 }} activeDot={{ r: 6, fill: CHART_SINGLE }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center">
                    <p className="text-slate-500">Not enough data.</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recent Activity Sidebar */}
        <div className="glass-panel rounded-2xl p-6 border border-white/5 flex flex-col h-full">
          <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
            <Clock size={20} className="text-purple-400" />
            Recent Activity
          </h3>
          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-6">
            {visibleOrders.slice(0, 5).map((order) => (
              <div key={order.id} className="relative pl-6 before:absolute before:left-[11px] before:top-8 before:bottom-[-24px] before:w-px before:bg-slate-700 last:before:hidden">
                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-brand-primary-lighter border-2 border-brand-primary flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-brand-accent"></div>
                </div>
                <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 hover:bg-brand-primary-lighter/50 transition-colors">
                  <p className="text-sm text-white font-medium">Order <span className="text-brand-accent">{order.id}</span> placed</p>
                  <p className="text-xs text-slate-400 mt-1">{order.customerName} • {order.city}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium">₹{order.value.toLocaleString()}</p>
                </div>
              </div>
            ))}
            
            {visibleLeads.slice(0, 4).map((lead) => (
              <div key={lead.id} className="relative pl-6 before:absolute before:left-[11px] before:top-8 before:bottom-[-24px] before:w-px before:bg-slate-700 last:before:hidden">
                <div className="absolute left-0 top-1.5 w-6 h-6 rounded-full bg-brand-primary-lighter border-2 border-brand-primary flex items-center justify-center shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-blue-400"></div>
                </div>
                <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 hover:bg-brand-primary-lighter/50 transition-colors">
                  <p className="text-sm text-white font-medium">New Lead: <span className="text-blue-400">{lead.name}</span></p>
                  <p className="text-xs text-slate-400 mt-1">{lead.company}</p>
                  <p className="text-xs text-slate-500 mt-2 font-medium capitalize">{lead.status} Status</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;

