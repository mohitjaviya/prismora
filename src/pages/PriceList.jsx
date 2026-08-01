import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Tags, Search, Download } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

export default function PriceList() {
  const { productCatalog } = useData();
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const priceField = user?.role === 'Dealer' ? 'dealerPrice' : user?.role === 'Retailer' ? 'retailerPrice' : 'distributorPrice';
  const tierLabel = user?.role === 'Dealer' ? 'dealer' : user?.role === 'Retailer' ? 'retailer' : 'distributor';

  const filtered = useMemo(() =>
    productCatalog
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.category.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name)),
    [productCatalog, search]
  );

  const handleExport = () => downloadCSV(filtered.map(p => ({
    Product: p.name, Category: p.category, HSN: p.hsnCode, UOM: p.uom,
    MRP: p.mrp, 'Your Price': p[priceField], 'GST %': p.gstPct
  })), 'PRISMORA_Price_List');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Tags size={24} className="text-brand-accent" /> Price List
          </h1>
          <p className="text-slate-400 text-sm mt-1">Your {tierLabel} pricing tier for all active products.</p>
        </div>
        <button onClick={handleExport} className="glass-panel hover:bg-brand-primary-lighter/80 text-white px-4 py-2.5 rounded-xl flex items-center gap-2 transition-all hover:-translate-y-0.5">
          <Download size={16} className="text-brand-accent" /><span className="text-sm font-medium">Export</span>
        </button>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products or category..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
      </div>

      <div className="glass-panel rounded-2xl overflow-hidden border border-white/5">
        <div className="overflow-x-auto custom-scrollbar">
          <table className="w-full text-left text-sm border-collapse">
            <thead>
              <tr className="bg-brand-primary-light/40 border-b border-white/5 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <th className="p-4">Product</th>
                <th className="p-4">HSN Code</th>
                <th className="p-4">UOM</th>
                <th className="p-4 text-right">MRP</th>
                <th className="p-4 text-right">Your Price</th>
                <th className="p-4 text-right">GST %</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5 text-slate-300">
              {filtered.length > 0 ? filtered.map(p => (
                <tr key={p.id} className="hover:bg-brand-primary-lighter/20 transition-colors">
                  <td className="p-4">
                    <div className="font-semibold text-white">{p.name}</div>
                    <div className="text-xs text-slate-500">{p.category}</div>
                  </td>
                  <td className="p-4 text-xs text-slate-400 font-mono">{p.hsnCode}</td>
                  <td className="p-4 text-slate-400">{p.uom}</td>
                  <td className="p-4 text-right text-slate-500 line-through">{formatCurrency(p.mrp)}</td>
                  <td className="p-4 text-right font-bold text-brand-accent">{formatCurrency(p[priceField])}</td>
                  <td className="p-4 text-right text-slate-400">{p.gstPct}%</td>
                </tr>
              )) : (
                <tr><td colSpan="6" className="p-12 text-center text-slate-500">
                  <Tags size={32} className="mx-auto mb-3 opacity-20" />
                  <p>No products found.</p>
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
