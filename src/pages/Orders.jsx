import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth, isSalesRole, isAdminRole, isManagerRole } from '../context/AuthContext';
import { format } from 'date-fns';
import { Plus, Edit2, Trash2, Download, Package, CheckCircle } from 'lucide-react';
import { createPortal } from 'react-dom';
import { downloadCSV } from '../utils/exportUtils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const STATUSES = ['Pending', 'Processing', 'Ready for Dispatch', 'Shipped', 'Delivered', 'Cancelled'];

// Which role "owns" moving an order into a given status — enforces the
// Sales → Warehouse → Dispatch fulfillment hierarchy. Super Admin/Admin can
// always override.
const STATUS_STAGE_OWNERS = {
  'Processing': ['Sales Executive', 'Sales Manager', 'Sales', 'Manager'],
  'Ready for Dispatch': ['Warehouse Manager'],
  'Shipped': ['Dispatch Team'],
  'Delivered': ['Dispatch Team'],
  'Cancelled': ['Sales Executive', 'Sales Manager', 'Sales', 'Manager'],
};
const ADMIN_OVERRIDE_ROLES = ['Super Admin', 'Admin'];

const canSetOrderStatus = (role, targetStatus) => {
  if (ADMIN_OVERRIDE_ROLES.includes(role)) return true;
  if (targetStatus === 'Pending') return true;
  return (STATUS_STAGE_OWNERS[targetStatus] || []).includes(role);
};

const INDIAN_STATES = [
  'Andhra Pradesh', 'Arunachal Pradesh', 'Assam', 'Bihar', 'Chhattisgarh',
  'Goa', 'Gujarat', 'Haryana', 'Himachal Pradesh', 'Jharkhand',
  'Karnataka', 'Kerala', 'Madhya Pradesh', 'Maharashtra', 'Manipur',
  'Meghalaya', 'Mizoram', 'Nagaland', 'Odisha', 'Punjab',
  'Rajasthan', 'Sikkim', 'Tamil Nadu', 'Telangana', 'Tripura',
  'Uttar Pradesh', 'Uttarakhand', 'West Bengal',
  'Delhi', 'Jammu & Kashmir', 'Ladakh', 'Puducherry', 'Chandigarh'
];

