import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Boxes, Search, CheckCircle, Clock, Package } from 'lucide-react';
import { aggregateReceived } from '../utils/stockUtils';


export default function Stock() {
  const { orders, productCatalog, distributors, dealers, retailers } = useData();
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;

  const { rows, totalUnits, awaitingUnits, orderCount } = useMemo(() => {
    const { byProduct, totalUnits: total, awaitingUnits: awaiting, orderCount: counted } =
      aggregateReceived(orders, party, user?.role);

    const catalogByName = new Map((productCatalog || []).map(p => [p.name, p]));
    const built = Object.entries(byProduct)
      .map(([name, v]) => {
        const p = catalogByName.get(name);
        return {
          id: p?.id || name,
          name,
          uom: p?.uom || 'UNIT',
          category: p?.category || 'Uncategorised',
          received: v.received,
          unconfirmed: v.unconfirmed,
        };
      })
      .filter(p => !search || p.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) => b.received - a.received || a.name.localeCompare(b.name));

    return { rows: built, totalUnits: total, awaitingUnits: awaiting, orderCount: counted };
  }, [orders, party, user, productCatalog, search]);

  if (!party) {
    return (
      <div className="glass-panel rounded-2xl border border-white/5 p-12 text-center text-slate-500">
        <Boxes size={32} className="mx-auto mb-3 opacity-20" />
        <p className="text-slate-400 font-medium">Your account profile could not be found.</p>
        <p className="text-xs mt-2 max-w-sm mx-auto leading-relaxed">
          Your login is not linked to a distributor, dealer or retailer record. An administrator can fix this
          from the Distributors, Dealers or Retailers screen.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <div>
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Boxes size={24} className="text-brand-accent" /> Stock Availability
        </h1>
        <p className="text-slate-400 text-sm mt-1">
          Goods delivered to you by Janki Herbals, totalled by product.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5"><Package size={12} />Received to date</p>
          <p className="text-2xl font-extrabold mt-1 text-white">{totalUnits.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">units</span></p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider flex items-center gap-1.5"><Clock size={12} />Awaiting your confirmation</p>
          <p className={`text-2xl font-extrabold mt-1 ${awaitingUnits > 0 ? 'text-amber-400' : 'text-white'}`}>{awaitingUnits.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">units</span></p>
        </div>
        <div className="glass-panel rounded-2xl p-4 border border-white/5">
          <p className="text-xs text-slate-400 font-semibold uppercase tracking-wider">Deliveries counted</p>
          <p className="text-2xl font-extrabold mt-1 text-white">{orderCount.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">orders</span></p>
        </div>
      </div>

      <div className="glass-panel rounded-2xl p-4 border border-white/5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search products..." className="w-full glass-input rounded-xl pl-9 pr-4 py-2.5 text-sm text-white" />
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {rows.length > 0 ? rows.map(p => (
          <div key={p.id} className="glass-panel rounded-2xl border border-white/5 p-5">
            <div className="flex justify-between items-start mb-2 gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-white text-sm">{p.name}</h3>
                <p className="text-xs text-slate-500">{p.category}</p>
              </div>
              <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border flex-shrink-0 ${
                p.unconfirmed > 0
                  ? 'bg-amber-500/10 text-amber-400 border-amber-500/20'
                  : 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
              }`}>
                {p.unconfirmed > 0 ? <><Clock size={12} />Unconfirmed</> : <><CheckCircle size={12} />Confirmed</>}
              </span>
            </div>
            <div className="mt-3 pt-3 border-t border-white/5">
              <p className="text-2xl font-extrabold text-white">{p.received.toLocaleString('en-IN')} <span className="text-xs font-medium text-slate-500">{p.uom}</span></p>
              <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">Received to date</p>
              {p.unconfirmed > 0 && (
                <p className="text-[11px] text-amber-400 mt-2">
                  {p.unconfirmed.toLocaleString('en-IN')} {p.uom} not yet confirmed by you — confirm in My Orders.
                </p>
              )}
            </div>
          </div>
        )) : (
          <div className="col-span-full glass-panel rounded-2xl border border-white/5 p-16 text-center text-slate-500">
            <Boxes size={32} className="mx-auto mb-3 opacity-20" />
            <p className="text-slate-400 font-medium">{search ? 'No products match your search.' : 'Nothing delivered to you yet.'}</p>
            {!search && (
              <p className="text-xs mt-2 max-w-md mx-auto leading-relaxed">
                Products appear here once an order of yours is marked <span className="text-slate-300">Delivered</span> by the
                dispatch team. Orders still being processed or shipped are not counted.
              </p>
            )}
          </div>
        )}
      </div>

      <p className="text-[11px] text-slate-600 leading-relaxed max-w-3xl">
        These are cumulative totals of what Janki Herbals has delivered to you. The system does not track your own
        onward sales, so this figure does not reduce as you sell.
      </p>
    </div>
  );
}
