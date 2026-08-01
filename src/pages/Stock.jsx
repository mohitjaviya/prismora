import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Boxes, Search, CheckCircle, AlertTriangle, XCircle } from 'lucide-react';

// Maps a portal role to the id field its records carry on shared tables.
const PARTY_ID_FIELD = { Distributor: 'distributorId', Dealer: 'dealerId', Retailer: 'retailerId' };

export default function Stock() {
  const { orders, productCatalog, distributors, dealers, retailers } = useData();
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;

  // Sums quantities from this distributor/dealer/retailer's own delivered +
  // receipt-confirmed orders — this is stock they've actually taken
  // possession of, not the company's shared warehouse pool.
  const aggregated = useMemo(() => {
    const byProduct = {};
    orders
      .filter(o => o[PARTY_ID_FIELD[user?.role]] === party?.id && o.receivedByDistributor)
      .forEach(order => {
        const lineItems = Array.isArray(order.items) && order.items.length > 0
          ? order.items.map(i => ({ name: i.name, quantity: Number(i.quantity || 0) }))
          : [{ name: order.product, quantity: Number(order.quantity || 0) }];
        lineItems.forEach(({ name, quantity }) => {
          if (!name) return;
          byProduct[name] = (byProduct[name] || 0) + quantity;
        });
      });
    return productCatalog
      .map(p => {
        const available = byProduct[p.name] || 0;
        let status = 'In Stock';
        if (available === 0) status = 'Out of Stock';
        else if (available <= 50) status = 'Low Stock';
        return { id: p.id, name: p.name, uom: p.uom, category: p.category, available, status };
      })
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [orders, party, user, productCatalog, search]);

  const statusConfig = {
    'In Stock':     { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
    'Low Stock':    { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <AlertTriangle size={12} /> },
    'Out of Stock': { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <XCircle size={12} /> },
  };

  if (!party) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500">
        <Boxes size={32} className="mx-auto mb-3 opacity-20" />
        <p>Your account profile could not be found. Contact support.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Boxes size={24} className="text-brand-accent" /> Stock Availability
        </h1>
        <p className="text-slate-400 text-sm mt-1">Stock you currently hold, based on orders you've received and confirmed.</p>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {aggregated.length > 0 ? aggregated.map(p => (
          <div key={p.id} className="glass-panel rounded-2xl border border-white/5 p-5">
            <div className="flex justify-between items-start mb-2">
              <div>
                <h3 className="font-bold text-white text-sm">{p.name}</h3>
                <p className="text-xs text-slate-500">{p.category}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 ${statusConfig[p.status].cls}`}>
                {statusConfig[p.status].icon}{p.status}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-2xl font-extrabold text-white">{p.available.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">{p.uom}</span></p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Available</p>
            </div>
          </div>
        )) : (
          <div className="col-span-full glass-panel rounded-2xl border border-white/5 p-16 text-center text-slate-500">
            <Boxes size={32} className="mx-auto mb-3 opacity-20" />
            <p>No products found.</p>
          </div>
        )}
      </div>
    </div>
  );
}
