import { useState, useMemo, useEffect } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { Package2, Plus, Edit2, Trash2, AlertTriangle, X, Download, RefreshCw, TrendingDown, CheckCircle, Clock, AlertCircle, ArrowUp, ArrowDown, Mail, ArrowLeftRight, ClipboardCheck, Layers, Wallet, Scale, PackageX, Undo2 } from 'lucide-react';
import { useConfirm, useToast } from '../context/DialogContext';
import { PageHeader, DataTable, Button, Card, StatCard, SearchInput, Select } from '../components/ui';
import { downloadExcel } from '../utils/exportUtils';
import { sendEmailAlert, templates } from '../utils/notificationUtils';
import { optionsFor } from '../utils/masterLists';
import { isExpired, daysToExpiry as expiryDays, EXPIRING_SOON_DAYS, stockStatus } from '../utils/expiry';
import StockReconciliation from '../components/StockReconciliation';
import DamagedStockModal from '../components/DamagedStockModal';
import { batchNumberProblem } from '../utils/batchNumber';
import { stockValueBreakdown, batchValues } from '../utils/stockValue';
import { useFieldCheck, FieldError, ErrorSummary } from '../components/ui';

const INVENTORY_ADD_SPEC = {
  product: { label: 'Product', required: true },
  quantity: { label: 'Quantity', kind: 'qty', required: true },
  unitCost: { label: 'Unit cost', kind: 'amount' },
  reorderLevel: { label: 'Reorder level', kind: 'count' },
  reserved: { label: 'Reserved', kind: 'count' },
  transit: { label: 'Transit', kind: 'count' },
  damaged: { label: 'Damaged', kind: 'count' }
};
const INVENTORY_ADJUST_SPEC = {
  adjustment: { label: 'Adjustment', kind: 'adjustment' },
  reason: { label: 'Reason', required: true }
};
const INVENTORY_TRANSFER_SPEC = {
  quantity: { label: 'Quantity to Transfer', kind: 'qty', required: true }
};
const INVENTORY_COUNT_SPEC = {
  countedQty: { label: 'Counted quantity', kind: 'count', required: true }
};

// 'Damaged' is not a status: batches holding damaged units, whatever their status (Gap 17).
const STATUS_FILTERS = ['All', 'OK', 'Low Stock', 'Critical', 'Expiring Soon', 'Expired', 'Damaged', 'Out of Stock'];

// The status rule lives in utils/expiry.js, shared with the Reports low-stock list.
const getStockStatus = stockStatus;

