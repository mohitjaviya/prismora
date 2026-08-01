import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  Tag, Plus, Trash2, X, Edit2, CheckCircle,
  Clock, AlertTriangle, Search, Filter, Download, Users, Percent, Gift, Calendar, BarChart3
} from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';

const SCHEME_TYPES = ['Flat Discount', 'Cash Discount', 'Free Goods', 'Slab Discount', 'Seasonal Offer', 'Buy X Get Y'];
const APPLICABLE_TO = ['All', 'Distributor', 'Dealer', 'Retailer'];

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const getDaysLeft = (validTo) => {
  if (!validTo) return null;
  const diff = Math.ceil((new Date(validTo) - new Date()) / 86400000);
  return diff;
};

const typeIcon = (type) => {
  if (type.includes('Discount') || type.includes('Cash')) return <Percent size={16} />;
  if (type.includes('Free') || type.includes('Buy')) return <Gift size={16} />;
  if (type.includes('Seasonal') || type.includes('Slab')) return <Calendar size={16} />;
  return <Tag size={16} />;
};

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

const BLANK_FORM = {
  name: '', type: 'Flat Discount', discountPct: '', freeGoodsQty: '',
  minOrderValue: '', applicableTo: 'Distributor', applicableProducts: [], validFrom: '', validTo: '',
  description: '', status: 'Active'
};

