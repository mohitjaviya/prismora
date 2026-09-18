import { useState, useMemo, Fragment } from 'react';
import { useData } from '../context/DataContext';
import { INDIA_STATE_PATHS, INDIA_VIEWBOX } from '../utils/indiaMap';
import { STATE_DISTRICTS } from '../utils/indianStatesDistricts';
import { useAuth, isSalesRole } from '../context/AuthContext';
import { 
  ArrowUpDown, Plus, Edit2, Trash2, MapPin, Users, Globe, ChevronRight, X, Compass, Check
} from 'lucide-react';
import { useConfirm } from '../context/DialogContext';
import { PageHeader } from '../components/ui';
import { createPortal } from 'react-dom';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat', 
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 
  'Madhya Pradesh', 'Maharashtra', 'Odisha', 'Punjab', 'Rajasthan', 
  'Tamil Nadu', 'Telangana', 'Uttar Pradesh', 'West Bengal', 'Delhi'
];

const BLANK_TERRITORY_FORM = { name: '', state: 'Gujarat', districts: [], executiveId: '' };

// Territory names, district names and the city recorded on an order are all
// typed by hand at some point, so they are compared loosely. "Gujrat North Hub"
// and "Gujarat North Hub" are still two different zones — this only forgives
// stray spaces and capitals, not spelling.
const norm = (s) => String(s || '').trim().toLowerCase();

