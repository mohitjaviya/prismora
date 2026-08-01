import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  Network, Plus, Edit2, Trash2, Search, X, Download,
  Phone, Mail, MapPin,
  CreditCard, IndianRupee, Eye, ShieldCheck, ShieldX, Wallet, ArrowUpCircle, ArrowDownCircle, Truck
} from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { buildLedgerEntries } from '../utils/distributorUtils';

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh', 'Goa', 'Gujarat',
  'Haryana', 'Himachal Pradesh', 'Jharkhand', 'Karnataka', 'Kerala', 'Madhya Pradesh',
  'Maharashtra', 'Manipur', 'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura', 'Uttar Pradesh',
  'Uttarakhand', 'West Bengal', 'Delhi', 'Jammu & Kashmir', 'Ladakh'
];

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

const BLANK_FORM = {
  name: '', gstin: '', parentDistributorId: '', state: '', city: '', territory: '',
  phone: '', email: '', contactPerson: '', creditLimit: 100000, status: 'Active'
};

export default function Dealers() {
  const { dealers, addDealer, updateDealer, deleteDealer, distributors, invoices, distributorPayments, addDealerPayment } = useData();
  const { user, users, updateUser, deleteUser, canAccess } = useAuth();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingDealer, setEditingDealer] = useState(null);
  const [viewingDealer, setViewingDealer] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const canManage = canAccess('dealers', 'full');

  const parentDistributorName = (id) => distributors.find(d => d.id === id)?.name || '—';

  const kpis = useMemo(() => ({
    total: dealers.length,
    active: dealers.filter(d => d.status === 'Active').length,
    totalOutstanding: dealers.reduce((s, d) => s + (d.outstandingAmount || 0), 0),
    overLimit: dealers.filter(d => (d.outstandingAmount || 0) > (d.creditLimit || 100000)).length,
    pending: dealers.filter(d => d.status === 'Pending').length,
  }), [dealers]);

  const filtered = useMemo(() => dealers.filter(d => {
    const matchSearch = !search ||
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      (d.territory || '').toLowerCase().includes(search.toLowerCase()) ||
      (d.contactPerson || '').toLowerCase().includes(search.toLowerCase());
    const matchState = !stateFilter || d.state === stateFilter;
    const matchStatus = statusFilter === 'All' || d.status === statusFilter;
    return matchSearch && matchState && matchStatus;
  }), [dealers, search, stateFilter, statusFilter]);

  const allStates = [...new Set(dealers.map(d => d.state).filter(Boolean))].sort();
  const activeDistributors = distributors.filter(d => d.status === 'Active');

  const openAdd = () => { setEditingDealer(null); setForm(BLANK_FORM); setIsModalOpen(true); };
  const openEdit = (d) => { setEditingDealer(d); setForm({ name: d.name, gstin: d.gstin || '', parentDistributorId: d.parentDistributorId || '', state: d.state || '', city: d.city || '', territory: d.territory || '', phone: d.phone || '', email: d.email || '', contactPerson: d.contactPerson || '', creditLimit: d.creditLimit || 100000, status: d.status || 'Active' }); setIsModalOpen(true); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form, creditLimit: Number(form.creditLimit) };
    if (editingDealer) updateDealer(editingDealer.id, payload);
    else addDealer(payload);
    setIsModalOpen(false);
  };

  const approveDealer = (d) => {
    updateDealer(d.id, { status: 'Active' });
    const linkedUser = users.find(u => u.dealerId === d.id);
    if (linkedUser) updateUser(linkedUser.id, { status: 'Active' });
  };

  const rejectDealer = (d) => {
    if (!confirm(`Reject and remove the registration for "${d.name}"?`)) return;
    const linkedUser = users.find(u => u.dealerId === d.id);
    if (linkedUser) deleteUser(linkedUser.id);
    deleteDealer(d.id);
  };

  const ledgerEntries = useMemo(() => viewingDealer ? buildLedgerEntries(viewingDealer, invoices, distributorPayments) : [], [viewingDealer, invoices, distributorPayments]);

  const handleRecordPayment = (e) => {
    e.preventDefault();
    if (!viewingDealer) return;
    addDealerPayment({
      dealerId: viewingDealer.id,
      amount: Number(paymentForm.amount),
      method: paymentForm.method,
      reference: paymentForm.reference,
      date: paymentForm.date ? new Date(paymentForm.date).toISOString() : new Date().toISOString(),
      notes: paymentForm.notes,
      recordedBy: user?.id
    });
    setIsPaymentModalOpen(false);
    setPaymentForm({ amount: '', method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0], notes: '' });
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Network size={24} className="text-brand-accent" /> Dealer Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Dealers linked to distributors, territory mapping & outstanding ledger.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => downloadCSV(filtered.map(d => ({ Name: d.name, GSTIN: d.gstin, ParentDistributor: parentDistributorName(d.parentDistributorId), State: d.state, City: d.city, Territory: d.territory, Phone: d.phone, Email: d.email, Outstanding: d.outstandingAmount, CreditLimit: d.creditLimit, Status: d.status })), 'PRISMORA_Dealers')}
            className="glass-panel hover:bg-brand-primary-lighter/80 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5">
            <Download size={16} className="text-brand-accent" /><span className="hidden sm:inline text-sm font-medium">Export</span>
          </button>
          {canManage && (
            <button onClick={openAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Add Dealer
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total Dealers', value: kpis.total, color: 'text-blue-400' },
          { label: 'Active', value: kpis.active, color: 'text-emerald-400' },
          { label: 'Pending Approval', value: kpis.pending, color: kpis.pending > 0 ? 'text-amber-400' : 'text-slate-400' },
          { label: 'Total Outstanding', value: formatCurrency(kpis.totalOutstanding), color: 'text-brand-accent' },
          { label: 'Over Credit Limit', value: kpis.overLimit, color: kpis.overLimit > 0 ? 'text-rose-400' : 'text-slate-400' },
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
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search name, territory or contact..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        <select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="glass-input rounded-xl px-4 py-2.5 text-sm text-slate-200 appearance-none">
          <option value="">All States</option>
          {allStates.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
        </select>
        <div className="flex gap-2">
          {['All', 'Pending', 'Active', 'Inactive'].map(s => (
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
                <th className="p-4">Dealer</th>
                <th className="p-4">Parent Distributor</th>
                <th className="p-4">Territory / State</th>
                <th className="p-4">Contact</th>
                <th className="p-4 text-right">Outstanding</th>
                <th className="p-4 text-right">Credit Limit</th>
                <th className="p-4 text-center">Status</th>
                <th className="p-4 text-center">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filtered.length > 0 ? filtered.map(d => {
                const isOverLimit = (d.outstandingAmount || 0) > (d.creditLimit || 100000);
                const utilizationPct = d.creditLimit ? Math.min(100, Math.round(((d.outstandingAmount || 0) / d.creditLimit) * 100)) : 0;
                return (
                  <tr key={d.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">{d.name}</div>
                      <div className="text-xs text-slate-500 font-mono">{d.gstin || '—'}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm flex items-center gap-1.5"><Truck size={12} className="text-brand-accent flex-shrink-0" />{parentDistributorName(d.parentDistributorId)}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{d.territory || '—'}</div>
                      <div className="text-xs text-slate-500">{d.state || '—'}</div>
                    </td>
                    <td className="p-4">
                      <div className="text-sm">{d.contactPerson || '—'}</div>
                      <div className="text-xs text-slate-500">{d.phone || d.email || '—'}</div>
                    </td>
                    <td className="p-4 text-right">
                      <span className={`font-bold ${isOverLimit ? 'text-rose-400' : 'text-white'}`}>{formatCurrency(d.outstandingAmount || 0)}</span>
                      <div className="mt-1 h-1 bg-brand-primary-lighter rounded-full overflow-hidden">
                        <div className={`h-full rounded-full ${utilizationPct > 90 ? 'bg-rose-500' : utilizationPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${utilizationPct}%` }} />
                      </div>
                      <div className="text-[10px] text-slate-500 mt-0.5">{utilizationPct}% utilized</div>
                    </td>
                    <td className="p-4 text-right text-slate-400">{formatCurrency(d.creditLimit)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${d.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : d.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                        {d.status}
                      </span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        {d.status === 'Pending' && canManage ? (
                          <>
                            <button onClick={() => approveDealer(d)} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Approve"><ShieldCheck size={14} /></button>
                            <button onClick={() => rejectDealer(d)} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Reject"><ShieldX size={14} /></button>
                          </>
                        ) : null}
                        <button onClick={() => setViewingDealer(d)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="View Details"><Eye size={14} /></button>
                        {canManage && <>
                          <button onClick={() => openEdit(d)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => { if (confirm('Delete this dealer?')) deleteDealer(d.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                );
              }) : (
                <tr><td colSpan="8" className="p-12 text-center text-slate-500">
                  <Network size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No dealers found.</p>
                  {canManage && <button onClick={openAdd} className="mt-4 text-brand-accent hover:underline text-sm">+ Add your first dealer</button>}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Detail Modal */}
      {viewingDealer && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingDealer(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-0 flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-white">{viewingDealer.name}</h3>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${viewingDealer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : viewingDealer.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{viewingDealer.status}</span>
              </div>
              <button onClick={() => setViewingDealer(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-4">
              {viewingDealer.status === 'Pending' && canManage && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-300">This registration is awaiting review.</p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { approveDealer(viewingDealer); setViewingDealer(null); }} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg flex items-center gap-1.5"><ShieldCheck size={12} />Approve</button>
                    <button onClick={() => { rejectDealer(viewingDealer); setViewingDealer(null); }} className="px-3 py-1.5 text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg flex items-center gap-1.5"><ShieldX size={12} />Reject</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow icon={<CreditCard size={14} />} label="GSTIN" value={viewingDealer.gstin || 'N/A'} />
                <InfoRow icon={<Truck size={14} />} label="Parent Distributor" value={parentDistributorName(viewingDealer.parentDistributorId)} />
                <InfoRow icon={<MapPin size={14} />} label="Territory" value={viewingDealer.territory || 'N/A'} />
                <InfoRow icon={<MapPin size={14} />} label="City / State" value={`${viewingDealer.city || ''}, ${viewingDealer.state || ''}`.trim() || 'N/A'} />
                <InfoRow icon={<Phone size={14} />} label="Phone" value={viewingDealer.phone || 'N/A'} />
                <InfoRow icon={<Mail size={14} />} label="Email" value={viewingDealer.email || 'N/A'} />
                <InfoRow icon={<Network size={14} />} label="Contact Person" value={viewingDealer.contactPerson || 'N/A'} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400">Outstanding</p>
                  <p className="text-lg font-bold text-rose-400">{formatCurrency(viewingDealer.outstandingAmount || 0)}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400">Credit Limit</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(viewingDealer.creditLimit)}</p>
                </div>
              </div>

              {viewingDealer.status !== 'Pending' && (
                <div className="mt-5 pt-4 border-t border-white/5">
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-sm font-bold text-white flex items-center gap-1.5"><Wallet size={14} className="text-brand-accent" />Outstanding Ledger</h4>
                    {canManage && <button onClick={() => setIsPaymentModalOpen(true)} className="text-xs font-semibold text-brand-accent hover:underline">+ Record Payment</button>}
                  </div>
                  {ledgerEntries.length > 0 ? (
                    <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5">
                      {ledgerEntries.slice().reverse().map(row => (
                        <div key={row.id} className="flex items-center justify-between text-xs bg-brand-primary-lighter/30 rounded-lg px-3 py-2">
                          <div className="flex items-center gap-2">
                            {row.debit > 0 ? <ArrowUpCircle size={13} className="text-rose-400 flex-shrink-0" /> : <ArrowDownCircle size={13} className="text-emerald-400 flex-shrink-0" />}
                            <div>
                              <p className="text-slate-300">{row.description}</p>
                              <p className="text-[10px] text-slate-500">{formatDate(row.date)}</p>
                            </div>
                          </div>
                          <span className={`font-semibold ${row.debit > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                            {row.debit > 0 ? `+${formatCurrency(row.debit)}` : `-${formatCurrency(row.credit)}`}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500 text-center py-4">No ledger activity yet.</p>
                  )}
                </div>
              )}
            </div>
            <div className="flex gap-3 justify-end p-6 pt-4 border-t border-white/5 flex-shrink-0">
              {canManage && viewingDealer.status !== 'Pending' && <button onClick={() => { setViewingDealer(null); openEdit(viewingDealer); }} className="px-4 py-2 text-sm btn-accent rounded-xl flex items-center gap-2"><Edit2 size={14} />Edit</button>}
              <button onClick={() => setViewingDealer(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Close</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && viewingDealer && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><IndianRupee size={18} className="text-brand-accent" />Record Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label className={labelCls}>Amount (₹) *</label>
                <input required type="number" min="1" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Method</label>
                  <select value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                    {['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'].map(m => <option key={m} value={m} className="bg-brand-primary">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Date</label>
                  <input type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} className={inputCls} style={{ colorScheme: 'dark' }} />
                </div>
              </div>
              <div>
                <label className={labelCls}>Reference / UTR</label>
                <input type="text" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows="2" value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setIsPaymentModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Record Payment</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Add / Edit Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[5vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white">{editingDealer ? 'Edit Dealer' : 'Add New Dealer'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label className={labelCls}>Company / Business Name *</label><input required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mohan Dealers" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Parent Distributor *</label>
                  <select required value={form.parentDistributorId} onChange={e => setForm(f => ({ ...f, parentDistributorId: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Distributor --</option>
                    {activeDistributors.map(d => <option key={d.id} value={d.id} className="bg-brand-primary">{d.name} ({d.territory})</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>GSTIN</label><input type="text" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACG..." className={inputCls} /></div>
                <div><label className={labelCls}>Contact Person</label><input type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Phone</label><input type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Email</label><input type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>State *</label>
                  <select required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>City</label><input type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Territory / Zone</label><input type="text" value={form.territory} onChange={e => setForm(f => ({ ...f, territory: e.target.value }))} placeholder="e.g. Gujarat North" className={inputCls} /></div>
                <div><label className={labelCls}>Credit Limit (₹)</label><input type="number" min="0" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    <option value="Active" className="bg-brand-primary">Active</option>
                    <option value="Inactive" className="bg-brand-primary">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingDealer ? 'Save Changes' : 'Add Dealer'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}

function InfoRow({ icon, label, value }) {
  return (
    <div className="flex items-start gap-2">
      <span className="text-brand-accent mt-0.5 flex-shrink-0">{icon}</span>
      <div>
        <p className="text-[10px] text-slate-500 uppercase font-semibold">{label}</p>
        <p className="text-white text-sm font-medium">{value}</p>
      </div>
    </div>
  );
}