export default function Schemes() {
  const { schemes, addScheme, updateScheme, deleteScheme, distributorIncentives, productCatalog } = useData();
  const { canAccess } = useAuth();

  const canManage = canAccess('schemes', 'full');

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('Active');
  const [applicableFilter, setApplicableFilter] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingScheme, setEditingScheme] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);

  // Performance analytics per scheme — reuses distributor_incentives, which
  // already records every auto-generated incentive per order/party/scheme.
  const schemeStats = useMemo(() => {
    const stats = {};
    distributorIncentives.forEach(i => {
      if (!stats[i.schemeId]) stats[i.schemeId] = { uses: 0, cashValue: 0, freeUnits: 0, parties: new Set() };
      const s = stats[i.schemeId];
      s.uses += 1;
      if (i.incentiveType === 'Free Goods') s.freeUnits += Number(i.incentiveValue || 0);
      else s.cashValue += Number(i.incentiveValue || 0);
      const partyId = i.distributorId || i.dealerId || i.retailerId;
      if (partyId) s.parties.add(partyId);
    });
    return stats;
  }, [distributorIncentives]);

  const topScheme = useMemo(() => {
    let best = null;
    schemes.forEach(s => {
      const uses = schemeStats[s.id]?.uses || 0;
      if (uses > 0 && (!best || uses > best.uses)) best = { name: s.name, uses };
    });
    return best;
  }, [schemes, schemeStats]);

  const kpis = useMemo(() => {
    const active = schemes.filter(s => s.status === 'Active');
    const expiringSoon = active.filter(s => {
      const d = getDaysLeft(s.validTo);
      return d !== null && d <= 7 && d >= 0;
    });
    return { total: schemes.length, active: active.length, expiringSoon: expiringSoon.length };
  }, [schemes]);

  const filtered = useMemo(() => schemes.filter(s => {
    const matchSearch = !search || s.name.toLowerCase().includes(search.toLowerCase());
    const matchStatus = filter === 'All' ? true : filter === 'Active' ? s.status === 'Active' : filter === 'Expired' ? (getDaysLeft(s.validTo) !== null && getDaysLeft(s.validTo) < 0) || s.status === 'Inactive' : true;
    const matchApplicable = !applicableFilter || s.applicableTo === applicableFilter || s.applicableTo === 'All';
    return matchSearch && matchStatus && matchApplicable;
  }), [schemes, search, filter, applicableFilter]);

  const openAdd = () => { setEditingScheme(null); setForm(BLANK_FORM); setIsModalOpen(true); };
  const openEdit = (s) => {
    setEditingScheme(s);
    setForm({
      name: s.name, type: s.type, discountPct: s.discountPct || '',
      freeGoodsQty: s.freeGoodsQty || '', minOrderValue: s.minOrderValue || '',
      applicableTo: s.applicableTo, applicableProducts: s.applicableProducts || [], validFrom: s.validFrom ? s.validFrom.split('T')[0] : '',
      validTo: s.validTo ? s.validTo.split('T')[0] : '',
      description: s.description || '', status: s.status
    });
    setIsModalOpen(true);
  };

  const toggleProductTarget = (name) => {
    setForm(f => ({
      ...f,
      applicableProducts: f.applicableProducts.includes(name)
        ? f.applicableProducts.filter(p => p !== name)
        : [...f.applicableProducts, name]
    }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      discountPct: Number(form.discountPct || 0),
      freeGoodsQty: Number(form.freeGoodsQty || 0),
      minOrderValue: Number(form.minOrderValue || 0),
      validFrom: form.validFrom ? new Date(form.validFrom).toISOString() : null,
      validTo: form.validTo ? new Date(form.validTo).toISOString() : null,
    };
    if (editingScheme) updateScheme(editingScheme.id, payload);
    else addScheme(payload);
    setIsModalOpen(false);
  };

  const toggleStatus = (s) => updateScheme(s.id, { status: s.status === 'Active' ? 'Inactive' : 'Active' });

  const applicableColors = {
    'All': 'bg-blue-500/10 text-blue-300 border-blue-500/20',
    'Distributor': 'bg-purple-500/10 text-purple-300 border-purple-500/20',
    'Dealer': 'bg-amber-500/10 text-amber-300 border-amber-500/20',
    'Retailer': 'bg-emerald-500/10 text-emerald-300 border-emerald-500/20',
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tag size={24} className="text-brand-accent" /> {canManage ? 'Scheme & Incentive Management' : 'Active Schemes'}
          </h1>
          <p className="text-slate-400 text-sm mt-1">{canManage ? 'Create and manage promotional schemes for distributors, dealers, and retailers.' : 'Promotional schemes you currently qualify for.'}</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV(filtered.map(s => ({ ID: s.id, Name: s.name, Type: s.type, Discount: s.discountPct, FreeGoods: s.freeGoodsQty, MinOrder: s.minOrderValue, ApplicableTo: s.applicableTo, ApplicableProducts: Array.isArray(s.applicableProducts) && s.applicableProducts.length > 0 ? s.applicableProducts.join('; ') : 'All Products', ValidFrom: formatDate(s.validFrom), ValidTo: formatDate(s.validTo), Status: s.status })), 'PRISMORA_Schemes')}
            className="glass-panel hover:bg-brand-primary-lighter/80 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5">
            <Download size={16} className="text-brand-accent" /><span className="hidden sm:inline text-sm font-medium">Export</span>
          </button>
          {canManage && (
            <button onClick={openAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Create Scheme
            </button>
          )}
        </div>
      </div>

      {/* KPIs */}
      <div className={`grid gap-4 ${canManage ? 'grid-cols-2 lg:grid-cols-4' : 'grid-cols-3'}`}>
        {[
          { label: 'Total Schemes', value: kpis.total, color: 'text-blue-400' },
          { label: 'Active Now', value: kpis.active, color: 'text-emerald-400' },
          { label: 'Expiring in 7 Days', value: kpis.expiringSoon, color: kpis.expiringSoon > 0 ? 'text-orange-400' : 'text-slate-400' },
          ...(canManage ? [{ label: 'Top Scheme', value: topScheme ? `${topScheme.name} (${topScheme.uses})` : '—', color: 'text-brand-accent', small: true }] : []),
        ].map((k, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</p>
            <p className={`${k.small ? 'text-sm' : 'text-2xl'} font-extrabold mt-1 ${k.color} truncate`} title={k.small ? k.value : undefined}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search schemes..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        <div className="flex gap-2">
          {['Active', 'All', 'Expired'].map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${filter === f ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-white/5 text-slate-400 hover:text-white bg-brand-primary-lighter/40'}`}>{f}</button>
          ))}
        </div>
        <div className="flex gap-2">
          {['', ...APPLICABLE_TO].map(a => (
            <button key={a || 'all-ch'} onClick={() => setApplicableFilter(a)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${applicableFilter === a ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-white/5 text-slate-400 hover:text-white bg-brand-primary-lighter/40'}`}>{a || 'All Channels'}</button>
          ))}
        </div>
      </div>

      {/* Cards Grid */}
      {filtered.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {filtered.map(s => {
            const daysLeft = getDaysLeft(s.validTo);
            const isExpired = daysLeft !== null && daysLeft < 0;
            const isExpiringSoon = daysLeft !== null && daysLeft <= 7 && daysLeft >= 0;
            return (
              <div key={s.id} className={`glass-panel rounded-2xl border p-5 transition-all hover:-translate-y-1 hover:shadow-xl ${s.status === 'Active' && !isExpired ? 'border-white/10 hover:border-brand-accent/30 hover:shadow-brand-accent/5' : 'border-white/5 opacity-60'}`}>
                <div className="flex justify-between items-start mb-3">
                  <div className={`p-2 rounded-xl ${s.status === 'Active' && !isExpired ? 'bg-brand-accent/10 text-brand-accent' : 'bg-slate-500/10 text-slate-400'}`}>
                    {typeIcon(s.type)}
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${applicableColors[s.applicableTo] || applicableColors['All']}`}>{s.applicableTo}</span>
                    {isExpired ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-rose-500/10 text-rose-400 border-rose-500/20">Expired</span>
                    ) : s.status === 'Active' ? (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-emerald-500/10 text-emerald-400 border-emerald-500/20">Active</span>
                    ) : (
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full border bg-slate-500/10 text-slate-400 border-slate-500/20">Inactive</span>
                    )}
                  </div>
                </div>

                <h3 className="font-bold text-white text-base mb-1">{s.name}</h3>
                <p className="text-xs text-slate-400 mb-3">{s.type}</p>

                {/* Value Chips */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {s.discountPct > 0 && (
                    <div className="flex items-center gap-1 bg-brand-accent/10 border border-brand-accent/20 rounded-lg px-2.5 py-1 text-xs font-semibold text-brand-accent">
                      <Percent size={10} />{s.discountPct}% Off
                    </div>
                  )}
                  {s.freeGoodsQty > 0 && (
                    <div className="flex items-center gap-1 bg-purple-500/10 border border-purple-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold text-purple-300">
                      <Gift size={10} />{s.freeGoodsQty} Free Units
                    </div>
                  )}
                  {s.minOrderValue > 0 && (
                    <div className="flex items-center gap-1 bg-blue-500/10 border border-blue-500/20 rounded-lg px-2.5 py-1 text-xs font-semibold text-blue-300">
                      Min: {formatCurrency(s.minOrderValue)}
                    </div>
                  )}
                </div>

                <p className="text-[10px] text-slate-500 mb-3">
                  Applies to: <span className="text-slate-300 font-medium">{Array.isArray(s.applicableProducts) && s.applicableProducts.length > 0 ? s.applicableProducts.join(', ') : 'All Products'}</span>
                </p>

                {s.description && <p className="text-xs text-slate-400 mb-3 leading-relaxed line-clamp-2">{s.description}</p>}

                {canManage && schemeStats[s.id] && (
                  <p className="text-[10px] text-slate-500 mb-3 flex items-center gap-1">
                    <BarChart3 size={11} className="text-brand-accent flex-shrink-0" />
                    {schemeStats[s.id].uses} use{schemeStats[s.id].uses === 1 ? '' : 's'}
                    {schemeStats[s.id].cashValue > 0 && <> · {formatCurrency(schemeStats[s.id].cashValue)} given</>}
                    {schemeStats[s.id].freeUnits > 0 && <> · {schemeStats[s.id].freeUnits} free units</>}
                    {' '}· {schemeStats[s.id].parties.size} part{schemeStats[s.id].parties.size === 1 ? 'y' : 'ies'}
                  </p>
                )}

                <div className="border-t border-white/5 pt-3 mt-auto">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-[10px] text-slate-500">Validity</p>
                      <p className="text-xs font-medium text-slate-300">{formatDate(s.validFrom)} → {formatDate(s.validTo)}</p>
                      {isExpiringSoon && !isExpired && (
                        <p className="text-[10px] text-orange-400 font-bold mt-0.5">⚠ Expires in {daysLeft} days</p>
                      )}
                    </div>
                    {canManage && (
                      <div className="flex gap-1.5">
                        <button onClick={() => toggleStatus(s)} className={`p-1.5 rounded-lg transition-colors ${s.status === 'Active' ? 'text-emerald-400 hover:bg-emerald-400/10' : 'text-slate-500 hover:bg-white/5 hover:text-slate-300'}`} title={s.status === 'Active' ? 'Deactivate' : 'Activate'}>
                          <CheckCircle size={14} />
                        </button>
                        <button onClick={() => openEdit(s)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                        <button onClick={() => { if (confirm('Delete scheme?')) deleteScheme(s.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="glass-panel rounded-2xl border border-white/5 p-16 text-center text-slate-500">
          <Tag size={40} className="mx-auto mb-4 opacity-20" />
          <p>{canManage ? 'No schemes found. Create your first promotional scheme.' : 'No schemes available right now.'}</p>
          {canManage && <button onClick={openAdd} className="mt-4 text-brand-accent hover:underline text-sm">+ Create Scheme</button>}
        </div>
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[4vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Tag className="text-brand-accent" size={20} />{editingScheme ? 'Edit Scheme' : 'Create New Scheme'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Scheme Name *</label><input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Monsoon Mega Sale 2026" className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Scheme Type *</label>
                  <select required value={form.type} onChange={e => setForm(f => ({ ...f, type: e.target.value }))} className={inputCls}>
                    {SCHEME_TYPES.map(t => <option key={t} value={t} className="bg-brand-primary">{t}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Applicable To *</label>
                  <select required value={form.applicableTo} onChange={e => setForm(f => ({ ...f, applicableTo: e.target.value }))} className={inputCls}>
                    {APPLICABLE_TO.map(a => <option key={a} value={a} className="bg-brand-primary">{a}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Discount % (if applicable)</label><input type="number" min="0" max="100" step="0.5" value={form.discountPct} onChange={e => setForm(f => ({ ...f, discountPct: e.target.value }))} placeholder="e.g. 10" className={inputCls} /></div>
                <div><label className={labelCls}>Free Goods Qty (if applicable)</label><input type="number" min="0" value={form.freeGoodsQty} onChange={e => setForm(f => ({ ...f, freeGoodsQty: e.target.value }))} placeholder="e.g. 5 units" className={inputCls} /></div>
                <div><label className={labelCls}>Minimum Order Value (₹)</label><input type="number" min="0" value={form.minOrderValue} onChange={e => setForm(f => ({ ...f, minOrderValue: e.target.value }))} placeholder="e.g. 50000" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Applicable Products <span className="normal-case text-slate-500 font-normal">(leave all unchecked for "All Products")</span></label>
                  <div className="flex flex-wrap gap-2 p-3 glass-input rounded-xl max-h-32 overflow-y-auto custom-scrollbar">
                    {productCatalog.map(p => (
                      <label key={p.id} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer border transition-colors ${form.applicableProducts.includes(p.name) ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400 hover:text-white'}`}>
                        <input type="checkbox" className="hidden" checked={form.applicableProducts.includes(p.name)} onChange={() => toggleProductTarget(p.name)} />
                        {p.name}
                      </label>
                    ))}
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    <option value="Active" className="bg-brand-primary">Active</option>
                    <option value="Inactive" className="bg-brand-primary">Inactive</option>
                  </select>
                </div>
                <div><label className={labelCls}>Valid From</label><input type="date" value={form.validFrom} onChange={e => setForm(f => ({ ...f, validFrom: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Valid To</label><input type="date" value={form.validTo} onChange={e => setForm(f => ({ ...f, validTo: e.target.value }))} className={inputCls} /></div>
                <div className="sm:col-span-2"><label className={labelCls}>Description</label><textarea rows="2" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Brief description of the scheme terms..." className={`${inputCls} resize-none`} /></div>
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingScheme ? 'Save Changes' : 'Create Scheme'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
