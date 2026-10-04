/**
 * Sales returns as the Orders screen shows them (Gap 11). Read-only: returns
 * are written by record_sales_return (054), which also checks the quantities.
 */

const num = (v) => Number(v) || 0;

/**
 * Units an order delivered, counted the way order_returnable (054/055) does:
 * a multi-line order counts once fulfilled; a single-product order counts its
 * delivered quantity (or the whole order once fulfilled).
 */
export const deliveredUnits = (order) => {
  if (!order) return 0;
  if (Array.isArray(order.items) && order.items.length > 0) {
    return order.fulfilledAt ? order.items.reduce((s, i) => s + num(i?.quantity), 0) : 0;
  }
  if (order.fulfilledAt) return Math.max(num(order.quantity), num(order.deliveredQty));
  return num(order.deliveredQty);
};

/** This order's returns, oldest first. */
export const returnsForOrder = (salesReturns, orderId) =>
  (salesReturns || [])
    .filter(r => r && r.orderId === orderId)
    .sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || '')));

export const returnedUnits = (returns) =>
  (returns || []).reduce((s, r) => s + (Array.isArray(r.lines) ? r.lines.reduce((t, l) => t + num(l?.quantity), 0) : 0), 0);

/**
 * { returned, delivered, left, label } — label is null (nothing came back),
 * 'Partially returned' or 'Fully returned'.
 */
export const orderReturnState = (order, salesReturns) => {
  const returned = returnedUnits(returnsForOrder(salesReturns, order?.id));
  const delivered = deliveredUnits(order);
  const left = Math.max(0, delivered - returned);
  let label = null;
  if (returned > 0) label = delivered > 0 && left === 0 ? 'Fully returned' : 'Partially returned';
  return { returned, delivered, left, label };
};

/** One row per returned line, for the Returns lists. */
export const returnLineRows = (returns) =>
  (returns || []).flatMap(r => (Array.isArray(r.lines) && r.lines.length ? r.lines : [{}]).map((l, i) => ({
    key: `${r.id}-${i}`,
    returnId: r.id,
    date: r.createdAt,
    product: l.product || '',
    batch: l.batchNumber || '',
    quantity: num(l.quantity),
    reason: l.reason || '',
    creditNoteId: r.creditNoteId || '',
    note: r.note || '',
    createdBy: r.createdBy || '',
  })));
