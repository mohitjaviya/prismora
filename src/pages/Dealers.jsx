import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { Network, Plus, Edit2, Trash2, X, Download, Phone, Mail, MapPin, CreditCard, IndianRupee, Eye, ShieldCheck, ShieldX, Wallet, ArrowUpCircle, ArrowDownCircle, Truck, Clock, AlertTriangle } from 'lucide-react';
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
  name: '', gstin: '', parentDistributorId: '', state: '', city: '', territory: '', territoryId: '',
  phone: '', email: '', contactPerson: '', address: '', pincode: '', creditLimit: 100000, status: 'Active'
};

export default function Dealers() {
  const { dealers, addDealer, updateDealer, deleteDealer, distributors, invoices, distributorPayments, addDealerPayment, orders, territories,
    distributorIncentives, schemeClaims, complaints, retailers } = useData();
  const confirm = useConfirm();
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
      territoryName(territories, d).toLowerCase().includes(search.toLowerCase()) ||
      (d.contactPerson || '').toLowerCase().includes(search.toLowerCase());
    const matchState = !stateFilter || d.state === stateFilter;
    const matchStatus = statusFilter === 'All' || d.status === statusFilter;
    return matchSearch && matchState && matchStatus;
  }), [dealers, territories, search, stateFilter, statusFilter]);

  const allStates = [...new Set(dealers.map(d => d.state).filter(Boolean))].sort();
  const activeDistributors = distributors.filter(d => d.status === 'Active');

  const openAdd = () => { setEditingDealer(null); setForm(BLANK_FORM); setIsModalOpen(true); };
  const openEdit = (d) => { setEditingDealer(d); setForm({ name: d.name, gstin: d.gstin || '', parentDistributorId: d.parentDistributorId || '', state: d.state || '', city: d.city || '', territory: d.territory || '', territoryId: d.territoryId || '', phone: d.phone || '', email: d.email || '', contactPerson: d.contactPerson || '', address: d.address || '', pincode: d.pincode || '', creditLimit: d.creditLimit || 100000, status: d.status || 'Active' }); setIsModalOpen(true); };

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

  const rejectDealer = async (d) => {
    if (!await confirm({ title: `Reject and remove the registration for "${d.name}"?`, danger: true, confirmLabel: 'Remove' })) return;
    const linkedUser = users.find(u => u.dealerId === d.id);
    if (linkedUser) deleteUser(linkedUser.id);
    deleteDealer(d.id);
  };

  /**
   * Deleting a partner, with what is attached said first.
   *
   * Foreign keys refuse to remove a party that orders or money point at, and
   * deleteDealer does not inspect the error -- so the screen used to ask a
   * plain question, accept the answer, and then fail with nothing to explain
   * it. Now it counts what is in the way and either says so or says what will
   * be unlinked.
   */
  const handleDelete = async (d) => {
    const warning = deleteWarning(d, {
      orders, invoices, distributorPayments, distributorIncentives, schemeClaims,
      complaints, retailers,
    });

    if (warning && !warning.canDelete) {
      await confirm({ title: warning.title, body: warning.body, confirmLabel: 'Close', danger: true });
      return;
    }

    const ok = await confirm({
      title: warning?.title || `Delete ${d.name}?`,
      body: warning?.body || 'This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (ok) deleteDealer(d.id);
  };

  const ledgerEntries = useMemo(() => viewingDealer ? buildLedgerEntries(viewingDealer, invoices, distributorPayments, orders) : [], [viewingDealer, invoices, distributorPayments, orders]);

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

  const dealerColumns = [
    {
      key: 'name', header: 'Dealer', sort: d => d.name || '',
      render: d => (
        <>
          <div className="font-semibold text-white">{d.name}</div>
          <div className="text-[11px] text-slate-500 font-mono">{d.gstin || '—'}</div>
        </>
      ),
    },
    {
      key: 'parent', header: 'Parent Distributor', hideBelow: 'lg',
      sort: d => parentDistributorName(d.parentDistributorId) || '',
      render: d => (
        <span className="inline-flex items-center gap-1.5">
          <Truck size={12} className="text-brand-accent flex-shrink-0" />
          {parentDistributorName(d.parentDistributorId)}
        </span>
      ),
    },
    {
      key: 'territory', header: 'Territory / State', hideBelow: 'md', sort: d => territoryName(territories, d),
      render: d => (
        <>
          <div>{territoryName(territories, d)}</div>
          <div className="text-[11px] text-slate-500">{d.state || '—'}</div>
        </>
      ),
    },
    {
      key: 'contact', header: 'Contact', hideBelow: 'lg', sort: d => d.contactPerson || '',
      render: d => (
        <>
          <div>{d.contactPerson || '—'}</div>
          <div className="text-[11px] text-slate-500">{d.phone || d.email || '—'}</div>
        </>
      ),
    },
    {
      key: 'outstanding', header: 'Outstanding', align: 'right',
      sort: d => Number(d.outstandingAmount) || 0,
      render: d => {
        const over = (d.outstandingAmount || 0) > (d.creditLimit || 100000);
        const pct = d.creditLimit ? Math.min(100, Math.round(((d.outstandingAmount || 0) / d.creditLimit) * 100)) : 0;
        return (
          <>
            <span className={`font-bold ${over ? 'text-rose-400' : 'text-white'}`}>{formatCurrency(d.outstandingAmount || 0)}</span>
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
      sort: d => Number(d.creditLimit) || 0,
      render: d => <span className="text-slate-400">{formatCurrency(d.creditLimit)}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: d => d.status || '',
      render: d => <Badge>{d.status}</Badge>,
    },
    {
      key: 'actions', header: '', align: 'center', width: 'w-32',
      render: d => (
        <div className="flex items-center justify-center gap-0.5">
          {d.status === 'Pending' && canManage && (
            <>
              <IconButton icon={ShieldCheck} title="Approve" size="sm" onClick={() => approveDealer(d)} />
              <IconButton icon={ShieldX} title="Reject" size="sm" tone="danger" onClick={() => rejectDealer(d)} />
            </>
          )}
          <IconButton icon={Eye} title="View details" size="sm" onClick={() => setViewingDealer(d)} />
          {canManage && (
            <>
              <IconButton icon={Edit2} title="Edit dealer" size="sm" tone="accent" onClick={() => openEdit(d)} />
              <IconButton icon={Trash2} title="Delete dealer" size="sm" tone="danger"
                onClick={() => handleDelete(d)} />
            </>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Network}
        title="Dealer Management"
        subtitle="Dealers linked to distributors, territory mapping and outstanding ledger."
        actions={
          <>
            <Button icon={Download} onClick={() => downloadCSV(filtered.map(d => ({ Name: d.name, GSTIN: d.gstin, ParentDistributor: parentDistributorName(d.parentDistributorId), State: d.state, City: d.city, Territory: d.territory, Phone: d.phone, Email: d.email, Outstanding: d.outstandingAmount, CreditLimit: d.creditLimit, Status: d.status })), 'PRISMORA_Dealers')}>
              Export
            </Button>
            {canManage && <Button variant="primary" icon={Plus} onClick={openAdd}>Add Dealer</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4">
        <StatCard label="Total Dealers" value={kpis.total} icon={Network} tone="info" />
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
        title="Dealers"
        columns={dealerColumns}
        rows={filtered}
        rowKey={d => d.id}
        empty={{
          icon: Network,
          title: 'No dealers found',
          hint: canManage
            ? 'Dealers buy from a distributor rather than from you directly. Add one and its territory and outstanding balance appear here.'
            : 'Nothing matches the filters above.',
          action: canManage ? <Button variant="primary" icon={Plus} onClick={openAdd}>Add Dealer</Button> : undefined,
        }}
      />


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
                <InfoRow icon={<MapPin size={14} />} label="Territory" value={territoryName(territories, viewingDealer)} />
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

              <div className="mt-5 pt-4 border-t border-white/5">
                <PartnerOrderHistory party={viewingDealer} kind="dealer" />
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
                <label htmlFor="dealers-amount" className={labelCls}>Amount (₹) *</label>
                <input id="dealers-amount" required type="number" min="1" value={paymentForm.amount} onChange={e => setPaymentForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label htmlFor="dealers-method" className={labelCls}>Method</label>
                  <select id="dealers-method" value={paymentForm.method} onChange={e => setPaymentForm(f => ({ ...f, method: e.target.value }))} className={inputCls}>
                    {['Bank Transfer', 'Cheque', 'UPI', 'Cash', 'Other'].map(m => <option key={m} value={m} className="bg-brand-primary">{m}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="dealers-date" className={labelCls}>Date</label>
                  <input id="dealers-date" type="date" value={paymentForm.date} onChange={e => setPaymentForm(f => ({ ...f, date: e.target.value }))} className={inputCls} style={{ colorScheme: 'dark' }} />
                </div>
              </div>
              <div>
                <label htmlFor="dealers-reference-utr" className={labelCls}>Reference / UTR</label>
                <input id="dealers-reference-utr" type="text" value={paymentForm.reference} onChange={e => setPaymentForm(f => ({ ...f, reference: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label htmlFor="dealers-notes" className={labelCls}>Notes</label>
                <textarea id="dealers-notes" rows="2" value={paymentForm.notes} onChange={e => setPaymentForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
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
                <div className="sm:col-span-2"><label htmlFor="dealers-company-business-name" className={labelCls}>Company / Business Name *</label><input id="dealers-company-business-name" required type="text" value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Mohan Dealers" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label htmlFor="dealers-parent-distributor" className={labelCls}>Parent Distributor *</label>
                  <select id="dealers-parent-distributor" required value={form.parentDistributorId} onChange={e => setForm(f => ({ ...f, parentDistributorId: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Distributor --</option>
                    {activeDistributors.map(d => <option key={d.id} value={d.id} className="bg-brand-primary">{d.name} ({d.territory})</option>)}
                  </select>
                </div>
                <div><label htmlFor="dealers-gstin" className={labelCls}>GSTIN</label><input id="dealers-gstin" type="text" value={form.gstin} onChange={e => setForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACG..." className={inputCls} /></div>
                <div><label htmlFor="dealers-contact-person" className={labelCls}>Contact Person</label><input id="dealers-contact-person" type="text" value={form.contactPerson} onChange={e => setForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="dealers-phone" className={labelCls}>Phone</label><input id="dealers-phone" type="tel" value={form.phone} onChange={e => setForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="dealers-email" className={labelCls}>Email</label><input id="dealers-email" type="email" value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label htmlFor="dealers-state" className={labelCls}>State *</label>
                  <select id="dealers-state" required value={form.state} onChange={e => setForm(f => ({ ...f, state: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
                <div><label htmlFor="dealers-city" className={labelCls}>City</label><input id="dealers-city" type="text" value={form.city} onChange={e => setForm(f => ({ ...f, city: e.target.value }))} className={inputCls} /></div>
                <div><label htmlFor="dealers-pincode" className={labelCls}>Pincode *</label><input id="dealers-pincode" required type="text" inputMode="numeric" maxLength={6} value={form.pincode} onChange={e => setForm(f => ({ ...f, pincode: e.target.value.replace(/\D/g, '') }))} placeholder="e.g. 388001" className={inputCls} /></div>
                <div className="sm:col-span-2">
                  <label htmlFor="dealers-delivery-address" className={labelCls}>Delivery Address *</label>
                  <textarea id="dealers-delivery-address" required rows="2" value={form.address} onChange={e => setForm(f => ({ ...f, address: e.target.value }))} placeholder="Building, street, area — where consignments should be delivered" className={inputCls + ' resize-none'} />
                  <p className="text-[10px] text-slate-500 mt-1">Used as the default delivery address on their orders. Dispatch cannot send goods to a city alone.</p>
                </div>
                <div>
                  <label htmlFor="dealers-territory-zone" className={labelCls}>Territory / Zone</label>
                  {/* Chosen, not typed. Free text produced four spellings of the
                      same area across beats, partners and orders, none of which
                      matched a territory record — so a partner order could not be
                      routed to the rep who owns that area. */}
                  <select id="dealers-territory-zone" value={form.territoryId || ''} onChange={e => setForm(f => ({ ...f, ...territoryFields(territories, e.target.value) }))} className={inputCls} style={{ colorScheme: 'dark' }}>
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
                <div><label htmlFor="dealers-credit-limit" className={labelCls}>Credit Limit (₹)</label><input id="dealers-credit-limit" type="number" min="0" value={form.creditLimit} onChange={e => setForm(f => ({ ...f, creditLimit: e.target.value }))} className={inputCls} /></div>
                <div>
                  <label htmlFor="dealers-status" className={labelCls}>Status</label>
                  <select id="dealers-status" value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value }))} className={inputCls}>
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