const statusConfig = {
  'OK': { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  'Low Stock': { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <AlertCircle size={12} /> },
  'Critical': { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <AlertTriangle size={12} /> },
  'Expiring Soon': { cls: 'bg-orange-500/10 text-orange-400 border-orange-500/20', icon: <Clock size={12} /> },
  'Expired': { cls: 'bg-red-800/20 text-red-400 border-red-700/30', icon: <AlertTriangle size={12} /> },
  'Out of Stock': { cls: 'bg-slate-500/10 text-slate-400 border-slate-500/20', icon: <TrendingDown size={12} /> },
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
  const { inventory, products, addInventoryItem, updateInventoryItem, deleteInventoryItem, adjustStock, countStock, transferStock, masters, damagedLockSupported, expiredMovesSupported } = useData();
  const confirm = useConfirm();
  const toast = useToast();
  // Options come from Master Lists; masterLists.js holds the fallback.
  const warehouses = optionsFor(masters, 'warehouse').map(o => o.key);
  const { canAccess, user } = useAuth();
  const canManage = canAccess('inventory', 'full');
  // Gap 16 (087): the damaged count moves only by write-off or return to the
  // vendor. Until the database has 087 this stays off and nothing changes here.
  const [damagedLocked, setDamagedLocked] = useState(false);
  useEffect(() => {
    let live = true;
    damagedLockSupported().then(ok => { if (live) setDamagedLocked(ok); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const canMoveDamaged = damagedLocked && ['Super Admin', 'Admin', 'Warehouse Manager'].includes(user?.role);
  // Gap 17 (091): expired units written off / returned to the vendor, same roles.
  const [expiredMoves, setExpiredMoves] = useState(false);
  useEffect(() => {
    let live = true;
    expiredMovesSupported().then(ok => { if (live) setExpiredMoves(ok); });
    return () => { live = false; };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const canMoveExpired = expiredMoves && ['Super Admin', 'Admin', 'Warehouse Manager'].includes(user?.role);
  const [damagedAction, setDamagedAction] = useState(null);

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
  const [reconOpen, setReconOpen] = useState(false);

  const addCheck = useFieldCheck();
  const transferCheck = useFieldCheck();
  const countCheck = useFieldCheck();
  const adjustCheck = useFieldCheck();

  // KPI derivations
  const withStatus = useMemo(() => inventory.map(i => ({ ...i, _status: getStockStatus(i) })), [inventory]);

  // Stock Value = sellable units only; expired and damaged shown apart (Gap 17).
  const values = useMemo(() => stockValueBreakdown(inventory), [inventory]);
  const kpis = useMemo(() => ({
    stockValue: values.sellable, expiredValue: values.expired, damagedValue: values.damaged, damagedUnits: values.damagedUnits,
    totalSKUs: [...new Set(inventory.map(i => i.product))].length,
    totalBatches: inventory.length,
    lowStock: withStatus.filter(i => i._status === 'Low Stock' || i._status === 'Critical' || i._status === 'Out of Stock').length,
    expiringSoon: withStatus.filter(i => i._status === 'Expiring Soon').length,
    expiredUnits: withStatus.filter(i => i._status === 'Expired').reduce((s, i) => s + (i.quantity || 0), 0),
  }), [inventory, withStatus, values]);

  const filtered = useMemo(() => {
    return withStatus.filter(item => {
      const matchSearch = !search || item.product.toLowerCase().includes(search.toLowerCase()) || (item.batchNumber || '').toLowerCase().includes(search.toLowerCase());
      const matchWarehouse = !warehouseFilter || item.warehouse === warehouseFilter;
      const matchStatus = statusFilter === 'All' || item._status === statusFilter
        || (statusFilter === 'Damaged' && Number(item.damaged) > 0);
      return matchSearch && matchWarehouse && matchStatus;
    });
  }, [withStatus, search, warehouseFilter, statusFilter]);

  // Combines every batch of the same product into one row, so staff never
  // have to manually add up multiple batch rows to get a real total.
  const productSummary = useMemo(() => {
    const byProduct = {};
    filtered.forEach(item => {
      if (!byProduct[item.product]) {
        byProduct[item.product] = { product: item.product, totalQty: 0, reserved: 0, batchCount: 0, expired: 0, damaged: 0, available: 0 };
      }
      const p = byProduct[item.product];
      p.totalQty += item.quantity || 0;
      p.reserved += item.reserved || 0;
      p.batchCount += 1;
      p.damaged += Number(item.damaged) || 0;
      // Expired units are counted apart and never offered as available.
      if (item._status === 'Expired') p.expired += item.quantity || 0;
      else p.available += Math.max(0, (item.quantity || 0) - (item.reserved || 0));
    });
    return Object.values(byProduct)
      .sort((a, b) => a.product.localeCompare(b.product));
  }, [filtered]);

  const openAdd = () => { addCheck.reset(); setEditingItem(null); setForm(BLANK_FORM); setIsAddOpen(true); };
  const openEdit = (item) => {
    addCheck.reset();
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
  const openAdjust = (item) => { adjustCheck.reset(); setAdjustingItem(item); setAdjustForm(BLANK_ADJUST); setIsAdjustOpen(true); };
  const openTransfer = (item) => { transferCheck.reset(); setTransferItem(item); setTransferForm({ toWarehouse: warehouses.find(w => w !== item.warehouse) || '', quantity: '', notes: '' }); };
  const openCount = (item) => { countCheck.reset(); setCountItem(item); setCountedQty(String(item.quantity)); };

  // Every form here waits for the database: the button says "Saving…", a
  // refusal is shown and the dialog stays open, and it closes only once saved.
  const [saving, setSaving] = useState(null);
  const finish = (result, okText, close) => {
    setSaving(null);
    if (!result?.ok) { toast(result?.error || result?.reason || 'Not saved.', 'error'); return; }
    toast(okText, 'success');
    close();
  };

  const handleTransfer = async (e) => {
    e.preventDefault();
    if (saving) return;
    if (!transferCheck.ok(transferForm, INVENTORY_TRANSFER_SPEC, transferExtra)) return;
    // An impossible transfer gives back a reason; this shows it and keeps the
    // dialog open so the number can be corrected.
    setSaving('transfer');
    const result = await transferStock(
      transferItem?.id, transferForm.toWarehouse, Number(transferForm.quantity), transferForm.notes);
    finish(result, `Moved ${transferForm.quantity} ${transferItem?.product} to ${transferForm.toWarehouse}.`, () => setTransferItem(null));
  };

  const handleCount = async (e) => {
    e.preventDefault();
    if (!countItem || saving) return;
    if (!countCheck.ok({ countedQty }, INVENTORY_COUNT_SPEC)) return;
    const counted = Number(countedQty);
    const variance = counted - countItem.quantity;
    if (variance === 0) { toast('Count matches the system: nothing to change.', 'success'); setCountItem(null); return; }
    setSaving('count');
    const result = await countStock(countItem.id, counted, countItem.quantity);
    finish(result, `Stock set to ${counted} for ${countItem.product}.`, () => setCountItem(null));
  };

  const transferExtra = (f) => (transferItem && Number(f.quantity) > transferItem.quantity
    ? { quantity: `Only ${transferItem.quantity} in this batch to transfer` } : {});

  // The quantity of an existing batch is not typed here (Adjust / Cycle Count), so it is not checked.
  const addValues = { ...form, quantity: editingItem ? 1 : form.quantity };
  const batchExtra = (f) => {
    const problem = batchNumberProblem(f, inventory, editingItem);
    return problem ? { batchNumber: problem } : {};
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (saving) return;
    // Gap 18 (090): a number is required and used once per product.
    if (!addCheck.ok(addValues, INVENTORY_ADD_SPEC, batchExtra)) return;
    const payload = {
      ...form, batchNumber: form.batchNumber.trim(),
      quantity: Number(form.quantity), reorderLevel: Number(form.reorderLevel),
      unitCost: Number(form.unitCost || 0),
      expiryDate: form.expiryDate ? new Date(form.expiryDate).toISOString() : null
    };
    // Not sent on an edit: the database moves quantities (080), and a figure
    // loaded earlier may no longer be what the batch holds.
    if (editingItem) delete payload.quantity;
    // Nor the damaged count once 087 locks it (write-off / return to vendor only).
    if (editingItem && damagedLocked) delete payload.damaged;
    // A batch holding stock changes warehouse only as a recorded transfer of
    // all of it (081): the other fields are saved first, then the move.
    const held = Number(inventory.find(i => i.id === editingItem?.id)?.quantity ?? editingItem?.quantity) || 0;
    const moveTo = editingItem && held > 0 && payload.warehouse !== editingItem.warehouse ? payload.warehouse : null;
    if (moveTo) payload.warehouse = editingItem.warehouse;
    setSaving('batch');
    let result = editingItem ? await updateInventoryItem(editingItem.id, payload) : await addInventoryItem(payload);
    if (result?.ok && moveTo) {
      result = await transferStock(editingItem.id, moveTo, held, 'moved on the batch Edit form');
      if (!result?.ok) result = { ok: false, error: `Changes saved, but the batch was not moved: ${result?.error || result?.reason || 'refused.'}` };
    }
    finish(result, moveTo ? `Stock batch saved and its ${held} units moved to ${moveTo}.` : editingItem ? 'Stock batch saved.' : `Stock batch for ${payload.product} added.`, () => setIsAddOpen(false));
  };

  // Stock cannot go below 0 (the database refuses it too): say so under the field.
  const adjustBelowZero = (f) => {
    const n = Number(f.adjustment);
    return adjustingItem && Number.isInteger(n) && adjustingItem.quantity + n < 0
      ? { adjustment: `Adjustment would take stock below 0 (only ${adjustingItem.quantity} in this batch)` } : {};
  };

  const handleAdjust = async (e) => {
    e.preventDefault();
    if (!adjustingItem || saving) return;
    if (!adjustCheck.ok(adjustForm, INVENTORY_ADJUST_SPEC, adjustBelowZero)) return;
    setSaving('adjust');
    const result = await adjustStock(adjustingItem.id, Number(adjustForm.adjustment), adjustForm.reason);
    finish(result, `Stock for ${adjustingItem.product} is now ${result?.quantity}.`, () => setIsAdjustOpen(false));
  };

  const handleExport = () => {
    downloadExcel(filtered.map(i => ({
      Product: i.product, Batch: i.batchNumber, Warehouse: i.warehouse,
      Qty: i.quantity, Reserved: i.reserved, AvailableToSell: isExpired(i) ? 0 : Math.max(0, (i.quantity || 0) - (i.reserved || 0)), Expired: isExpired(i) ? 'Yes' : '', Transit: i.transit, Damaged: i.damaged,
      ReorderLevel: i.reorderLevel, Expiry: formatDate(i.expiryDate),
      UnitCost: i.unitCost,
      // Gap 17: sellable value only in Stock Value; expired and damaged apart.
      ...(v => ({ SellableValue: v.sellable, ExpiredValue: v.expired, DamagedValue: v.damaged }))(batchValues(i)),
      Status: i._status
    })), 'PRISMORA_Inventory');
  };

  const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
  const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

  const productColumns = [
    {
      key: 'product', header: 'Product', sort: p => p.product || '',
      render: p => <span className="font-semibold text-white">{p.product}</span>
    },
    {
      key: 'batchCount', header: 'Batches', align: 'center', sort: p => p.batchCount,
      render: p => <span className="text-slate-400">{p.batchCount}</span>
    },
    {
      key: 'totalQty', header: 'Total Qty', align: 'center', sort: p => p.totalQty,
      render: p => <span className="font-bold text-white">{p.totalQty}</span>
    },
    {
      key: 'reserved', header: 'Reserved', align: 'center', hideBelow: 'sm', sort: p => p.reserved,
      render: p => <span className="text-slate-400">{p.reserved}</span>
    },
    {
      key: 'available', header: 'Available to Sell', align: 'center', sort: p => p.available,
      render: p => (
        <span className={`font-bold ${p.available > 0 ? 'text-emerald-400' : 'text-rose-400'}`}>{p.available}</span>
      )
    },
    {
      key: 'expired', header: 'Expired', align: 'center', sort: p => p.expired,
      render: p => (p.expired > 0
        ? <span className="font-bold text-red-400" title="In expired batches: never sold or delivered">{p.expired}</span>
        : <span className="text-slate-600">—</span>)
    },
    {
      key: 'damaged', header: 'Damaged', align: 'center', sort: p => p.damaged,
      render: p => (p.damaged > 0
        ? <span className="font-bold text-rose-400" title="Damaged units: never sold; written off or returned to the vendor">{p.damaged}</span>
        : <span className="text-slate-600">—</span>)
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      {reconOpen && <StockReconciliation onClose={() => setReconOpen(false)} />}
      {damagedAction && <DamagedStockModal item={damagedAction.item} mode={damagedAction.mode} source={damagedAction.source} onClose={() => setDamagedAction(null)} />}
      <PageHeader
        icon={Package2}
        title="Inventory Management"
        subtitle="Warehouse stock, batch tracking, expiry and reorder alerts."
        actions={
          <>
            {/* Gap 15: movements added up per batch against what it holds. */}
            <Button icon={Scale} onClick={() => setReconOpen(true)}>Stock check</Button>
            <Button icon={Download} onClick={handleExport}>Export</Button>
            {canManage && <Button variant="primary" icon={Plus} onClick={openAdd}>Add Batch</Button>}
          </>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-7 gap-3 sm:gap-4">
        <StatCard label="Total SKUs" value={kpis.totalSKUs} icon={Package2} tone="info" />
        <StatCard label="Total Batches" value={kpis.totalBatches} icon={Layers} tone="accent" />
        <StatCard label="Low / Critical" value={kpis.lowStock} icon={AlertTriangle}
          tone={kpis.lowStock > 0 ? 'warning' : 'accent'} />
        <StatCard label={`Expiring ≤${EXPIRING_SOON_DAYS}d`} value={kpis.expiringSoon} icon={Clock}
          tone={kpis.expiringSoon > 0 ? 'warning' : 'accent'} />
        <StatCard label="Expired units" value={kpis.expiredUnits} icon={AlertTriangle}
          tone={kpis.expiredUnits > 0 ? 'danger' : 'accent'} />
        <StatCard label="Damaged units" value={kpis.damagedUnits} icon={PackageX}
          tone={kpis.damagedUnits > 0 ? 'danger' : 'accent'}
          hint={kpis.damagedUnits > 0 ? `${formatCurrency(kpis.damagedValue)} at cost` : undefined} />
        <StatCard label="Stock Value" value={formatCurrency(kpis.stockValue)} icon={Wallet} tone="accent"
          className="col-span-2 md:col-span-4 xl:col-span-1"
          hint={kpis.expiredValue || kpis.damagedValue ? `Sellable only. Not counted: expired ${formatCurrency(kpis.expiredValue)}, damaged ${formatCurrency(kpis.damagedValue)}` : 'Sellable stock at cost'} />
      </div>

      <Card padding="p-4" className="flex flex-col md:flex-row gap-3 md:items-center">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search product or batch"
        />
        <Select value={warehouseFilter} onChange={e => setWarehouseFilter(e.target.value)} className="md:w-48">
          <option value="">All Warehouses</option>
          {warehouses.map(w => <option key={w} value={w}>{w}</option>)}
        </Select>
        <div className="flex gap-1.5 flex-wrap">
          {STATUS_FILTERS.map(sf => (
            <button key={sf} type="button" onClick={() => setStatusFilter(sf)}
              className={`h-10 px-3 rounded-xl text-xs font-semibold border transition-colors ${statusFilter === sf
                  ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                  : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'
                }`}>
              {sf}
            </button>
          ))}
        </div>
      </Card>

      <DataTable
        title="Products"
        columns={productColumns}
        rows={productSummary}
        rowKey={p => p.product}
        onRowClick={p => setViewingProduct(p.product)}
        empty={{
          icon: Package2,
          title: 'Nothing in stock here',
          hint: canManage
            ? 'Stock arrives either from a goods receipt against a purchase order, or by adding a batch here directly. Each batch carries its own expiry date.'
            : 'Nothing matches the filters above.',
          action: canManage ? <Button variant="primary" icon={Plus} onClick={openAdd}>Add Batch</Button> : undefined,
        }}
      />

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
                  <button onClick={() => { addCheck.reset(); setEditingItem(null); setForm({ ...BLANK_FORM, product: viewingProduct }); setIsAddOpen(true); }} className="btn-accent px-3 py-1.5 rounded-lg text-xs font-bold flex items-center gap-1.5">
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
                    const daysToExpiry = expiryDays(item);
                    const expired = item._status === 'Expired';
                    return (
                      <tr key={item.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                        <td className="p-4 text-xs text-slate-500 font-mono">{item.batchNumber || '—'}</td>
                        <td className="p-4 text-slate-400 text-xs">{item.warehouse}</td>
                        <td className="p-4 text-center font-bold text-white">{item.quantity}</td>
                        <td className="p-4 text-center text-slate-400">{item.reserved || 0}</td>
                        <td className={`p-4 text-center font-bold ${!expired && Math.max(0, (item.quantity || 0) - (item.reserved || 0)) > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                          {expired ? 0 : Math.max(0, (item.quantity || 0) - (item.reserved || 0))}
                        </td>
                        <td className="p-4 text-center text-slate-400">{item.transit || 0}</td>
                        <td className="p-4 text-center text-rose-400">{item.damaged || 0}</td>
                        <td className="p-4 text-center text-amber-400">{item.reorderLevel}</td>
                        <td className="p-4">
                          <div className={`text-xs font-medium ${expired ? 'text-red-400' : daysToExpiry !== null && daysToExpiry <= EXPIRING_SOON_DAYS ? 'text-orange-400' : 'text-slate-400'}`}>
                            {formatDate(item.expiryDate)}
                            {expired && <span className="ml-1 font-bold">(Expired)</span>}
                            {!expired && daysToExpiry !== null && daysToExpiry <= EXPIRING_SOON_DAYS && <span className="ml-1 text-orange-400">({daysToExpiry}d)</span>}
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
                              {canMoveDamaged && Number(item.damaged) > 0 && (
                                <>
                                  <button onClick={() => setDamagedAction({ item, mode: 'writeoff', source: 'damaged' })} className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-400/10 rounded-lg transition-colors" title="Write off damaged"><PackageX size={14} /></button>
                                  <button onClick={() => setDamagedAction({ item, mode: 'vendor', source: 'damaged' })} className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors" title="Return damaged to vendor"><Undo2 size={14} /></button>
                                </>
                              )}
                              {canMoveExpired && expired && Math.max(0, (item.quantity || 0) - (item.reserved || 0)) > 0 && (
                                <>
                                  <button onClick={() => setDamagedAction({ item, mode: 'writeoff', source: 'expired' })} className="p-1.5 text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors" title="Write off expired"><PackageX size={14} /></button>
                                  <button onClick={() => setDamagedAction({ item, mode: 'vendor', source: 'expired' })} className="p-1.5 text-red-400 hover:text-amber-400 hover:bg-amber-400/10 rounded-lg transition-colors" title="Return expired to vendor"><Undo2 size={14} /></button>
                                </>
                              )}
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
                              <button onClick={async () => {
                                if (!await confirm({ title: 'Delete this inventory batch?', danger: true, confirmLabel: 'Delete' })) return;
                                const res = await deleteInventoryItem(item.id);
                                toast(res?.ok ? 'Stock batch deleted.' : (res?.error || 'The batch could not be deleted.'), res?.ok ? 'success' : 'error');
                              }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
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
            <form onSubmit={handleSubmit} noValidate className="flex-1 overflow-y-auto custom-scrollbar p-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="sm:col-span-2">
                  <label htmlFor="inventory-product" className={labelCls}>Product *</label>
                  <select id="inventory-product" value={form.product} onChange={e => setForm({ ...form, product: e.target.value })} className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Product --</option>
                    {products.map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                  </select>
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="product" />
                </div>
                <div>
                  <label htmlFor="inventory-batch-number" className={labelCls}>Batch Number *</label>
                  <input id="inventory-batch-number" type="text" value={form.batchNumber} onChange={e => setForm({ ...form, batchNumber: e.target.value })} placeholder="e.g. RBH-2025-001" className={inputCls} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="batchNumber" />
                </div>
                <div>
                  <label htmlFor="inventory-expiry-date" className={labelCls}>Expiry Date</label>
                  <input id="inventory-expiry-date" type="date" value={form.expiryDate} onChange={e => setForm({ ...form, expiryDate: e.target.value })} className={inputCls} />
                </div>
                <div>
                  <label htmlFor="inventory-quantity" className={labelCls}>{editingItem ? 'Quantity' : 'Quantity *'}</label>
                  <input id="inventory-quantity" readOnly={!!editingItem} type="number" value={form.quantity} onChange={e => setForm({ ...form, quantity: e.target.value })} placeholder="0" className={inputCls + (editingItem ? ' opacity-60 cursor-not-allowed' : '')} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="quantity" />
                  {editingItem && <span className="block text-[10px] text-slate-500 mt-1">Use Adjust or Cycle Count to change it.</span>}
                </div>
                <div>
                  <label htmlFor="inventory-unit-cost" className={labelCls}>Unit Cost (₹)</label>
                  <input id="inventory-unit-cost" type="number" value={form.unitCost} onChange={e => setForm({ ...form, unitCost: e.target.value })} placeholder="0" className={inputCls} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="unitCost" />
                </div>
                <div>
                  <label htmlFor="inventory-reorder-level" className={labelCls}>Reorder Level</label>
                  <input id="inventory-reorder-level" type="number" value={form.reorderLevel} onChange={e => setForm({ ...form, reorderLevel: e.target.value })} className={inputCls} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="reorderLevel" />
                </div>
                <div>
                  <label htmlFor="inventory-warehouse" className={labelCls}>Warehouse</label>
                  <select id="inventory-warehouse" value={form.warehouse} onChange={e => setForm({ ...form, warehouse: e.target.value })} className={inputCls}>
                    {warehouses.map(w => <option key={w} value={w} className="bg-brand-primary">{w}</option>)}
                  </select>
                </div>
                <div>
                  <label htmlFor="inventory-reserved" className={labelCls}>Reserved</label>
                  <input id="inventory-reserved" type="number" value={form.reserved} onChange={e => setForm({ ...form, reserved: e.target.value })} className={inputCls} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="reserved" />
                </div>
                <div>
                  <label htmlFor="inventory-transit" className={labelCls}>Transit</label>
                  <input id="inventory-transit" type="number" value={form.transit} onChange={e => setForm({ ...form, transit: e.target.value })} className={inputCls} />
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="transit" />
                </div>
                <div>
                  <label htmlFor="inventory-damaged" className={labelCls}>Damaged</label>
                  <input id="inventory-damaged" type="number" value={form.damaged} onChange={e => setForm({ ...form, damaged: e.target.value })}
                    readOnly={!!editingItem && damagedLocked} title={editingItem && damagedLocked ? 'Changes only through Write off damaged or Return damaged to vendor (batch list)' : undefined}
                    className={`${inputCls} ${editingItem && damagedLocked ? 'opacity-60 cursor-not-allowed' : ''}`} />
                  {editingItem && damagedLocked && <p className="mt-1 text-[11px] text-slate-500">Read-only: use Write off or Return to vendor on the batch.</p>}
                  <FieldError errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} field="damaged" />
                </div>
              </div>
              <div className="mt-4"><ErrorSummary errors={addCheck.errors(addValues, INVENTORY_ADD_SPEC, batchExtra)} /></div>
              <div className="flex gap-3 justify-end mt-6 pt-4 border-t border-white/5">
                <button type="button" onClick={() => setIsAddOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" disabled={!!saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving === 'batch' ? 'Saving…' : editingItem ? 'Save Changes' : 'Add Batch'}</button>
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
            <form onSubmit={handleAdjust} noValidate className="space-y-4">
              <div>
                <label htmlFor="inventory-adjustment-to-add-to-subtract" className={labelCls}>Adjustment (+ to add, - to subtract)</label>
                <div className="flex gap-2">
                  <button type="button" onClick={() => setAdjustForm(f => ({ ...f, adjustment: f.adjustment === '' ? '-' : (Number(f.adjustment) < 0 ? String(-Number(f.adjustment)) : '-' + Math.abs(Number(f.adjustment))) }))}
                    className="p-2.5 glass-input rounded-xl text-red-400 hover:bg-red-400/10 transition-colors"><ArrowDown size={16} /></button>
                  <input id="inventory-adjustment-to-add-to-subtract" type="number" value={adjustForm.adjustment} onChange={e => setAdjustForm({ ...adjustForm, adjustment: e.target.value })} placeholder="e.g. 50 or -10" className={`${inputCls} flex-1`} />
                  <button type="button" onClick={() => setAdjustForm(f => ({ ...f, adjustment: f.adjustment === '' ? '' : String(Math.abs(Number(f.adjustment))) }))}
                    className="p-2.5 glass-input rounded-xl text-emerald-400 hover:bg-emerald-400/10 transition-colors"><ArrowUp size={16} /></button>
                </div>
                <FieldError errors={adjustCheck.errors(adjustForm, INVENTORY_ADJUST_SPEC, adjustBelowZero)} field="adjustment" />
              </div>
              <div>
                <label htmlFor="inventory-reason" className={labelCls}>Reason *</label>
                <input id="inventory-reason" type="text" value={adjustForm.reason} onChange={e => setAdjustForm({ ...adjustForm, reason: e.target.value })} placeholder="e.g. GRN received, Damaged goods, Stock count correction" className={inputCls} />
                <FieldError errors={adjustCheck.errors(adjustForm, INVENTORY_ADJUST_SPEC, adjustBelowZero)} field="reason" />
              </div>
              <ErrorSummary errors={adjustCheck.errors(adjustForm, INVENTORY_ADJUST_SPEC, adjustBelowZero)} />
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setIsAdjustOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" disabled={!!saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving === 'adjust' ? 'Saving…' : 'Apply Adjustment'}</button>
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
            <form onSubmit={handleTransfer} noValidate className="space-y-4">
              <div>
                <label htmlFor="inventory-destination-warehouse" className={labelCls}>Destination Warehouse *</label>
                <select id="inventory-destination-warehouse" required value={transferForm.toWarehouse} onChange={e => setTransferForm(f => ({ ...f, toWarehouse: e.target.value }))} className={inputCls}>
                  {warehouses.filter(w => w !== transferItem.warehouse).map(w => <option key={w} value={w} className="bg-brand-primary">{w}</option>)}
                </select>
              </div>
              <div>
                <label htmlFor="inventory-quantity-to-transfer-max" className={labelCls}>Quantity to Transfer * <span className="normal-case text-slate-500 font-normal">(max {transferItem.quantity})</span></label>
                <input id="inventory-quantity-to-transfer-max" type="number" value={transferForm.quantity} onChange={e => setTransferForm(f => ({ ...f, quantity: e.target.value }))} className={inputCls} />
                <FieldError errors={transferCheck.errors(transferForm, INVENTORY_TRANSFER_SPEC, transferExtra)} field="quantity" />
              </div>
              <div>
                <label htmlFor="inventory-notes" className={labelCls}>Notes</label>
                <input id="inventory-notes" type="text" value={transferForm.notes} onChange={e => setTransferForm(f => ({ ...f, notes: e.target.value }))} placeholder="e.g. Restocking Secondary Warehouse" className={inputCls} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setTransferItem(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" disabled={!!saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving === 'transfer' ? 'Saving…' : 'Transfer'}</button>
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
            <form onSubmit={handleCount} noValidate className="space-y-4">
              <div>
                <label htmlFor="inventory-physically-counted-quantity" className={labelCls}>Physically Counted Quantity *</label>
                <input id="inventory-physically-counted-quantity" type="number" value={countedQty} onChange={e => setCountedQty(e.target.value)} className={inputCls} autoFocus />
                <FieldError errors={countCheck.errors({ countedQty }, INVENTORY_COUNT_SPEC)} field="countedQty" />
              </div>
              {countedQty !== '' && Number(countedQty) !== countItem.quantity && (
                <div className={`rounded-xl p-3 border text-sm font-medium ${Number(countedQty) - countItem.quantity > 0 ? 'bg-emerald-500/10 border-emerald-500/20 text-emerald-400' : 'bg-rose-500/10 border-rose-500/20 text-rose-400'}`}>
                  Variance: {Number(countedQty) - countItem.quantity > 0 ? '+' : ''}{Number(countedQty) - countItem.quantity} units — will be reconciled.
                </div>
              )}
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setCountItem(null)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" disabled={!!saving} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{saving === 'count' ? 'Saving…' : 'Reconcile Count'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