export default function Geography() {
  const { orders, territories, addTerritory, updateTerritory, deleteTerritory } = useData();
  const confirm = useConfirm();
  const { users: allUsers, canAccessData, isAdmin } = useAuth();
  
  const [activeTab, setActiveTab] = useState('insights'); // 'insights' | 'territories'
  const [sortConfig, setSortConfig] = useState({ key: 'revenue', direction: 'desc' });
  const [selectedTerritoryId, setSelectedTerritoryId] = useState(null);

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTerritory, setEditingTerritory] = useState(null);
  const [formData, setFormData] = useState(BLANK_TERRITORY_FORM);
  // Districts saved by the old free-text box that match no real district, so
  // the modal can say what it is about to drop instead of doing it quietly.
  const [droppedDistricts, setDroppedDistricts] = useState([]);
  // Which zone's district list is opened out in the matrix, one at a time.
  const [expandedDistricts, setExpandedDistricts] = useState(null);

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

  // The breakdown repeated the state on every row, so a business selling into
  // twenty cities across four states read as twenty near-identical lines with
  // no sense of which state mattered. Rolling the cities up under their state
  // puts the answer first and keeps the detail one click away.
  const byState = useMemo(() => {
    const grouped = {};
    geoData.forEach(row => {
      const key = row.state || 'Unknown';
      if (!grouped[key]) grouped[key] = { state: key, cities: [], orders: 0, revenue: 0, units: 0 };
      grouped[key].cities.push(row);
      grouped[key].orders += row.orders;
      grouped[key].revenue += row.revenue;
      grouped[key].units += row.units;
    });

    const list = Object.values(grouped);
    list.forEach(g => g.cities.sort((a, b) => b.revenue - a.revenue));
    list.sort((a, b) => {
      const dir = sortConfig.direction === 'asc' ? 1 : -1;
      if (sortConfig.key === 'state') return a.state.localeCompare(b.state) * dir;
      if (sortConfig.key === 'city') return (b.cities.length - a.cities.length) * dir;
      return ((a[sortConfig.key] || 0) - (b[sortConfig.key] || 0)) * dir;
    });
    return list;
  }, [geoData, sortConfig]);

  const grandRevenue = useMemo(() => byState.reduce((sum, g) => sum + g.revenue, 0), [byState]);

  // One state open at a time, shared with the map beside it: opening a row
  // highlights that state on the map, and clicking the map opens its row.
  const [openState, setOpenState] = useState(null);
  const toggleState = (name) => setOpenState(prev => (prev === name ? null : name));

  // Active Territory for sidebar visual mapping
  const activeTerritoryDetail = useMemo(() => {
    if (selectedTerritoryId) {
      return territories.find(t => t.id === selectedTerritoryId);
    }
    return territories[0] || null;
  }, [selectedTerritoryId, territories]);

  /**
   * What this zone has actually sold — its districts, not its whole state.
   *
   * The panel used to read stateOrderStats[territory.state], so a zone covering
   * Ahmedabad, Vadodara and Anand reported every order in Gujarat as its own:
   * Amreli sits 300km outside it and still counted. A territory is defined by
   * the districts it covers, so that is what it is measured on.
   *
   * An order records a city rather than a district — so the city is matched
   * against the covered districts, which is exact for the district towns the
   * team actually sells into (Amreli, Anand, Vadodara) and misses an order
   * booked to a smaller town inside one of those districts. `outsideZone`
   * exists to make that visible instead of silently dropping it.
   */
  const territoryStats = useMemo(() => {
    if (!activeTerritoryDetail) return null;
    const t = activeTerritoryDetail;
    const covered = new Set((Array.isArray(t.districts) ? t.districts : []).map(norm));
    const sum = list => list.reduce((s, o) => s + Number(o.value || 0), 0);

    const inState = visibleOrders.filter(o => norm(o.state) === norm(t.state));
    const inZone = inState.filter(o => covered.has(norm(o.city)));

    // Booked against this zone by name, but sitting in a district it does not
    // cover. This is the case worth surfacing: the order is being credited to
    // a supervisor who is not responsible for that ground.
    const outsideZone = visibleOrders.filter(
      o => norm(o.territory) === norm(t.name) && !covered.has(norm(o.city))
    );

    return {
      revenue: sum(inZone), count: inZone.length, orders: inZone,
      stateRevenue: sum(inState), stateCount: inState.length,
      outsideZone,
    };
  }, [activeTerritoryDetail, visibleOrders]);

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
      districts: [],
      executiveId: salesExecutives[0]?.id || ''
    });
    setDroppedDistricts([]);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (t) => {
    // Everything saved before the picker existed was typed by hand, so it
    // arrives in whatever case and spelling the person used — this zone holds
    // "anand", "vadodar", "ahmedabad". Match each one back to the real district
    // ignoring case, so the boxes it should tick are actually ticked; anything
    // that matches nothing ("vadodar") is set aside and named in the modal.
    const stateName = t.state || 'Gujarat';
    const saved = Array.isArray(t.districts)
      ? t.districts
      : String(t.districts || '').split(',').map(d => d.trim()).filter(Boolean);
    const byNorm = new Map((STATE_DISTRICTS[stateName] || []).map(d => [norm(d), d]));
    const matched = [];
    const unknown = [];
    saved.forEach(d => {
      const official = byNorm.get(norm(d));
      if (!official) unknown.push(d);
      else if (!matched.includes(official)) matched.push(official);
    });

    setEditingTerritory(t);
    setFormData({
      name: t.name,
      state: stateName,
      districts: matched,
      executiveId: t.executiveId || ''
    });
    setDroppedDistricts(unknown);
    setIsModalOpen(true);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const districtList = formData.districts;
    // The picker replaced a `required` textarea, so the browser no longer
    // enforces this. A zone covering nothing matches no order and reports zero
    // for ever, which reads as a broken screen rather than an empty zone.
    if (districtList.length === 0) return;

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
            <PageHeader
        icon={Globe}
        title="Geography & Territories"
        subtitle="Manage corporate distribution sales territories and view performance distribution."
        actions={
        <>
          {activeTab === 'territories' && isAdmin && (
          <button
          onClick={handleOpenAdd}
          className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold"
          >
          <Plus size={16} /> Add Territory
          </button>
          )}
        </>
        }
      />

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
                  <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-slate-400/25 border border-slate-400/40 inline-block"/><span>None</span></span>
                </div>
              </div>
              <div className="relative w-full overflow-hidden rounded-xl bg-brand-primary-dark/50 border border-white/5">
                <svg viewBox={INDIA_VIEWBOX} className="w-full" style={{ maxHeight: '460px' }}>
                  {/* Real state outlines rather than the hand-drawn polygons that
                      were here before — those were five-point blobs that did not
                      resemble the states they stood for, and covered only 21 of
                      them. All 36 states and union territories are present now,
                      so the hard-coded label coordinates that went with the old
                      drawing are gone; the name is on hover instead. */}
                  {/* The map and the table below it show the same numbers, so
                      they behave as one control: clicking either opens that
                      state in the other. */}
                  {Object.entries(INDIA_STATE_PATHS).map(([name, d]) => {
                    const rev = stateRevenue[name] || 0;
                    return (
                      <path
                        key={name}
                        d={d}
                        onClick={() => toggleState(name)}
                        fill={rev > 0 ? getStateColor(name) : '#94a3b8'}
                        fillOpacity={rev > 0 ? 0.9 : 0.22}
                        stroke={openState === name ? '#D4186C' : '#64748b'}
                        strokeWidth={openState === name ? 2.5 : 0.8}
                        strokeOpacity={openState === name ? 1 : 0.5}
                        className="transition-all duration-300 hover:brightness-125 cursor-pointer"
                      >
                        <title>{rev > 0 ? `${name}: ₹${rev.toLocaleString('en-IN')}` : `${name}: no orders`}</title>
                      </path>
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
                <div>
                  <span className="text-sm font-bold text-white uppercase tracking-wider">Revenue by State</span>
                  <p className="text-[10px] text-slate-500 mt-0.5 normal-case font-normal">Click a state — here or on the map — to see its cities</p>
                </div>
              </div>
              <div className="overflow-x-auto custom-scrollbar">
                <table className="w-full text-left text-sm border-collapse">
                  <thead>
                    <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                      <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('state')}>
                        <div className="flex items-center gap-1">State <ArrowUpDown size={14} /></div>
                      </th>
                      <th className="p-4 cursor-pointer hover:text-white" onClick={() => requestSort('city')}>
                        <div className="flex items-center gap-1">Cities <ArrowUpDown size={14} /></div>
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
                    {byState.length > 0 ? byState.map(group => {
                      const isOpen = openState === group.state;
                      const share = grandRevenue > 0 ? Math.round((group.revenue / grandRevenue) * 100) : 0;
                      return (
                        <Fragment key={group.state}>
                          <tr
                            onClick={() => toggleState(group.state)}
                            className={`cursor-pointer transition-colors ${isOpen ? 'bg-brand-accent/5' : 'hover:bg-brand-primary-lighter/20'}`}
                          >
                            <td className="p-4 font-semibold text-white">
                              <div className="flex items-center gap-1.5">
                                <ChevronRight size={14} className={`text-brand-accent transition-transform ${isOpen ? 'rotate-90' : ''}`} />
                                {group.state}
                              </div>
                            </td>
                            <td className="p-4 text-slate-400 text-xs">
                              {group.cities.length} {group.cities.length === 1 ? 'city' : 'cities'}
                            </td>
                            <td className="p-4 text-center font-mono">{group.orders}</td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end gap-2">
                                <span className="text-[10px] text-slate-500 tabular-nums w-8 text-right">{share}%</span>
                                <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                                  <div className="h-full bg-brand-accent rounded-full transition-all" style={{ width: `${share}%` }} />
                                </div>
                                <span className="font-bold text-brand-accent text-xs tabular-nums">₹{group.revenue.toLocaleString('en-IN')}</span>
                              </div>
                            </td>
                          </tr>

                          {isOpen && group.cities.map(city => {
                            const cityShare = group.revenue > 0 ? Math.round((city.revenue / group.revenue) * 100) : 0;
                            return (
                              <tr key={`${group.state}-${city.city}`} className="bg-brand-primary-lighter/10">
                                <td className="py-2.5 pl-10 pr-4 text-slate-500 text-xs">↳</td>
                                <td className="py-2.5 px-4 text-slate-300">{city.city}</td>
                                <td className="py-2.5 px-4 text-center font-mono text-slate-400">{city.orders}</td>
                                <td className="py-2.5 px-4 text-right">
                                  <div className="flex items-center justify-end gap-2">
                                    <span className="text-[10px] text-slate-600 tabular-nums w-8 text-right">{cityShare}%</span>
                                    <div className="w-16 h-1 bg-white/5 rounded-full overflow-hidden">
                                      <div className="h-full bg-brand-accent/50 rounded-full" style={{ width: `${cityShare}%` }} />
                                    </div>
                                    <span className="text-slate-300 text-xs tabular-nums">₹{city.revenue.toLocaleString('en-IN')}</span>
                                  </div>
                                </td>
                              </tr>
                            );
                          })}
                        </Fragment>
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
                        {/* A count told nobody which ground this zone actually
                            covers, and the dark pill it sat in was unreadable
                            on the light theme. The names are the useful part. */}
                        <td className="p-4">
                          {(() => {
                            const list = Array.isArray(t.districts)
                              ? t.districts
                              : String(t.districts || '').split(',').map(d => d.trim()).filter(Boolean);
                            if (list.length === 0) {
                              return <span className="text-xs italic text-amber-500">No districts set</span>;
                            }
                            // The rest used to be a hover tooltip, which says
                            // nothing on a phone and reads as "these districts
                            // are not viewable". Tapping the chip opens them.
                            const isOpen = expandedDistricts === t.id;
                            const shown = isOpen ? list : list.slice(0, 3);
                            return (
                              <div className="flex flex-wrap gap-1 justify-center">
                                {shown.map(d => (
                                  <span
                                    key={d}
                                    className="bg-brand-accent/10 border border-brand-accent/25 text-brand-accent text-[11px] px-2 py-0.5 rounded-full font-semibold"
                                  >
                                    {d}
                                  </span>
                                ))}
                                {list.length > 3 && (
                                  <button
                                    type="button"
                                    // The row itself selects the zone; this
                                    // only opens the list, so it stops there.
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setExpandedDistricts(isOpen ? null : t.id);
                                    }}
                                    className="bg-white/5 border border-white/10 text-slate-400 hover:text-brand-accent hover:border-brand-accent/25 text-[11px] px-2 py-0.5 rounded-full font-semibold transition-colors cursor-pointer"
                                  >
                                    {isOpen ? 'Show less' : `+${list.length - 3} more`}
                                  </button>
                                )}
                              </div>
                            );
                          })()}
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
                                onClick={async () => { if (await confirm({ title: 'Delete territory?', danger: true, confirmLabel: 'Delete' })) deleteTerritory(t.id); }}
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
              const zone = territoryStats;
              const recentOrders = [...zone.orders].sort((a, b) => new Date(b.date || b.createdAt) - new Date(a.date || a.createdAt)).slice(0, 4);
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

                  {/* The zone's own districts — not its whole state. */}
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-brand-accent/10 border border-brand-accent/20 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Zone Revenue</p>
                      <p className="text-base font-extrabold text-brand-accent mt-0.5">₹{zone.revenue.toLocaleString('en-IN')}</p>
                    </div>
                    <div className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                      <p className="text-[10px] text-slate-400 uppercase tracking-wider">Orders in Zone</p>
                      <p className="text-base font-extrabold text-white mt-0.5">{zone.count}</p>
                    </div>
                  </div>

                  {/* State kept as context, clearly separated from the zone's
                      own numbers — this pair used to be labelled as the zone. */}
                  <p className="text-[10px] text-slate-500 text-center -mt-1">
                    All of {activeTerritoryDetail.state}: ₹{zone.stateRevenue.toLocaleString('en-IN')} across {zone.stateCount} order{zone.stateCount === 1 ? '' : 's'}
                  </p>

                  {zone.outsideZone.length > 0 && (
                    <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-3">
                      <p className="text-[10px] font-bold text-amber-400 uppercase tracking-wider mb-1.5">
                        {zone.outsideZone.length} order{zone.outsideZone.length === 1 ? '' : 's'} booked here, outside its districts
                      </p>
                      <div className="space-y-1">
                        {zone.outsideZone.slice(0, 3).map(o => (
                          <p key={o.id} className="text-[11px] text-slate-300">
                            <span className="font-medium">{o.id}</span> — {o.customerName}
                            <span className="text-amber-400/80"> in {o.city || 'no city'}</span>
                          </p>
                        ))}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1.5 leading-relaxed">
                        These count towards {getExecutiveName(activeTerritoryDetail.executiveId)} but sit on ground this
                        zone does not cover. Either add the district above, or move the order to the right zone.
                      </p>
                    </div>
                  )}

                  <div className="border-t border-white/5 pt-3 space-y-2">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Supervisor:</span>
                      <span className="font-semibold text-white">{getExecutiveName(activeTerritoryDetail.executiveId)}</span>
                    </div>
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-slate-400">Territory ID:</span>
                      <span className="font-mono text-slate-300">{activeTerritoryDetail.id}</span>
                    </div>
                    {/* The districts used to appear here only while the zone
                        had no orders, so the moment it started selling there
                        was nowhere left to read what ground it covers. */}
                    <div className="text-xs">
                      <span className="text-slate-400">Covers:</span>
                      <div className="flex flex-wrap gap-1 mt-1.5">
                        {(Array.isArray(activeTerritoryDetail.districts) ? activeTerritoryDetail.districts : []).length > 0 ? (
                          activeTerritoryDetail.districts.map(d => (
                            <span key={d} className="bg-brand-accent/10 border border-brand-accent/25 text-brand-accent text-[11px] px-2 py-0.5 rounded-full font-semibold">
                              {d}
                            </span>
                          ))
                        ) : (
                          <span className="text-[11px] italic text-amber-500">No districts set</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Recent orders from this state */}
                  <div className="bg-brand-primary-dark/80 rounded-xl p-3 border border-white/5">
                    <div className="absolute inset-0 opacity-10 bg-[radial-gradient(#10b981_1px,transparent_1px)] [background-size:16px_16px] rounded-xl pointer-events-none" />
                    <p className="text-[9px] font-bold text-slate-500 uppercase tracking-wider mb-2">
                      {zone.count > 0 ? `Recent orders in ${activeTerritoryDetail.name}` : 'Districts covered'}
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
                        {zone.count > 4 && (
                          <p className="text-[10px] text-slate-600 text-center">+{zone.count - 4} more orders in this zone</p>
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
                          <div className="text-xs italic text-slate-500 py-2">No districts assigned to this zone yet — edit it to pick the districts it covers.</div>
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
                  // Districts belong to the state, so changing it clears them
                  // rather than leaving Anand ticked under Maharashtra.
                  onChange={e => setFormData({ ...formData, state: e.target.value, districts: [] })}
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
                {/* Typed districts were never going to line up with the city on
                    an order, and a zone is measured by matching those two. The
                    list is the real district list for the chosen state. */}
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] text-slate-500">
                    Tick every district this zone covers in {formData.state}.
                  </p>
                  {formData.districts.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setFormData({ ...formData, districts: [] })}
                      className="text-[10px] font-semibold text-slate-400 hover:text-brand-accent transition-colors"
                    >
                      Clear all
                    </button>
                  )}
                </div>

                {droppedDistricts.length > 0 && (
                  <div className="bg-amber-500/10 border border-amber-500/25 rounded-xl p-2.5 mb-2">
                    <p className="text-[11px] text-amber-400 leading-relaxed">
                      <span className="font-semibold">{droppedDistricts.join(', ')}</span>
                      {droppedDistricts.length === 1 ? ' does not match any' : ' do not match any'} district in {formData.state},
                      so it was never going to match an order. Tick the right one below — saving will drop it.
                    </p>
                  </div>
                )}

                <div className="glass-input rounded-xl p-2 max-h-52 overflow-y-auto">
                  <div className="grid grid-cols-2 gap-1">
                    {(STATE_DISTRICTS[formData.state] || []).map(dist => {
                      const picked = formData.districts.includes(dist);
                      return (
                        <button
                          type="button"
                          key={dist}
                          onClick={() => setFormData({
                            ...formData,
                            districts: picked
                              ? formData.districts.filter(d => d !== dist)
                              : [...formData.districts, dist],
                          })}
                          className={`flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left text-xs transition-colors ${
                            picked
                              ? 'bg-brand-accent/15 text-brand-accent font-semibold'
                              : 'text-slate-300 hover:bg-white/5'
                          }`}
                        >
                          <span className={`w-3.5 h-3.5 rounded flex items-center justify-center shrink-0 border ${
                            picked ? 'bg-brand-accent border-brand-accent' : 'border-slate-500'
                          }`}>
                            {picked && <Check size={10} className="text-white" strokeWidth={3} />}
                          </span>
                          <span className="truncate">{dist}</span>
                        </button>
                      );
                    })}
                    {(STATE_DISTRICTS[formData.state] || []).length === 0 && (
                      <p className="col-span-2 text-xs italic text-slate-500 py-3 text-center">
                        No district list for {formData.state} yet.
                      </p>
                    )}
                  </div>
                </div>

                <p className={`text-[10px] mt-1.5 ${formData.districts.length ? 'text-brand-accent' : 'text-amber-400'}`}>
                  {formData.districts.length
                    ? `${formData.districts.length} district${formData.districts.length > 1 ? 's' : ''} selected`
                    : 'Pick at least one district — a zone with none can never match an order.'}
                </p>
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
