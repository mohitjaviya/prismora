/**
 * What an order still lacks before it can move to `targetStatus`, as the words
 * the error message uses — or null when nothing is missing.
 *
 * An order cannot leave Pending until there is somewhere to send it. Both
 * parts are needed: a pincode without a street cannot be delivered to, and a
 * street without a pincode will not route. Cancelled is exempt — an order
 * being abandoned never ships.
 */
export const missingDelivery = (order, targetStatus) => {
  if (targetStatus === 'Pending' || targetStatus === 'Cancelled') return null;
  const missing = [];
  if (!String(order?.deliveryAddress || '').trim()) missing.push('a delivery address');
  if (!String(order?.deliveryPincode || '').trim()) missing.push('a pincode');
  return missing.length ? missing.join(' and ') : null;
};
