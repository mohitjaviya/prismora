import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  ShoppingBag, Plus, Trash2, Search, X, Download,
  CheckCircle, Clock, Truck, FileText, User, Edit2,
  ChevronRight, Package2, AlertCircle, Eye, Wallet, IndianRupee, ArrowUpCircle, ArrowDownCircle
} from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { buildVendorLedger } from '../utils/distributorUtils';

const PO_STATUSES = ['Draft', 'Confirmed', 'GRN Done', 'Closed', 'Cancelled'];

const statusConfig = {
  'Draft':      { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: <FileText size={12} /> },
  'Confirmed':  { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20',    icon: <CheckCircle size={12} /> },
  'GRN Done':   { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <Truck size={12} /> },
  'Closed':     { cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: <CheckCircle size={12} /> },
  'Cancelled':  { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20',    icon: <AlertCircle size={12} /> },
};

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";
const BLANK_LINE = { product: '', quantity: '', unitCost: '', batchNumber: '', expiryDate: '' };

export default function Purchases() {
  const { purchaseOrders, vendors, grn, products, inventory, vendorPayments, purchaseReturns,
    addPurchaseOrder, updatePurchaseOrderStatus, deletePurchaseOrder,
    addVendor, updateVendor, deleteVendor, addGRN, adjustStock, addVendorPayment, addPurchaseReturn } = useData();
  const { user, canAccess } = useAuth();

  const [activeTab, setActiveTab] = useState('orders');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isPOModalOpen, setIsPOModalOpen] = useState(false);
  const [isGRNModalOpen, setIsGRNModalOpen] = useState(false);
  const [isVendorModalOpen, setIsVendorModalOpen] = useState(false);
  const [editingVendor, setEditingVendor] = useState(null);
  const [viewingVendor, setViewingVendor] = useState(null);
  const [isPaymentModalOpen, setIsPaymentModalOpen] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Bank Transfer', reference: '', date: new Date().toISOString().split('T')[0], notes: '' });
  const [grnTargetPO, setGrnTargetPO] = useState(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [returnForm, setReturnForm] = useState({ vendorId: '', reason: 'Damaged goods', product: '', quantity: '', unitCost: '', notes: '' });

  const [poForm, setPOForm] = useState({ vendorId: '', vendorName: '', expectedDate: '', notes: '', items: [{ ...BLANK_LINE }] });
  const [grnForm, setGRNForm] = useState({ receivedDate: new Date().toISOString().split('T')[0], notes: '', items: [] });
  const [vendorForm, setVendorForm] = useState({ name: '', gstin: '', phone: '', email: '', address: '', contactPerson: '', status: 'Active' });

  const canManage = canAccess('purchases', 'full');

  // KPIs
  const kpis = useMemo(() => ({
    total: purchaseOrders.length,
    pending: purchaseOrders.filter(p => p.status === 'Confirmed').length,
    // Only committed spend counts — a Draft was never sent to the vendor and a
    // Cancelled PO represents no obligation, so including either overstates spend.
    thisMonth: purchaseOrders.filter(p => {
      if (p.status === 'Draft' || p.status === 'Cancelled') return false;
      const d = new Date(p.createdAt); const now = new Date();
      return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
    }).reduce((s, p) => s + (p.total || 0), 0),
    vendors: vendors.length,
    payables: vendors.reduce((s, v) => s + (v.outstandingAmount || 0), 0),
  }), [purchaseOrders, vendors]);

  const ledgerEntries = useMemo(() => viewingVendor ? buildVendorLedger(viewingVendor, grn, vendorPayments, purchaseReturns) : [], [viewingVendor, grn, vendorPayments, purchaseReturns]);

  const handleSubmitReturn = (e) => {
    e.preventDefault();
    const vendor = vendors.find(v => v.id === returnForm.vendorId);
    addPurchaseReturn({
      vendorId: returnForm.vendorId,
      vendorName: vendor?.name || '',
      reason: returnForm.reason,
      items: [{ product: returnForm.product, quantity: Number(returnForm.quantity), unitCost: Number(returnForm.unitCost) }],
      notes: returnForm.notes,
      date: new Date().toISOString(),
      recordedBy: user?.id
    });
    setReturnForm({ vendorId: '', reason: 'Damaged goods', product: '', quantity: '', unitCost: '', notes: '' });
    setIsReturnModalOpen(false);
  };

  const handleRecordPayment = (e) => {
    e.preventDefault();
    if (!viewingVendor) return;
    addVendorPayment({
      vendorId: viewingVendor.id,
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

  const filteredOrders = useMemo(() => purchaseOrders.filter(po => {
    const matchSearch = !search || po.vendorName?.toLowerCase().includes(search.toLowerCase()) || po.id.toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'All' || po.status === statusFilter;
    return matchSearch && matchStatus;
  }), [purchaseOrders, search, statusFilter]);

  const filteredVendors = useMemo(() => vendors.filter(v =>
    !search || v.name.toLowerCase().includes(search.toLowerCase())
  ), [vendors, search]);

  const addLineItem = () => setPOForm(f => ({ ...f, items: [...f.items, { ...BLANK_LINE }] }));
  const removeLineItem = (idx) => setPOForm(f => ({ ...f, items: f.items.filter((_, i) => i !== idx) }));
  const updateLineItem = (idx, key, val) => setPOForm(f => ({ ...f, items: f.items.map((item, i) => i === idx ? { ...item, [key]: val } : item) }));
  const poTotal = poForm.items.reduce((s, i) => s + (Number(i.quantity) * Number(i.unitCost) || 0), 0);

  const handleSubmitPO = (e) => {
    e.preventDefault();
    const vendor = vendors.find(v => v.id === poForm.vendorId);
    addPurchaseOrder({
      vendorId: poForm.vendorId,
      vendorName: vendor?.name || poForm.vendorName,
      items: poForm.items.map(i => ({ ...i, quantity: Number(i.quantity), unitCost: Number(i.unitCost) })),
      total: poTotal,
      expectedDate: poForm.expectedDate ? new Date(poForm.expectedDate).toISOString() : null,
      notes: poForm.notes,
      assignedTo: user.id
    });
    setPOForm({ vendorId: '', vendorName: '', expectedDate: '', notes: '', items: [{ ...BLANK_LINE }] });
    setIsPOModalOpen(false);
  };

  const openGRN = (po) => {
    setGrnTargetPO(po);
    setGRNForm({
      receivedDate: new Date().toISOString().split('T')[0],
      notes: '',
      items: (po.items || []).map(i => ({ ...i, receivedQty: i.quantity }))
    });
    setIsGRNModalOpen(true);
  };

  const handleSubmitGRN = (e) => {
    e.preventDefault();
    addGRN({
      poId: grnTargetPO?.id || null,
      vendorName: grnTargetPO?.vendorName || '',
      items: grnForm.items.map(i => ({ ...i, quantity: Number(i.receivedQty) })),
      receivedDate: new Date(grnForm.receivedDate).toISOString(),
      notes: grnForm.notes,
      receivedBy: user.id
    });

    // ── Auto-update Inventory stock for each received item ─────────────────
    grnForm.items.forEach(item => {
      const receivedQty = Number(item.receivedQty);
      if (!receivedQty || receivedQty <= 0) return;
      // Match inventory item by product name (case-insensitive)
      const invItem = inventory.find(inv =>
        inv.product?.toLowerCase() === item.product?.toLowerCase()
      );
      if (invItem) {
        adjustStock(invItem.id, receivedQty, `GRN received from ${grnTargetPO?.vendorName || 'vendor'}`);
      }
    });

    setIsGRNModalOpen(false);
  };

  const openAddVendor = () => { setEditingVendor(null); setVendorForm({ name: '', gstin: '', phone: '', email: '', address: '', contactPerson: '', status: 'Active' }); setIsVendorModalOpen(true); };
  const openEditVendor = (v) => { setEditingVendor(v); setVendorForm({ name: v.name, gstin: v.gstin || '', phone: v.phone || '', email: v.email || '', address: v.address || '', contactPerson: v.contactPerson || '', status: v.status || 'Active' }); setIsVendorModalOpen(true); };
  const handleSubmitVendor = (e) => {
    e.preventDefault();
    if (editingVendor) updateVendor(editingVendor.id, vendorForm);
    else addVendor(vendorForm);
    setIsVendorModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingBag size={24} className="text-brand-accent" /> Purchase Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Purchase orders, vendor management & goods receipt from Janki Herbals.</p>
        </div>
        {canManage && (
          <div className="flex gap-3">
            {activeTab === 'orders' && (
              <button onClick={() => setIsPOModalOpen(true)} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
                <Plus size={16} /> Create PO
              </button>
            )}
            {activeTab === 'vendors' && (
              <button onClick={openAddVendor} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
                <Plus size={16} /> Add Vendor
              </button>
            )}
            {activeTab === 'returns' && (
              <button onClick={() => setIsReturnModalOpen(true)} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
                <Plus size={16} /> Record Return
              </button>
            )}
          </div>
        )}
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total POs', value: kpis.total, color: 'text-blue-400' },
          { label: 'Pending GRN', value: kpis.pending, color: 'text-amber-400' },
          { label: 'This Month Spend', value: formatCurrency(kpis.thisMonth), color: 'text-brand-accent' },
          { label: 'Vendor Payables', value: formatCurrency(kpis.payables), color: kpis.payables > 0 ? 'text-rose-400' : 'text-slate-400' },
          { label: 'Active Vendors', value: kpis.vendors, color: 'text-emerald-400' },
        ].map((k, i) => (
          <div key={i} className="glass-panel rounded-2xl p-4 border border-white/5">
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</p>
            <p className={`text-xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex border-b border-white/5 pb-px gap-1">
        {[['orders', 'Purchase Orders'], ['vendors', 'Vendors'], ['grn', 'GRN History'], ['returns', 'Returns']].map(([key, label]) => (
          <button key={key} onClick={() => { setActiveTab(key); setSearch(''); }}
            className={`px-5 py-3 font-semibold text-sm border-b-2 transition-all ${activeTab === key ? 'border-brand-accent text-brand-accent' : 'border-transparent text-slate-400 hover:text-white hover:bg-white/5'}`}>
            {label} {key === 'orders' ? `(${purchaseOrders.length})` : key === 'vendors' ? `(${vendors.length})` : key === 'grn' ? `(${grn.length})` : `(${purchaseReturns.length})`}
          </button>
        ))}
      </div>

      {/* Search (shared) */}
      <div className="flex gap-3 items-center flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={activeTab === 'orders' ? 'Search PO or vendor...' : 'Search vendor...'} className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        {activeTab === 'orders' && (
          <div className="flex gap-2 flex-wrap">
            {['All', ...PO_STATUSES].map(s => (
              <button key={s} onClick={() => setStatusFilter(s)}
                className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === s ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'border-white/5 text-slate-400 hover:text-white bg-brand-primary-lighter/40'}`}>
                {s}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Orders Tab */}
      {activeTab === 'orders' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">PO ID</th>
                  <th className="p-4">Vendor</th>
                  <th className="p-4 text-center">Items</th>
                  <th className="p-4 text-right">Total</th>
                  <th className="p-4">Expected Date</th>
                  <th className="p-4">Created</th>
                  <th className="p-4 text-center">Status</th>
                  {canManage && <th className="p-4 text-center">Actions</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredOrders.length > 0 ? filteredOrders.map(po => {
                  const st = statusConfig[po.status] || statusConfig['Draft'];
                  return (
                    <tr key={po.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                      <td className="p-4 font-bold text-white font-mono text-xs">{po.id}</td>
                      <td className="p-4"><div className="font-medium text-white">{po.vendorName}</div></td>
                      <td className="p-4 text-center">{(po.items || []).length} items</td>
                      <td className="p-4 text-right font-bold text-brand-accent">{formatCurrency(po.total)}</td>
                      <td className="p-4 text-slate-400">{formatDate(po.expectedDate)}</td>
                      <td className="p-4 text-slate-400">{formatDate(po.createdAt)}</td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${st.cls}`}>
                          {st.icon}{po.status}
                        </span>
                        {po.status === 'Confirmed' && (() => {
                          const days = Math.floor((Date.now() - new Date(po.createdAt)) / 86400000);
                          const cls = days > 30 ? 'text-rose-400' : days > 15 ? 'text-amber-400' : 'text-slate-500';
                          return <div className={`mt-1 text-[10px] font-semibold ${cls}`}>⏳ {days}d awaiting GRN</div>;
                        })()}
                      </td>
                      {canManage && (
                        <td className="p-4 text-center">
                          <div className="flex items-center justify-center gap-1">
                            {po.status === 'Draft' && (
                              <button onClick={() => updatePurchaseOrderStatus(po.id, 'Confirmed')} className="px-2 py-1 text-[10px] bg-blue-500/10 text-blue-400 border border-blue-500/20 rounded-lg hover:bg-blue-500/20 transition-colors">Confirm</button>
                            )}
                            {po.status === 'Confirmed' && (
                              <button onClick={() => openGRN(po)} className="px-2 py-1 text-[10px] bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-lg hover:bg-emerald-500/20 transition-colors">GRN</button>
                            )}
                            {po.status === 'GRN Done' && (
                              <button onClick={() => updatePurchaseOrderStatus(po.id, 'Closed')} className="px-2 py-1 text-[10px] bg-purple-500/10 text-purple-400 border border-purple-500/20 rounded-lg hover:bg-purple-500/20 transition-colors">Close</button>
                            )}
                            <button onClick={() => { if (confirm('Delete this PO?')) deletePurchaseOrder(po.id); }} className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={13} /></button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                }) : (
                  <tr><td colSpan="8" className="p-12 text-center text-slate-500">
                    <ShoppingBag size={32} className="mx-auto mb-3 opacity-20" />
                    <p>No purchase orders found.</p>
                    {canManage && <button onClick={() => setIsPOModalOpen(true)} className="mt-4 text-brand-accent hover:underline text-sm">+ Create your first PO</button>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Vendors Tab */}
      {activeTab === 'vendors' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Vendor</th>
                  <th className="p-4">GSTIN</th>
                  <th className="p-4">Contact</th>
                  <th className="p-4 text-right">Outstanding</th>
                  <th className="p-4 text-center">Status</th>
                  <th className="p-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {filteredVendors.length > 0 ? filteredVendors.map(v => (
                  <tr key={v.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4">
                      <div className="font-semibold text-white">{v.name}</div>
                      <div className="text-xs text-slate-500">{v.contactPerson}</div>
                    </td>
                    <td className="p-4 font-mono text-xs text-slate-400">{v.gstin || '—'}</td>
                    <td className="p-4 text-slate-300">{v.phone || '—'}</td>
                    <td className={`p-4 text-right font-bold ${(v.outstandingAmount || 0) > 0 ? 'text-rose-400' : 'text-slate-400'}`}>{formatCurrency(v.outstandingAmount || 0)}</td>
                    <td className="p-4 text-center">
                      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border ${v.status === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>{v.status}</span>
                    </td>
                    <td className="p-4 text-center">
                      <div className="flex items-center justify-center gap-1.5">
                        <button onClick={() => setViewingVendor(v)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="View Ledger"><Eye size={14} /></button>
                        {canManage && <>
                          <button onClick={() => openEditVendor(v)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors"><Edit2 size={14} /></button>
                          <button onClick={() => { if (confirm('Delete vendor?')) deleteVendor(v.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors"><Trash2 size={14} /></button>
                        </>}
                      </div>
                    </td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="p-12 text-center text-slate-500">No vendors found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* GRN History Tab */}
      {activeTab === 'grn' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">GRN ID</th>
                  <th className="p-4">PO Reference</th>
                  <th className="p-4">Vendor</th>
                  <th className="p-4 text-center">Items Received</th>
                  <th className="p-4">Received Date</th>
                  <th className="p-4">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {grn.length > 0 ? grn.map(g => (
                  <tr key={g.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4 font-bold text-white font-mono text-xs">{g.id}</td>
                    <td className="p-4 text-brand-accent font-mono text-xs">{g.poId || 'Direct'}</td>
                    <td className="p-4 text-white font-medium">{g.vendorName}</td>
                    <td className="p-4 text-center">{(g.items || []).length} items</td>
                    <td className="p-4 text-slate-400">{formatDate(g.receivedDate)}</td>
                    <td className="p-4 text-slate-500 italic">{g.notes || '—'}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="6" className="p-12 text-center text-slate-500">No GRNs recorded yet.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Returns Tab */}
      {activeTab === 'returns' && (
        <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
          <div className="overflow-x-auto custom-scrollbar">
            <table className="w-full text-left text-sm border-collapse">
              <thead>
                <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                  <th className="p-4">Return ID</th>
                  <th className="p-4">Vendor</th>
                  <th className="p-4">Product</th>
                  <th className="p-4 text-center">Qty</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4 text-right">Credit Value</th>
                  <th className="p-4">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-slate-300">
                {purchaseReturns.length > 0 ? purchaseReturns.map(r => (
                  <tr key={r.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                    <td className="p-4 font-bold text-white font-mono text-xs">{r.id}</td>
                    <td className="p-4 text-white font-medium">{r.vendorName}</td>
                    <td className="p-4">{(r.items || []).map(i => i.product).join(', ')}</td>
                    <td className="p-4 text-center">{(r.items || []).reduce((s, i) => s + Number(i.quantity || 0), 0)}</td>
                    <td className="p-4"><span className="text-xs bg-rose-500/10 text-rose-300 border border-rose-500/20 px-2 py-0.5 rounded-full">{r.reason}</span></td>
                    <td className="p-4 text-right font-bold text-emerald-400">{formatCurrency(r.value)}</td>
                    <td className="p-4 text-slate-400">{formatDate(r.date || r.createdAt)}</td>
                  </tr>
                )) : (
                  <tr><td colSpan="7" className="p-12 text-center text-slate-500">
                    <ShoppingBag size={32} className="mx-auto mb-3 opacity-20" />
                    <p>No purchase returns recorded.</p>
                    {canManage && <button onClick={() => setIsReturnModalOpen(true)} className="mt-4 text-brand-accent hover:underline text-sm">+ Record your first return</button>}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Record Return Modal */}
      {isReturnModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsReturnModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">Record Purchase Return</h3>
              <button onClick={() => setIsReturnModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitReturn} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2">
                  <label className={labelCls}>Vendor *</label>
                  <select required value={returnForm.vendorId} onChange={e => setReturnForm(f => ({ ...f, vendorId: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Vendor --</option>
                    {vendors.map(v => <option key={v.id} value={v.id} className="bg-brand-primary">{v.name}</option>)}
                  </select>
                </div>
                <div className="col-span-2">
                  <label className={labelCls}>Product *</label>
                  <select required value={returnForm.product} onChange={e => setReturnForm(f => ({ ...f, product: e.target.value }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Product --</option>
                    {products.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                  </select>
                </div>
                <div><label className={labelCls}>Quantity *</label><input required type="number" min="1" value={returnForm.quantity} onChange={e => setReturnForm(f => ({ ...f, quantity: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Unit Cost (₹) *</label><input required type="number" min="0" value={returnForm.unitCost} onChange={e => setReturnForm(f => ({ ...f, unitCost: e.target.value }))} className={inputCls} /></div>
                <div className="col-span-2">
                  <label className={labelCls}>Reason *</label>
                  <select required value={returnForm.reason} onChange={e => setReturnForm(f => ({ ...f, reason: e.target.value }))} className={inputCls}>
                    {['Damaged goods', 'Wrong item', 'Quality issue', 'Expired stock', 'Excess supply', 'Other'].map(r => <option key={r} value={r} className="bg-brand-primary">{r}</option>)}
                  </select>
                </div>
                <div className="col-span-2"><label className={labelCls}>Notes</label><textarea rows="2" value={returnForm.notes} onChange={e => setReturnForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} /></div>
              </div>
              <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 text-xs text-slate-400 flex justify-between">
                <span>Credit to vendor payable:</span>
                <span className="font-bold text-emerald-400">{formatCurrency(Number(returnForm.quantity) * Number(returnForm.unitCost) || 0)}</span>
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsReturnModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Record Return</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Create PO Modal */}
      {isPOModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[4vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPOModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-3xl max-h-[92vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShoppingBag className="text-brand-accent" size={20} />Create Purchase Order</h3>
              <button onClick={() => setIsPOModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitPO} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Vendor *</label>
                  <select required value={poForm.vendorId} onChange={e => setPOForm(f => ({ ...f, vendorId: e.target.value, vendorName: vendors.find(v => v.id === e.target.value)?.name || '' }))} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Vendor --</option>
                    {vendors.map(v => <option key={v.id} value={v.id} className="bg-brand-primary">{v.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Expected Delivery Date</label>
                  <input type="date" value={poForm.expectedDate} onChange={e => setPOForm(f => ({ ...f, expectedDate: e.target.value }))} className={inputCls} />
                </div>
              </div>

              {/* Line Items */}
              <div>
                <div className="flex justify-between items-center mb-2">
                  <label className={labelCls}>Line Items *</label>
                  <button type="button" onClick={addLineItem} className="text-xs text-brand-accent hover:underline flex items-center gap-1"><Plus size={12} /> Add Item</button>
                </div>
                <div className="space-y-2">
                  {poForm.items.map((item, idx) => (
                    <div key={idx} className="grid grid-cols-12 gap-2 items-center bg-brand-primary-lighter/20 p-3 rounded-xl border border-white/5">
                      <div className="col-span-4">
                        <select required value={item.product} onChange={e => updateLineItem(idx, 'product', e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white">
                          <option value="" className="bg-brand-primary">Product...</option>
                          {products.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                        </select>
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="1" required placeholder="Qty" value={item.quantity} onChange={e => updateLineItem(idx, 'quantity', e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white" />
                      </div>
                      <div className="col-span-2">
                        <input type="number" min="0" placeholder="Unit Cost" value={item.unitCost} onChange={e => updateLineItem(idx, 'unitCost', e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white" />
                      </div>
                      <div className="col-span-2">
                        <input type="text" placeholder="Batch#" value={item.batchNumber} onChange={e => updateLineItem(idx, 'batchNumber', e.target.value)} className="w-full glass-input rounded-lg px-3 py-2 text-xs text-white" />
                      </div>
                      <div className="col-span-1 text-right font-semibold text-brand-accent text-xs">
                        {formatCurrency(Number(item.quantity) * Number(item.unitCost) || 0)}
                      </div>
                      <div className="col-span-1 text-right">
                        {poForm.items.length > 1 && <button type="button" onClick={() => removeLineItem(idx)} className="text-red-400 hover:text-red-300"><X size={14} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
                <div className="flex justify-end mt-2">
                  <div className="bg-brand-primary-lighter/30 rounded-xl px-4 py-2 text-sm font-bold text-white border border-white/5">
                    Total: <span className="text-brand-accent">{formatCurrency(poTotal)}</span>
                  </div>
                </div>
              </div>

              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows="2" value={poForm.notes} onChange={e => setPOForm(f => ({ ...f, notes: e.target.value }))} placeholder="Any special instructions..." className={`${inputCls} resize-none`} />
              </div>

              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsPOModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Create Purchase Order</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* GRN Modal */}
      {isGRNModalOpen && grnTargetPO && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsGRNModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Truck className="text-brand-accent" size={20} />Record GRN — {grnTargetPO.id}</h3>
              <button onClick={() => setIsGRNModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmitGRN} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 text-xs text-slate-400">
                <span className="font-semibold text-white">Vendor:</span> {grnTargetPO.vendorName} &nbsp;|&nbsp;
                <span className="font-semibold text-white">PO Total:</span> {formatCurrency(grnTargetPO.total)}
              </div>
              <div>
                <label className={labelCls}>Received Date *</label>
                <input required type="date" value={grnForm.receivedDate} onChange={e => setGRNForm(f => ({ ...f, receivedDate: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Items Received</label>
                {grnForm.items.map((item, idx) => (
                  <div key={idx} className="flex gap-2 items-center mb-2">
                    <span className="text-xs text-white flex-1 truncate">{item.product}</span>
                    <input type="number" min="0" value={item.receivedQty} onChange={e => setGRNForm(f => ({ ...f, items: f.items.map((gi, i) => i === idx ? { ...gi, receivedQty: e.target.value } : gi) }))} className="w-24 glass-input rounded-lg px-3 py-2 text-xs text-white" placeholder="Qty" />
                  </div>
                ))}
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <textarea rows="2" value={grnForm.notes} onChange={e => setGRNForm(f => ({ ...f, notes: e.target.value }))} className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsGRNModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Record GRN & Update Stock</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Vendor Detail / Ledger Modal */}
      {viewingVendor && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingVendor(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-start p-6 pb-4 flex-shrink-0 border-b border-white/5">
              <div>
                <h3 className="text-xl font-bold text-white">{viewingVendor.name}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{viewingVendor.gstin || 'No GSTIN'} · {viewingVendor.contactPerson || '—'}</p>
              </div>
              <button onClick={() => setViewingVendor(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-center mb-5">
                <p className="text-xs text-slate-400 uppercase tracking-wide">Outstanding Payable</p>
                <p className="text-2xl font-extrabold text-rose-400 mt-0.5">{formatCurrency(viewingVendor.outstandingAmount || 0)}</p>
              </div>
              <div className="flex items-center justify-between mb-3">
                <h4 className="text-sm font-bold text-white flex items-center gap-1.5"><Wallet size={14} className="text-brand-accent" />Vendor Ledger</h4>
                {canManage && (viewingVendor.outstandingAmount || 0) > 0 && (
                  <button onClick={() => setIsPaymentModalOpen(true)} className="text-xs font-semibold text-brand-accent hover:underline">+ Record Payment</button>
                )}
              </div>
              {ledgerEntries.length > 0 ? (
                <div className="space-y-1.5">
                  {ledgerEntries.slice().reverse().map(row => (
                    <div key={row.id} className="flex items-center justify-between text-xs bg-brand-primary-lighter/30 rounded-lg px-3 py-2">
                      <div className="flex items-center gap-2">
                        {row.debit > 0 ? <ArrowUpCircle size={13} className="text-rose-400 flex-shrink-0" /> : <ArrowDownCircle size={13} className="text-emerald-400 flex-shrink-0" />}
                        <div>
                          <p className="text-slate-300">{row.description}</p>
                          <p className="text-[10px] text-slate-500">{formatDate(row.date)}</p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className={`font-semibold ${row.debit > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                          {row.debit > 0 ? `+${formatCurrency(row.debit)}` : `-${formatCurrency(row.credit)}`}
                        </span>
                        <p className="text-[10px] text-slate-500">Bal: {formatCurrency(row.balance)}</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-slate-500 text-center py-6">No ledger activity yet. Record a GRN to create a payable.</p>
              )}
            </div>
            <div className="flex gap-3 justify-end p-6 pt-4 border-t border-white/5 flex-shrink-0">
              {canManage && (viewingVendor.outstandingAmount || 0) > 0 && (
                <button onClick={() => setIsPaymentModalOpen(true)} className="px-4 py-2 text-sm btn-accent rounded-xl flex items-center gap-2"><IndianRupee size={14} />Record Payment</button>
              )}
              <button onClick={() => setViewingVendor(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Close</button>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Record Vendor Payment Modal */}
      {isPaymentModalOpen && viewingVendor && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPaymentModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><IndianRupee size={18} className="text-brand-accent" />Pay {viewingVendor.name}</h3>
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

      {/* Vendor Modal */}
      {isVendorModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsVendorModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-5">
              <h3 className="text-lg font-bold text-white">{editingVendor ? 'Edit Vendor' : 'Add Vendor'}</h3>
              <button onClick={() => setIsVendorModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmitVendor} className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="col-span-2"><label className={labelCls}>Vendor Name *</label><input required type="text" value={vendorForm.name} onChange={e => setVendorForm(f => ({ ...f, name: e.target.value }))} placeholder="e.g. Janki Herbals" className={inputCls} /></div>
                <div><label className={labelCls}>GSTIN</label><input type="text" value={vendorForm.gstin} onChange={e => setVendorForm(f => ({ ...f, gstin: e.target.value }))} placeholder="24AAACJ..." className={inputCls} /></div>
                <div><label className={labelCls}>Contact Person</label><input type="text" value={vendorForm.contactPerson} onChange={e => setVendorForm(f => ({ ...f, contactPerson: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Phone</label><input type="text" value={vendorForm.phone} onChange={e => setVendorForm(f => ({ ...f, phone: e.target.value }))} className={inputCls} /></div>
                <div><label className={labelCls}>Email</label><input type="email" value={vendorForm.email} onChange={e => setVendorForm(f => ({ ...f, email: e.target.value }))} className={inputCls} /></div>
                <div className="col-span-2"><label className={labelCls}>Address</label><textarea rows="2" value={vendorForm.address} onChange={e => setVendorForm(f => ({ ...f, address: e.target.value }))} className={`${inputCls} resize-none`} /></div>
              </div>
              <div className="flex gap-3 justify-end pt-2 border-t border-white/5">
                <button type="button" onClick={() => setIsVendorModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingVendor ? 'Save Changes' : 'Add Vendor'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
