import { useState, useMemo } from 'react';
import { useData } from '../context/DataContext';
import { useAuth } from '../context/AuthContext';
import { createPortal } from 'react-dom';
import { FileCheck2, Plus, X, CheckCircle, XCircle, Clock, Wallet, Download } from 'lucide-react';
import { useToast } from '../context/DialogContext';
import { downloadCSV } from '../utils/exportUtils';
import { PageHeader, DataTable, Button, Badge, StatCard, Card, SearchInput } from '../components/ui';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

const statusConfig = {
  'Pending':  { cls: 'bg-amber-500/10 text-amber-400 border-amber-500/20', icon: <Clock size={12} /> },
  'Approved': { cls: 'bg-blue-500/10 text-blue-400 border-blue-500/20', icon: <CheckCircle size={12} /> },
  'Settled':  { cls: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20', icon: <CheckCircle size={12} /> },
  'Rejected': { cls: 'bg-rose-500/10 text-rose-400 border-rose-500/20', icon: <XCircle size={12} /> },
};

const inputCls = "w-full glass-input rounded-xl px-4 py-2.5 text-sm text-white placeholder-slate-600";
const labelCls = "block text-xs font-semibold text-slate-400 mb-1.5 uppercase tracking-wide";

const BLANK_FORM = { incentiveId: '', amount: '', notes: '' };

// Maps a portal role to the id field its records carry on shared tables
// (schemeClaims/orders/etc.) — keeps 3-way party logic from becoming a
// chain of ternaries.
const PARTY_ID_FIELD = { Distributor: 'distributorId', Dealer: 'dealerId', Retailer: 'retailerId' };


export default function Claims() {
  const { schemeClaims, addSchemeClaim, updateSchemeClaimStatus, distributorIncentives, distributors, dealers, retailers } = useData();
  const toast = useToast();
  const { user, canAccess } = useAuth();

  const isParty = ['Distributor', 'Dealer', 'Retailer'].includes(user?.role);
  const distributor = useMemo(() => distributors?.find(d => d.id === user?.distributorId), [distributors, user]);
  const dealer = useMemo(() => dealers?.find(d => d.id === user?.dealerId), [dealers, user]);
  const retailer = useMemo(() => retailers?.find(r => r.id === user?.retailerId), [retailers, user]);
  const party = user?.role === 'Distributor' ? distributor : user?.role === 'Dealer' ? dealer : user?.role === 'Retailer' ? retailer : null;
  const canReview = canAccess('claims', 'full') && !isParty;

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [form, setForm] = useState(BLANK_FORM);
  const [reviewingClaim, setReviewingClaim] = useState(null);
  const [reviewNotes, setReviewNotes] = useState('');

  const visibleClaims = useMemo(() => {
    // A party whose own record can't be resolved must see nothing. Without this,
    // `c[field] === party?.id` becomes `undefined === undefined`, which matches
    // every unassigned claim and leaks it to them.
    if (isParty && !party?.id) return [];
    const base = isParty
      ? schemeClaims.filter(c => c[PARTY_ID_FIELD[user?.role]] === party.id)
      : schemeClaims;
    return base.filter(c => {
      const matchSearch = !search || c.schemeName.toLowerCase().includes(search.toLowerCase()) || c.id.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === 'All' || c.status === statusFilter;
      return matchSearch && matchStatus;
    }).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }, [schemeClaims, isParty, party, user, search, statusFilter]);

  // What can be claimed (083): the party's own Earned incentives that have no
  // open claim. The database checks the same and takes the scheme, order and
  // partner from the incentive.
  const claimable = useMemo(() => {
    if (!party?.id) return [];
    const open = new Set(schemeClaims.filter(c => c.incentiveId && c.status !== 'Rejected').map(c => c.incentiveId));
    return (distributorIncentives || []).filter(i => i[PARTY_ID_FIELD[user?.role]] === party.id && i.status === 'Earned' && !open.has(i.id));
  }, [distributorIncentives, schemeClaims, party, user]);
  const chosen = claimable.find(i => i.id === form.incentiveId);
  const isFreeGoods = chosen?.incentiveType === 'Free Goods';
  const incentiveLabel = (i) => `${i.schemeName || 'Scheme'}${i.orderId ? ` — order ${i.orderId}` : ''} — ${i.incentiveType === 'Free Goods' ? `${i.incentiveValue} free unit(s) of ${i.incentiveProduct}` : formatCurrency(i.incentiveValue)}`;

  const kpis = useMemo(() => ({
    pending: visibleClaims.filter(c => c.status === 'Pending').length,
    approved: visibleClaims.filter(c => c.status === 'Approved').length,
    settledValue: visibleClaims.filter(c => c.status === 'Settled').reduce((s, c) => s + Number(c.amount || 0), 0),
  }), [visibleClaims]);

  const openAdd = () => { setForm(BLANK_FORM); setIsModalOpen(true); };

  const [isSaving, setIsSaving] = useState(false);
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (isSaving) return;
    if (!chosen || !party) return;
    setIsSaving(true);
    const r = await addSchemeClaim({
      distributorId: user?.role === 'Distributor' ? party.id : null,
      dealerId: user?.role === 'Dealer' ? party.id : null,
      retailerId: user?.role === 'Retailer' ? party.id : null,
      incentiveId: chosen.id,
      // The scheme, order and partner are taken from the incentive by the database.
      schemeName: chosen.schemeName,
      amount: isFreeGoods ? 0 : Number(form.amount || chosen.incentiveValue),
      notes: form.notes
    });
    setIsSaving(false);
    if (!r?.ok) { toast(r?.error || 'The claim could not be submitted.', 'error'); return; }
    toast(`Claim ${r.id} submitted.`, 'success');
    setIsModalOpen(false);
  };

  const openReview = (claim) => { setReviewingClaim(claim); setReviewNotes(claim.reviewNotes || ''); };

  const handleReview = async (status) => {
    if (!reviewingClaim) return;
    // Settling pays the incentive in the database (083); a refusal says why.
    const r = await updateSchemeClaimStatus(reviewingClaim.id, status, reviewNotes);
    if (!r?.ok) { toast(r?.error || 'The claim was not updated.', 'error'); return; }
    toast(status === 'Settled' ? `Claim ${reviewingClaim.id} settled: its incentive is paid.` : `Claim ${reviewingClaim.id} ${status.toLowerCase()}.`, 'success');
    setReviewingClaim(null);
  };

  const partyName = (claim) => {
    if (claim.distributorId) return { name: distributors?.find(d => d.id === claim.distributorId)?.name || 'Unknown', type: 'Distributor' };
    if (claim.dealerId) return { name: dealers?.find(d => d.id === claim.dealerId)?.name || 'Unknown', type: 'Dealer' };
    if (claim.retailerId) return { name: retailers?.find(r => r.id === claim.retailerId)?.name || 'Unknown', type: 'Retailer' };
    return { name: 'Unknown', type: '' };
  };

  const claimColumns = [
    ...(isParty ? [] : [{
      key: 'party', header: 'Party', sort: c => partyName(c).name,
      render: c => (
        <>
          <div className="font-semibold text-white">{partyName(c).name}</div>
          {partyName(c).type && <span className="text-[10px] text-slate-500 uppercase tracking-wide">{partyName(c).type}</span>}
        </>
      ),
    }]),
    {
      key: 'scheme', header: 'Scheme', sort: c => c.schemeName || '',
      render: c => (
        <>
          <div className="text-white">{c.schemeName}</div>
          {c.orderId && <div className="text-[11px] text-slate-500">Ref: {c.orderId}</div>}
        </>
      ),
    },
    {
      key: 'amount', header: 'Amount', align: 'right', sort: c => Number(c.amount) || 0,
      render: c => {
        const inc = (distributorIncentives || []).find(i => i.id === c.incentiveId);
        return inc?.incentiveType === 'Free Goods'
          ? <span className="font-semibold text-white">{inc.incentiveValue} unit(s)</span>
          : <span className="font-semibold text-white">{formatCurrency(c.amount)}</span>;
      },
    },
    {
      key: 'date', header: 'Date', hideBelow: 'sm',
      sort: c => (c.createdAt ? new Date(c.createdAt).getTime() : null),
      render: c => <span className="text-slate-500">{formatDate(c.createdAt)}</span>,
    },
    {
      key: 'status', header: 'Status', align: 'center', sort: c => c.status || '',
      render: c => <Badge>{statusConfig[c.status]?.icon}{c.status}</Badge>,
    },
    ...(canReview ? [{
      key: 'actions', header: '', align: 'center', width: 'w-24',
      // A settled claim is final (083): nothing left to review.
      render: c => (c.status === 'Settled' ? null : <Button size="sm" onClick={() => openReview(c)}>Review</Button>),
    }] : []),
  ];

  const handleExport = () => downloadCSV(visibleClaims.map(c => ({
    Claim: c.id,
    Party: partyName(c).name,
    Type: partyName(c).type,
    Scheme: c.schemeName,
    Order: c.orderId || '',
    Amount: c.amount,
    Status: c.status,
    Notes: c.reviewNotes || '',
    Date: formatDate(c.createdAt),
  })), 'PRISMORA_Scheme_Claims');

  return (
    <div className="space-y-6 animate-fade-in-up">
      <PageHeader
        icon={FileCheck2}
        title={isParty ? 'My Scheme Claims' : 'Scheme Claims'}
        subtitle={isParty
          ? 'Claim the incentives your orders have earned, and track each claim.'
          : 'Review and settle distributor, dealer and retailer scheme claims.'}
        actions={<>
          <Button icon={Download} onClick={handleExport}>Export</Button>
          {isParty && <Button variant="primary" icon={Plus} onClick={openAdd}>Submit Claim</Button>}
        </>}
      />

      <div className="grid grid-cols-3 gap-3 sm:gap-4">
        <StatCard label="Pending Review" value={kpis.pending} icon={Clock} tone={kpis.pending > 0 ? 'warning' : 'accent'} />
        <StatCard label="Approved, awaiting settlement" value={kpis.approved} icon={CheckCircle} tone="info" />
        <StatCard label="Settled Value" value={formatCurrency(kpis.settledValue)} icon={Wallet} tone="success" />
      </div>

      <Card padding="p-4" className="flex flex-col md:flex-row gap-3 md:items-center">
        <SearchInput
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Search by scheme or claim ID"
        />
        <div className="flex gap-1.5 flex-wrap">
          {['All', 'Pending', 'Approved', 'Settled', 'Rejected'].map(st => (
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
        title="Claims"
        columns={claimColumns}
        rows={visibleClaims}
        rowKey={c => c.id}
        empty={{
          icon: FileCheck2,
          title: 'No claims yet',
          hint: isParty
            ? 'A claim is how you ask for an incentive your orders have earned. Submit one and its progress shows here.'
            : 'Nothing has been claimed against a scheme yet. Claims submitted by distributors, dealers and retailers arrive here for review.',
          action: isParty ? <Button variant="primary" icon={Plus} onClick={openAdd}>Submit Claim</Button> : undefined,
        }}
      />

      {/* Submit Claim Modal */}
      {isModalOpen && createPortal(
        <div className="fixed inset-0 z-[200] flex items-start justify-center p-4 pt-[6vh]">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsModalOpen(false)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-lg rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white">Submit Scheme Claim</h3>
              <button onClick={() => setIsModalOpen(false)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label htmlFor="claims-incentive" className={labelCls}>Earned incentive *</label>
                {claimable.length === 0 ? (
                  <p className="text-sm text-slate-400">You have no earned incentives waiting to be claimed. Incentives appear here once a qualifying order earns one.</p>
                ) : (
                  <select id="claims-incentive" required value={form.incentiveId}
                    onChange={e => { const inc = claimable.find(i => i.id === e.target.value); setForm(f => ({ ...f, incentiveId: e.target.value, amount: inc && inc.incentiveType !== 'Free Goods' ? String(inc.incentiveValue) : '' })); }}
                    className={inputCls}>
                    <option value="" className="bg-brand-primary text-slate-500">-- Choose an incentive --</option>
                    {claimable.map(i => <option key={i.id} value={i.id} className="bg-brand-primary">{incentiveLabel(i)}</option>)}
                  </select>
                )}
              </div>
              {chosen && (isFreeGoods ? (
                <p className="text-sm text-slate-300">You are claiming {chosen.incentiveValue} free unit(s) of {chosen.incentiveProduct}, paid in goods.</p>
              ) : (
                <div>
                  <label htmlFor="claims-claim-amount" className={labelCls}>Claim Amount (₹) *</label>
                  <input id="claims-claim-amount" required type="number" min="1" max={chosen.incentiveValue} value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} className={inputCls} />
                  <p className="text-[11px] text-slate-500 mt-1">At most {formatCurrency(chosen.incentiveValue)}, what this incentive is worth.</p>
                </div>
              ))}
              <div>
                <label htmlFor="claims-notes" className={labelCls}>Notes</label>
                <textarea id="claims-notes" rows="3" value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Explain how you qualified for this scheme..." className={`${inputCls} resize-none`} />
              </div>
              <div className="flex gap-3 justify-end pt-2">
                <button type="button" onClick={() => setIsModalOpen(false)} className="px-4 py-2 text-sm bg-brand-primary-lighter text-slate-400 rounded-xl">Cancel</button>
                <button type="submit" disabled={isSaving || !chosen} className="px-4 py-2 text-sm btn-accent rounded-xl disabled:opacity-60">{isSaving ? 'Saving…' : 'Submit Claim'}</button>
              </div>
            </form>
          </div>
        </div>, document.body
      )}

      {/* Review Modal */}
      {reviewingClaim && createPortal(
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setReviewingClaim(null)} />
          <div className="relative glass-panel bg-brand-primary w-full max-w-md rounded-2xl shadow-2xl border border-brand-accent/30 animate-fade-in-up z-10 p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-bold text-white flex items-center gap-2"><Wallet size={18} className="text-brand-accent" />Review Claim</h3>
              <button onClick={() => setReviewingClaim(null)} className="p-1 text-slate-400 hover:text-white rounded-lg"><X size={18} /></button>
            </div>
            <div className="text-sm text-slate-300 space-y-1 mb-4">
              <p><span className="text-slate-500">{partyName(reviewingClaim).type || 'Party'}:</span> {partyName(reviewingClaim).name}</p>
              <p><span className="text-slate-500">Scheme:</span> {reviewingClaim.schemeName}</p>
              <p><span className="text-slate-500">Amount:</span> <span className="font-bold text-white">{formatCurrency(reviewingClaim.amount)}</span></p>
              {reviewingClaim.incentiveId
                ? <p><span className="text-slate-500">Incentive:</span> {reviewingClaim.incentiveId} — settling pays it</p>
                : <p className="text-amber-400 text-xs">Made before claims were tied to incentives: it cannot be settled. Reject it, and the partner can claim the incentive.</p>}
              {reviewingClaim.notes && <p><span className="text-slate-500">Notes:</span> {reviewingClaim.notes}</p>}
            </div>
            <label htmlFor="claims-review-notes" className={labelCls}>Review Notes</label>
            <textarea id="claims-review-notes" rows="2" value={reviewNotes} onChange={e => setReviewNotes(e.target.value)} className={`${inputCls} resize-none mb-4`} />
            <div className="grid grid-cols-3 gap-2">
              <button onClick={() => handleReview('Rejected')} className="px-3 py-2 text-xs font-bold bg-red-500/15 text-red-400 border border-red-500/30 rounded-lg">Reject</button>
              <button onClick={() => handleReview('Approved')} className="px-3 py-2 text-xs font-bold bg-blue-500/15 text-blue-400 border border-blue-500/30 rounded-lg">Approve</button>
              <button onClick={() => handleReview('Settled')} className="px-3 py-2 text-xs font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30 rounded-lg">Settle</button>
            </div>
          </div>
        </div>, document.body
      )}
    </div>
  );
}
