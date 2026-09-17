import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, Package, QrCode, X } from 'lucide-react';
import { optionsFor } from '../../utils/masterLists';

/**
 * The product catalogue: what is sold, at what price, under which tax rate.
 *
 * Moved here from Settings because it is master data — the thing every order,
 * invoice and stock figure is priced from. Its categories, units and statuses
 * are themselves master lists, so they are edited two clicks away.
 */

const INDIAN_TAX_RATES = [0, 5, 12, 18, 28];

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const BLANK_PRODUCT_FORM = { name: '', category: 'Wellness', hsnCode: '', sku: '', gstPct: 12, mrp: '', distributorPrice: '', dealerPrice: '', retailerPrice: '', uom: 'BOTTLE', status: 'Active' };

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

export default function ProductCatalog() {
  const { productCatalog, addProduct, updateProduct, deleteProduct, masters } = useData();

  // The three lists this form offers are themselves master lists.
  const productCategories = optionsFor(masters, 'product_category').map(o => o.key);
  const uoms = optionsFor(masters, 'uom').map(o => o.key);
  const productStatuses = optionsFor(masters, 'product_status').map(o => o.key);

  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState(null);
  const [productForm, setProductForm] = useState(BLANK_PRODUCT_FORM);
  const [viewingQrProduct, setViewingQrProduct] = useState(null);

  const openProductAdd = () => { setEditingProduct(null); setProductForm(BLANK_PRODUCT_FORM); setIsProductModalOpen(true); };
  const openProductEdit = (p) => {
    setEditingProduct(p);
    setProductForm({
      name: p.name, category: p.category || 'Wellness', hsnCode: p.hsnCode || '', sku: p.sku || '',
      gstPct: p.gstPct || 12, mrp: p.mrp || '',
      distributorPrice: p.distributorPrice || '', dealerPrice: p.dealerPrice || '',
      retailerPrice: p.retailerPrice || '', uom: p.uom || 'BOTTLE', status: p.status || 'Active'
    });
    setIsProductModalOpen(true);
  };

  const handleProductSubmit = (e) => {
    e.preventDefault();
    const payload = {
      ...productForm,
      gstPct: Number(productForm.gstPct),
      mrp: Number(productForm.mrp || 0),
      distributorPrice: Number(productForm.distributorPrice || 0),
      dealerPrice: Number(productForm.dealerPrice || 0),
      retailerPrice: Number(productForm.retailerPrice || 0)
    };
    if (editingProduct) updateProduct(editingProduct.id, payload);
    else addProduct(payload);
    setIsProductModalOpen(false);
  };

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex justify-between items-center gap-4">
        <div>
          <h2 className="text-base font-bold text-white flex items-center gap-2"><Package size={18} className="text-brand-accent" />Product Catalogue</h2>
          <p className="text-xs text-slate-400 mt-1">Prices, HSN codes and tax rates. Every order and invoice is priced from here.</p>
        </div>
        <button onClick={openProductAdd} className="btn-accent px-4 py-2.5 rounded-xl flex items-center gap-2 text-sm font-bold flex-shrink-0">
          <Plus size={16} /> Add Product
        </button>
      </div>


          <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                    <th className="p-4">Product / SKU</th>
                    <th className="p-4">Category</th>
                    <th className="p-4 text-center">Status</th>
                    <th className="p-4 text-center">HSN</th>
                    <th className="p-4 text-center">GST %</th>
                    <th className="p-4 text-right">MRP</th>
                    <th className="p-4 text-right">Distributor (₹)</th>
                    <th className="p-4 text-right">Dealer (₹)</th>
                    <th className="p-4 text-right">Retailer (₹)</th>
                    <th className="p-4 text-center">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5 text-slate-300">
                  {productCatalog.length > 0 ? productCatalog.map(p => (
                    <tr key={p.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                      <td className="p-4">
                        <div className="font-semibold text-white">{p.name}</div>
                        <div className="text-[10px] font-mono text-slate-500">{p.sku || 'No SKU'} · {p.uom || 'BOX'}</div>
                      </td>
                      <td className="p-4 text-xs"><span className="bg-brand-accent/10 text-brand-accent border border-brand-accent/20 px-2 py-0.5 rounded-full">{p.category}</span></td>
                      <td className="p-4 text-center">
                        {(() => {
                          const s = p.status || 'Active';
                          const cls = s === 'Active' ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' : s === 'Seasonal' ? 'bg-amber-500/10 text-amber-400 border-amber-500/20' : s === 'Coming Soon' ? 'bg-blue-500/10 text-blue-400 border-blue-500/20' : 'bg-slate-500/10 text-slate-400 border-slate-500/20';
                          return <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold border ${cls}`}>{s}</span>;
                        })()}
                      </td>
                      <td className="p-4 text-center font-mono text-xs text-slate-400">{p.hsnCode || '—'}</td>
                      <td className="p-4 text-center font-bold text-brand-accent">{p.gstPct}%</td>
                      <td className="p-4 text-right font-medium text-slate-300">{formatCurrency(p.mrp)}</td>
                      <td className="p-4 text-right font-bold text-white">{formatCurrency(p.distributorPrice)}</td>
                      <td className="p-4 text-right text-slate-400">{formatCurrency(p.dealerPrice)}</td>
                      <td className="p-4 text-right text-slate-400">{formatCurrency(p.retailerPrice)}</td>
                      <td className="p-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button onClick={() => setViewingQrProduct(p)} className="p-1.5 text-slate-400 hover:text-blue-400 hover:bg-blue-400/10 rounded-lg transition-colors" title="Generate QR Barcode"><QrCode size={14} /></button>
                          <button onClick={() => openProductEdit(p)} className="p-1.5 text-slate-400 hover:text-brand-accent hover:bg-brand-accent/10 rounded-lg transition-colors" title="Edit"><Edit2 size={14} /></button>
                          <button onClick={() => { if (confirm('Delete this product?')) deleteProduct(p.id); }} className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-400/10 rounded-lg transition-colors" title="Delete"><Trash2 size={14} /></button>
                        </div>
                      </td>
                    </tr>
                  )) : (
                    <tr><td colSpan="10" className="p-8 text-center text-slate-500">No products found in catalog.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

  {isProductModalOpen && createPortal(
          <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[5vh]">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsProductModalOpen(false)} />
            <div className="relative glass-panel bg-brand-primary w-full max-w-2xl max-h-[90vh] rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 flex flex-col overflow-hidden">
              <div className="flex justify-between items-center p-6 border-b border-white/5 flex-shrink-0">
                <h3 className="text-lg font-bold text-white flex items-center gap-2"><Package className="text-brand-accent" size={20} />{editingProduct ? 'Edit Catalog Product' : 'Add New Product'}</h3>
                <button onClick={() => setIsProductModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={20} /></button>
              </div>
              <form onSubmit={handleProductSubmit} className="flex-1 overflow-y-auto custom-scrollbar p-6 space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div className="sm:col-span-2"><label className={labelCls}>Product Name *</label><input required type="text" value={productForm.name} onChange={e => setProductForm({ ...productForm, name: e.target.value })} placeholder="e.g. Brahmi Amla Shakar 200ml" className={inputCls} /></div>
                  <div>
                    <label className={labelCls}>Category</label>
                    <select value={productForm.category} onChange={e => setProductForm({ ...productForm, category: e.target.value })} className={inputCls}>
                      {productCategories.map(c => <option key={c} value={c} className="bg-brand-primary">{c}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Unit of Measure (UOM)</label>
                    <select value={productForm.uom} onChange={e => setProductForm({ ...productForm, uom: e.target.value })} className={inputCls}>
                      {uoms.map(u => <option key={u} value={u} className="bg-brand-primary">{u}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>SKU / Barcode</label><input type="text" value={productForm.sku} onChange={e => setProductForm({ ...productForm, sku: e.target.value })} placeholder="e.g. PRM-HHO-100" className={inputCls} /></div>
                  <div>
                    <label className={labelCls}>Lifecycle Status</label>
                    <select value={productForm.status} onChange={e => setProductForm({ ...productForm, status: e.target.value })} className={inputCls}>
                      {productStatuses.map(s => <option key={s} value={s} className="bg-brand-primary">{s}</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>HSN Code *</label><input required type="text" value={productForm.hsnCode} onChange={e => setProductForm({ ...productForm, hsnCode: e.target.value })} placeholder="e.g. 30049011" className={inputCls} /></div>
                  <div>
                    <label className={labelCls}>GST Rate *</label>
                    <select value={productForm.gstPct} onChange={e => setProductForm({ ...productForm, gstPct: e.target.value })} className={inputCls}>
                      {INDIAN_TAX_RATES.map(r => <option key={r} value={r} className="bg-brand-primary">{r}% GST</option>)}
                    </select>
                  </div>
                  <div><label className={labelCls}>MRP (Retail Price Limit) (₹)</label><input type="number" min="0" value={productForm.mrp} onChange={e => setProductForm({ ...productForm, mrp: e.target.value })} placeholder="0" className={inputCls} /></div>
                  <div><label className={labelCls}>Distributor Base Price (₹) *</label><input required type="number" min="0" value={productForm.distributorPrice} onChange={e => setProductForm({ ...productForm, distributorPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
                  <div><label className={labelCls}>Dealer Base Price (₹) *</label><input required type="number" min="0" value={productForm.dealerPrice} onChange={e => setProductForm({ ...productForm, dealerPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
                  <div><label className={labelCls}>Retailer Base Price (₹) *</label><input required type="number" min="0" value={productForm.retailerPrice} onChange={e => setProductForm({ ...productForm, retailerPrice: e.target.value })} placeholder="0" className={inputCls} /></div>
                </div>
                <div className="flex gap-3 justify-end pt-4 border-t border-white/5">
                  <button type="button" onClick={() => setIsProductModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                  <button type="submit" className="px-4 py-2 text-sm btn-accent rounded-xl">{editingProduct ? 'Save Changes' : 'Create Product'}</button>
                </div>
              </form>
            </div>
          </div>, document.body
        )}

  {viewingQrProduct && createPortal(
          <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setViewingQrProduct(null)} />
            <div className="relative glass-panel bg-brand-primary w-full max-w-sm rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6 flex flex-col items-center text-center">
              <div className="w-full flex justify-between items-center mb-4">
                <h3 className="font-bold text-white text-sm flex items-center gap-1.5"><QrCode size={18} className="text-brand-accent" />QR Barcode</h3>
                <button onClick={() => setViewingQrProduct(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
              </div>
              <div className="bg-white p-4 rounded-2xl border border-white/10 shadow-lg mb-4">
                <img 
                  src={`https://api.qrserver.com/v1/create-qr-code/?size=160x160&color=112240&bgcolor=ffffff&data=${encodeURIComponent(`PRISMORA-PROD:${viewingQrProduct.id}:${viewingQrProduct.name}:HSN:${viewingQrProduct.hsnCode}`)}`} 
                  alt="Product QR Barcode" 
                  className="w-40 h-40"
                />
              </div>
              <h4 className="font-bold text-white text-base">{viewingQrProduct.name}</h4>
              <p className="text-xs text-slate-400 mt-0.5">HSN: {viewingQrProduct.hsnCode || 'N/A'} &nbsp;|&nbsp; GST: {viewingQrProduct.gstPct}%</p>
              <div className="bg-brand-primary-lighter/30 rounded-xl p-2.5 mt-3 border border-white/5 w-full text-xs text-slate-300 font-medium">
                MRP: <span className="font-bold text-white">{formatCurrency(viewingQrProduct.mrp)}</span> &nbsp;|&nbsp; Dist: <span className="font-bold text-brand-accent">{formatCurrency(viewingQrProduct.distributorPrice)}</span>
              </div>
              <button onClick={() => setViewingQrProduct(null)} className="mt-5 w-full py-2.5 rounded-xl bg-brand-primary-lighter text-slate-300 hover:text-white text-sm font-semibold">Done</button>
            </div>
          </div>, document.body
        )}
    </div>
  );
}
