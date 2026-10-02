/**
 * Which stock may be sold (D-18).
 *
 * A batch is sellable until the end of its expiry day, India time; from the
 * next day it is expired, and it never counts as stock that can be sold or
 * delivered again. The database applies the same rule when a delivery takes
 * stock (deduct_stock, migration 052), so what the screen offers and what a
 * delivery can take agree.
 *
 * Expired batches stay on record — they are real goods on a shelf, to be
 * returned or written off — and are shown separately as "Expired".
 */
import { localDay } from './orderDate';

export const EXPIRING_SOON_DAYS = 30;

/** Whole days from today until the batch's expiry day (0 = expires today, negative = expired). */
export const daysToExpiry = (batch, now = new Date()) => {
  if (!batch?.expiryDate) return null;
  const [y, m, d] = localDay(batch.expiryDate).split('-').map(Number);
  const [ty, tm, td] = localDay(now).split('-').map(Number);
  if (!y || !ty) return null;
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(ty, tm - 1, td)) / 86400000);
};

export const isExpired = (batch, now = new Date()) => {
  const days = daysToExpiry(batch, now);
  return days !== null && days < 0;
};

export const isExpiringSoon = (batch, now = new Date(), within = EXPIRING_SOON_DAYS) => {
  const days = daysToExpiry(batch, now);
  return days !== null && days >= 0 && days <= within;
};

const unreserved = (b) => Math.max(0, (Number(b.quantity) || 0) - (Number(b.reserved) || 0));

/** What of a product can be sold or delivered now: unreserved, unexpired. */
export const sellableQty = (inventory, product, now = new Date()) => (inventory || [])
  .filter(b => b.product === product && !isExpired(b, now))
  .reduce((sum, b) => sum + unreserved(b), 0);

/** Units of a product sitting in expired batches. */
export const expiredQty = (inventory, product, now = new Date()) => (inventory || [])
  .filter(b => b.product === product && isExpired(b, now))
  .reduce((sum, b) => sum + (Number(b.quantity) || 0), 0);

/**
 * A batch's stock status, as the Inventory screen shows it. Expired comes
 * before low: an expired batch is not stock that can be sold, however much of
 * it there is (D-18, the rule deliveries follow too).
 */
export const stockStatus = (item) => {
  if (item.quantity === 0) return 'Out of Stock';
  if (isExpired(item)) return 'Expired';
  if (isExpiringSoon(item)) return 'Expiring Soon';
  if (item.quantity <= item.reorderLevel * 0.5) return 'Critical';
  if (item.quantity <= item.reorderLevel) return 'Low Stock';
  return 'OK';
};

/**
 * Needs reordering: low, critical or out. Shared by the Inventory "Low /
 * Critical" card and the Reports low-stock list (Phase 2 H12: Reports also
 * listed an expired batch, 10 vs 9; it belongs on the Expiry report).
 */
export const needsReorder = (item) => ['Low Stock', 'Critical', 'Out of Stock'].includes(stockStatus(item));
