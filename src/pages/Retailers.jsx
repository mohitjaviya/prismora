import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { ShoppingBag, Plus, Edit2, Trash2, X, Download, Phone, Mail, MapPin, CreditCard, IndianRupee, Eye, ShieldCheck, ShieldX, Wallet, ArrowUpCircle, ArrowDownCircle, Network, Store, Clock, AlertTriangle } from 'lucide-react';
import { useConfirm } from '../context/DialogContext';
import { PageHeader, DataTable, Button, IconButton, Badge, StatCard, Card, SearchInput, Select } from '../components/ui';
import PartnerOrderHistory from '../components/PartnerOrderHistory';
import { downloadCSV } from '../utils/exportUtils';
import { buildLedgerEntries } from '../utils/distributorUtils';
import { deleteWarning } from '../utils/partyDependants';
import { territoryFields, territoryName } from '../utils/territory';

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
  name: '', gstin: '', parentDealerId: '', state: '', city: '', territory: '', territoryId: '',
  phone: '', email: '', contactPerson: '', address: '', pincode: '', creditLimit: 50000, status: 'Active'
};

export default function Retailers() {
  const { retailers, addRetailer, updateRetailer, deleteRetailer, dealers, invoices, distributorPayments, addRetailerPayment, orders, territories,
    distributorIncentives, schemeClaims, complaints } = useData();
  const confirm = useConfirm();
  const { user, users, updateUser, deleteUser, canAccess } = useAuth();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingRetailer, setEditingRetailer] = useState(null);
  const [viewingRetailer, setViewingRetailer] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0], notes: '' });

  const canManage = canAccess('retailers', 'full');

  const parentDealerName = (id) => dealers.find(d => d.id === id)?.name || '—';

  const kpis = useMemo(() => ({
    total: retailers.length,
    active: retailers.filter(r => r.status === 'Active').length,
    totalOutstanding: retailers.reduce((s, r) => s + (r.outstandingAmount || 0), 0),
    overLimit: retailers.filter(r => (r.outstandingAmount || 0) > (r.creditLimit || 50000)).length,
    pending: retailers.filter(r => r.status === 'Pending').length,
  }), [retailers]);

  const filtered = useMemo(() => retailers.filter(r => {
    const matchSearch = !search ||
      r.name.toLowerCase().includes(search.toLowerCase()) ||
      territoryName(territories, r).toLowerCase().includes(search.toLowerCase()) ||
      (r.contactPerson || '').toLowerCase().includes(search.toLowerCase());
    const matchState = !stateFilter || r.state === stateFilter;
    const matchStatus = statusFilter === 'All' || r.status === statusFilter;
    return matchSearch && matchState && matchStatus;
  }), [retailers, territories, search, stateFilter, statusFilter]);

  const allStates = [...new Set(retailers.map(r => r.state).filter(Boolean))].sort();
  const activeDealers = dealers.filter(d => d.status === 'Active');

  const openAdd = () => { setEditingRetailer(null); setForm(BLANK_FORM); setIsModalOpen(true); };
  const openEdit = (r) => { setEditingRetailer(r); setForm({ name: r.name, gstin: r.gstin || '', parentDealerId: r.parentDealerId || '', state: r.state || '', city: r.city || '', territory: r.territory || '', territoryId: r.territoryId || '', phone: r.phone || '', email: r.email || '', contactPerson: r.contactPerson || '', address: r.address || '', pincode: r.pincode || '', creditLimit: r.creditLimit || 50000, status: r.status || 'Active' }); setIsModalOpen(true); };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = { ...form, creditLimit: Number(form.creditLimit) };
    if (editingRetailer) updateRetailer(editingRetailer.id, payload);
    else addRetailer(payload);
    setIsModalOpen(false);
  };

  const approveRetailer = (r) => {
    updateRetailer(r.id, { status: 'Active' });
    const linkedUser = users.find(u => u.retailerId === r.id);
    if (linkedUser) updateUser(linkedUser.id, { status: 'Active' });
  };

  const rejectRetailer = async (r) => {
    if (!await confirm({ title: `Reject and remove the registration for "${r.name}"?`, danger: true, confirmLabel: 'Remove' })) return;
    const linkedUser = users.find(u => u.retailerId === r.id);
    if (linkedUser) deleteUser(linkedUser.id);
    deleteRetailer(r.id);
  };

  /**
   * Deleting a partner, with what is attached said first.
   *
   * Foreign keys refuse to remove a party that orders or money point at, and
   * deleteRetailer does not inspect the error -- so the screen used to ask a
   * plain question, accept the answer, and then fail with nothing to explain
   * it. Now it counts what is in the way and either says so or says what will
   * be unlinked.
   */
  const handleDelete = async (r) => {
    const warning = deleteWarning(r, {
      orders, invoices, distributorPayments, distributorIncentives, schemeClaims,
      complaints,
    });

    if (warning && !warning.canDelete) {
      await confirm({ title: warning.title, body: warning.body, confirmLabel: 'Close', danger: true });
      return;
    }

    const ok = await confirm({
      title: warning?.title || `Delete ${r.name}?`,
      body: warning?.body || 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteRetailer(r.id);
  };

  const ledgerEntries = useMemo(() => viewingRetailer ? buildLedgerEntries(viewingRetailer, invoices, distributorPayments, orders) : [], [viewingRetailer, invoices, distributorPayments, orders]);

  const handleRecordPayment = (e) => {
    e.preventDefault();
    if (!viewingRetailer) return;
    addRetailerPayment({
      retailerId: viewingRetailer.id,
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

  const rowColumns = [
    {
      key: 'name', header: 'Retailer', sort: r => r.name || '',
      render: r => (
        <>
          <div className="font-semibold text-white">{r.name}</div>
          <div className="text-[11px] text-slate-500 font-mono">{r.gstin || '—'}</div>
        </>
      ),
    },
    {
      key: 'parent', header: 'Parent Dealer', hideBelow: 'lg',
      sort: r => parentDealerName(r.parentDealerId) || '',
      render: r => (
        <span className="inline-flex items-center gap-1.5">
          <Network size={12} className="text-brand-accent flex-shrink-0" />
          {parentDealerName(r.parentDealerId)}
        </span>
      ),
    },
    {
      key: 'territory', header: 'Territory / State', hideBelow: 'md', sort: r => territoryName(territories, r),
      render: r => (
        <>
          <div>{territoryName(territories, r)}</div>
          <div className="text-[11px] text-slate-500">{r.state || '—'}</div>
        </>
      ),
    },
    {
      key: 'contact', header: 'Contact', hideBelow: 'lg', sort: r => r.contactPerson || '',
      render: r => (
        <>
          <div>{r.contactPerson || '—'}</div>
          <div className="text-[11px] text-slate-500">{r.phone || r.email || '—'}</div>
        </>
      ),
    },
    {
      key: 'outstanding', header: 'Outstanding', align: 'right',
      sort: r => Number(r.outstandingAmount) || 0,
      render: r => {
        const over = (r.outstandingAmount || 0) > (r.creditLimit || 100000);
        const pct = r.creditLimit ? Math.min(100, Math.round(((r.outstandingAmount || 0) / r.creditLimit) * 100)) : 0;
        return (
          <>
            <span className={`font-bold ${over ? 'text-rose-400' : 'text-white'}`}>{formatCurrency(r.outstandingAmount || 0)}</span>
            <div className="mt-1 h-1 bg-white/10 rounded-full overflow-hidden ml-auto w-24">
              <div className={`h-full rounded-full ${pct > 90 ? 'bg-rose-500' : pct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`} style={{ width: `${pct}%` }} />
            </div>
            <div className="text-[10px] text-slate-500 mt-0.5">{pct}% of limit</div>
          </>
        );
      },
    },
    {
      key: 'limit', header: 'Credit Limit', align: 'right', hideBelow: 'lg',
      sort: r => Number(r.creditLimit) || 0,
      render: r => <span className="text-slate-400">{formatCurrency(r.creditLimit)}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: r => r.status || '',
      render: r => <Badge>{r.status}</Badge>,
    },
    {
      key: 'actions', header: '', align: 'center', width: 'w-32',
      render: r => (
        <div className="flex items-center justify-center gap-0.5">
          {r.status === 'Pending' && canManage && (
            <>
              <IconButton icon={ShieldCheck} title="Approve" size="sm" onClick={() => approveRetailer(r)} />
              <IconButton icon={ShieldX} title="Reject" size="sm" tone="danger" onClick={() => rejectRetailer(r)} />
            </>
          )}
          <IconButton icon={Eye} title="View details" size="sm" onClick={() => setViewingRetailer(r)} />
          {canManage && (
            <>
              <IconButton icon={Edit2} title="Edit retailer" size="sm" tone="accent" onClick={() => openEdit(r)} />
              <IconButton icon={Trash2} title="Delete retailer" size="sm" tone="danger"
                onClick={() => handleDelete(r)} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Store}
        title="Retailer Management"
        subtitle="Retailers linked to dealers, territory mapping and outstanding ledger."
        actions={
          <>
            <Button icon={Download} onClick={() => downloadCSV(filtered.map(r => ({ Name: r.name, GSTIN: r.gstin, ParentDealer: parentDealerName(r.parentDealerId), State: r.state, City: r.city, Territory: territoryName(territories, r), Phone: r.phone, Email: r.email, Outstanding: r.outstandingAmount, CreditLimit: r.creditLimit, Status: r.status })), 'PRISMORA_Retailers')}>Export</Button>
            {canManage && <Button variant="primary" icon={Plus} onClick={openAdd}>Add Retailer</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard label="Total Retailers" value={kpis.total} icon={Store} tone="info" />
        <StatCard label="Active" value={kpis.active} icon={ShieldCheck} tone="success" />
        <StatCard label="Pending Approval" value={kpis.pending} icon={Clock} tone={kpis.pending > 0 ? 'warning' : 'accent'} />
        <StatCard label="Total Outstanding" value={formatCurrency(kpis.totalOutstanding)} icon={Wallet} tone="accent" />
        <StatCard label="Over Credit Limit" value={kpis.overLimit} icon={AlertTriangle} tone={kpis.overLimit > 0 ? 'danger' : 'accent'} />
      </div>

      <Card padding="p-4" className="flex flex-col md:flex-row gap-3 md:items-center">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search name, territory or contact"
        />
        <Select value={stateFilter} onChange={e => setStateFilter(e.target.value)} className="md:w-48">
          <option value="">All States</option>
          {allStates.map(st => <option key={st} value={st}>{st}</option>)}
        </Select>
        <div className="flex gap-1.5 flex-wrap">
          {['All', 'Pending', 'Active', 'Inactive'].map(st => (
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
        title="Retailers"
        columns={rowColumns}
        rows={filtered}
        rowKey={r => r.id}
        empty={{
          icon: Store,
          title: 'No retailers found',
          hint: canManage ? 'A retailer buys from a dealer and is the last step before the shelf. Add one and its territory and outstanding balance appear here.' : 'Nothing matches the filters above.',
          action: canManage ? <Button variant="primary" icon={Plus} onClick={openAdd}>Add Retailer</Button> : undefined,
        }}
      />


      {/* Detail Modal */}
      {viewingRetailer && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingRetailer(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-0 flex-shrink-0">
              <div>
                <h3 className="text-xl font-bold text-white">{viewingRetailer.name}</h3>
                <span className={`mt-1 inline-block px-2 py-0.5 rounded-full text-[10px] font-bold border ${viewingRetailer.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : viewingRetailer.status === 'Pending' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{viewingRetailer.status}</span>
              </div>
              <button onClick={() => setViewingRetailer(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 pt-4">
              {viewingRetailer.status === 'Pending' && canManage && (
                <div className="mb-4 p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-between gap-3">
                  <p className="text-xs text-amber-300">This registration is awaiting review.</p>
                  <div className="flex gap-2 flex-shrink-0">
                    <button onClick={() => { approveRetailer(viewingRetailer); setViewingRetailer(null); }} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg flex items-center gap-1.5"><ShieldCheck size={12} />Approve</button>
                    <button onClick={() => { rejectRetailer(viewingRetailer); setViewingRetailer(null); }} className="px-3 py-1.5 text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg flex items-center gap-1.5"><ShieldX size={12} />Reject</button>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-2 gap-4 text-sm">
                <InfoRow icon={<CreditCard size={14} />} label="GSTIN" value={viewingRetailer.gstin || 'N/A'} />
                <InfoRow icon={<Network size={14} />} label="Parent Dealer" value={parentDealerName(viewingRetailer.parentDealerId)} />
                <InfoRow icon={<MapPin size={14} />} label="Territory" value={territoryName(territories, viewingRetailer)} />
                <InfoRow icon={<MapPin size={14} />} label="City / State" value={`${viewingRetailer.city || ''}, ${viewingRetailer.state || ''}`.trim() || 'N/A'} />
                <InfoRow icon={<Phone size={14} />} label="Phone" value={viewingRetailer.phone || 'N/A'} />
                <InfoRow icon={<Mail size={14} />} label="Email" value={viewingRetailer.email || 'N/A'} />
                <InfoRow icon={<ShoppingBag size={14} />} label="Contact Person" value={viewingRetailer.contactPerson || 'N/A'} />
              </div>
              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400">Outstanding</p>
                  <p className="text-lg font-bold text-rose-400">{formatCurrency(viewingRetailer.outstandingAmount || 0)}</p>
                </div>
                <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-400">Credit Limit</p>
                  <p className="text-lg font-bold text-emerald-400">{formatCurrency(viewingRetailer.creditLimit)}</p>
                </div>
              </div>

              <div className="mt-5 pt-4 border-t border-white/5">
                <PartnerOrderHistory party={viewingRetailer} kind="retailer" />
              </div>

              {viewingRetailer.status !== 'Pending' && (
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
              {canManage && viewingRetailer.status !== 'Pending' && <button onClick={() => { setViewingRetailer(null); openEdit(viewingRetailer); }} className="px-4 py-2 text-sm btn-accent rounded-xl flex items-center gap-2"><Edit2 size={14} />Edit</button>}
              <button onClick={() => setViewingRetailer(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Close</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Record Payment Modal */}
      {isPaymentModalOpen && viewingRetailer && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><IndianRupee size={18} className="text-brand-accent" />Record Payment</h3>
              <button onClick={() => setIsPaymentModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleRecordPayment} className="space-y-4">
              <div>
                <label htmlFor="retailers-amount" className={labelCls}>Amount (₹) *</label>
                <input id="retailers-amount" required type="number" min="1" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="retailers-method" className={labelCls}>Method</label>
                  <select id="retailers-method" value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                    {['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'].map(m => <option key={m} value={m} className="bg-brand-primary">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="retailers-date" className={labelCls}>Date</label>
                  <input id="retailers-date" type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} className={inputCls} style={{ colorScheme: 'dark' }} />
                </div>
              </div>
              <div>
                <label htmlFor="retailers-reference-utr" className={labelCls}>Reference / UTR</label>
                <input id="retailers-reference-utr" type="text" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label htmlFor="retailers-notes" className={labelCls}>Notes</label>
                <textarea id="retailers-notes" rows="2" value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
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
              <h3 className="text-lg font-bold text-white">{editingRetailer ? 'Edit Retailer' : 'Add New Retailer'}</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2"><label htmlFor="retailers-company-business-name" className={labelCls}>Company / Business Name *</label><input id="retailers-company-business-name" required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Geeta Retailers" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label htmlFor="retailers-parent-dealer" className={labelCls}>Parent Dealer *</label>
                  <select id="retailers-parent-dealer" required value={form.parentDealerId} onChange={e => setForm(f => ({ ...f, parentDealerId: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Dealer --</option>
                    {activeDealers.map(d => <option key={d.id} value={d.id} className="bg-brand-primary">{d.name} ({territoryName(territories, d)})</option>)}
                  </select>
                </div>
                <div><label htmlFor="retailers-gstin" className={labelCls}>GSTIN</label><input id="retailers-gstin" type="text" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACG..." className={inputCls} /></div>
                <div><label htmlFor="retailers-contact-person" className={labelCls}>Contact Person</label><input id="retailers-contact-person" type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="retailers-phone" className={labelCls}>Phone</label><input id="retailers-phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="retailers-email" className={labelCls}>Email</label><input id="retailers-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label htmlFor="retailers-state" className={labelCls}>State *</label>
                  <select id="retailers-state" required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
                <div><label htmlFor="retailers-city" className={labelCls}>City</label><input id="retailers-city" type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="retailers-pincode" className={labelCls}>Pincode *</label><input id="retailers-pincode" required type="text" inputMode="numeric" maxLength={6} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }))} placeholder="e.g. 388001" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label htmlFor="retailers-delivery-address" className={labelCls}>Delivery Address *</label>
                  <textarea id="retailers-delivery-address" required rows="2" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Building, street, area — where consignments should be delivered" className={inputCls + ' resize-none'} />
                  <p className="text-[10px] text-slate-500 mt-1">Used as the default delivery address on their orders. Dispatch cannot send goods to a city alone.</p>
                </div>
                <div>
                  <label htmlFor="retailers-territory-zone" className={labelCls}>Territory / Zone</label>
                  {/* Chosen, not typed. Free text produced four spellings of the
                      same area across beats, partners and orders, none of which
                      matched a territory record — so a partner order could not be
                      routed to the rep who owns that area. */}
                  <select id="retailers-territory-zone" value={form.territoryId || ''} onChange={e => setForm(f => ({ ...f, ...territoryFields(territories, e.target.value) }))} className={inputCls} style={{ colorScheme: 'dark' }}>
                    <option value="" className="bg-brand-primary">{territories.length === 0 ? 'No territories set up yet' : 'Select a territory…'}</option>
                    {territories.map(t => (
                      <option key={t.id} value={t.id} className="bg-brand-primary">{t.name} ({t.state})</option>
                    ))}
                  </select>
                  {territories.length === 0 ? (
                    <p className="text-[10px] text-amber-400 mt-1">Create territories under Geography → Territories first — orders from this partner cannot be routed to a rep without one.</p>
                  ) : form.territory && !territories.some(t => t.name === form.territory) ? (
                    <p className="text-[10px] text-amber-400 mt-1">
                      "{form.territory}" is not one of your territories, so it matches nothing. Pick one from the list.
                    </p>
                  ) : null}
                </div>
                <div><label htmlFor="retailers-credit-limit" className={labelCls}>Credit Limit (₹)</label><input id="retailers-credit-limit" type="number" min="0" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label htmlFor="retailers-status" className={labelCls}>Status</label>
                  <select id="retailers-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
                    <option value="Active" className="bg-brand-primary">Active</option>
                    <option value="Inactive" className="bg-brand-primary">Inactive</option>
                  </select>
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingRetailer ? 'Save Changes' : 'Add Retailer'}</button>
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
