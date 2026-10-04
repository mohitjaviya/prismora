import { ArrowUpCircle, ArrowDownCircle } from 'lucide-react';
import { personName } from '../utils/attribution';
import { balanceStanding, signedLedgerAmount, ledgerDifference } from '../utils/distributorUtils';

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : 'N/A';

/** "Balance ₹X" or "Credit ₹X" after a line. */
const RunningBalance = ({ value }) => {
  const s = balanceStanding(value);
  return (
    <span className={`whitespace-nowrap ${s.credit ? 'text-emerald-400/80' : 'text-slate-500'}`}>
      {s.credit ? 'Credit' : 'Balance'} {formatCurrency(s.amount)}
    </span>
  );
};

/**
 * A partner's ledger in their detail drawer (Distributors, Dealers, Retailers):
 * newest line first, each with the running balance after it, and the total at
 * the foot. The total is the stored balance, which only the database moves.
 */
export default function PartnerLedgerList({ entries, outstanding, users }) {
  if (!entries.length) return <p className="text-xs text-slate-500 text-center py-4">No ledger activity yet.</p>;
  const standing = balanceStanding(outstanding);
  const mismatch = ledgerDifference(entries, outstanding);
  return (
    <>
      <div className="max-h-52 overflow-y-auto custom-scrollbar space-y-1.5">
        {entries.slice().reverse().map(row => (
          <div key={row.id} className="flex items-center justify-between gap-3 text-xs bg-brand-primary-lighter/30 rounded-lg px-3 py-2">
            <div className="flex items-center gap-2 min-w-0">
              {row.debit > 0 ? <ArrowUpCircle size={13} className="text-rose-400 flex-shrink-0" /> : <ArrowDownCircle size={13} className="text-emerald-400 flex-shrink-0" />}
              <div className="min-w-0">
                <p className="text-slate-300 break-words">{row.description}</p>
                {/* Who put this line in the ledger. Blank for an invoice
                    raised by delivery, which nobody typed. */}
                <p className="text-[10px] text-slate-500">
                  {formatDate(row.date)}
                  {row.recordedBy && <> &middot; {personName(users, row.recordedBy)}</>}
                </p>
              </div>
            </div>
            <div className="text-right flex-shrink-0">
              <p className={`font-semibold whitespace-nowrap ${row.debit > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                {signedLedgerAmount(row, formatCurrency)}
              </p>
              <p className="text-[10px]"><RunningBalance value={row.balance} /></p>
            </div>
          </div>
        ))}
      </div>
      <div className={`mt-2 flex items-center justify-between rounded-lg px-3 py-2 text-sm border ${standing.credit ? 'bg-emerald-500/10 border-emerald-500/20' : 'bg-rose-500/10 border-rose-500/20'}`}>
        <span className="font-semibold text-slate-300">{standing.label}</span>
        <span className={`font-bold whitespace-nowrap ${standing.credit ? 'text-emerald-400' : 'text-rose-400'}`}>{formatCurrency(standing.amount)}</span>
      </div>
      {standing.credit && (
        <p className="mt-1 text-[10px] text-slate-500">Held for the partner; it pays their next invoices first.</p>
      )}
      {mismatch && (
        <p className="mt-1 text-[10px] text-amber-400">
          The lines above add up to {formatCurrency(mismatch.lines)}; the balance on record is {formatCurrency(mismatch.outstanding)}.
        </p>
      )}
    </>
  );
}
