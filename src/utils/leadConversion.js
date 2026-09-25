/**
 * The order a lead becomes when the salesperson confirms it.
 *
 * `items` are the confirmed line items ({ name, quantity, unitPrice, total }).
 * `delivery` is what the convert step collected: state and city start from the
 * lead, the street address and pincode are asked for there. Either may be left
 * blank — a rep on a call may not have the address yet. The order still saves
 * at Pending, and the check on leaving Pending (utils/delivery.js) asks again.
 */
export const leadOrderDraft = (lead, items, delivery = {}, now = new Date()) => {
  const totalUnits = items.reduce((sum, i) => sum + i.quantity, 0);
  const totalValue = items.reduce((sum, i) => sum + i.total, 0);
  const text = (v) => String(v || '').trim();

  return {
    customerName: lead.name,
    companyName: lead.company || '',
    // A single-product order leaves `items` unset: partial delivery is only
    // tracked for those, and setting items would opt it out.
    product: items.length === 1 ? items[0].name : `${items[0].name} +${items.length - 1} more item${items.length > 2 ? 's' : ''}`,
    items: items.length > 1 ? items : undefined,
    quantity: totalUnits,
    value: totalValue || Number(lead.dealValue || 0),
    state: text(delivery.state) || lead.state || '',
    city: text(delivery.city) || lead.city || '',
    deliveryAddress: text(delivery.deliveryAddress),
    deliveryPincode: text(delivery.deliveryPincode),
    status: 'Pending',
    assignedTo: lead.assignedTo || '',
    leadId: lead.id,
    phone: lead.phone || '',
    email: lead.email || '',
    date: now.toISOString(),
  };
};
