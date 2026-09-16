// If a scheme targets specific products, only the value of matching line
// items counts toward eligibility/discount — not the whole cart. Untargeted
// schemes (applicableProducts empty) behave exactly as before (whole order value).
export const getSchemeMatchValue = (scheme, order) => {
  const targets = scheme.applicableProducts;
  if (!Array.isArray(targets) || targets.length === 0) return Number(order.value || 0);
  const lineItems = Array.isArray(order.items) && order.items.length > 0
    ? order.items
    : [{ name: order.product, total: order.value }];
  return lineItems
    .filter(i => targets.includes(i.name))
    .reduce((s, i) => s + Number(i.total || (i.quantity * i.unitPrice) || 0), 0);
};

/**
 * Where a scheme stands today: 'Active', 'Scheduled', 'Expired' or 'Inactive'.
 *
 * The Schemes screen counted "Active Now" as `status === 'Active'` and looked
 * at no dates at all, so a scheme that ended in August and one that does not
 * begin until October were both reported as running — two live schemes on a
 * day when nothing was live. The cards were half-right: they greyed out a
 * scheme past its validTo but had no idea about validFrom, so one that had not
 * started yet still wore a green Active badge.
 *
 * isSchemeEligible below already applied all three rules, which is why a claim
 * against those schemes would have been refused while the screen insisted they
 * were on. This is that same test, so the screen and the claim agree.
 */
export const schemeLiveState = (scheme, now = new Date()) => {
  if (!scheme) return 'Inactive';
  if (scheme.status !== 'Active') return 'Inactive';
  if (scheme.validFrom && new Date(scheme.validFrom) > now) return 'Scheduled';
  if (scheme.validTo && new Date(scheme.validTo) < now) return 'Expired';
  return 'Active';
};

export const isSchemeEligible = (scheme, order, now = new Date()) => {
  if (scheme.status !== 'Active') return false;
  if (scheme.validFrom && new Date(scheme.validFrom) > now) return false;
  if (scheme.validTo && new Date(scheme.validTo) < now) return false;
  const hasProductTarget = Array.isArray(scheme.applicableProducts) && scheme.applicableProducts.length > 0;
  const matchValue = getSchemeMatchValue(scheme, order);
  if (hasProductTarget && matchValue <= 0) return false;
  return matchValue >= Number(scheme.minOrderValue || 0);
};
