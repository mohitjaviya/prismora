import { useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { format } from 'date-fns';
import { Plus, Edit2, Trash2, Download } from 'lucide-react';
import { createPortal } from 'react-dom';
import { downloadCSV } from '../utils/exportUtils';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

const STATUSES = ['Pending', 'Processing', 'Shipped', 'Delivered', 'Cancelled'];

const Orders = () => {
  const { orders, addOrder, updateOrder, deleteOrder, products, addProduct } = useData();
  const { user, users: mockUsers, canAccessData, getAssignableUsers } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();
  
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState(null);
  const [highlightedRowId, setHighlightedRowId] = useState(null);
  const [isCustomProduct, setIsCustomProduct] = useState(false);
  const [salespersonFilter, setSalespersonFilter] = useState('');

  const baseVisibleOrders = orders.filter(o => canAccessData(o.assignedTo));
  const visibleOrders = salespersonFilter 
    ? baseVisibleOrders.filter(o => o.assignedTo === salespersonFilter)
    : baseVisibleOrders;

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
    assignedTo: user?.role === 'Sales' ? user.id : '',
    date: ''
  });

  const handleOpenModal = (order = null) => {
    if (order) {
      setEditingOrder(order);
      setFormData({
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
        assignedTo: user?.role === 'Sales' ? user.id : '',
        date: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  const closeModal = () => {
    setIsModalOpen(false);
    setIsCustomProduct(false);
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
      case 'Shipped': return 'bg-purple-500/10 text-purple-400 border-purple-500/20';
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
          {(user?.role === 'Admin' || user?.role === 'Manager') && (
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
                {user?.role !== 'Sales' && <th className="px-6 py-4 font-medium">Salesperson</th>}
                <th className="px-6 py-4 font-medium">Status</th>
                <th className="px-6 py-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {visibleOrders.length > 0 ? visibleOrders.map((order) => (
                <tr key={order.id} id={`order-row-${order.id}`} className={`hover:bg-brand-primary-lighter/30 transition-colors ${highlightedRowId === order.id ? 'bg-brand-accent/20' : ''}`}>
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{order.id}</div>
                    <div className="text-xs text-slate-500">{format(new Date(order.date), 'MMM dd, yyyy')}</div>
                  </td>
                  <td className="px-6 py-4">
                    <div className="font-medium text-white">{order.customerName}</div>
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
                  {user?.role !== 'Sales' && (
                    <td className="px-6 py-4 text-slate-400">
                      {getSalespersonName(order.assignedTo)}
                    </td>
                  )}
                  <td className="px-6 py-4">
                    <span className={`px-2.5 py-1 rounded-full text-xs font-medium border ${getStatusColor(order.status)}`}>
                      {order.status}
                    </span>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <button onClick={() => handleOpenModal(order)} className="text-blue-400 hover:text-blue-300 mr-3">
                      <Edit2 size={16} />
                    </button>
                    <button onClick={() => deleteOrder(order.id)} className="text-red-400 hover:text-red-300">
                      <Trash2 size={16} />
                    </button>
                  </td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={user?.role !== 'Sales' ? "7" : "6"} className="px-6 py-8 text-center text-slate-500">
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
            
            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-5">
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Customer Name *</label>
                  <input required type="text" value={formData.customerName} onChange={e => setFormData({...formData, customerName: e.target.value})} className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-400 mb-1 uppercase tracking-wider">Company Name</label>
                  <input type="text" value={formData.companyName} onChange={e => setFormData({...formData, companyName: e.target.value})} className="w-full glass-input rounded-xl px-4 py-2.5 text-white focus:ring-1 focus:ring-brand-accent" />
                </div>
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
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Quantity</label>
                  <input type="number" required value={formData.quantity} onChange={e => setFormData({...formData, quantity: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Order Value (₹)</label>
                  <input type="number" required value={formData.value} onChange={e => setFormData({...formData, value: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">State</label>
                  <input type="text" required value={formData.state} onChange={e => setFormData({...formData, state: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">City</label>
                  <input type="text" required value={formData.city} onChange={e => setFormData({...formData, city: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white" />
                </div>
                
                {user?.role !== 'Sales' && (
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
                
                <div>
                  <label className="block text-sm font-medium text-slate-300 mb-1.5">Status</label>
                  <select value={formData.status} onChange={e => setFormData({...formData, status: e.target.value})} className="w-full glass-input rounded-lg px-4 py-2.5 text-white">
                    {STATUSES.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                  </select>
                </div>
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
    </div>
  );
};

export default Orders;

