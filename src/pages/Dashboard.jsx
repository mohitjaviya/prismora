import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Users, TrendingUp, ShoppingBag, DollarSign, ArrowUpRight, ArrowDownRight, Clock, ChevronLeft } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line, PieChart, Pie, Cell, Legend } from 'recharts';

const COLORS = ['#6366F1', '#818CF8', '#A78BFA', '#38BDF8', '#818CF8'];
const LEAD_COLORS = ['#38BDF8', '#6366F1', '#A78BFA', '#F472B6', '#34D399', '#FBBF24'];

const Dashboard = () => {
  const { leads, orders } = useData();
  const { user, canAccessData } = useAuth();
  const [selectedMonth, setSelectedMonth] = useState(null);

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

  const kpis = [
    { title: 'Total Leads', value: totalLeads.toLocaleString('en-IN'), icon: <Users size={24} className="text-brand-accent" /> },
    { title: 'Conversion Rate', value: `${conversionRate}%`, icon: <TrendingUp size={24} className="text-green-400" /> },
    { title: 'Pipeline Value', value: formatCurrency(pipelineValue), icon: <DollarSign size={24} className="text-brand-accent" /> },
    { title: 'Total Revenue', value: formatCurrency(totalRevenue), icon: <ShoppingBag size={24} className="text-brand-accent-light" /> },
  ];

  // Prepare chart data from real database records
  const monthlyRevenue = {};
  visibleOrders.forEach(order => {
    if (order.status !== 'Cancelled' && order.date) {
      const date = new Date(order.date);
      const monthStr = date.toLocaleString('default', { month: 'short' });
      monthlyRevenue[monthStr] = (monthlyRevenue[monthStr] || 0) + (order.value || 0);
    }
  });

  const monthsOrder = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const salesData = monthsOrder
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
        const monthStr = date.toLocaleString('default', { month: 'short' });
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
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Dashboard Overview</h1>
          <p className="text-slate-400 text-sm">Welcome back to your PRISMORA sales intelligence hub.</p>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        {kpis.map((kpi, idx) => (
          <div key={idx} className="glass-panel relative overflow-hidden rounded-2xl p-6 hover:-translate-y-1 hover:shadow-2xl hover:shadow-brand-accent/10 transition-all duration-300 group border border-white/5 bg-gradient-to-br from-brand-primary-light/80 to-brand-primary/50">
            <div className="absolute top-0 right-0 w-32 h-32 bg-brand-accent/5 rounded-full blur-3xl -mr-10 -mt-10 group-hover:bg-brand-accent/10 transition-colors"></div>
            <div className="flex items-center justify-between mb-4 relative z-10">
              <h3 className="text-sm font-semibold text-slate-400 group-hover:text-slate-200 transition-colors">{kpi.title}</h3>
              <div className="p-3 bg-brand-primary/80 rounded-xl shadow-inner border border-white/5 text-brand-accent group-hover:scale-110 transition-transform">{kpi.icon}</div>
            </div>
            <div className="relative z-10 flex flex-wrap items-baseline gap-2 mt-1">
              <p className="text-2xl sm:text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-white to-slate-300 tracking-tight break-all">{kpi.value}</p>
              <span className={`text-xs font-medium flex items-center ${idx % 2 === 0 ? 'text-green-400' : 'text-red-400'}`}>
                {idx % 2 === 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                {idx % 2 === 0 ? '+12%' : '-2%'}
              </span>
            </div>
          </div>
        ))}
      </div>

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
              <ResponsiveContainer width="100%" height="100%">
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
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                      itemStyle={{ color: '#D4AF37' }}
                      formatter={(value) => `₹${value.toLocaleString()}`}
                    />
                    <Legend />
                  </PieChart>
                ) : (
                  <BarChart data={salesData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }} onClick={handleBarClick} style={{ cursor: 'pointer' }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                    <XAxis dataKey="month" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} tickFormatter={(value) => `₹${value/1000}k`} />
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                      itemStyle={{ color: '#D4AF37' }}
                      cursor={{fill: '#ffffff', opacity: 0.05}}
                    />
                    <Bar dataKey="revenue" fill="#D4AF37" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                )}
              </ResponsiveContainer>
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
                <ResponsiveContainer width="100%" height="100%">
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
                        <Cell key={`cell-${index}`} fill={LEAD_COLORS[index % LEAD_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                    />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Product Demand Chart */}
            <div className="glass-panel rounded-2xl p-6 hover:shadow-lg transition-shadow border border-white/5">
              <h3 className="text-lg font-bold text-white mb-6 flex items-center gap-2">
                <ShoppingBag size={20} className="text-blue-400" />
                Product Demand
              </h3>
              <div className="h-64 flex items-center justify-center">
                {productData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={productData} margin={{ top: 10, right: 30, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.5} vertical={false} />
                      <XAxis dataKey="name" stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <YAxis stroke="#94a3b8" fontSize={12} tickLine={false} axisLine={false} />
                      <Tooltip 
                        contentStyle={{ backgroundColor: '#112240', borderColor: '#334155', borderRadius: '8px', color: '#f8fafc' }}
                        itemStyle={{ color: '#60a5fa' }}
                      />
                      <Line type="monotone" dataKey="demand" stroke="#60a5fa" strokeWidth={3} dot={{ r: 4, fill: '#112240', strokeWidth: 2 }} activeDot={{ r: 6, fill: '#60a5fa' }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <p className="text-slate-500">Not enough data.</p>
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

