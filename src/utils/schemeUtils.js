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

export const isSchemeEligible = (scheme, order, now = new Date()) => {
  if (scheme.status !== 'Active') return false;
  if (scheme.validFrom && new Date(scheme.validFrom) > now) return false;
  if (scheme.validTo && new Date(scheme.validTo) < now) return false;
  const hasProductTarget = Array.isArray(scheme.applicableProducts) && scheme.applicableProducts.length > 0;
  const matchValue = getSchemeMatchValue(scheme, order);
  if (hasProductTarget && matchValue <= 0) return false;
  return matchValue >= Number(scheme.minOrderValue || 0);
};
