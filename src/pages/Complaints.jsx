import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isAdminRole } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { MessageSquareWarning, Plus, Trash2, X, Download, CheckCircle, Clock, AlertTriangle, Eye, RotateCcw } from 'lucide-react';
import { PageHeader, DataTable, Button, IconButton, Badge, StatCard, Card, SearchInput, Select } from '../components/ui';
import { downloadCSV } from '../utils/exportUtils';
import { optionsFor, badgeStyle } from '../utils/masterLists';


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
  const { complaints, products, addComplaint, updateComplaintStatus, deleteComplaint, distributors, dealers, retailers, masters } = useData();
  // From Master Lists. Statuses keep their stored key while the label is what
  // people read — statusConfig below is still keyed on the stored value.
  const complaintTypes = optionsFor(masters, 'complaint_type').map(o => o.key);
  const statusOptions = optionsFor(masters, 'complaint_status');
  // statusConfig below only knows the statuses that existed when it was
  // written, so one added through Master Lists came out unstyled. Its own
  // colour wins where it has one.
  const statusStyle = (k) => {
    const o = statusOptions.find(x => x.key === k);
    return o?.color ? badgeStyle(o.color) : null;
  };
  const statuses = statusOptions.map(o => o.key);
  const { user, getAssignableUsers, canAccess } = useAuth();

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

  const complaintColumns = [
    {
      key: 'id', header: 'ID', sort: c => c.id || '',
      render: c => <span className="font-mono text-[11px] font-bold text-brand-accent">{c.id}</span>,
    },
    {
      key: 'customer', header: 'Customer', sort: c => c.customerName || '',
      render: c => (
        <>
          <div className="font-semibold text-white">{c.customerName}</div>
          <div className="text-[11px] text-slate-500">{c.customerPhone || '—'}</div>
        </>
      ),
    },
    {
      key: 'product', header: 'Product / Batch', hideBelow: 'md', sort: c => c.product || '',
      render: c => (
        <>
          <div>{c.product || '—'}</div>
          <div className="text-[11px] text-slate-500 font-mono">{c.batchNumber || '—'}</div>
        </>
      ),
    },
    {
      key: 'type', header: 'Type', hideBelow: 'lg', sort: c => c.complaintType || '',
      render: c => <Badge tone="purple">{c.complaintType}</Badge>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: c => c.status || '',
      render: c => {
        const st = statusConfig[c.status] || statusConfig['Registered'];
        const styled = statusStyle(c.status);
        return (
          <Badge color={styled ? styled.color : undefined}>
            {st.icon}{c.status}
          </Badge>
        );
      },
    },
    {
      key: 'date', header: 'Date', hideBelow: 'sm',
      sort: c => (c.createdAt ? new Date(c.createdAt).getTime() : null),
      render: c => <span className="text-slate-400">{formatDate(c.createdAt)}</span>,
    },
    {
      key: 'actions', header: '', align: 'center', width: 'w-28',
      render: c => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton icon={Eye} title="View complaint" size="sm"
            onClick={e => { e.stopPropagation(); setViewingComplaint(c); }} />
          {canManage && c.status !== 'Closed' && (
            <IconButton icon={RotateCcw} title="Update status" size="sm"
              onClick={e => { e.stopPropagation(); openResolve(c); }} />
          )}
          {isAdminRole(user?.role) && (
            <IconButton icon={Trash2} title="Delete complaint" size="sm" tone="danger"
              onClick={e => { e.stopPropagation(); if (confirm('Delete complaint?')) deleteComplaint(c.id); }} />
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={MessageSquareWarning}
        title="Complaint Management"
        subtitle="Register, track and resolve customer complaints with batch-level root cause."
        actions={
          <>
            <Button icon={Download} onClick={() => downloadCSV(filtered.map(c => ({ ID: c.id, Customer: c.customerName, Phone: c.customerPhone, Product: c.product, Batch: c.batchNumber, Type: c.complaintType, Status: c.status, Resolution: c.resolution, Date: formatDate(c.createdAt) })), 'PRISMORA_Complaints')}>
              Export
            </Button>
            <Button variant="primary" icon={Plus} onClick={openAdd}>Register Complaint</Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <StatCard label="Total Complaints" value={kpis.total} icon={MessageSquareWarning} tone="info" />
        <StatCard label="Open / In Review" value={kpis.open} icon={Clock} tone={kpis.open > 0 ? 'danger' : 'accent'} />
        <StatCard label="Resolved / Closed" value={kpis.resolved} icon={CheckCircle} tone="success" />
        <StatCard label="Resolved Today" value={kpis.resolvedToday} icon={RotateCcw} tone="accent" />
      </div>

      <Card padding="p-4" className="flex flex-col md:flex-row gap-3 md:items-center">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by customer, product or ID"
        />
        <Select value={typeFilter} onChange={e => setTypeFilter(e.target.value)} className="md:w-48">
          <option value="">All Types</option>
          {complaintTypes.map(t => <option key={t} value={t}>{t}</option>)}
        </Select>
        <div className="flex gap-1.5 flex-wrap">
          {['All', ...statuses].map(st => (
            <button key={st} type="button" onClick={() => setStatusFilter(st)}
              className={`h-10 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                statusFilter === st
                  ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                  : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'
              }`}>
              {st}
            </button>
          ))}
        </div>
      </Card>

      <DataTable
        title="Complaints"
        columns={complaintColumns}
        rows={filtered}
        rowKey={c => c.id}
        onRowClick={c => setViewingComplaint(c)}
        empty={{
          icon: CheckCircle,
          title: 'No complaints',
          hint: 'Nothing has been registered against a batch. Complaints raised here carry the batch number, so a recurring fault can be traced back to where it was made.',
          action: <Button variant="primary" icon={Plus} onClick={openAdd}>Register Complaint</Button>,
        }}
      />


      {/* View Detail Modal */}
      {viewingComplaint && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingComplaint(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <div className="flex items-center gap-2 mb-1">
                  <span className="font-mono text-brand-accent font-bold text-sm">{viewingComplaint.id}</span>
                  <span style={statusStyle(viewingComplaint.status) || undefined} className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${statusStyle(viewingComplaint.status) ? "" : (statusConfig[viewingComplaint.status] || statusConfig['Registered']).cls}`}>{viewingComplaint.status}</span>
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
                  {statusOptions.map(o => <option key={o.key} value={o.key} className="bg-brand-primary">{o.label}</option>)}
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
                    {complaintTypes.map(t => <option key={t} value={t} className="bg-brand-primary">{t}</option>)}
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
