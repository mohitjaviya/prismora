import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Gift, CheckCircle, Clock, Package, Wallet, Download } from 'lucide-react';
import { useToast } from '../context/DialogContext';
import { downloadCSV } from '../utils/exportUtils';
import { PageHeader, DataTable, Button, Badge, StatCard, Card, SearchInput } from '../components/ui';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

// Maps a portal role to the id field its records carry on shared tables.
const PARTY_ID_FIELD = { Distributor: 'distributorId', Dealer: 'dealerId', Retailer: 'retailerId' };

// Marking a payout without recording it is the failure this guard exists to
// stop, so a refused write has to be said out loud rather than looking inert.
const PAYOUT_FAILED = 'The payout could not be recorded as an expense, so the status has been left unchanged rather than showing money as paid that the books do not have. The reason is in the browser console; try again once it is resolved.';

export default function Incentives() {
  const { distributorIncentives, markIncentivePaid, distributors, dealers, retailers } = useData();
  const toast = useToast();
  const { user, canAccess } = useAuth();

  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;
  const canManage = canAccess('incentives', 'full') && !isParty;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const visible = useMemo(() => {
    // A party whose own record can't be resolved must see nothing. Without this,
    // `i[field] === party?.id` becomes `undefined === undefined`, which matches
    // every unassigned incentive and leaks it to them.
    if (isParty && !party?.id) return [];
    const base = isParty
      ? distributorIncentives.filter(i => i[PARTY_ID_FIELD[user?.role]] === party.id)
      : distributorIncentives;
    return base.filter(i => {
      const matchSearch = !search || i.schemeName.toLowerCase().includes(search.toLowerCase()) || i.orderId?.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || i.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [distributorIncentives, isParty, party, user, search, statusFilter]);

  const kpis = useMemo(() => {
    const cashRows = visible.filter(i => i.incentiveType !== 'Free Goods');
    return {
      earned: cashRows.filter(i => i.status === 'Earned').reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
      paid: cashRows.filter(i => i.status === 'Paid').reduce((s, i) => s + Number(i.incentiveValue || 0), 0),
      count: visible.length,
    };
  }, [visible]);

  const partyName = (incentive) => {
    if (incentive.distributorId) return { name: distributors?.find(d => d.id === incentive.distributorId)?.name || 'Unknown', type: 'Distributor' };
    if (incentive.dealerId) return { name: dealers?.find(d => d.id === incentive.dealerId)?.name || 'Unknown', type: 'Dealer' };
    if (incentive.retailerId) return { name: retailers?.find(r => r.id === incentive.retailerId)?.name || 'Unknown', type: 'Retailer' };
    return { name: 'Unknown', type: '' };
  };

  const incentiveColumns = [
    ...(isParty ? [] : [{
      key: 'party', header: 'Party', sort: i => partyName(i).name,
      render: i => (
        <>
          <div className="font-semibold text-white">{partyName(i).name}</div>
          {partyName(i).type && <span className="text-[10px] text-slate-500 uppercase tracking-wide">{partyName(i).type}</span>}
        </>
      ),
    }]),
    {
      key: 'scheme', header: 'Scheme', sort: i => i.schemeName || '',
      render: i => (
        <>
          <div className="text-white">{i.schemeName}</div>
          <div className="text-[11px] text-slate-500">{formatDate(i.createdAt)}</div>
        </>
      ),
    },
    {
      key: 'order', header: 'Order', hideBelow: 'sm', sort: i => i.orderId || '',
      render: i => <span className="text-slate-400 font-mono text-[11px]">{i.orderId || '—'}</span>,
    },
    {
      key: 'incentive', header: 'Incentive', align: 'right',
      // Free goods are counted in units and everything else in rupees, so they
      // cannot share a sort. Units sort among themselves below any cash value.
      sort: i => (i.incentiveType === 'Free Goods' ? -1 : Number(i.incentiveValue) || 0),
      // A Percent icon sat in front of every incentive that was not free goods,
      // so a flat Cash payout of 450 rupees read as "% ₹450" -- and so did a
      // Discount one, whose percentage is on the scheme, not on this figure.
      // There are three types; the icon only knew about two of them. The type
      // is named underneath instead, which is what the icon was reaching for.
      render: i => {
        const freeGoods = i.incentiveType === 'Free Goods';
        return (
          <div className="leading-tight">
            <div className="inline-flex items-center gap-1 font-semibold text-white">
              {freeGoods && <Package size={12} className="text-purple-400" />}
              {freeGoods ? `${i.incentiveValue} units` : formatCurrency(i.incentiveValue)}
            </div>
            <div className="text-[10px] text-slate-500 font-normal">{i.incentiveType || 'Cash'}</div>
          </div>
        );
      },
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: i => i.status || '',
      render: i => (
        <Badge tone={i.status === 'Paid' ? 'success' : 'warning'}>
          {i.status === 'Paid' ? <CheckCircle size={10} /> : <Clock size={10} />}{i.status}
        </Badge>
      ),
    },
    ...(canManage ? [{
      key: 'actions', header: '', align: 'center', width: 'w-28',
      render: i => (i.status === 'Earned'
        ? <Button size="sm" onClick={async () => { if (!await markIncentivePaid(i.id)) toast(PAYOUT_FAILED, 'error'); }}>Mark Paid</Button>
        : null),
    }] : []),
  ];

  const handleExport = () => downloadCSV(visible.map(i => ({
    Incentive: i.id,
    Party: partyName(i).name,
    Type: partyName(i).type,
    Scheme: i.schemeName,
    Order: i.orderId || '',
    Kind: i.incentiveType,
    Value: i.incentiveValue,
    Status: i.status,
    Date: formatDate(i.createdAt),
  })), 'PRISMORA_Incentives');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Gift}
        title={isParty ? 'My Incentives' : 'Distributor, Dealer & Retailer Incentives'}
        subtitle={isParty
          ? 'Auto-calculated incentives earned from qualifying scheme orders.'
          : 'Incentives auto-generated across distributors, dealers and retailers from active schemes.'}
        actions={<Button icon={Download} onClick={handleExport}>Export</Button>}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Awaiting Payout" value={formatCurrency(kpis.earned)} icon={Clock} tone="warning" />
        <StatCard label="Paid Out" value={formatCurrency(kpis.paid)} icon={CheckCircle} tone="success" />
        <StatCard label="Total Incentives" value={kpis.count} icon={Wallet} tone="info" />
      </div>

      <Card padding="p-4" className="flex flex-col md:flex-row gap-3 md:items-center">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by scheme or order ID"
        />
        <div className="flex gap-1.5">
          {['All', 'Earned', 'Paid'].map(st => (
            <button key={st} type="button" onClick={() => setStatusFilter(st)}
              className={`h-10 px-3 rounded-xl text-xs font-semibold border transition-colors ${
                statusFilter === st
                  ? 'bg-brand-accent/15 border-brand-accent/40 text-brand-accent'
                  : 'border-white/10 text-slate-400 hover:text-white hover:border-white/25'
              }`}>
              {st}
            </button>
          ))}
        </div>
      </Card>

      <DataTable
        title="Incentives"
        columns={incentiveColumns}
        rows={visible}
        rowKey={i => i.id}
        empty={{
          icon: Gift,
          title: 'No incentives yet',
          hint: 'Incentives are worked out automatically when an order qualifies for an active scheme. Raise one against a running scheme and it appears here.',
        }}
      />
    </div>
  );
}
