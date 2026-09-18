import { useMemo, useState } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { Wallet, ArrowUpCircle, ArrowDownCircle, CreditCard, Download } from 'lucide-react';
import { downloadCSV } from '../utils/exportUtils';
import { PageHeader, DataTable, Card, StatCard, EmptyState, Button } from '../components/ui';
import { buildLedgerEntries, allParties } from '../utils/distributorUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

export default function Ledger() {
  const { invoices, distributorPayments, distributors, dealers, retailers, orders, correctPartyBalance } = useData();
  const { user, canAccess } = useAuth();

  // A partner sees their own account. Staff have full access to this screen but
  // are not a party themselves, so they choose whose ledger to read — a running
  // balance only means anything for one account at a time.
  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const [selectedPartyId, setSelectedPartyId] = useState('');
  const [correcting, setCorrecting] = useState(false);
  const [correction, setCorrection] = useState(null);

  // A partner may read their own ledger but not rewrite the company's record of
  // what they owe, so the correction is staff-only.
  const canCorrect = !isParty && canAccess('accounting', 'full');

  const ownParty = useMemo(() => {
    if (user?.role === 'Dealer') return dealers?.find(d => d.id === user?.dealerId);
    if (user?.role === 'Retailer') return retailers?.find(r => r.id === user?.retailerId);
    if (user?.role === 'Distributor') return distributors?.find(d => d.id === user?.distributorId);
    return null;
  }, [distributors, dealers, retailers, user]);

  const partyOptions = useMemo(
    () => (isParty ? [] : allParties(distributors, dealers, retailers)),
    [isParty, distributors, dealers, retailers]
  );
  const party = isParty ? ownParty : partyOptions.find(p => p.id === selectedPartyId);
  const entries = useMemo(() => buildLedgerEntries(party, invoices, distributorPayments, orders), [party, invoices, distributorPayments, orders]);

  // `outstandingAmount` is a single number kept on the party record and adjusted
  // as invoices and payments happen; the table below is recomputed from those
  // same documents. They are two different sources for the same figure, so they
  // can drift — a failed write, a deleted invoice, or an edit made directly in
  // the database will separate them. Show the ledger's own total as the headline
  // and say so plainly when the stored figure disagrees, rather than printing a
  // number the rows underneath contradict.
  const ledgerBalance = entries.length ? entries[entries.length - 1].balance : 0;
  const storedBalance = Number(party?.outstandingAmount || 0);
  const drift = Math.round(ledgerBalance - storedBalance);

  /**
   * The statement of account, as a file.
   *
   * Every row in the order it is read on screen, with the running balance
   * carried, because a statement without the balance beside each line is not a
   * statement -- it is a list of amounts.
   */
  const handleExport = () => downloadCSV(entries.map(row => ({
    Date: formatDate(row.date),
    Description: row.description,
    Reference: row.ref || '',
    Debit: row.debit || '',
    Credit: row.credit || '',
    Balance: row.balance,
  })), `PRISMORA_Statement_${(party?.name || 'account').replace(/[^A-Za-z0-9]+/g, '_')}`);

  const partyPicker = !isParty && (
    <div className="glass-panel rounded-2xl p-4 border border-white/5">
      <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">Viewing ledger for</label>
      <select
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

  if (!party) {
    return (
      <div className="space-y-6 animate-fade-in-up">
        <PageHeader
          icon={Wallet}
          title="Outstanding Ledger"
          subtitle="Invoices, payments and running balance with Janki Herbals."
        />
        {partyPicker}
        <Card padding="p-0">
          <EmptyState
            icon={Wallet}
            title={isParty
              ? 'Your account profile could not be found'
              : partyOptions.length === 0
                ? 'No distributors, dealers or retailers yet'
                : 'Choose a party above'}
            hint={isParty
              ? 'This login is not linked to a distributor, dealer or retailer record. An administrator can link it from the Distributors, Dealers or Retailers screen.'
              : partyOptions.length === 0
                ? 'A ledger belongs to a party, so add one first and its invoices and payments will collect here.'
                : 'Pick whose invoices, payments and running balance to look at.'}
          />
        </Card>
      </div>
    );
  }

  const utilizationPct = party.creditLimit ? Math.min(100, Math.round((ledgerBalance / party.creditLimit) * 100)) : 0;

  // Deliberately none of these is sortable. The balance column is a running
  // total in date order, so re-ordering the rows by amount or description would
  // leave a balance column that no longer adds up to anything.
  const ledgerColumns = [
    {
      key: 'date', header: 'Date',
      render: r => <span className="text-slate-500">{formatDate(r.date)}</span>,
    },
    {
      key: 'description', header: 'Description',
      render: r => (
        <span className="inline-flex items-center gap-2">
          {r.debit > 0
            ? <ArrowUpCircle size={13} className="text-rose-400 flex-shrink-0" />
            : <ArrowDownCircle size={13} className="text-emerald-400 flex-shrink-0" />}
          {r.description}
        </span>
      ),
    },
    {
      key: 'debit', header: 'Debit', align: 'right',
      render: r => <span className="text-rose-400 font-medium">{r.debit > 0 ? formatCurrency(r.debit) : '—'}</span>,
    },
    {
      key: 'credit', header: 'Credit', align: 'right',
      render: r => <span className="text-emerald-400 font-medium">{r.credit > 0 ? formatCurrency(r.credit) : '—'}</span>,
    },
    {
      key: 'balance', header: 'Balance', align: 'right',
      render: r => <span className="font-bold text-white">{formatCurrency(r.balance)}</span>,
    },
  ];

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={Wallet}
        title="Outstanding Ledger"
        subtitle={isParty
          ? 'Your invoices, payments and running balance with Janki Herbals.'
          : `Invoices, payments and running balance for ${party.name}.`}
        actions={entries.length > 0
          ? <Button icon={Download} onClick={handleExport}>Export statement</Button>
          : undefined}
      />

      {partyPicker}

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
        <StatCard
          label="Current Outstanding"
          value={formatCurrency(ledgerBalance)}
          icon={Wallet}
          tone={ledgerBalance > (party.creditLimit || 0) ? 'danger' : 'accent'}
          hint={drift !== 0
            ? `Account record shows ${formatCurrency(storedBalance)}. The figure above is calculated from the entries below.`
            : undefined}
        />
        <StatCard label="Credit Limit" value={formatCurrency(party.creditLimit)} icon={CreditCard} tone="success" />
        <Card padding="p-4 sm:p-5">
          <p className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">Utilisation</p>
          <p className="text-2xl font-extrabold text-white leading-none mt-2">{utilizationPct}%</p>
          <div className="mt-3 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className={`h-full rounded-full ${utilizationPct > 90 ? 'bg-rose-500' : utilizationPct > 60 ? 'bg-amber-500' : 'bg-emerald-500'}`}
              style={{ width: `${utilizationPct}%` }}
            />
          </div>
          <p className="text-[10px] text-slate-500 mt-1.5">of the credit limit above</p>
        </Card>
      </div>

      {drift !== 0 && canCorrect && (
        <Card padding="p-4" className="border-amber-500/25 bg-amber-500/5">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div className="min-w-0">
              <p className="text-xs text-amber-300 leading-relaxed">
                <span className="font-bold">
                  The account record and this ledger disagree by {formatCurrency(Math.abs(drift))}.
                </span>{' '}
                The record says {formatCurrency(storedBalance)}; the entries below add up to{' '}
                {formatCurrency(ledgerBalance)}. The entries are the ones that can be checked row by row.
              </p>
              <p className="text-[11px] text-amber-300/70 mt-1.5 leading-relaxed">
                The balance is not editable on any form, so correcting it by hand would mean inventing a payment
                that never happened. This sets the record to what the documents add up to.
              </p>
            </div>
            <Button
              variant="primary"
              disabled={correcting}
              onClick={async () => {
                setCorrecting(true);
                setCorrection(await correctPartyBalance(party, party.partyType));
                setCorrecting(false);
              }}
            >
              {correcting ? 'Correcting…' : 'Correct the record'}
            </Button>
          </div>
        </Card>
      )}

      {correction && (
        <Card padding="p-4" className="border-emerald-500/25 bg-emerald-500/5">
          <p className="text-xs text-emerald-300 leading-relaxed">
            {correction.changed
              ? `Outstanding corrected from ${formatCurrency(correction.from)} to ${formatCurrency(correction.to)}.`
              : 'The record already matched the ledger; nothing was changed.'}
          </p>
        </Card>
      )}

      <DataTable
        title="Entries"
        columns={ledgerColumns}
        rows={entries}
        rowKey={r => r.id}
        empty={{
          icon: Wallet,
          title: 'No ledger activity yet',
          hint: 'Entries appear here once an order is marked Delivered — that is the point an invoice is raised against the account. Payments are recorded here as credits.',
        }}
      />
    </div>
  );
}
