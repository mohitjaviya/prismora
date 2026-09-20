import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Boxes, CheckCircle, Clock, Package, Truck, Download } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { Badge, Button, Card, EmptyState, PageHeader, SearchInput, StatCard } from '../components/ui';
import { aggregateReceived } from '../utils/stockUtils';
import { allParties } from '../utils/distributorUtils';


export default function Stock() {
  const { orders, productCatalog, distributors, dealers, retailers } = useData();
  const { user } = useAuth();
  const [search, setSearch] = useState('');

  // A partner sees their own figures. Staff have full access to this screen but
  // are not a party themselves, so they choose whose stock to look at — without
  // this they only ever reached the "profile could not be found" dead end.
  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const [selectedPartyId, setSelectedPartyId] = useState('');

  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const ownParty = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;

  const partyOptions = useMemo(
    () => (isParty ? [] : allParties(distributors, dealers, retailers)),
    [isParty, distributors, dealers, retailers]
  );
  const chosen = useMemo(() => partyOptions.find(p => p.id === selectedPartyId), [partyOptions, selectedPartyId]);

  const party = isParty ? ownParty : chosen;
  const partyType = isParty ? user?.role : chosen?.partyType;

  const { rows, totalUnits, awaitingUnits, orderCount } = useMemo(() => {
    const { byProduct, totalUnits: total, awaitingUnits: awaiting, orderCount: counted } =
      aggregateReceived(orders, party, partyType);

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
  }, [orders, party, partyType, productCatalog, search]);

  const partyPicker = !isParty && (
    <div className="glass-panel rounded-2xl p-4 border border-white/5">
      <label htmlFor="stock-viewing-stock-held-by" className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Viewing stock held by</label>
      <select id="stock-viewing-stock-held-by"
        value={selectedPartyId}
        onChange={e => setSelectedPartyId(e.target.value)}
        className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white"
      >
        <option value="" className="bg-brand-primary">Select a distributor, dealer or retailer…</option>
        {partyOptions.map(p => (
          <option key={`${p.partyType}-${p.id}`} value={p.id} className="bg-brand-primary">
            {p.name} — {p.partyType}
          </option>
        ))}
      </select>
    </div>
  );

  const handleExport = () => downloadCSV(rows.map(pr => ({
  Product: pr.name,
  Category: pr.category,
  Received: pr.received,
  Unconfirmed: pr.unconfirmed,
  UOM: pr.uom,
  })), `PRISMORA_Stock_${(party?.name || 'account').replace(/[^A-Za-z0-9]+/g, '_')}`);

  if (!party) {
  return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          icon={Boxes}
          title="Stock Availability"
          subtitle="Goods delivered by Janki Herbals, totalled by product."
        />
        {partyPicker}
        <Card padding="p-0">
          <EmptyState
            icon={Boxes}
            title={isParty
              ? 'Your account profile could not be found'
              : partyOptions.length === 0
                ? 'No distributors, dealers or retailers yet'
                : 'Choose a party above'}
            hint={isParty
              ? 'This login is not linked to a distributor, dealer or retailer record. An administrator can link it from the Distributors, Dealers or Retailers screen.'
              : partyOptions.length === 0
                ? 'Stock is counted against a party, so add one first and what has been delivered to them collects here.'
                : 'Pick whose delivered stock to look at.'}
          />
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Boxes}
        title="Stock Availability"
        subtitle={isParty
          ? 'Goods delivered to you by Janki Herbals, totalled by product.'
          : `Goods delivered to ${party.name} by Janki Herbals, totalled by product.`}
        actions={<Button icon={Download} onClick={handleExport} disabled={!(rows.length > 0)}>Export</Button>}
      />

      {partyPicker}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Received to date"
          value={`${totalUnits.toLocaleString('en-IN')} units`}
          icon={Package}
          tone="accent"
        />
        <StatCard
          label="Awaiting confirmation"
          value={`${awaitingUnits.toLocaleString('en-IN')} units`}
          icon={Clock}
          tone={awaitingUnits > 0 ? 'warning' : 'accent'}
        />
        <StatCard
          label="Deliveries counted"
          value={`${orderCount.toLocaleString('en-IN')} orders`}
          icon={Truck}
          tone="info"
        />
      </div>

      <Card padding="p-4">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search products"
        />
      </Card>

      {rows.length > 0 ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {rows.map(pr => (
            <Card key={pr.id}>
              <div className="flex justify-between items-start mb-3 gap-2">
                <div className="min-w-0">
                  <h3 className="font-bold text-white text-sm truncate">{pr.name}</h3>
                  <p className="text-[11px] text-slate-500">{pr.category}</p>
                </div>
                <Badge tone={pr.unconfirmed > 0 ? 'warning' : 'success'} className="flex-shrink-0">
                  {pr.unconfirmed > 0 ? <><Clock size={10} />Unconfirmed</> : <><CheckCircle size={10} />Confirmed</>}
                </Badge>
              </div>
              <div className="pt-3 border-t border-white/5">
                <p className="text-2xl font-extrabold text-white leading-none">
                  {pr.received.toLocaleString('en-IN')}
                  <span className="text-xs font-medium text-slate-500 ml-1">{pr.uom}</span>
                </p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1.5">Received to date</p>
                {pr.unconfirmed > 0 && (
                  // Staff saw the same line as the customer and were told to
                  // confirm it in My Orders -- a page only a party login opens.
                  // For a customer with no portal that made it unconfirmable,
                  // and the instruction impossible for either of them to follow.
                  <p className="text-[11px] text-amber-400 mt-2 leading-snug">
                    {pr.unconfirmed.toLocaleString('en-IN')} {pr.uom} not yet confirmed — {isParty
                      ? 'confirm in My Orders.'
                      : 'record receipt on the order.'}
                  </p>
                )}
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card padding="p-0">
          <EmptyState
            icon={Boxes}
            title={search ? 'No products match that search' : 'Nothing delivered yet'}
            hint={search
              ? 'Try a shorter search, or clear it to see everything received.'
              : 'Products appear here once an order is marked Delivered by the dispatch team. Orders still being processed or shipped are not counted.'}
          />
        </Card>
      )}

      <p className="text-[11px] text-slate-600 leading-relaxed max-w-3xl">
        These are cumulative totals of what Janki Herbals has delivered{isParty ? ' to you' : ''}. The system does not
        track {isParty ? 'your' : 'their'} own onward sales, so this figure does not reduce as stock is sold on.
      </p>
    </div>
  );

}
