/**
 * The order stages, one step at a time — the same table the database
 * enforces (062_order_status_flow.sql). The screen uses it to offer only the
 * next step and to explain a refusal before anything is sent.
 */
export const ORDER_NEXT_STEPS = {
  Pending: ['Processing', 'Cancelled'],
  Processing: ['Ready for Dispatch', 'Cancelled'],
  'Ready for Dispatch': ['Shipped', 'Cancelled'],
  Shipped: ['Delivered', 'Partially Delivered', 'Cancelled'],
  'Partially Delivered': ['Partially Delivered', 'Delivered'],
};

export const nextStepsFor = (status) => ORDER_NEXT_STEPS[status] || [];

/** True when `to` is the saved status itself or one of its next steps. */
export const canStepTo = (from, to) => from === to || nextStepsFor(from).includes(to);

/** The refusal, in the database's words. */
export function stepRefusal(orderId, from, to) {
  const next = nextStepsFor(from).filter(s => s !== 'Cancelled');
  return `Order ${orderId} is ${from}; the next step is ${next.length ? next.join(' or ') : 'none'}. It cannot go to ${to} from here.`;
}

/**
 * A backorder split from this order that is still being fulfilled, if any.
 * While one is open the order cannot be cancelled or deleted (070).
 */
export const openBackorderOf = (order, orders) =>
  (order?.id && (orders || []).find(o => o.splitFromOrderId === order.id
    && !['Delivered', 'Cancelled'].includes(o.status || 'Pending'))) || null;

/** The invoice that locks an order's value, quantity and items (061), if any. */
export const lockingInvoice = (order, invoices) =>
  (order?.id && (invoices || []).find(i => i.orderId === order.id)) || null;
