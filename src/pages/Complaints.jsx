import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isAdminRole } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  MessageSquareWarning, Plus, Trash2, Search, X, Download,
  CheckCircle, Clock, AlertTriangle, Eye, Edit2, RotateCcw
} from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';

const COMPLAINT_TYPES = ['Quality Issue', 'Wrong Product', 'Damaged Packaging', 'Short Expiry', 'Missing Item', 'Billing Error', 'Delivery Issue', 'Other'];
const STATUSES = ['Registered', 'Under Review', 'Resolved', 'Closed'];

const statusConfig = {
  'Registered':   { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <AlertTriangle size={12} /> },
  'Under Review': { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock size={12} /> },
  'Resolved':     { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  'Closed':       { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: <CheckCircle size={12} /> },
};

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

const BLANK_FORM = { customerName: '', customerPhone: '', product: '', batchNumber: '', complaintType: '', description: '', assignedTo: '' };
const BLANK_RESOLVE = { status: 'Resolved', resolution: '' };

export default function Complaints() {
  const { complaints, products, addComplaint, updateComplaintStatus, deleteComplaint, distributors, dealers, retailers } = useData();
  const { user, users: teamUsers, getAssignableUsers, canAccess } = useAuth();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [typeFilter, setTypeFilter] = useState('');
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isResolveOpen, setIsResolveOpen] = useState(false);
  const [viewingComplaint, setViewingComplaint] = useState(null);
  const [targetComplaint, setTargetComplaint] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [resolveForm, setResolveForm] = useState(BLANK_RESOLVE);

  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;
  const canManage = canAccess('complaints', 'full') && !isParty;

  // KPIs
  const kpis = useMemo(() => {
    const open = complaints.filter(c => c.status === 'Registered' || c.status === 'Under Review');
    const resolvedToday = complaints.filter(c => {
      if (c.status !== 'Resolved' && c.status !== 'Closed') return false;
      const d = new Date(c.createdAt);
      const now = new Date();
      return d.toDateString() === now.toDateString();
    });
    return {
      total: complaints.length,
      open: open.length,
      resolved: complaints.filter(c => c.status === 'Resolved' || c.status === 'Closed').length,
      resolvedToday: resolvedToday.length,
    };
  }, [complaints]);

  const filtered = useMemo(() => complaints.filter(c => {
    const matchOwner = !isParty ||
      c.distributorId === party?.id ||
      c.dealerId === party?.id ||
      c.retailerId === party?.id ||
      c.customerName?.toLowerCase() === party?.name?.toLowerCase();
    const matchSearch = !search ||
      c.customerName.toLowerCase().includes(search.toLowerCase()) ||
      c.id.toLowerCase().includes(search.toLowerCase()) ||
      (c.product || '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || c.status === statusFilter;
    const matchType = !typeFilter || c.complaintType === typeFilter;
    return matchOwner && matchSearch && matchStatus && matchType;
  }), [complaints, isParty, party, search, statusFilter, typeFilter]);

  const openResolve = (c) => { setTargetComplaint(c); setResolveForm({ status: 'Resolved', resolution: c.resolution || '' }); setIsResolveOpen(true); };

  const openAdd = () => {
    setForm(isParty ? { ...BLANK_FORM, customerName: party?.name || '', customerPhone: party?.phone || '' } : BLANK_FORM);
    setIsAddOpen(true);
  };

  const handleSubmitAdd = (e) => {
    e.preventDefault();
    addComplaint({
      ...form,
      assignedTo: form.assignedTo || user.id,
      distributorId: user?.role === 'Distributor' ? party?.id : undefined,
      dealerId: user?.role === 'Dealer' ? party?.id : undefined,
      retailerId: user?.role === 'Retailer' ? party?.id : undefined
    });
    setIsAddOpen(false);
    setForm(BLANK_FORM);
  };

  const handleSubmitResolve = (e) => {
    e.preventDefault();
    updateComplaintStatus(targetComplaint.id, resolveForm.status, resolveForm.resolution);
    setIsResolveOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <MessageSquareWarning size={24} className="text-brand-accent" /> Complaint Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Register, track and resolve customer complaints with batch-level root cause.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV(filtered.map(c => ({ ID: c.id, Customer: c.customerName, Phone: c.customerPhone, Product: c.product, Batch: c.batchNumber, Type: c.complaintType, Status: c.status, Resolution: c.resolution, Date: formatDate(c.createdAt) })), 'PRISMORA_Complaints')}
            className="glass-panel hover:bg-brand-primary-lighter/80 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5">
            <Download size={16} className="text-brand-accent" /><span className="hidden sm:inline text-sm font-medium">Export</span>
          </button>
          <button onClick={openAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
            <Plus size={16} /> Register Complaint
          </button>
        </div>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Total Complaints', value: kpis.total, color: 'text-blue-400' },
          { label: 'Open / In Review', value: kpis.open, color: kpis.open > 0 ? 'text-rose-400' : 'text-slate-400' },
          { label: 'Resolved / Closed', value: kpis.resolved, color: 'text-emerald-400' },
          { label: 'Resolved Today', value: kpis.resolvedToday, color: 'text-brand-accent' },
        ].map((k, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</p>
            <p className={`text-xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row gap-3 items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search by customer, product or ID..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        <select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="glass-input rounded-xl px-4 py-2.5 text-sm text-slate-200 appearance-none">
          <option value="">All Types</option>
          {COMPLAINT_TYPES.map(t => <option key={t} value={t} className="bg-brand-primary">{t}</option>)}
        </select>
        <div className="flex gap-2 flex-wrap">
          {['All', ...STATUSES].map(s => (
            <button key={s} onClick={() => setStatusFilter(s)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-white/5 text-slate-400 hover:text-white bg-brand-primary-lighter/40'}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Table */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">ID</th>
                <th className="p-4">Customer</th>
                <th className="p-4">Product / Batch</th>
                <th className="p-4">Type</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4">Date</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filtered.length > 0 ? filtered.map(c => {
                const st = statusConfig[c.status] || statusConfig['Registered'];
                return (
                  <tr key={c.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4 font-mono text-xs font-bold text-brand-accent">{c.id}</td>
                    <td className="p-4">
                      <div className="font-medium text-white">{c.customerName}</div>
                      <div className="text-xs text-slate-500">{c.customerPhone || '—'}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{c.product || '—'}</div>
                      <div className="text-xs text-slate-500 font-mono">{c.batchNumber || '—'}</div>
                    </td>
                    <td className="p-4">
                      <span className="text-xs bg-purple-500/10 text-purple-300 border border-purple-500/20 px-2 py-0.5 rounded-full">{c.complaintType}</span>
                    </td>
                    <td className="p-4 text-center">
                      <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${st.cls}`}>{st.icon}{c.status}</span>
                    </td>
                    <td className="p-4 text-slate-400 text-xs">{formatDate(c.createdAt)}</td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setViewingComplaint(c)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors"><Eye size={13} /></button>
                        {canManage && c.status !== 'Closed' && (
                          <button onClick={() => openResolve(c)} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Update Status"><RotateCcw size={13} /></button>
                        )}
                        {isAdminRole(user?.role) && (
                          <button onClick={() => { if (confirm('Delete complaint?')) deleteComplaint(c.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="7" className="p-12 text-center text-slate-500">
                  <MessageSquareWarning size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No complaints found. Great job! 🎉</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* View Detail Modal */}
      {viewingComplaint && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingComplaint(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-brand-accent font-bold text-sm">{viewingComplaint.id}</span>
                  <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${(statusConfig[viewingComplaint.status] || statusConfig['Registered']).cls}`}>{viewingComplaint.status}</span>
                </div>
                <h3 className="text-xl font-bold text-white">{viewingComplaint.customerName}</h3>
              </div>
              <button onClick={() => setViewingComplaint(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                  <p className="text-xs text-slate-500">Phone</p>
                  <p className="text-white font-medium">{viewingComplaint.customerPhone || 'N/A'}</p>
                </div>
                <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                  <p className="text-xs text-slate-500">Complaint Type</p>
                  <p className="text-white font-medium">{viewingComplaint.complaintType}</p>
                </div>
                <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                  <p className="text-xs text-slate-500">Product</p>
                  <p className="text-white font-medium">{viewingComplaint.product || 'N/A'}</p>
                </div>
                <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                  <p className="text-xs text-slate-500">Batch #</p>
                  <p className="text-white font-medium font-mono">{viewingComplaint.batchNumber || 'N/A'}</p>
                </div>
              </div>
              {viewingComplaint.description && (
                <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5">
                  <p className="text-xs text-slate-500 mb-1">Description</p>
                  <p className="text-slate-200">{viewingComplaint.description}</p>
                </div>
              )}
              {viewingComplaint.resolution && (
                <div className="bg-emerald-500/10 rounded-xl p-3 border border-emerald-500/20">
                  <p className="text-xs text-emerald-400 mb-1">Resolution</p>
                  <p className="text-slate-200">{viewingComplaint.resolution}</p>
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end mt-5 pt-4 border-t border-white/5">
              {canManage && viewingComplaint.status !== 'Closed' && (
                <button onClick={() => { setViewingComplaint(null); openResolve(viewingComplaint); }} className="px-4 py-2 text-sm btn-accent rounded-xl flex items-center gap-2"><RotateCcw size={14} />Update Status</button>
              )}
              <button onClick={() => setViewingComplaint(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Close</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Resolve / Update Status Modal */}
      {isResolveOpen && targetComplaint && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsResolveOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><RotateCcw className="text-brand-accent" size={18} />Update Complaint</h3>
              <button onClick={() => setIsResolveOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="bg-brand-primary-lighter/20 rounded-xl p-3 border border-white/5 mb-4">
              <p className="text-xs text-slate-500">{targetComplaint.id}</p>
              <p className="text-white font-semibold">{targetComplaint.customerName} — {targetComplaint.complaintType}</p>
            </div>
            <form onSubmit={handleSubmitResolve} className="space-y-4">
              <div>
                <label className={labelCls}>New Status *</label>
                <select required value={resolveForm.status} onChange={e => setResolveForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                  {STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Resolution Notes</label>
                <textarea required rows="3" value={resolveForm.resolution} onChange={e => setResolveForm(f => ({ ...f, resolution: e.target.value }))} placeholder="Describe how the complaint was resolved..." className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsResolveOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Save Update</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Register Complaint Modal */}
      {isAddOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><MessageSquareWarning className="text-brand-accent" size={20} />Register New Complaint</h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitAdd} className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div><label className={labelCls}>Customer Name *</label><input required disabled={isParty} type="text" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} className={`${inputCls} ${isParty ? 'opacity-60 cursor-not-allowed' : ''}`} /></div>
                <div><label className={labelCls}>Customer Phone</label><input type="tel" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Product Involved</label>
                  <select value={form.product} onChange={e => setForm(f => ({ ...f, product: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Product (optional) --</option>
                    {products.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Batch Number</label><input type="text" value={form.batchNumber} onChange={e => setForm(f => ({ ...f, batchNumber: e.target.value }))} placeholder="e.g. RBH-2025-001" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Complaint Type *</label>
                  <select required value={form.complaintType} onChange={e => setForm(f => ({ ...f, complaintType: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Type --</option>
                    {COMPLAINT_TYPES.map(t => <option key={t} value={t} className="bg-brand-primary">{t}</option>)}
                  </select>
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Description</label>
                  <textarea rows="3" value={form.description} onChange={e => setForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the complaint in detail..." className={`${inputCls} resize-none`} />
                </div>
                {canManage && (
                  <div>
                    <label className={labelCls}>Assign To</label>
                    <select value={form.assignedTo} onChange={e => setForm(f => ({ ...f, assignedTo: e.target.value }))} className={inputCls}>
                      <option value="" className="bg-brand-primary">-- Assign to team member --</option>
                      {getAssignableUsers().map(u => <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>)}
                    </select>
                  </div>
                )}
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Register Complaint</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
