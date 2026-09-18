/**
 * What a distributor, dealer or retailer has actually bought.
 *
 * Their screens showed what they owe and nothing about what they ordered, so
 * "this dealer owes three and a half lakh" sat on screen with no way to see
 * what for without leaving for Operations and filtering the order list.
 *
 * Orders already carry distributorId, dealerId and retailerId, so this is a
 * view over data that exists rather than anything new to store.
 */

const DELIVERED = ['Delivered'];
const CLOSED = ['Delivered', 'Cancelled'];

const norm = (s) => String(s ?? '').trim().toLowerCase();

/** The id field on an order that points at this kind of partner. */
export const PARTY_ID_FIELD = {
  distributor: 'distributorId',
  dealer: 'dealerId',
  retailer: 'retailerId',
};

/**
 * Their orders, split into what the database can prove and what it cannot.
 *
 * An order raised from a converted lead carries a customer name and no party
 * id at all. It belongs to this partner by every reading except the one the
 * database can check, so it is returned separately rather than folded in
 * silently or dropped. Counting it in the totals would overstate what can be
 * proved; dropping it would understate the business.
 */
export const ordersForParty = (orders, party, kind) => {
  const field = PARTY_ID_FIELD[kind];
  if (!party?.id || !field) return { linked: [], unmatched: [] };

  const all = orders || [];
  const linked = all.filter(o => o?.[field] && o[field] === party.id);

  const name = norm(party.name);
  const unmatched = name
    ? all.filter(o =>
      o &&
      !o.distributorId && !o.dealerId && !o.retailerId &&
      (norm(o.customerName) === name || norm(o.companyName) === name))
    : [];

  return { linked, unmatched };
};

const byDateDesc = (a, b) =>
  new Date(b.date || b.createdAt || 0) - new Date(a.date || a.createdAt || 0);

/** Newest first, for the "recent orders" list. */
export const recentFirst = (orders) => [...(orders || [])].sort(byDateDesc);

/**
 * The summary above the list.
 *
 * Cancelled orders are counted so the total matches what is on the screen
 * below, but they are left out of lifetime value: a cancelled order is not
 * money the partner has spent.
 */
export const orderStats = (orders) => {
  const rows = orders || [];
  const live = rows.filter(o => o?.status !== 'Cancelled');
  const value = live.reduce((sum, o) => sum + (Number(o?.value) || 0), 0);

  const dates = rows
    .map(o => new Date(o?.date || o?.createdAt || NaN))
    .filter(d => !Number.isNaN(d.getTime()));
  const last = dates.length ? new Date(Math.max(...dates.map(d => d.getTime()))) : null;

  return {
    total: rows.length,
    pending: rows.filter(o => !CLOSED.includes(o?.status)).length,
    delivered: rows.filter(o => DELIVERED.includes(o?.status)).length,
    cancelled: rows.filter(o => o?.status === 'Cancelled').length,
    lifetimeValue: value,
    // Averaged over the orders that count towards the value, so the average
    // times the count equals the total rather than being quietly diluted by
    // cancelled rows.
    averageOrder: live.length ? Math.round(value / live.length) : 0,
    lastOrderDate: last,
    daysSinceLastOrder: last ? Math.floor((Date.now() - last.getTime()) / 86400000) : null,
  };
};

/** The total sitting in orders that look like theirs but are not linked. */
export const unmatchedValue = (orders) =>
  (orders || [])
    .filter(o => o?.status !== 'Cancelled')
    .reduce((sum, o) => sum + (Number(o?.value) || 0), 0);
