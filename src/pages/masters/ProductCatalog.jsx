import { useState } from 'react';
import { useData } from '../../context/DataContext';
import { createPortal } from 'react-dom';
import { Plus, Edit2, Trash2, Package, QrCode, X, Download } from 'lucide-react';
import { downloadCSV } from '../../utils/exportUtils';
import { useConfirm } from '../../context/DialogContext';
import { Badge, Button, DataTable, IconButton, PageHeader } from '../../components/ui';
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
  const confirm = useConfirm();

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

  const productColumns = [
    {
      key: 'name', header: 'Product / SKU', sort: p => p.name || '',
      render: p => (
        <>
          <div className="font-semibold text-white">{p.name}</div>
          <div className="text-[10px] font-mono text-slate-500">{p.sku || 'No SKU'} &middot; {p.uom || 'BOX'}</div>
        </>
      ),
    },
    {
      key: 'category', header: 'Category', hideBelow: 'lg', sort: p => p.category || '',
      render: p => <Badge tone="accent">{p.category}</Badge>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: p => p.status || 'Active',
      render: p => <Badge>{p.status || 'Active'}</Badge>,
    },
    {
      key: 'hsn', header: 'HSN', align: 'center', hideBelow: 'lg', sort: p => p.hsnCode || '',
      render: p => <span className="font-mono text-slate-400">{p.hsnCode || '—'}</span>,
    },
    {
      key: 'gst', header: 'GST', align: 'center', hideBelow: 'md', sort: p => Number(p.gstPct) || 0,
      render: p => <span className="font-bold text-brand-accent">{p.gstPct}%</span>,
    },
    {
      key: 'mrp', header: 'MRP', align: 'right', hideBelow: 'md', sort: p => Number(p.mrp) || 0,
      render: p => <span className="text-slate-400">{formatCurrency(p.mrp)}</span>,
    },
    {
      key: 'distributorPrice', header: 'Distributor', align: 'right', sort: p => Number(p.distributorPrice) || 0,
      render: p => <span className="font-bold text-white">{formatCurrency(p.distributorPrice)}</span>,
    },
    {
      key: 'dealerPrice', header: 'Dealer', align: 'right', hideBelow: 'lg', sort: p => Number(p.dealerPrice) || 0,
      render: p => <span className="text-slate-400">{formatCurrency(p.dealerPrice)}</span>,
    },
    {
      key: 'retailerPrice', header: 'Retailer', align: 'right', hideBelow: 'lg', sort: p => Number(p.retailerPrice) || 0,
      render: p => <span className="text-slate-400">{formatCurrency(p.retailerPrice)}</span>,
    },
    {
      key: 'actions', header: '', align: 'center', width: 'w-24',
      render: p => (
        <div className="flex items-center justify-center gap-0.5">
          <IconButton icon={Edit2} title="Edit product" size="sm" tone="accent" onClick={() => openProductEdit(p)} />
          <IconButton icon={Trash2} title="Delete product" size="sm" tone="danger"
            onClick={async () => { if (await confirm({ title: 'Delete this product?', danger: true, confirmLabel: 'Delete' })) deleteProduct(p.id); }} />
        </div>
      ),
    },
  ];

  const handleExport = () => downloadCSV(productCatalog.map(p => ({
    Product: p.name,
    SKU: p.sku,
    Category: p.category,
    Status: p.status || 'Active',
    HSN: p.hsnCode,
    UOM: p.uom,
    GST: p.gstPct,
    MRP: p.mrp,
    Distributor: p.distributorPrice,
    Dealer: p.dealerPrice,
    Retailer: p.retailerPrice,
  })), 'PRISMORA_Product_Catalogue');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Package}
        title="Product Catalogue"
        subtitle="Prices, HSN codes and tax rates. Every order and invoice is priced from here."
        actions={<>
            <Button icon={Download} onClick={handleExport} disabled={!(productCatalog.length > 0)}>Export</Button>
            <Button variant="primary" icon={Plus} onClick={openProductAdd}>Add Product</Button>
              </>}
      />

      <DataTable
        title="Products"
        columns={productColumns}
        rows={productCatalog}
        rowKey={p => p.id}
        search={p => `${p.name} ${p.sku || ''} ${p.category || ''} ${p.hsnCode || ''}`}
        searchPlaceholder="Search product, SKU or HSN"
        empty={{
          icon: Package,
          title: 'No products yet',
          hint: 'Orders and invoices are priced from this catalogue, so add a product here before raising one against it.',
          action: <Button variant="primary" icon={Plus} onClick={openProductAdd}>Add Product</Button>,
        }}
      />

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
