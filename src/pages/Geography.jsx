import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole } from '../context/AuthContext';
import { 
  ArrowUpDown, Plus, Edit2, Trash2, MapPin, Users, Globe, ChevronRight, X, Compass, Check
} from 'lucide-react';
import { createPortal } from 'react-dom';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 
  'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Delhi'
];

const BLANK_TERRITORY_FORM = { name: '', state: 'Gujarat', districts: '', executiveId: '' };

export default function Geography() {
  const { orders, territories, addTerritory, updateTerritory, deleteTerritory } = useData();
  const { users: allUsers, canAccessData, isAdmin } = useAuth();
  
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'territories'
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' });
  const [selectedTerritoryId, setSelectedTerritoryId] = useState(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTerritory, setEditingTerritory] = useState(null);
  const [formData, setFormData] = useState(BLANK_TERRITORY_FORM);

  // Filter Sales Executives
  const salesExecutives = useMemo(() => allUsers.filter(u => isSalesRole(u.role)), [allUsers]);

  // Derived Geographic Insights from CRM Orders
  const visibleOrders = useMemo(() => orders.filter(o => canAccessData(o.assignedTo)), [orders, canAccessData]);

  const geoData = useMemo(() => {
    const map = {};
    visibleOrders.forEach(order => {
      const key = `${order.state || 'Unknown'}-${order.city || 'Unknown'}`;
      if (!map[key]) {
        map[key] = { state: order.state || 'Unknown', city: order.city || 'Unknown', orders: 0, revenue: 0, units: 0 };
      }
      map[key].orders += 1;
      map[key].revenue += Number(order.value || 0);
      map[key].units += Number(order.quantity || 0);
    });

    const data = Object.values(map);
    data.sort((a, b) => {
      let aVal = a[sortConfig.key];
      let bVal = b[sortConfig.key];
      if (typeof aVal === 'string') {
        return sortConfig.direction === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal);
      }
      return sortConfig.direction === 'asc' ? aVal - bVal : bVal - aVal;
    });

    return data;
  }, [visibleOrders, sortConfig]);

  // Active Territory for sidebar visual mapping
  const activeTerritoryDetail = useMemo(() => {
    if (selectedTerritoryId) {
      return territories.find(t => t.id === selectedTerritoryId);
    }
    return territories[0] || null;
  }, [selectedTerritoryId, territories]);

  // Revenue per state from ALL visible orders — used by both tabs
  const stateOrderStats = useMemo(() => {
    const map = {};
    visibleOrders.forEach(o => {
      const s = o.state || 'Unknown';
      if (!map[s]) map[s] = { revenue: 0, count: 0, orders: [] };
      map[s].revenue += Number(o.value || 0);
      map[s].count += 1;
      map[s].orders.push(o);
    });
    return map;
  }, [visibleOrders]);

  // Handlers
  const requestSort = (key) => {
    setSortConfig(prev => ({
      key,
      direction: prev.key === key && prev.direction === 'asc' ? 'desc' : 'asc'
    }));
  };

  const handleOpenAdd = () => {
    setEditingTerritory(null);
    setFormData({
      name: '',
      state: 'Gujarat',
      districts: '',
      executiveId: salesExecutives[0]?.id || ''
    });
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    setEditingTerritory(t);
    setFormData({
      name: t.name,
      state: t.state || 'Gujarat',
      districts: Array.isArray(t.districts) ? t.districts.join(', ') : t.districts || '',
      executiveId: t.executiveId || ''
    });
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const districtList = formData.districts
      .split(',')
      .map(d => d.trim())
      .filter(d => d.length > 0);

    const payload = {
      name: formData.name,
      state: formData.state,
      districts: districtList,
      executiveId: formData.executiveId
    };

    if (editingTerritory) {
      updateTerritory(editingTerritory.id, payload);
    } else {
      addTerritory(payload);
    }
    setIsModalOpen(false);
  };

  const getExecutiveName = (id) => {
    const exec = allUsers.find(u => u.id === id);
    return exec ? exec.name : 'Unassigned';
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe size={24} className="text-brand-accent" />
            Geography & Territories
          </h1>
          <p className="text-slate-400 text-sm mt-1">Manage corporate distribution sales territories and view performance distribution.</p>
        </div>
        
        {activeTab === 'territories' && isAdmin && (
          <button 
            onClick={handleOpenAdd}
            className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold"
          >
            <Plus size={16} /> Add Territory
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1">
        <button 
          onClick={() => setActiveTab('insights')}
          className={`px-5 py-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'insights' 
              ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10' 
              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <Compass size={16} />
          Geographic Insights
        </button>
        <button 
          onClick={() => setActiveTab('territories')}
          className={`px-5 py-3 font-semibold text-sm border-b-2 flex items-center gap-2 transition-all ${
            activeTab === 'territories' 
              ? 'border-brand-accent text-brand-accent bg-brand-primary-light/10' 
              : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'
          }`}
        >
          <MapPin size={16} />
          Territory Structure
        </button>
      </div>

      {/* ── Tab Content: Geographic Insights ────────────────────────────────── */}
      {activeTab === 'insights' && (() => {
        // Build state-level revenue for map coloring
        const stateRevenue = {};
        visibleOrders.forEach(o => {
          if (o.state) stateRevenue[o.state] = (stateRevenue[o.state] || 0) + (o.value || 0);
        });
        const maxRev = Math.max(...Object.values(stateRevenue), 1);
        const getStateColor = (stateName) => {
          const rev = stateRevenue[stateName] || 0;
          const intensity = rev / maxRev;
          if (intensity === 0) return '#1e293b';
          if (intensity < 0.2) return '#064e3b';
          if (intensity < 0.5) return '#065f46';
          if (intensity < 0.8) return '#047857';
          return '#10b981';
        };
        const getStateOpacity = (stateName) => {
          const rev = stateRevenue[stateName] || 0;
          return rev > 0 ? 0.85 : 0.3;
        };

        return (
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            {/* SVG India Map */}
            <div className="glass-panel rounded-2xl p-5 border border-white/5">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-sm font-bold text-white uppercase tracking-wider">Revenue Heatmap</h3>
                <div className="flex items-center gap-3 text-[10px] text-slate-400">
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block"/><span>High</span></span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-900 inline-block"/><span>Low</span></span>
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-700 inline-block"/><span>None</span></span>
                </div>
              </div>
              <div className="relative w-full overflow-hidden rounded-xl bg-brand-primary-dark/50 border border-white/5">
                <svg viewBox="0 0 550 600" className="w-full" style={{ maxHeight: '420px' }}>
                  {/* Simplified India state paths — approximated polygons */}
                  {[
                    { name: 'Rajasthan', d: 'M 120 130 L 220 110 L 250 150 L 240 230 L 160 250 L 110 210 Z' },
                    { name: 'Gujarat', d: 'M 60 200 L 120 180 L 160 250 L 130 310 L 80 290 L 50 250 Z' },
                    { name: 'Maharashtra', d: 'M 130 310 L 240 260 L 290 310 L 270 380 L 180 400 L 130 360 Z' },
                    { name: 'Madhya Pradesh', d: 'M 160 250 L 260 225 L 310 260 L 290 310 L 180 320 Z' },
                    { name: 'Uttar Pradesh', d: 'M 220 110 L 340 95 L 370 140 L 340 185 L 260 200 L 240 160 Z' },
                    { name: 'Punjab', d: 'M 185 60 L 235 50 L 240 90 L 200 100 L 180 85 Z' },
                    { name: 'Haryana', d: 'M 200 100 L 240 90 L 250 120 L 220 130 L 195 118 Z' },
                    { name: 'Delhi', d: 'M 220 115 L 235 110 L 238 125 L 224 128 Z' },
                    { name: 'Himachal Pradesh', d: 'M 200 40 L 255 30 L 265 65 L 235 75 L 205 65 Z' },
                    { name: 'Bihar', d: 'M 340 145 L 400 135 L 415 175 L 380 195 L 340 185 Z' },
                    { name: 'West Bengal', d: 'M 400 150 L 440 140 L 450 210 L 420 240 L 390 210 L 400 175 Z' },
                    { name: 'Odisha', d: 'M 370 200 L 420 210 L 410 280 L 365 285 L 340 250 L 360 220 Z' },
                    { name: 'Jharkhand', d: 'M 360 175 L 410 170 L 415 205 L 370 210 L 355 195 Z' },
                    { name: 'Chhattisgarh', d: 'M 290 230 L 360 220 L 365 285 L 310 295 L 285 275 Z' },
                    { name: 'Telangana', d: 'M 250 305 L 320 295 L 330 355 L 280 365 L 240 345 Z' },
                    { name: 'Andhra Pradesh', d: 'M 250 360 L 330 355 L 340 420 L 290 450 L 245 420 Z' },
                    { name: 'Karnataka', d: 'M 175 375 L 250 360 L 250 440 L 205 470 L 165 440 L 155 400 Z' },
                    { name: 'Kerala', d: 'M 185 460 L 215 450 L 220 530 L 195 540 L 175 505 Z' },
                    { name: 'Tamil Nadu', d: 'M 215 450 L 290 450 L 295 520 L 250 545 L 220 525 Z' },
                    { name: 'Goa', d: 'M 148 408 L 168 400 L 172 418 L 152 424 Z' },
                    { name: 'Assam', d: 'M 450 120 L 500 115 L 505 145 L 455 150 Z' },
                  ].map(state => (
                    <g key={state.name}>
                      <path
                        d={state.d}
                        fill={getStateColor(state.name)}
                        fillOpacity={getStateOpacity(state.name)}
                        stroke="#334155"
                        strokeWidth="1.5"
                        className="transition-all duration-300 hover:brightness-125 cursor-pointer"
                      />
                      {stateRevenue[state.name] > 0 && (
                        <title>{state.name}: ₹{stateRevenue[state.name].toLocaleString('en-IN')}</title>
                      )}
                    </g>
                  ))}
                  {/* State name labels for active states */}
                  {Object.entries(stateRevenue).filter(([, rev]) => rev > 0).map(([state, rev]) => {
                    const labelMap = {
                      'Gujarat': [100, 245], 'Maharashtra': [205, 345], 'Rajasthan': [175, 185],
                      'Karnataka': [200, 420], 'Uttar Pradesh': [290, 150], 'Tamil Nadu': [250, 490],
                      'Andhra Pradesh': [285, 400], 'West Bengal': [420, 190], 'Madhya Pradesh': [230, 280],
                    };
                    const pos = labelMap[state];
                    if (!pos) return null;
                    return (
                      <text key={state} x={pos[0]} y={pos[1]} textAnchor="middle" fontSize="9" fill="#d1fae5" fontWeight="600" className="pointer-events-none">
                        {state.split(' ')[0]}
                      </text>
                    );
                  })}
                </svg>
              </div>
              {/* Legend */}
              <div className="mt-3 flex flex-wrap gap-2">
                {Object.entries(stateRevenue).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([state, rev]) => (
                  <span key={state} className="text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded-full">
                    {state}: ₹{rev.toLocaleString('en-IN')}
                  </span>
                ))}
              </div>
            </div>

            {/* Revenue Table */}
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
              <div className="p-4 border-b border-white/5 bg-brand-primary-light/20">
                <span className="text-sm font-bold text-white uppercase tracking-wider">City-Level Breakdown</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('state')}>
                        <div className="flex items-center gap-1">State <ArrowUpDown size={14} /></div>
                      </th>
                      <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('city')}>
                        <div className="flex items-center gap-1">City <ArrowUpDown size={14} /></div>
                      </th>
                      <th className="p-4 text-center cursor-pointer hover:text-white" onClick={() => requestSort('orders')}>
                        <div className="flex items-center gap-1 justify-center">Orders <ArrowUpDown size={14} /></div>
                      </th>
                      <th className="p-4 text-right cursor-pointer hover:text-white" onClick={() => requestSort('revenue')}>
                        <div className="flex items-center gap-1 justify-end">Revenue <ArrowUpDown size={14} /></div>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {geoData.length > 0 ? geoData.map((row, idx) => {
                      const pct = maxRev > 0 ? Math.round((row.revenue / maxRev) * 100) : 0;
                      return (
                        <tr key={idx} className="hover:bg-brand-primary-lighter/20 transition-colors">
                          <td className="p-4 font-semibold text-white">{row.state}</td>
                          <td className="p-4 text-slate-400">{row.city}</td>
                          <td className="p-4 text-center font-mono">{row.orders}</td>
                          <td className="p-4 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                <div className="h-full bg-brand-accent rounded-full transition-all" style={{ width: `${pct}%` }} />
                              </div>
                              <span className="font-bold text-brand-accent text-xs">₹{row.revenue.toLocaleString('en-IN')}</span>
                            </div>
                          </td>
                        </tr>
                      );
                    }) : (
                      <tr>
                        <td colSpan="4" className="p-8 text-center text-slate-500">No geo insights logged yet.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        );
      })()}


      {/* ── Tab Content: Territory Structure ────────────────────────────────── */}
      {activeTab === 'territories' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Territories Table List */}
          <div className="lg:col-span-8 space-y-4">
            <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
              <div className="p-4 border-b border-white/5 bg-brand-primary-light/20 flex justify-between items-center">
                <span className="text-sm font-bold text-white uppercase tracking-wider">Territories Matrix</span>
                <span className="text-xs text-slate-400 font-medium">{territories.length} Active Zones</span>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4">Zone / State</th>
                      <th className="p-4">Sales Supervisor</th>
                      <th className="p-4 text-center">Districts Covered</th>
                      <th className="p-4 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {territories.length > 0 ? territories.map((t) => (
                      <tr 
                        key={t.id} 
                        onClick={() => setSelectedTerritoryId(t.id)}
                        className={`cursor-pointer transition-all hover:bg-brand-primary-lighter/20 ${
                          activeTerritoryDetail?.id === t.id ? 'bg-brand-accent/5 border-l-4 border-l-brand-accent' : ''
                        }`}
                      >
                        <td className="p-4">
                          <div className="font-semibold text-white flex items-center gap-1.5">
                            <MapPin size={14} className="text-brand-accent" />
                            {t.name}
                          </div>
                          <div className="text-xs text-slate-500 mt-0.5">{t.state}</div>
                        </td>
                        <td className="p-4">
                          <div className="flex items-center gap-2">
                            <div className="w-6 h-6 rounded-full bg-blue-500/10 text-blue-400 flex items-center justify-center font-bold text-[10px] uppercase">
                              {getExecutiveName(t.executiveId).substring(0,2)}
                            </div>
                            <span className="font-medium text-slate-300">{getExecutiveName(t.executiveId)}</span>
                          </div>
                        </td>
                        <td className="p-4 text-center">
                          <span className="bg-slate-800 border border-slate-700 text-white text-xs px-2.5 py-0.5 rounded-full font-bold">
                            {Array.isArray(t.districts) ? t.districts.length : 0} Districts
                          </span>
                        </td>
                        <td className="p-4 text-right" onClick={(e) => e.stopPropagation()}>
                          {isAdmin ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button 
                                onClick={() => handleOpenEdit(t)} 
                                className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"
                              >
                                <Edit2 size={14} />
                              </button>
                              <button 
                                onClick={() => { if (confirm('Delete territory?')) deleteTerritory(t.id); }}
                                className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"
                              >
                                <Trash2 size={14} />
                              </button>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-600 font-mono">—</span>
                          )}
                        </td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4" className="p-8 text-center text-slate-500">No territories added. Click "Add Territory" to begin.</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>

          {/* Territory Sidebar — live order data per state */}
          <div className="lg:col-span-4 space-y-4">
            {activeTerritoryDetail ? (() => {
              const stateStats = stateOrderStats[activeTerritoryDetail.state] || { revenue: 0, count: 0, orders: [] };
              const recentOrders = [...stateStats.orders].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 4);
              return (
                <div className="glass-panel rounded-2xl p-5 border border-brand-accent/20 bg-brand-primary-light/10 space-y-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <span className="text-[10px] font-bold text-brand-accent uppercase tracking-widest bg-brand-accent/10 border border-brand-accent/20 px-2 py-0.5 rounded-full">Zone Live Data</span>
                      <h3 className="text-lg font-bold text-white mt-1.5">{activeTerritoryDetail.name}</h3>
                      <p className="text-xs text-slate-400 mt-0.5">{activeTerritoryDetail.state} Region</p>
                    </div>
                    <Compass className="text-brand-accent animate-spin-slow shrink-0" size={28} />
                  </div>

                  {/* Live order stats for this territory's state */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">State Revenue</p>
                      <p className="text-base font-extrabold text-brand-accent mt-0.5">₹{stateStats.revenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Orders in State</p>
                      <p className="text-base font-extrabold text-white mt-0.5">{stateStats.count}</p>
                    </div>
                  </div>

                  <div className="border-t border-white/5 pt-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Supervisor:</span>
                      <span className="font-semibold text-white">{getExecutiveName(activeTerritoryDetail.executiveId)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Territory ID:</span>
                      <span className="font-mono text-slate-300">{activeTerritoryDetail.id}</span>
                    </div>
                  </div>

                  {/* Recent orders from this state */}
                  <div className="bg-brand-primary-dark/80 rounded-xl p-3 border border-white/5">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] rounded-xl pointer-events-none" />
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      {stateStats.count > 0 ? `Recent Orders from ${activeTerritoryDetail.state}` : 'Districts Network'}
                    </p>
                    {recentOrders.length > 0 ? (
                      <div className="space-y-2">
                        {recentOrders.map((o, i) => (
                          <div key={i} className="flex items-center justify-between text-[11px] bg-white/5 rounded-lg px-2.5 py-1.5">
                            <div>
                              <span className="text-white font-medium">{o.customerName}</span>
                              <span className="text-slate-500 ml-1.5">{o.city}</span>
                            </div>
                            <span className="text-brand-accent font-bold">₹{(o.value || 0).toLocaleString('en-IN')}</span>
                          </div>
                        ))}
                        {stateStats.count > 4 && (
                          <p className="text-[10px] text-slate-600 text-center">+{stateStats.count - 4} more orders in {activeTerritoryDetail.state}</p>
                        )}
                      </div>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {Array.isArray(activeTerritoryDetail.districts) && activeTerritoryDetail.districts.length > 0 ? (
                          activeTerritoryDetail.districts.map((dist, idx) => (
                            <div key={idx} className="bg-brand-accent/10 border border-brand-accent/20 text-brand-accent text-[11px] px-2.5 py-1 rounded-lg flex items-center gap-1">
                              <div className="w-1.5 h-1.5 rounded-full bg-brand-accent shrink-0" />
                              {dist}
                            </div>
                          ))
                        ) : (
                          <div className="text-xs italic text-slate-500 py-2">No districts assigned. Add an order from {activeTerritoryDetail.state} to see live data here.</div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="glass-panel rounded-2xl p-6 text-center text-slate-500 border border-white/5 py-16">
                <MapPin className="mx-auto text-slate-600 mb-2" size={32} />
                No active zone selection. Select a territory to view live order data.
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Territory Add/Edit Modal ───────────────────────────────────────── */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh]">
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)}></div>
          
          {/* Modal Panel */}
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <MapPin className="text-brand-accent" size={20} />
                {editingTerritory ? 'Edit Sales Zone' : 'Create New Territory'}
              </h3>
              <button 
                onClick={() => setIsModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white rounded-lg transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Territory/Zone Name *</label>
                <input 
                  type="text" 
                  required
                  placeholder="e.g. Gujarat North Hub"
                  value={formData.name}
                  onChange={e => setFormData({ ...formData, name: e.target.value })}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">State Coverage *</label>
                <select
                  value={formData.state}
                  onChange={e => setFormData({ ...formData, state: e.target.value })}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                >
                  {INDIAN_STATES.map(st => (
                    <option key={st} value={st} className="bg-brand-primary">{st}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">
                  Districts Covered *
                </label>
                <p className="text-[10px] text-slate-500 mb-1.5">Enter districts separated by commas (e.g. Anand, Nadiad, Vadodara).</p>
                <textarea 
                  required
                  rows="3"
                  placeholder="Anand, Vadodara, Ahmedabad"
                  value={formData.districts}
                  onChange={e => setFormData({ ...formData, districts: e.target.value })}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Assigned Sales Supervisor *</label>
                <select
                  value={formData.executiveId}
                  onChange={e => setFormData({ ...formData, executiveId: e.target.value })}
                  className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
                >
                  {salesExecutives.length > 0 ? salesExecutives.map(exec => (
                    <option key={exec.id} value={exec.id} className="bg-brand-primary">
                      {exec.name} ({exec.email})
                    </option>
                  )) : (
                    <option value="" className="bg-brand-primary">No Sales Executives available</option>
                  )}
                </select>
              </div>

              <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                <button 
                  type="button" 
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl"
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className="px-4 py-2 text-sm btn-accent rounded-xl"
                >
                  {editingTerritory ? 'Save Changes' : 'Create Territory'}
                </button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