const Orders = () => {
  const { orders, addOrder, updateOrder, deleteOrder, products, addProduct, leads, inventory, splitOrder, deliverPartial } = useData();
  const { user, users: mockUsers, canAccessData, getAssignableUsers } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('');
  const [statusError, setStatusError] = useState('');
  const [isSplitModalOpen, setIsSplitModalOpen] = useState(false);
  const [splitQuantities, setSplitQuantities] = useState({});
  const [isPartialModalOpen, setIsPartialModalOpen] = useState(false);
  const [partialQty, setPartialQty] = useState('');

  // Warehouse Manager / Dispatch Team fulfill orders across every sales rep,
  // so they aren't restricted to the row-level "my own orders" visibility
  // that applies to Sales roles.
  const isFulfillmentRole = user?.role === 'Warehouse Manager' || user?.role === 'Dispatch Team';
  const baseVisibleOrders = orders.filter(o => isFulfillmentRole || canAccessData(o.assignedTo));

  const getAvailableQty = (productName) => inventory
    .filter(b => b.product === productName)
    .reduce((sum, b) => sum + Math.max(0, (b.quantity || 0) - (b.reserved || 0)), 0);

  const getStockShortfalls = (order) => {
    const lineItems = Array.isArray(order.items) && order.items.length > 0
      ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
      : [{ name: order.product, quantity: Number(order.quantity || 0) }];
    return lineItems
      .map(li => ({ ...li, available: getAvailableQty(li.name) }))
      .filter(li => li.name && li.available < li.quantity);
  };

  const attemptSetStatus = (targetStatus) => {
    if (!canSetOrderStatus(user?.role, targetStatus)) {
      const owners = STATUS_STAGE_OWNERS[targetStatus];
      setStatusError(`Only ${owners ? owners.join('/') : 'Admin'} can set this status.`);
      return;
    }
    // Block ALL forward fulfillment stages when stock is short — you can't
    // dispatch, ship, or deliver goods you don't physically have. (Delivered
    // was previously unguarded, allowing "delivery" with no stock.)
    if (['Ready for Dispatch', 'Shipped', 'Delivered'].includes(targetStatus)) {
      const shortfalls = getStockShortfalls(formData);
      if (shortfalls.length > 0) {
        setStatusError(`Insufficient stock to ${targetStatus === 'Delivered' ? 'deliver' : 'dispatch'} — ${shortfalls.map(s => `${s.name} (need ${s.quantity}, have ${s.available})`).join('; ')}. Split the order to fulfil what's available.`);
        return;
      }
    }
    setStatusError('');
    setFormData(prev => ({ ...prev, status: targetStatus }));
  };

  // Offer split whenever an order that hasn't shipped yet is short on stock and
  // at least one unit can actually ship now.
  const canSplitOrder = () => {
    if (!editingOrder || !['Pending', 'Processing', 'Ready for Dispatch'].includes(formData.status)) return false;
    const shortfalls = getStockShortfalls(formData);
    if (shortfalls.length === 0) return false;
    const lineItems = Array.isArray(formData.items) && formData.items.length > 0
      ? formData.items.map(i => ({ name: i.name }))
      : [{ name: formData.product }];
    return lineItems.some(li => getAvailableQty(li.name) > 0);
  };

  const orderLineItems = (order) => Array.isArray(order.items) && order.items.length > 0
    ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
    : [{ name: order.product, quantity: Number(order.quantity || 0) }];

  const openSplitModal = () => {
    if (!editingOrder) return;
    const defaults = {};
    orderLineItems(formData).forEach(li => {
      defaults[li.name] = Math.min(li.quantity, Math.max(0, getAvailableQty(li.name)));
    });
    setSplitQuantities(defaults);
    setIsSplitModalOpen(true);
  };

  const confirmSplitOrder = () => {
    if (!editingOrder) return;
    splitOrder(editingOrder.id, splitQuantities);
    setIsSplitModalOpen(false);
    closeModal();
  };

  // Partial delivery applies to single-product orders (multi-item orders use Split)
  const isSingleProduct = (order) => !(Array.isArray(order.items) && order.items.length > 1);
  const orderRemainingQty = (order) => Number(order.quantity || 0) - Number(order.deliveredQty || 0);

  const canPartialDeliver = () => {
    if (!editingOrder || !isSingleProduct(formData)) return false;
    if (['Delivered', 'Cancelled'].includes(formData.status)) return false;
    const remaining = orderRemainingQty(formData);
    const avail = getAvailableQty(formData.product);
    return remaining > 0 && avail > 0 && avail < remaining; // short but some stock
  };

  const openPartialModal = () => {
    if (!editingOrder) return;
    const suggested = Math.min(orderRemainingQty(formData), Math.max(0, getAvailableQty(formData.product)));
    setPartialQty(String(suggested));
    setIsPartialModalOpen(true);
  };

  const confirmPartialDelivery = () => {
    if (!editingOrder) return;
    const qty = Number(partialQty);
    if (qty <= 0) return;
    deliverPartial(editingOrder.id, qty);
    setIsPartialModalOpen(false);
    closeModal();
  };

  // Sales roles hand off fulfillment entirely — they get one action
  // ("Assign to Warehouse Manager") instead of the full pipeline stepper.
  const isSalesOnlyRole = STATUS_STAGE_OWNERS['Processing'].includes(user?.role);
  const visibleOrders = (salespersonFilter 
    ? baseVisibleOrders.filter(o => o.assignedTo === salespersonFilter)
    : baseVisibleOrders)
    .sort((a, b) => {
      const dateA = new Date(a.date || a.createdAt || 0).getTime();
      const dateB = new Date(b.date || b.createdAt || 0).getTime();
      if (dateA !== dateB) return dateB - dateA;
      const numA = parseInt(a.id.replace('O', ''), 10) || 0;
      const numB = parseInt(b.id.replace('O', ''), 10) || 0;
      return numB - numA;
    });

  useEffect(() => {
    const searchId = searchParams.get('searchId');
    if (searchId) {
      const targetOrder = visibleOrders.find(o => o.id === searchId);
      if (targetOrder) {
        setTimeout(() => {
          const element = document.getElementById(`order-row-${searchId}`);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
            setHighlightedRowId(searchId);
            setTimeout(() => setHighlightedRowId(null), 3000);
          }
        }, 100);
        navigate('/orders', { replace: true });
      }
    }
  }, [searchParams, visibleOrders, navigate]);

  const [formData, setFormData] = useState({
    customerName: '', companyName: '', product: '', quantity: '', value: '',
    state: '', city: '', status: 'Pending',
    assignedTo: isSalesRole(user?.role) ? user.id : '',
    date: '', phone: '', email: ''
  });

  const handleOpenModal = (order = null) => {
    setStatusError('');
    if (order) {
      setEditingOrder(order);
      setFormData({
        phone: '',
        email: '',
        ...order,
        date: order.date ? order.date.split('T')[0] : ''
      });
      const safeProducts = products || [];
      if (order.product && !safeProducts.includes(order.product)) {
        setIsCustomProduct(true);
      } else {
        setIsCustomProduct(false);
      }
    } else {
      setEditingOrder(null);
      setIsCustomProduct(false);
      setFormData({
        customerName: '', companyName: '', product: '', quantity: '', value: '',
        state: '', city: '', status: 'Pending',
        assignedTo: isSalesRole(user?.role) ? user.id : '',
        date: new Date().toISOString().split('T')[0],
        phone: '', email: ''
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsCustomProduct(false);
    setStatusError('');
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    
    // Save custom product to global catalog if new
    if (formData.product && formData.product.trim() !== '') {
      addProduct(formData.product);
    }

    const dataToSave = {
      ...formData,
      quantity: Number(formData.quantity),
      value: Number(formData.value),
      date: formData.date ? new Date(formData.date).toISOString() : new Date().toISOString()
    };

    if (editingOrder) {
      updateOrder(editingOrder.id, dataToSave);
    } else {
      addOrder(dataToSave);
    }
    closeModal();
  };

  const getStatusColor = (status) => {
    switch (status) {
      case 'Pending': return 'bg-yellow-500/10 text-yellow-400 border-yellow-500/20';
      case 'Processing': return 'bg-blue-500/10 text-blue-400 border-blue-500/20';
      case 'Ready for Dispatch': return 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20';
      case 'Shipped': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
      case 'Partially Delivered': return 'bg-teal-500/10 text-teal-400 border-teal-500/20';
      case 'Delivered': return 'bg-green-500/10 text-green-400 border-green-500/20';
      case 'Cancelled': return 'bg-red-500/10 text-red-400 border-red-500/20';
      default: return 'bg-slate-500/10 text-slate-400 border-slate-500/20';
    }
  };

  const getSalespersonName = (id) => {
    const sp = mockUsers.find(u => u.id === id);
    return sp ? sp.name : 'Unknown';
  };

  const handleExport = () => {
    const formattedData = visibleOrders.map(o => ({
      ...o,
      Company: o.companyName || 'N/A',
      date: o.date ? format(new Date(o.date), 'yyyy-MM-dd') : 'None',
      salesperson: mockUsers.find(u => u.id === o.assignedTo)?.name || 'Unassigned'
    }));
    downloadCSV(formattedData, 'PRISMORA_Orders');
  };

  return (
    <div className="space-y-6 flex flex-col h-full">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-white">Order Management</h1>
          <p className="text-slate-400 text-sm">Track and monitor all product orders.</p>
        </div>
        <div className="flex gap-3 items-center">
          {(isAdminRole(user?.role) || isManagerRole(user?.role)) && (
            <select
              value={salespersonFilter}
              onChange={e => setSalespersonFilter(e.target.value)}
              className="glass-panel text-white text-sm px-3 py-2.5 rounded-xl border border-white/5 focus:ring-1 focus:ring-brand-accent appearance-none pr-8 bg-[url('data:image/svg+xml;charset=US-ASCII,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%22292.4%22%20height%3D%22292.4%22%3E%3Cpath%20fill%3D%22%23cbd5e1%22%20d%3D%22M287%2069.4a17.6%2017.6%200%200%200-13-5.4H18.4c-5%200-9.3%201.8-12.9%205.4A17.6%2017.6%200%200%200%200%2082.2c0%205%201.8%209.3%205.4%2012.9l128%20127.9c3.6%203.6%207.8%205.4%2012.8%205.4s9.2-1.8%2012.8-5.4L287%2095c3.5-3.5%205.4-7.8%205.4-12.8%200-5-1.9-9.2-5.4-12.8z%22%2F%3E%3C%2Fsvg%3E')] bg-no-repeat bg-[length:10px_10px] bg-[position:right_10px_center] max-w-[160px]"
            >
              <option value="" className="bg-brand-primary">All Salespeople</option>
              {getAssignableUsers().map(u => (
                <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
              ))}
            </select>
          )}

          <button 
            onClick={handleExport}
            className="glass-panel hover:bg-brand-primary-lighter/80 text-white font-medium px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5"
          >
            <Download size={18} className="text-brand-accent" />
            <span className="hidden sm:inline">Export</span>
          </button>
          <button 
            onClick={() => handleOpenModal()}
            className="bg-gradient-to-r from-brand-accent to-brand-accent-dark hover:from-brand-accent-light hover:to-brand-accent text-brand-primary font-bold px-5 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:scale-105 shadow-lg shadow-brand-accent/20"
          >
            <Plus size={18} />
            <span className="hidden sm:inline">Add Order</span>
          </button>
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm text-slate-300">
            <thead className="bg-brand-primary-lighter/50 text-slate-400 border-b border-slate-700/50">
              <tr>
                <th className="px-6 py-4 font-medium">Order ID / Date</th>
                <th className="px-6 py-4 font-medium">Customer & Location</th>
                <th className="px-6 py-4 font-medium">Product Details</th>
                <th className="px-6 py-4 font-medium">Value</th>
                {!isSalesRole(user?.role) && <th className="px-6 py-4 font-medium">Salesperson</th>}
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {visibleOrders.length > 0 ? visibleOrders.map((order) => {
                const getSafeDateStr = (dateStr) => {
                  try {
                    if (!dateStr) return 'N/A';
                    const d = new Date(dateStr);
                    if (isNaN(d.getTime())) return 'N/A';
                    return format(d, 'MMM dd, yyyy');
                  } catch {
                    return 'N/A';
                  }
                };

                return (
                  <tr 
                    key={order.id} 
                    id={`order-row-${order.id}`} 
                    onClick={() => handleOpenModal(order)}
                    className={`hover:bg-brand-primary-lighter/30 transition-colors cursor-pointer ${highlightedRowId === order.id ? 'bg-brand-accent/20' : ''}`}
                  >
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{order.id}</div>
                      <div className="text-xs text-slate-500">{getSafeDateStr(order.date)}</div>
                      {order.splitFromOrderId && (
                        <div className="text-[10px] font-semibold text-cyan-400 mt-1">↳ Split from {order.splitFromOrderId}</div>
                      )}
                      {order.splitIntoOrderId && (
                        <div className="text-[10px] font-semibold text-cyan-400 mt-1">→ Backorder: {order.splitIntoOrderId}</div>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      <div className="font-medium text-white">{order.customerName}</div>
                      {(order.phone || order.email) && (
                        <div className="text-xs text-brand-accent mt-0.5 font-medium">
                          {order.phone || '—'} • {order.email || '—'}
                        </div>
                      )}
                      <div className="text-xs text-slate-500 mt-0.5">{order.companyName || 'N/A'}</div>
                      <div className="text-xs text-slate-500">{order.city}, {order.state}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-brand-accent">{order.product}</div>
                      <div className="text-xs text-slate-400">Qty: {order.quantity}</div>
                    </td>
                    <td className="px-6 py-4 font-medium">
                      ₹{order.value.toLocaleString()}
                    </td>
                    {!isSalesRole(user?.role) && (
                      <td className="px-6 py-4 text-slate-400">
                        {getSalespersonName(order.assignedTo)}
                      </td>
                    )}
                    <td className="px-6 py-4">
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                        {order.status}
                      </span>
                      {order.status === 'Partially Delivered' && (
                        <div className="mt-1.5 text-[10px] font-semibold text-teal-400">
                          {order.deliveredQty || 0} / {order.quantity} delivered · {order.quantity - (order.deliveredQty || 0)} pending
                        </div>
                      )}
                      {order.receivedByDistributor && (
                        <div className="mt-1.5 flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                          <CheckCircle size={10} /> Receipt Confirmed
                        </div>
                      )}
                    </td>
                    <td className="px-6 py-4 text-right" onClick={(e) => e.stopPropagation()}>
                      <button onClick={() => handleOpenModal(order)} className="text-blue-400 hover:text-blue-300 mr-3">
                        <Edit2 size={16} />
                      </button>
                      <button onClick={() => deleteOrder(order.id)} className="text-red-400 hover:text-red-300">
                        <Trash2 size={16} />
                      </button>
                    </td>
                  </tr>
                );
              }) : (
                <tr>
                  <td colSpan={!isSalesRole(user?.role) ? "7" : "6"} className="px-6 py-8 text-center text-slate-500">
                    No orders found.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-brand-primary/80 backdrop-blur-sm">
          <div className="bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto custom-scrollbar">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center sticky top-0 bg-brand-primary-light z-10">
              <h2 className="text-xl font-bold text-white">{editingOrder ? 'Edit Order' : 'Add New Order'}</h2>
              <button onClick={closeModal} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            
            <form onSubmit={handleSubmit} className="p-6 space-y-6">
              {/* Status Timeline Stepper (only for existing orders) */}
              {editingOrder && (
                <div className="bg-brand-primary-lighter/40 rounded-xl p-4 border border-white/5 mb-2">
                  <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block mb-3">Order Status Journey</span>
                  {formData.status === 'Cancelled' ? (
                    <div className="flex items-center justify-center gap-2 text-red-400 font-bold text-sm bg-red-500/10 border border-red-500/20 py-2.5 rounded-lg">
                      ⚠️ This order has been Cancelled
                    </div>
                  ) : isSalesOnlyRole ? (
                    formData.status === 'Pending' ? (
                      <div className="flex items-center justify-between gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(formData.status)}`}>{formData.status}</span>
                        <div className="flex gap-2">
                          <button type="button" onClick={() => attemptSetStatus('Cancelled')} className="px-3 py-2 text-xs font-semibold text-red-400 hover:bg-red-500/10 rounded-lg transition-colors">Cancel Order</button>
                          <button type="button" onClick={() => attemptSetStatus('Processing')} className="btn-accent px-4 py-2 rounded-lg text-xs font-bold">Assign to Warehouse Manager</button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center gap-3">
                        <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(formData.status)}`}>{formData.status}</span>
                        <span className="text-xs text-slate-400">This order is now with the Warehouse/Dispatch team — you can no longer change its status.</span>
                      </div>
                    )
                  ) : (
                    <div className="relative flex items-center justify-between">
                      {/* Stepper Progress Line */}
                      <div className="absolute left-6 right-6 top-4 -translate-y-1/2 h-0.5 bg-slate-700 pointer-events-none">
                        <div 
                          className="h-full bg-brand-accent transition-all duration-500"
                          style={{
                            width: `${
                              (STATUSES.filter(s => s !== 'Cancelled').indexOf(formData.status) / (STATUSES.filter(s => s !== 'Cancelled').length - 1)) * 100
                            }%`
                          }}
                        />
                      </div>
                      
                      {/* Steps */}
                      {STATUSES.filter(s => s !== 'Cancelled').map((status, idx) => {
                        const activeIdx = STATUSES.filter(s => s !== 'Cancelled').indexOf(formData.status);
                        const isCompleted = idx < activeIdx;
                        const isActive = idx === activeIdx;
                        
                        const isAllowed = canSetOrderStatus(user?.role, status);

                        return (
                          <button
                            key={status}
                            type="button"
                            onClick={() => attemptSetStatus(status)}
                            className={`relative z-10 flex flex-col items-center group focus:outline-none ${!isAllowed ? 'opacity-50' : ''}`}
                          >
                            <div
                              className={`w-8 h-8 rounded-full border-2 flex items-center justify-center font-bold text-xs transition-all duration-300 ${
                                isActive
                                  ? 'bg-brand-accent border-brand-accent text-white shadow-lg shadow-brand-accent/30 scale-110'
                                  : isCompleted
                                    ? 'bg-brand-primary border-brand-accent text-brand-accent'
                                    : 'bg-brand-primary border-slate-700 text-slate-500 hover:border-slate-500 hover:text-slate-300'
                              }`}
                            >
                              {isCompleted ? '✓' : idx + 1}
                            </div>
                            <span 
                              className={`text-[10px] mt-2 font-medium transition-colors ${
                                isActive 
                                  ? 'text-brand-accent font-bold' 
                                  : isCompleted 
                                    ? 'text-slate-300' 
                                    : 'text-slate-500 group-hover:text-slate-400'
                              }`}
                            >
                              {status}
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {statusError && (
                <div className="flex flex-col gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3 text-sm text-red-400 font-medium -mt-2">
                  <div className="flex items-start gap-2">⚠️ {statusError}</div>
                  <div className="flex flex-wrap gap-2">
                    {canPartialDeliver() && (
                      <button type="button" onClick={openPartialModal} className="px-3 py-1.5 text-xs font-bold bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 rounded-lg transition-colors">
                        Deliver {getAvailableQty(formData.product)} Now (Partial)
                      </button>
                    )}
                    {canSplitOrder() && (
                      <button type="button" onClick={openSplitModal} className="px-3 py-1.5 text-xs font-bold bg-red-500/20 hover:bg-red-500/30 text-red-300 rounded-lg transition-colors">
                        Split into Backorder
                      </button>
                    )}
                  </div>
                </div>
              )}

              {editingOrder && formData.splitFromOrderId && (
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 text-sm text-cyan-400 font-medium -mt-2">
                  This order was split from <strong>{formData.splitFromOrderId}</strong> (backordered remainder awaiting restock).
                </div>
              )}

              {editingOrder && formData.splitIntoOrderId && (
                <div className="flex items-center gap-2 bg-cyan-500/10 border border-cyan-500/20 rounded-xl px-4 py-3 text-sm text-cyan-400 font-medium -mt-2">
                  Remaining quantity that couldn't be fulfilled was split into <strong>{formData.splitIntoOrderId}</strong>.
                </div>
              )}

              {editingOrder && formData.receivedByDistributor && (
                <div className="flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400 font-medium -mt-2">
                  <CheckCircle size={16} className="flex-shrink-0" />
                  Distributor confirmed receipt on {formData.receivedAt ? format(new Date(formData.receivedAt), 'MMM dd, yyyy') : 'N/A'}
                </div>
              )}

              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Customer Name *</label>
                  <input 
                    required 
                    type="text" 
                    value={formData.customerName} 
                    onChange={e => {
                      const val = e.target.value;
                      const matchedLead = leads?.find(l => l.name?.toLowerCase() === val.toLowerCase());
                      if (matchedLead) {
                        setFormData(prev => ({
                          ...prev,
                          customerName: val,
                          companyName: prev.companyName || matchedLead.company || '',
                          phone: prev.phone || matchedLead.phone || '',
                          email: prev.email || matchedLead.email || '',
                          state: prev.state || matchedLead.state || '',
                          city: prev.city || matchedLead.city || '',
                          product: prev.product || (Array.isArray(matchedLead.productInterest) ? matchedLead.productInterest[0] : (matchedLead.productInterest || '')),
                          value: prev.value || matchedLead.dealValue || ''
                        }));
                      } else {
                        setFormData(prev => ({
                          ...prev,
                          customerName: val
                        }));
                      }
                    }} 
                    className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent" 
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Company Name</label>
                  <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Contact Phone</label>
                  <input type="text" placeholder="e.g. 9876543210" value={formData.phone || ''} onChange={e => setFormData({...formData, phone: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1.5">Contact Email</label>
                  <input type="email" placeholder="e.g. client@prismora.com" value={formData.email || ''} onChange={e => setFormData({...formData, email: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                                {!(Array.isArray(formData.items) && formData.items.length > 0) && (
                                <div className="col-span-2">
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Product</label>
                  {isCustomProduct ? (
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        required
                        value={formData.product} 
                        onChange={e => setFormData({...formData, product: e.target.value})} 
                        className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                        placeholder="Type new product name..."
                        autoFocus
                      />
                      <button type="button" onClick={() => { setIsCustomProduct(false); setFormData({...formData, product: ''}); }} className="px-3 py-2 bg-brand-primary border border-slate-700/50 rounded-lg hover:bg-white/10 text-slate-400 transition-colors">✕</button>
                    </div>
                  ) : (
                    <select
                      value={formData.product || ''}
                      onChange={e => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsCustomProduct(true);
                          setFormData({...formData, product: ''});
                        } else {
                          setFormData({...formData, product: e.target.value});
                        }
                      }}
                      className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                    >
                      <option value="" className="bg-brand-primary text-slate-500">-- Select a product --</option>
                      {(products || []).map(p => <option key={p} value={p} className="bg-brand-primary">{p}</option>)}
                      <option value="__ADD_NEW__" className="bg-brand-primary text-brand-accent font-bold">+ Add Custom Product</option>
                    </select>
                  )}
                  {formData.product && !isCustomProduct && (() => {
                    const avail = getAvailableQty(formData.product);
                    return (
                      <p className={`mt-1.5 text-xs font-medium ${avail > 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                        {avail > 0 ? `✓ ${avail.toLocaleString('en-IN')} available in stock` : '⚠ Out of stock'}
                      </p>
                    );
                  })()}
                </div>
                )}
                {Array.isArray(formData.items) && formData.items.length > 0 && (
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Itemized Breakdown</label>
                    <div className="border border-slate-700/50 rounded-lg overflow-hidden">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-brand-primary-lighter/40 text-slate-400 text-xs uppercase">
                            <th className="p-2.5 text-left">Product</th>
                            <th className="p-2.5 text-right">Qty</th>
                            <th className="p-2.5 text-right">Rate</th>
                            <th className="p-2.5 text-right">Total</th>
                            <th className="p-2.5 text-right">Available</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-700/50 text-slate-300">
                          {formData.items.map((item, idx) => {
                            const avail = getAvailableQty(item.name);
                            return (
                              <tr key={idx}>
                                <td className="p-2.5 flex items-center gap-1.5"><Package size={12} className="text-brand-accent flex-shrink-0" />{item.name}</td>
                                <td className="p-2.5 text-right">{item.quantity}</td>
                                <td className="p-2.5 text-right">₹{Number(item.unitPrice || 0).toLocaleString('en-IN')}</td>
                                <td className="p-2.5 text-right font-medium text-white">₹{Number(item.total || 0).toLocaleString('en-IN')}</td>
                                <td className={`p-2.5 text-right font-medium ${avail >= item.quantity ? 'text-emerald-400' : 'text-red-400'}`}>{avail.toLocaleString('en-IN')}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Quantity</label>
                  <input type="number" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Order Value (₹)</label>
                  <input type="number" required value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">State *</label>
                  <select
                    required
                    value={formData.state}
                    onChange={e => setFormData({...formData, state: e.target.value})}
                    className="w-full glass-input rounded-lg px-4 py-2.5 text-white"
                  >
                    <option value="" className="bg-brand-primary text-slate-500">-- Select State --</option>
                    {INDIAN_STATES.map(s => (
                      <option key={s} value={s} className="bg-brand-primary">{s}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">City *</label>
                  <input type="text" required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} placeholder="e.g. Mumbai, Pune..." className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                
                {!isSalesRole(user?.role) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Assign To</label>
                    <select value={formData.assignedTo} onChange={e => setFormData({...formData, assignedTo: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white">
                      <option value="" className="bg-brand-primary">Select Salesperson</option>
                      {getAssignableUsers().map(u => (
                        <option key={u.id} value={u.id} className="bg-brand-primary">{u.name}</option>
                      ))}
                    </select>
                  </div>
                )}
                
                {!(editingOrder && isSalesOnlyRole) && (
                  <div>
                    <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                    <select value={formData.status} onChange={e => attemptSetStatus(e.target.value)} className="w-full glass-input rounded-lg px-4 py-2.5 text-white">
                      {STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                    </select>
                    {statusError && (
                      <p className="mt-1.5 text-xs font-medium text-red-400">⚠️ {statusError}</p>
                    )}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Order Date</label>
                  <input type="date" required value={formData.date} onChange={e => setFormData({...formData, date: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" style={{ colorScheme: 'dark' }} />
                </div>
              </div>
              
              <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-slate-700/50">
                <button type="button" onClick={closeModal} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
                <button type="submit" className="px-5 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-brand-accent-light hover:shadow-lg hover:shadow-brand-accent/20 transition-all">
                  {editingOrder ? 'Update Order' : 'Save Order'}
                </button>
              </div>
            </form>
          </div>
        </div>
      , document.body)}

      {isPartialModalOpen && editingOrder && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsPartialModalOpen(false)} />
          <div className="relative bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-md z-10">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Partial Delivery — {editingOrder.id}</h2>
              <button onClick={() => setIsPartialModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <div className="bg-brand-primary-lighter/30 rounded-xl p-3 border border-white/5 text-xs text-slate-400 space-y-1">
                <div className="flex justify-between"><span>Product:</span><span className="text-white font-medium">{formData.product}</span></div>
                <div className="flex justify-between"><span>Ordered:</span><span className="text-white font-medium">{formData.quantity}</span></div>
                <div className="flex justify-between"><span>Already delivered:</span><span className="text-white font-medium">{formData.deliveredQty || 0}</span></div>
                <div className="flex justify-between"><span>Remaining:</span><span className="text-white font-medium">{orderRemainingQty(formData)}</span></div>
                <div className="flex justify-between"><span>In stock now:</span><span className="text-brand-accent font-bold">{getAvailableQty(formData.product)}</span></div>
              </div>
              <div>
                <label className="block text-sm font-medium text-slate-300 mb-1.5">Quantity to deliver now *</label>
                <input type="number" min="1" max={Math.min(orderRemainingQty(formData), getAvailableQty(formData.product))} value={partialQty}
                  onChange={e => setPartialQty(e.target.value)} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" autoFocus />
                <p className="mt-1.5 text-xs text-slate-500">Max {Math.min(orderRemainingQty(formData), getAvailableQty(formData.product))} (limited by stock & remaining qty). The rest stays pending on this order.</p>
              </div>
              {Number(partialQty) > 0 && (
                <div className="bg-teal-500/10 border border-teal-500/20 rounded-xl p-3 text-sm text-teal-400 font-medium">
                  After this: {(Number(formData.deliveredQty || 0) + Number(partialQty))} / {formData.quantity} delivered.
                  {(Number(formData.deliveredQty || 0) + Number(partialQty)) >= Number(formData.quantity) ? ' Order will be fully Delivered.' : ' Order will be Partially Delivered.'}
                </div>
              )}
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button type="button" onClick={() => setIsPartialModalOpen(false)} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
              <button type="button" onClick={confirmPartialDelivery} className="px-5 py-2 bg-emerald-500/90 hover:bg-emerald-500 text-white font-bold rounded-lg transition-all">Confirm Delivery</button>
            </div>
          </div>
        </div>, document.body
      )}

      {isSplitModalOpen && editingOrder && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsSplitModalOpen(false)} />
          <div className="relative bg-brand-primary-light border border-slate-700 rounded-xl shadow-2xl w-full max-w-lg z-10">
            <div className="px-6 py-4 border-b border-slate-700 flex justify-between items-center">
              <h2 className="text-lg font-bold text-white">Split Order {editingOrder.id}</h2>
              <button onClick={() => setIsSplitModalOpen(false)} className="text-slate-400 hover:text-white transition-colors">✕</button>
            </div>
            <div className="p-6 space-y-4">
              <p className="text-sm text-slate-400">Enter how many units of each product to ship now. The rest moves into a new backorder that stays in Processing until it's restocked.</p>
              {orderLineItems(formData).map(li => (
                <div key={li.name} className="flex items-center justify-between gap-4">
                  <div>
                    <p className="text-sm font-medium text-white">{li.name}</p>
                    <p className="text-xs text-slate-500">Ordered: {li.quantity} · Available: {getAvailableQty(li.name)}</p>
                  </div>
                  <input
                    type="number"
                    min="0"
                    max={li.quantity}
                    value={splitQuantities[li.name] ?? 0}
                    onChange={e => {
                      const val = Math.max(0, Math.min(li.quantity, Number(e.target.value)));
                      setSplitQuantities(prev => ({ ...prev, [li.name]: val }));
                    }}
                    className="w-28 glass-input rounded-lg px-3 py-2 text-white text-right"
                  />
                </div>
              ))}
            </div>
            <div className="px-6 py-4 border-t border-slate-700 flex justify-end gap-3">
              <button type="button" onClick={() => setIsSplitModalOpen(false)} className="px-5 py-2 text-slate-300 hover:bg-brand-primary-lighter rounded-lg transition-colors font-medium">Cancel</button>
              <button type="button" onClick={confirmSplitOrder} className="px-5 py-2 bg-brand-accent text-brand-primary font-bold rounded-lg hover:bg-brand-accent-light transition-all">Confirm Split</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
};

export default Orders;

