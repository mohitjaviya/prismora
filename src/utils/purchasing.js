/**
 * The arithmetic behind a purchase return.
 *
 * All of it lived inside addPurchaseReturn, a closure in a 3,279-line provider,
 * so none of it could be tested — and the table has never held a single row, so
 * none of it has ever run against real data either. Two of the three steps a
 * return performs are money or stock movements, which makes it the least
 * examined risky path in the application.
 *
 * The vendor side repeated a mistake the sales side already fixed. See
 * vendorBalanceAfterReturn.
 */

/** What the returned goods are worth, to the paise. */
export function returnValue(items = []) {
  if (!Array.isArray(items)) return 0;
  const total = items.reduce((sum, item) => {
    const qty = Number(item?.quantity);
    const cost = Number(item?.unitCost);
    if (!Number.isFinite(qty) || !Number.isFinite(cost)) return sum;
    return sum + qty * cost;
  }, 0);
  return Math.round(total * 100) / 100;
}

/**
 * What the vendor is owed after goods go back to them.
 *
 * addPurchaseReturn used `Math.max(0, outstanding - value)`. settlement.js
 * carries a comment explaining why that is wrong on the sales side -- it
 * "silently discarded the excess", so a partner who paid in advance had the
 * advance forgotten. The same shape was still here on the purchase side, where
 * it means returning more goods than you currently owe for quietly throws the
 * credit away.
 *
 * Negative is meaningful and kept: it is the vendor owing you, which is exactly
 * what an over-return is.
 */
export function vendorBalanceAfterReturn(outstanding, value) {
  return Math.round(((Number(outstanding) || 0) - (Number(value) || 0)) * 100) / 100;
}

/** True when goods going back are worth more than is currently owed. */
export function isOverReturn(outstanding, value) {
  return (Number(value) || 0) > (Number(outstanding) || 0);
}

/**
 * Which inventory batch the returned units come out of.
 *
 * The first batch of that product holding stock, matched without regard to
 * case. Returns null when the product is not stocked or every batch is empty --
 * and the caller must treat that as "the stock movement did not happen", which
 * is the live situation today: all nine batches sit at zero.
 */
export function batchForReturn(inventory = [], product) {
  const name = String(product || '').trim().toLowerCase();
  if (!name) return null;
  return (inventory || []).find(
    b => String(b?.product || '').trim().toLowerCase() === name && Number(b?.quantity) > 0
  ) || null;
}

/**
 * A batch's quantity after an adjustment, floored at zero.
 *
 * Stock cannot go negative: unlike a balance, there is no such thing as owing
 * somebody minus four bottles. A return larger than the batch empties it, and
 * the shortfall is lost rather than recorded -- which is a real gap, but one
 * that needs a decision about split batches rather than a different clamp.
 */
export function stockAfterAdjustment(quantity, adjustment) {
  const from = Number(quantity);
  const by = Number(adjustment);
  if (!Number.isFinite(from) || !Number.isFinite(by)) return null;
  return Math.max(0, from + by);
}
