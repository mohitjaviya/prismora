/**
 * Value rules the database also enforces (078). These copies give the form a
 * clear sentence before the round-trip; the database is the one that decides.
 */

const num = (v) => (v === '' || v == null ? null : Number(v));

/** Scheme: discount 0–100, end on or after start, no negative quantities. */
export function schemeProblem(s = {}) {
  const pct = num(s.discountPct);
  if (pct != null && (Number.isNaN(pct) || pct < 0 || pct > 100)) return 'Discount must be between 0 and 100%.';
  if (num(s.freeGoodsQty) < 0) return 'Free goods quantity cannot be negative.';
  if (num(s.minOrderValue) < 0) return 'Minimum order value cannot be negative.';
  if (s.validFrom && s.validTo && new Date(s.validTo) < new Date(s.validFrom)) return 'Valid To cannot be before Valid From.';
  return null;
}

/** Product: a partner price may not be above the MRP. */
export function productPriceProblem(p = {}) {
  const mrp = num(p.mrp);
  if (mrp == null) return null;
  for (const [field, label] of [['distributorPrice', 'Distributor'], ['dealerPrice', 'Dealer'], ['retailerPrice', 'Retailer']]) {
    const v = num(p[field]);
    if (v != null && v > mrp) return `${label} price (₹${v}) cannot be above the MRP (₹${mrp}).`;
  }
  return null;
}
