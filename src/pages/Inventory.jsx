import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  Package2, Plus, Edit2, Trash2, Search, Filter,
  AlertTriangle, X, Download, RefreshCw, TrendingDown,
  CheckCircle, Clock, AlertCircle, Warehouse, ArrowUp, ArrowDown, Mail,
  ArrowLeftRight, ClipboardCheck
} from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { sendEmailAlert, templates } from '../utils/notificationUtils';

const WAREHOUSES = ['Main Warehouse', 'Secondary Warehouse', 'Cold Storage'];
const STATUS_FILTERS = ['All', 'OK', 'Low Stock', 'Critical', 'Expiring Soon', 'Out of Stock'];

const getStockStatus = (item) => {
  if (item.quantity === 0) return 'Out of Stock';
  if (item.quantity <= item.reorderLevel * 0.5) return 'Critical';
  if (item.quantity <= item.reorderLevel) return 'Low Stock';
  if (item.expiryDate) {
    const daysToExpiry = Math.ceil((new Date(item.expiryDate) - new Date()) / (1000 * 60 * 60 * 24));
    if (daysToExpiry <= 60 && daysToExpiry > 0) return 'Expiring Soon';
    if (daysToExpiry <= 0) return 'Expired';
  }
  return 'OK';
};

const statusConfig = {
  'OK':            { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  'Low Stock':     { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20',    icon: <AlertCircle size={12} /> },
  'Critical':      { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20',        icon: <AlertTriangle size={12} /> },
  'Expiring Soon': { cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20',  icon: <Clock size={12} /> },
  'Expired':       { cls: 'bg-red-800/20 text-red-400 border-red-700/30',           icon: <AlertTriangle size={12} /> },
  'Out of Stock':  { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20',     icon: <TrendingDown size={12} /> },
};

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (dateStr) =>
  dateStr ? new Date(dateStr).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const BLANK_FORM = {
  product: '', batchNumber: '', expiryDate: '', quantity: '',
  reserved: 0, transit: 0, damaged: 0, reorderLevel: 10,
  warehouse: 'Main Warehouse', unitCost: ''
};

const BLANK_ADJUST = { adjustment: '', reason: '' };

export default function Inventory() {
  const { inventory, products, addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, transferStock } = useData();
  const { canAccess } = useAuth();
  const canManage = canAccess('inventory', 'full');

  const [search, setSearch] = useState('');
  const [warehouseFilter, setWarehouseFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [viewingProduct, setViewingProduct] = useState(null);
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [isAdjustOpen, setIsAdjustOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [adjustingItem, setAdjustingItem] = useState(null);
  const [form, setForm] = useState(BLANK_FORM);
  const [adjustForm, setAdjustForm] = useState(BLANK_ADJUST);
  const [transferItem, setTransferItem] = useState(null);
  const [transferForm, setTransferForm] = useState({ toWarehouse: '', quantity: '', notes: '' });
  const [countItem, setCountItem] = useState(null);
  const [countedQty, setCountedQty] = useState('');

  // KPI derivations
  const withStatus = useMemo(() => inventory.map(i => ({ ...i, _status: getStockStatus(i) })), [inventory]);

  const kpis = useMemo(() => ({
    totalSKUs:      [...new Set(inventory.map(i => i.product))].length,
    totalBatches:   inventory.length,
    lowStock:       withStatus.filter(i => i._status === 'Low Stock' || i._status === 'Critical' || i._status === 'Out of Stock').length,
    expiringSoon:   withStatus.filter(i => i._status === 'Expiring Soon').length,
    stockValue:     inventory.reduce((s, i) => s + (i.quantity || 0) * (i.unitCost || 0), 0),
  }), [inventory, withStatus]);

  const filtered = useMemo(() => {
    return withStatus.filter(item => {
      const matchSearch = !search || item.product.toLowerCase().includes(search.toLowerCase()) || (item.batchNumber || '').toLowerCase().includes(search.toLowerCase());
      const matchWarehouse = !warehouseFilter || item.warehouse === warehouseFilter;
      const matchStatus = statusFilter === 'All' || item._status === statusFilter;
      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [withStatus, search, warehouseFilter, statusFilter]);

  // Combines every batch of the same product into one row, so staff never
  // have to manually add up multiple batch rows to get a real total.
  const productSummary = useMemo(() => {
    const byProduct = {};
    filtered.forEach(item => {
      if (!byProduct[item.product]) {
        byProduct[item.product] = { product: item.product, totalQty: 0, reserved: 0, batchCount: 0 };
      }
      byProduct[item.product].totalQty += item.quantity || 0;
      byProduct[item.product].reserved += item.reserved || 0;
      byProduct[item.product].batchCount += 1;
    });
    return Object.values(byProduct)
      .map(p => ({ ...p, available: Math.max(0, p.totalQty - p.reserved) }))
      .sort((a, b) => a.product.localeCompare(b.product));
  }, [filtered]);

  const openAdd = () => { setEditingItem(null); setForm(BLANK_FORM); setIsAddOpen(true); };
  const openEdit = (item) => {
    setEditingItem(item);
    setForm({
      product: item.product, batchNumber: item.batchNumber || '',
      expiryDate: item.expiryDate ? item.expiryDate.split('T')[0] : '',
      quantity: item.quantity, reserved: item.reserved || 0,
      transit: item.transit || 0, damaged: item.damaged || 0,
      reorderLevel: item.reorderLevel || 10, warehouse: item.warehouse || 'Main Warehouse',
      unitCost: item.unitCost || ''
    });
    setIsAddOpen(true);
  };
  const openAdjust = (item) => { setAdjustingItem(item); setAdjustForm(BLANK_ADJUST); setIsAdjustOpen(true); };
  const openTransfer = (item) => { setTransferItem(item); setTransferForm({ toWarehouse: WAREHOUSES.find(w => w !== item.warehouse) || '', quantity: '', notes: '' }); };
  const openCount = (item) => { setCountItem(item); setCountedQty(String(item.quantity)); };

  const handleTransfer = (e) => {
    e.preventDefault();
    const qty = Number(transferForm.quantity);
    if (!transferItem || !transferForm.toWarehouse || qty <= 0 || qty > transferItem.quantity) return;
    transferStock(transferItem.id, transferForm.toWarehouse, qty, transferForm.notes);
    setTransferItem(null);
  };

  const handleCount = (e) => {
    e.preventDefault();
    if (!countItem) return;
    const counted = Number(countedQty);
    const variance = counted - countItem.quantity;
    if (variance !== 0) adjustStock(countItem.id, variance, `Cycle count reconciliation (system ${countItem.quantity} → counted ${counted})`);
    setCountItem(null);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...form,
      quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel),
      unitCost: Number(form.unitCost || 0),
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : null
    };
    if (editingItem) updateInventoryItem(editingItem.id, payload);
    else addInventoryItem(payload);
    setIsAddOpen(false);
  };

  const handleAdjust = (e) => {
    e.preventDefault();
    if (!adjustingItem || !adjustForm.reason.trim()) return;
    adjustStock(adjustingItem.id, Number(adjustForm.adjustment), adjustForm.reason);
    setIsAdjustOpen(false);
  };

  const handleExport = () => {
    downloadCSV(filtered.map(i => ({
      Product: i.product, Batch: i.batchNumber, Warehouse: i.warehouse,
      Qty: i.quantity, Reserved: i.reserved, AvailableToSell: Math.max(0, (i.quantity || 0) - (i.reserved || 0)), Transit: i.transit, Damaged: i.damaged,
      ReorderLevel: i.reorderLevel, Expiry: formatDate(i.expiryDate),
      UnitCost: i.unitCost, StockValue: i.quantity * (i.unitCost || 0), Status: i._status
    })), 'PRISMORA_Inventory');
  };

  const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
  const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

  return (
    <div className="space-y-6 animate-fade-in-up">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Package2 size={24} className="text-brand-accent" />
            Inventory Management
          </h1>
          <p className="text-slate-400 text-sm mt-1">Warehouse stock, batch tracking, expiry & reorder alerts.</p>
        </div>
        <div className="flex gap-3">
          <button onClick={handleExport} className="glass-panel hover:bg-brand-primary-lighter/80 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5">
            <Download size={16} className="text-brand-accent" /><span className="hidden sm:inline text-sm font-medium">Export CSV</span>
          </button>
          {(canManage) && (
            <button onClick={openAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
              <Plus size={16} /> Add Batch
            </button>
          )}
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        {[
          { label: 'Total SKUs', value: kpis.totalSKUs, color: 'text-blue-400', bg: 'bg-blue-500/5' },
          { label: 'Total Batches', value: kpis.totalBatches, color: 'text-purple-400', bg: 'bg-purple-500/5' },
          { label: 'Low / Critical', value: kpis.lowStock, color: 'text-amber-400', bg: 'bg-amber-500/5' },
          { label: 'Expiring Soon', value: kpis.expiringSoon, color: 'text-orange-400', bg: 'bg-orange-500/5' },
          { label: 'Stock Value', value: formatCurrency(kpis.stockValue), color: 'text-brand-accent', bg: 'bg-brand-accent/5', wide: true },
        ].map((k, i) => (
          <div key={i} className={`glass-panel rounded-2xl p-4 border border-white/5 ${k.wide ? 'col-span-2 lg:col-span-1' : ''}`}>
            <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">{k.label}</p>
            <p className={`text-xl font-extrabold mt-1 ${k.color}`}>{k.value}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="glass-panel rounded-2xl p-4 border border-white/5 flex flex-col md:flex-row gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search product or batch..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
        <div className="relative">
          <Warehouse className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={14} />
          <select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)} className="glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-slate-200 appearance-none">
            <option value="">All Warehouses</option>
            {WAREHOUSES.map(w => <option key={w} value={w} className="bg-brand-primary">{w}</option>)}
          </select>
        </div>
        <div className="flex gap-2 flex-wrap">
          {STATUS_FILTERS.map(sf => (
            <button key={sf} onClick={() => setStatusFilter(sf)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all ${statusFilter === sf ? 'bg-brand-accent/15 border-brand-accent text-brand-accent' : 'bg-brand-primary-lighter/40 border-white/5 text-slate-400 hover:text-white'}`}>
              {sf}
            </button>
          ))}
        </div>
      </div>

      {/* Product Totals Table — click a product to see its individual batches */}
      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Product</th>
                <th className="p-4 text-center">Batches</th>
                <th className="p-4 text-center">Total Qty</th>
                <th className="p-4 text-center">Reserved</th>
                <th className="p-4 text-center">Available to Sell</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {productSummary.length > 0 ? productSummary.map(p => (
                <tr key={p.product} onClick={() => setViewingProduct(p.product)} className="hover:bg-brand-primary-lighter/20 transition-colors cursor-pointer">
                  <td className="p-4 font-semibold text-white">{p.product}</td>
                  <td className="p-4 text-center text-slate-400">{p.batchCount}</td>
                  <td className="p-4 text-center font-bold text-white">{p.totalQty}</td>
                  <td className="p-4 text-center text-slate-400">{p.reserved}</td>
                  <td className={`p-4 text-center font-bold ${p.available > 0 ? 'text-emerald-400' : 'text-red-400'}`}>{p.available}</td>
                </tr>
              )) : (
                <tr><td colSpan="5" className="p-12 text-center text-slate-500">
                  <Package2 size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No inventory items match your filters.</p>
                  {(canManage) && (
                    <button onClick={openAdd} className="mt-4 text-brand-accent hover:underline text-sm">+ Add your first batch</button>
                  )}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Batch Detail Modal — opened by clicking a product row above */}
      {viewingProduct && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[8vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingProduct(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-5xl max-h-[80vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package2 className="text-brand-accent" size={20} />
                Batches — {viewingProduct}
              </h3>
              <div className="flex items-center gap-3">
                {canManage && (
                  <button onClick={() => { setEditingItem(null); setForm({ ...BLANK_FORM, product: viewingProduct }); setIsAddOpen(true); }} className="btn-accent px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
                    <Plus size={14} /> Add Batch
                  </button>
                )}
                <button onClick={() => setViewingProduct(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
              </div>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider sticky top-0">
                    <th className="p-4">Batch</th>
                    <th className="p-4">Warehouse</th>
                    <th className="p-4 text-center">Total Qty</th>
                    <th className="p-4 text-center">Reserved</th>
                    <th className="p-4 text-center">Available</th>
                    <th className="p-4 text-center">Transit</th>
                    <th className="p-4 text-center">Damaged</th>
                    <th className="p-4 text-center">Reorder At</th>
                    <th className="p-4">Expiry</th>
                    <th className="p-4 text-right">Unit Cost</th>
                    <th className="p-4 text-center">Status</th>
                    {(canManage) && <th className="p-4 text-center">Actions</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {filtered.filter(item => item.product === viewingProduct).map(item => {
                    const st = statusConfig[item._status] || statusConfig['OK'];
                    const daysToExpiry = item.expiryDate ? Math.ceil((new Date(item.expiryDate) - new Date()) / 86400000) : null;
                    return (
                      <tr key={item.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                        <td className="p-4 text-xs text-slate-500 font-mono">{item.batchNumber || '—'}</td>
                        <td className="p-4 text-slate-400 text-xs">{item.warehouse}</td>
                        <td className="p-4 text-center font-bold text-white">{item.quantity}</td>
                        <td className="p-4 text-center text-slate-400">{item.reserved || 0}</td>
                        <td className={`p-4 text-center font-bold ${Math.max(0, (item.quantity || 0) - (item.reserved || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {Math.max(0, (item.quantity || 0) - (item.reserved || 0))}
                        </td>
                        <td className="p-4 text-center text-slate-400">{item.transit || 0}</td>
                        <td className="p-4 text-center text-rose-400">{item.damaged || 0}</td>
                        <td className="p-4 text-center text-amber-400">{item.reorderLevel}</td>
                        <td className="p-4">
                          <div className={`text-xs font-medium ${daysToExpiry !== null && daysToExpiry <= 60 ? 'text-orange-400' : 'text-slate-400'}`}>
                            {formatDate(item.expiryDate)}
                            {daysToExpiry !== null && daysToExpiry <= 60 && daysToExpiry > 0 && <span className="ml-1 text-orange-400">({daysToExpiry}d)</span>}
                          </div>
                        </td>
                        <td className="p-4 text-right text-slate-300">{formatCurrency(item.unitCost)}</td>
                        <td className="p-4 text-center">
                          <span className={`inline-flex items-center gap-1.5 px-2 py-1 rounded-full text-[10px] font-bold border ${st.cls}`}>
                            {st.icon}{item._status}
                          </span>
                        </td>
                        {(canManage) && (
                          <td className="p-4 text-center">
                            <div className="flex items-center justify-center gap-1.5">
                              <button onClick={() => openAdjust(item)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Adjust Stock"><RefreshCw size={14} /></button>
                              <button onClick={() => openCount(item)} className="p-1.5 text-slate-400 hover:text-emerald-400 hover:bg-emerald-400/10 rounded-lg transition-colors" title="Cycle Count"><ClipboardCheck size={14} /></button>
                              <button onClick={() => openTransfer(item)} className="p-1.5 text-slate-400 hover:text-purple-400 hover:bg-purple-400/10 rounded-lg transition-colors" title="Transfer to Warehouse"><ArrowLeftRight size={14} /></button>
                              {item._status !== 'OK' && (
                                <button
                                  onClick={() => {
                                    const isExpiry = item._status === 'Expiring Soon' || item._status === 'Expired';
                                    const subject = isExpiry
                                      ? `[Warning] Expiry Alert: ${item.product}`
                                      : `[Alert] Restock Needed: ${item.product}`;
                                    const body = isExpiry
                                      ? templates.expiryAlert(item.product, item.batchNumber, daysToExpiry || 0, item.quantity, item.warehouse)
                                      : templates.lowStockAlert(item.product, item.quantity, item.warehouse);
                                    sendEmailAlert('warehouse@prismora.com', subject, body);
                                  }}
                                  className="p-1.5 text-slate-400 hover:text-orange-400 hover:bg-orange-400/10 rounded-lg transition-colors"
                                  title={item._status === 'Expiring Soon' || item._status === 'Expired' ? "Email Expiry Alert" : "Email Restock Alert"}
                                >
                                  <Mail size={14} />
                                </button>
                              )}
                              <button onClick={() => openEdit(item)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors" title="Edit"><Edit2 size={14} /></button>
                              <button onClick={() => { if (confirm('Delete this inventory batch?')) deleteInventoryItem(item.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Add / Edit Modal */}
      {isAddOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[6vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAddOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <Package2 className="text-brand-accent" size={20} />
                {editingItem ? 'Edit Inventory Batch' : 'Add New Batch'}
              </h3>
              <button onClick={() => setIsAddOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label className={labelCls}>Product *</label>
                  <select required value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Product --</option>
                    {products.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Batch Number</label>
                  <input type="text" value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} placeholder="e.g. RBH-2025-001" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Expiry Date</label>
                  <input type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Quantity *</label>
                  <input required type="number" min="0" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Unit Cost (₹)</label>
                  <input type="number" min="0" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="0" className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Reorder Level</label>
                  <input type="number" min="0" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Warehouse</label>
                  <select value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} className={inputCls}>
                    {WAREHOUSES.map(w => <option key={w} value={w} className="bg-brand-primary">{w}</option>)}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>Reserved</label>
                  <input type="number" min="0" value={form.reserved} onChange={e => setForm({ ...form, reserved: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Transit</label>
                  <input type="number" min="0" value={form.transit} onChange={e => setForm({ ...form, transit: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Damaged</label>
                  <input type="number" min="0" value={form.damaged} onChange={e => setForm({ ...form, damaged: e.target.value })} className={inputCls} />
                </div>
              </div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingItem ? 'Save Changes' : 'Add Batch'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Adjust Stock Modal */}
      {isAdjustOpen && adjustingItem && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsAdjustOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-6">
              <h3 className="text-lg font-bold text-white flex items-center gap-2">
                <RefreshCw className="text-brand-accent" size={20} />Adjust Stock
              </h3>
              <button onClick={() => setIsAdjustOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="bg-brand-primary-lighter/30 rounded-xl p-3 mb-4 border border-white/5">
              <p className="text-sm font-semibold text-white">{adjustingItem.product}</p>
              <p className="text-xs text-slate-400">Batch: {adjustingItem.batchNumber || '—'} · Current Qty: <span className="font-bold text-brand-accent">{adjustingItem.quantity}</span></p>
            </div>
            <form onSubmit={handleAdjust} className="space-y-4">
              <div>
                <label className={labelCls}>Adjustment (+ to add, - to subtract)</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAdjustForm(f => ({ ...f, adjustment: f.adjustment === '' ? '-' : (Number(f.adjustment) < 0 ? String(-Number(f.adjustment)) : '-' + Math.abs(Number(f.adjustment))) }))}
                    className="p-2.5 glass-input rounded-xl text-red-400 hover:bg-red-400/10 transition-colors"><ArrowDown size={16} /></button>
                  <input type="number" required value={adjustForm.adjustment} onChange={e => setAdjustForm({ ...adjustForm, adjustment: e.target.value })} placeholder="e.g. 50 or -10" className={`${inputCls} flex-1`} />
                  <button type="button" onClick={() => setAdjustForm(f => ({ ...f, adjustment: f.adjustment === '' ? '' : String(Math.abs(Number(f.adjustment))) }))}
                    className="p-2.5 glass-input rounded-xl text-emerald-400 hover:bg-emerald-400/10 transition-colors"><ArrowUp size={16} /></button>
                </div>
              </div>
              <div>
                <label className={labelCls}>Reason *</label>
                <input required type="text" value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g. GRN received, Damaged goods, Stock count correction" className={inputCls} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setIsAdjustOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Apply Adjustment</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Transfer Stock Modal */}
      {transferItem && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setTransferItem(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><ArrowLeftRight className="text-brand-accent" size={20} />Transfer Stock</h3>
              <button onClick={() => setTransferItem(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="bg-brand-primary-lighter/30 rounded-xl p-3 mb-4 border border-white/5">
              <p className="text-sm font-semibold text-white">{transferItem.product}</p>
              <p className="text-xs text-slate-400">Batch: {transferItem.batchNumber || '—'} · From: <span className="font-bold text-brand-accent">{transferItem.warehouse}</span> · Available: {transferItem.quantity}</p>
            </div>
            <form onSubmit={handleTransfer} className="space-y-4">
              <div>
                <label className={labelCls}>Destination Warehouse *</label>
                <select required value={transferForm.toWarehouse} onChange={e => setTransferForm(f => ({ ...f, toWarehouse: e.target.value }))} className={inputCls}>
                  {WAREHOUSES.filter(w => w !== transferItem.warehouse).map(w => <option key={w} value={w} className="bg-brand-primary">{w}</option>)}
                </select>
              </div>
              <div>
                <label className={labelCls}>Quantity to Transfer * <span className="normal-case text-slate-500 font-normal">(max {transferItem.quantity})</span></label>
                <input required type="number" min="1" max={transferItem.quantity} value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className={labelCls}>Notes</label>
                <input type="text" value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Restocking Secondary Warehouse" className={inputCls} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setTransferItem(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Transfer</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Cycle Count Modal */}
      {countItem && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setCountItem(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><ClipboardCheck className="text-brand-accent" size={20} />Cycle Count</h3>
              <button onClick={() => setCountItem(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="bg-brand-primary-lighter/30 rounded-xl p-3 mb-4 border border-white/5">
              <p className="text-sm font-semibold text-white">{countItem.product}</p>
              <p className="text-xs text-slate-400">Batch: {countItem.batchNumber || '—'} · System Qty: <span className="font-bold text-brand-accent">{countItem.quantity}</span></p>
            </div>
            <form onSubmit={handleCount} className="space-y-4">
              <div>
                <label className={labelCls}>Physically Counted Quantity *</label>
                <input required type="number" min="0" value={countedQty} onChange={e => setCountedQty(e.target.value)} className={inputCls} autoFocus />
              </div>
              {countedQty !== '' && Number(countedQty) !== countItem.quantity && (
                <div className={`rounded-xl p-3 border text-sm font-medium ${Number(countedQty) - countItem.quantity > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  Variance: {Number(countedQty) - countItem.quantity > 0 ? '+' : ''}{Number(countedQty) - countItem.quantity} units — will be reconciled.
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setCountItem(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">Reconcile Count</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
