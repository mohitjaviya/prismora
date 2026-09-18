import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { ShoppingCart, AlertTriangle, ArrowRight } from 'lucide-react';
import { useData } from '../context/DataContext';
import { Badge, EmptyState } from './ui';
import {
  ordersForParty, recentFirst, orderStats, unmatchedValue,
} from '../utils/partnerOrders';

/**
 * What a partner has bought, on the partner's own record.
 *
 * Their detail panel used to show what they owe and nothing about what they
 * ordered, so a dealer owing three and a half lakh sat on screen with no way
 * to see what for without leaving for Operations and filtering the order list.
 *
 * One component for all three kinds, because Distributors, Dealers and
 * Retailers are the same screen with a different noun and had already drifted
 * apart once.
 */

const formatCurrency = (val) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(val || 0);

const formatDate = (d) =>
  d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

/** "4 days ago", or the honest absence of an answer. */
const lastOrderText = (days) => {
  if (days === null) return null;
  if (days <= 0) return 'today';
  if (days === 1) return 'yesterday';
  return `${days} days ago`;
};

const RECENT = 8;

export default function PartnerOrderHistory({ party, kind }) {
  const { orders } = useData();

  const { linked, unmatched, stats, recent } = useMemo(() => {
    const split = ordersForParty(orders, party, kind);
    return {
      linked: split.linked,
      unmatched: split.unmatched,
      stats: orderStats(split.linked),
      recent: recentFirst(split.linked).slice(0, RECENT),
    };
  }, [orders, party, kind]);

  const since = lastOrderText(stats.daysSinceLastOrder);
  // Long enough that somebody should probably ring them.
  const quiet = stats.daysSinceLastOrder !== null && stats.daysSinceLastOrder >= 60;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wide">Order history</h4>
        {linked.length > 0 && (
          <Link
            to={`/orders?searchId=${encodeURIComponent(party.id)}`}
            className="text-[11px] font-semibold text-brand-accent hover:underline inline-flex items-center gap-1"
          >
            All orders <ArrowRight size={11} />
          </Link>
        )}
      </div>

      {linked.length === 0 ? (
        <div className="rounded-xl border border-white/5 bg-brand-primary-lighter/20">
          <EmptyState
            compact
            icon={ShoppingCart}
            title="No orders yet"
            hint="Orders raised against this account will collect here, with their value and status."
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {[
              { label: 'Orders', value: stats.total },
              { label: 'Pending', value: stats.pending, tone: stats.pending > 0 ? 'text-amber-400' : 'text-white' },
              { label: 'Lifetime value', value: formatCurrency(stats.lifetimeValue) },
              { label: 'Average order', value: formatCurrency(stats.averageOrder) },
            ].map(s => (
              <div key={s.label} className="rounded-xl border border-white/5 bg-brand-primary-lighter/20 px-3 py-2.5">
                <p className={`text-base font-extrabold leading-none truncate ${s.tone || 'text-white'}`}>{s.value}</p>
                <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-1">{s.label}</p>
              </div>
            ))}
          </div>

          {since && (
            <p className={`text-[11px] ${quiet ? 'text-amber-400' : 'text-slate-500'}`}>
              Last order {since}
              <span className="text-slate-600"> · {formatDate(stats.lastOrderDate)}</span>
              {quiet && ' — worth a call.'}
            </p>
          )}

          <div className="rounded-xl border border-white/5 overflow-hidden">
            <div className="overflow-x-auto custom-scrollbar">
              <table className="w-full min-w-[420px]">
                <thead>
                  <tr className="bg-white/[0.02] border-b border-white/5">
                    {['Order', 'Product', 'Value', 'Status'].map((h, i) => (
                      <th
                        key={h}
                        scope="col"
                        className={`px-3 py-2 text-[10px] font-bold uppercase tracking-wide text-slate-400 ${
                          i === 2 ? 'text-right' : i === 3 ? 'text-center' : 'text-left'
                        }`}
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {recent.map(o => (
                    <tr key={o.id} className="border-b border-white/5 last:border-0">
                      <td className="px-3 py-2">
                        <div className="text-xs font-semibold text-white">{o.id}</div>
                        <div className="text-[10px] text-slate-500">{formatDate(o.date || o.createdAt)}</div>
                      </td>
                      <td className="px-3 py-2">
                        <div className="text-xs text-slate-300 truncate max-w-[14rem]">{o.product}</div>
                        <div className="text-[10px] text-slate-500">Qty: {o.quantity}</div>
                      </td>
                      <td className="px-3 py-2 text-right text-xs font-semibold text-white whitespace-nowrap">
                        {formatCurrency(o.value)}
                      </td>
                      <td className="px-3 py-2 text-center">
                        <Badge size="sm">{o.status}</Badge>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {linked.length > RECENT && (
            <p className="text-[11px] text-slate-500">
              Showing the {RECENT} most recent of {linked.length}.
            </p>
          )}
        </>
      )}

      {/* Orders that name this partner but carry no link to them. Counting
          them above would overstate what can be proved; leaving them out
          entirely would understate the business, so they are said out loud. */}
      {unmatched.length > 0 && (
        <div className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-3">
          <p className="text-[11px] text-amber-300 leading-relaxed flex gap-2">
            <AlertTriangle size={12} className="flex-shrink-0 mt-0.5" />
            <span>
              <span className="font-bold">
                {unmatched.length === 1
                  ? '1 more order carries this name'
                  : `${unmatched.length} more orders carry this name`}
                {' '}({formatCurrency(unmatchedValue(unmatched))})
              </span>{' '}
              but are not linked to this account, so they are not counted above. Orders raised from a converted lead
              record a customer name rather than an account. Re-saving the order against this account links it.
            </span>
          </p>
        </div>
      )}
    </div>
  );
}
