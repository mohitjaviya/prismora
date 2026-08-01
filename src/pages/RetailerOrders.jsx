import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import {
  ShoppingCart, Plus, Trash2, X, Package, Tag, Truck, CheckCircle, Clock, PackageCheck
} from 'lucide-react';
import { isSchemeEligible } from '../utils/schemeUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const statusConfig = {
  'Pending':    { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock size={12} /> },
  'Processing': { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <Clock size={12} /> },
  'Ready for Dispatch': { cls: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20', icon: <PackageCheck size={12} /> },
  'Shipped':    { cls: 'bg-purple-500/10 text-purple-400 border-purple-500/20', icon: <Truck size={12} /> },
  'Delivered':  { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  'Cancelled':  { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <X size={12} /> },
};

export default function RetailerOrders() {
  const { orders, addOrder, confirmOrderReceipt, productCatalog, schemes, territories, retailers } = useData();
  const { user } = useAuth();

  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [cart, setCart] = useState([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [qty, setQty] = useState('');
  const [viewingOrder, setViewingOrder] = useState(null);

  const myOrders = useMemo(() =>
    orders.filter(o => o.retailerId === retailer?.id)
      .sort((a, b) => new Date(b.createdAt || b.date) - new Date(a.createdAt || a.date)),
    [orders, retailer]
  );

  const cartTotal = cart.reduce((s, i) => s + i.quantity * i.retailerPrice, 0);
  const cartQty = cart.reduce((s, i) => s + i.quantity, 0);

  const qualifyingScheme = useMemo(() => {
    const cartOrder = { value: cartTotal, items: cart.map(i => ({ name: i.name, total: i.quantity * i.retailerPrice })) };
    return schemes.find(s =>
      ['Retailer', 'All'].includes(s.applicableTo) &&
      Number(s.minOrderValue || 0) > 0 &&
      isSchemeEligible(s, cartOrder)
    );
  }, [schemes, cartTotal, cart]);

  const addToCart = () => {
    const product = productCatalog.find(p => p.id === selectedProduct);
    if (!product || !qty || Number(qty) <= 0) return;
    setCart(prev => {
      const existing = prev.find(i => i.id === product.id);
      if (existing) {
        return prev.map(i => i.id === product.id ? { ...i, quantity: i.quantity + Number(qty) } : i);
      }
      return [...prev, { id: product.id, name: product.name, retailerPrice: product.retailerPrice, gstPct: product.gstPct, uom: product.uom, quantity: Number(qty) }];
    });
    setSelectedProduct('');
    setQty('');
  };

  const removeFromCart = (id) => setCart(prev => prev.filter(i => i.id !== id));

  const openOrderModal = () => { setCart([]); setSelectedProduct(''); setQty(''); setIsModalOpen(true); };

  const handleSubmitOrder = () => {
    if (!retailer || cart.length === 0) return;
    const territory = territories.find(t => t.state === retailer.state);
    addOrder({
      customerName: retailer.name,
      companyName: retailer.name,
      product: cart.length === 1 ? cart[0].name : `${cart[0].name} +${cart.length - 1} more item${cart.length > 2 ? 's' : ''}`,
      quantity: cartQty,
      value: cartTotal,
      items: cart.map(i => ({ name: i.name, quantity: i.quantity, unitPrice: i.retailerPrice, gstPct: i.gstPct, total: i.quantity * i.retailerPrice })),
      state: retailer.state,
      city: retailer.city,
      status: 'Pending',
      assignedTo: territory?.executiveId || '',
      retailerId: retailer.id,
      phone: retailer.phone,
      email: retailer.email,
      date: new Date().toISOString()
    });
    setIsModalOpen(false);
    setCart([]);
  };

  if (!retailer) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500">
        <ShoppingCart size={32} className="mx-auto mb-3 opacity-20" />
        <p>Your retailer profile could not be found. Contact support.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <ShoppingCart size={24} className="text-brand-accent" /> My Orders
          </h1>
          <p className="text-slate-400 text-sm mt-1">Place new orders and track your order history.</p>
        </div>
        <button onClick={openOrderModal} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold">
          <Plus size={16} /> Place New Order
        </button>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Order ID / Date</th>
                <th className="p-4">Product(s)</th>
                <th className="p-4 text-right">Value</th>
                <th className="p-4 text-center">Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {myOrders.length > 0 ? myOrders.map(o => (
                <tr key={o.id} onClick={() => setViewingOrder(o)} className="hover:bg-brand-primary-lighter/20 transition-colors cursor-pointer">
                  <td className="p-4">
                    <div className="font-semibold text-white">{o.id}</div>
                    <div className="text-xs text-slate-500">{formatDate(o.date || o.createdAt)}</div>
                  </td>
                  <td className="p-4">
                    <div className="text-brand-accent">{o.product}</div>
                    <div className="text-xs text-slate-500">Qty: {o.quantity}</div>
                  </td>
                  <td className="p-4 text-right font-medium text-white">{formatCurrency(o.value)}</td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border ${statusConfig[o.status]?.cls || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
                      {statusConfig[o.status]?.icon}{o.status}
                    </span>
                    {o.receivedByDistributor && (
                      <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
                        <CheckCircle size={10} /> Receipt Confirmed
                      </div>
                    )}
                  </td>
                </tr>
              )) : (
                <tr><td colSpan="4" className="p-12 text-center text-slate-500">
                  <ShoppingCart size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No orders yet.</p>
                  <button onClick={openOrderModal} className="mt-4 text-brand-accent hover:underline text-sm">+ Place your first order</button>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Place Order Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[4vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[92vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
            <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><ShoppingCart className="text-brand-accent" size={20} />Place New Order</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
            </div>
            <div className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
              <div className="flex gap-3 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Product</label>
                  <select value={selectedProduct} onChange={e => setSelectedProduct(e.target.value)} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white">
                    <option value="" className="bg-brand-primary text-slate-500">-- Select Product --</option>
                    {productCatalog.map(p => <option key={p.id} value={p.id} className="bg-brand-primary">{p.name} — {formatCurrency(p.retailerPrice)}/{p.uom}</option>)}
                  </select>
                </div>
                <div className="w-28">
                  <label className="block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide">Qty</label>
                  <input type="number" min="1" value={qty} onChange={e => setQty(e.target.value)} className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white" />
                </div>
                <button type="button" onClick={addToCart} className="btn-accent px-4 py-2.5 rounded-xl text-sm font-bold flex-shrink-0">Add</button>
              </div>

              {cart.length > 0 ? (
                <div className="border border-white/5 rounded-xl overflow-hidden">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="bg-brand-primary-light/40 text-slate-400 text-xs uppercase">
                        <th className="p-3 text-left">Product</th>
                        <th className="p-3 text-right">Qty</th>
                        <th className="p-3 text-right">Rate</th>
                        <th className="p-3 text-right">Total</th>
                        <th className="p-3"></th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {cart.map(i => (
                        <tr key={i.id}>
                          <td className="p-3">{i.name}</td>
                          <td className="p-3 text-right">{i.quantity} {i.uom}</td>
                          <td className="p-3 text-right">{formatCurrency(i.retailerPrice)}</td>
                          <td className="p-3 text-right font-medium text-white">{formatCurrency(i.quantity * i.retailerPrice)}</td>
                          <td className="p-3 text-right"><button type="button" onClick={() => removeFromCart(i.id)} className="text-slate-500 hover:text-red-400"><Trash2 size={14} /></button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <p className="text-center text-slate-500 text-sm py-6 border border-dashed border-white/10 rounded-xl">Add products to build your order.</p>
              )}

              {qualifyingScheme && (
                <div className="flex items-center gap-2 bg-brand-accent/10 border border-brand-accent/20 rounded-xl px-4 py-3 text-sm text-brand-accent">
                  <Tag size={16} className="flex-shrink-0" />
                  You qualify for <strong>{qualifyingScheme.name}</strong>
                  {qualifyingScheme.discountPct > 0 && <> ({qualifyingScheme.discountPct}% incentive)</>}
                  {qualifyingScheme.freeGoodsQty > 0 && <> ({qualifyingScheme.freeGoodsQty} free units)</>} — it'll be credited to your Incentives automatically.
                </div>
              )}

              <div className="flex justify-between items-center pt-4 border-t border-white/5">
                <div>
                  <p className="text-xs text-slate-500">Order Total</p>
                  <p className="text-2xl font-extrabold text-white">{formatCurrency(cartTotal)}</p>
                </div>
                <div className="flex gap-3">
                  <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                  <button type="button" disabled={cart.length === 0} onClick={handleSubmitOrder} className="px-5 py-2 text-sm btn-accent rounded-xl disabled:opacity-40 disabled:cursor-not-allowed">Submit Order</button>
                </div>
              </div>
            </div>
          </div>
        </div>, document.body
      )}

      {/* Order Detail Modal */}
      {viewingOrder && (() => {
        const liveOrder = orders.find(o => o.id === viewingOrder.id) || viewingOrder;
        const canConfirmReceipt = ['Shipped', 'Delivered'].includes(liveOrder.status) && !liveOrder.receivedByDistributor;
        return createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingOrder(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="text-lg font-bold text-white">{liveOrder.id}</h3>
                <p className="text-xs text-slate-500">{formatDate(liveOrder.date || liveOrder.createdAt)}</p>
              </div>
              <button onClick={() => setViewingOrder(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border mb-4 ${statusConfig[liveOrder.status]?.cls || 'bg-slate-500/10 text-slate-400 border-slate-500/20'}`}>
              {statusConfig[liveOrder.status]?.icon}{liveOrder.status}
            </span>
            {Array.isArray(liveOrder.items) && liveOrder.items.length > 0 ? (
              <div className="border border-white/5 rounded-xl overflow-hidden mb-4">
                <table className="w-full text-sm">
                  <thead><tr className="bg-brand-primary-light/40 text-slate-400 text-xs uppercase"><th className="p-2.5 text-left">Product</th><th className="p-2.5 text-right">Qty</th><th className="p-2.5 text-right">Total</th></tr></thead>
                  <tbody className="divide-y divide-white/5 text-slate-300">
                    {liveOrder.items.map((i, idx) => (
                      <tr key={idx}><td className="p-2.5 flex items-center gap-1.5"><Package size={12} className="text-brand-accent" />{i.name}</td><td className="p-2.5 text-right">{i.quantity}</td><td className="p-2.5 text-right">{formatCurrency(i.total)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="text-sm text-slate-300 mb-4">{liveOrder.product} — Qty: {liveOrder.quantity}</p>
            )}
            <div className="flex justify-between items-center pt-3 border-t border-white/5">
              <span className="text-sm text-slate-400">Order Total</span>
              <span className="text-lg font-bold text-white">{formatCurrency(liveOrder.value)}</span>
            </div>

            {liveOrder.receivedByDistributor ? (
              <div className="mt-4 flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/20 rounded-xl px-4 py-3 text-sm text-emerald-400 font-medium">
                <CheckCircle size={16} className="flex-shrink-0" />
                Receipt confirmed on {formatDate(liveOrder.receivedAt)}
              </div>
            ) : canConfirmReceipt ? (
              <button
                type="button"
                onClick={() => confirmOrderReceipt(liveOrder.id)}
                className="mt-4 w-full btn-accent px-4 py-2.5 rounded-xl text-sm font-bold flex items-center justify-center gap-2"
              >
                <CheckCircle size={16} /> Confirm Receipt
              </button>
            ) : null}
          </div>
        </div>, document.body
        );
      })()}
    </div>
  );
}
