import { describe, it, expect } from 'vitest';
import { leadOrderDraft } from '../leadConversion';
import { missingDelivery } from '../delivery';

const LEAD = {
  id: 'L7', name: 'Asha Patel', company: 'Patel Stores', phone: '9876500000', email: 'asha@patel.in',
  state: 'Gujarat', city: 'Anand', assignedTo: 'U-1', dealValue: 5000,
};
const ONE_ITEM = [{ name: 'Neem Face Wash', quantity: 10, unitPrice: 120, total: 1200 }];
const NOW = new Date('2026-09-24T10:00:00Z');

describe('leadOrderDraft - the order a lead becomes', () => {
  // The gap this closes: the convert step never asked where to deliver, so
  // every converted order was stopped later on the way out of Pending.
  it('carries the address given at conversion, so the order can leave Pending', () => {
    const order = leadOrderDraft(LEAD, ONE_ITEM, {
      state: 'Gujarat', city: 'Anand', deliveryAddress: ' 12 Station Road, Vidyanagar ', deliveryPincode: '388120',
    }, NOW);

    expect(order.deliveryAddress).toBe('12 Station Road, Vidyanagar');
    expect(order.deliveryPincode).toBe('388120');
    expect(order.status).toBe('Pending');
    expect(missingDelivery(order, 'Processing')).toBeNull();
  });

  it('starts state and city from the lead, so only street and pincode need typing', () => {
    const order = leadOrderDraft(LEAD, ONE_ITEM, { deliveryAddress: '12 Station Road', deliveryPincode: '388120' }, NOW);
    expect(order.state).toBe('Gujarat');
    expect(order.city).toBe('Anand');
  });

  it('takes a state or city corrected at conversion over the lead', () => {
    const order = leadOrderDraft(LEAD, ONE_ITEM, { state: 'Gujarat', city: 'Vadodara' }, NOW);
    expect(order.city).toBe('Vadodara');
  });

  it('still saves at Pending with no address, and the check before Processing catches it', () => {
    // A rep on a call may not have the address yet. That is allowed; the order
    // just cannot move on until someone adds it.
    const order = leadOrderDraft(LEAD, ONE_ITEM, {}, NOW);

    expect(order.status).toBe('Pending');
    expect(order.deliveryAddress).toBe('');
    expect(order.deliveryPincode).toBe('');
    expect(missingDelivery(order, 'Pending')).toBeNull();
    expect(missingDelivery(order, 'Processing')).toBe('a delivery address and a pincode');
  });

  it('asks for whichever half is still missing', () => {
    expect(missingDelivery(leadOrderDraft(LEAD, ONE_ITEM, { deliveryPincode: '388120' }, NOW), 'Processing'))
      .toBe('a delivery address');
    expect(missingDelivery(leadOrderDraft(LEAD, ONE_ITEM, { deliveryAddress: '12 Station Road' }, NOW), 'Processing'))
      .toBe('a pincode');
  });

  it('keeps the rest of the order as it was', () => {
    const order = leadOrderDraft(LEAD, ONE_ITEM, {}, NOW);
    expect(order).toMatchObject({
      customerName: 'Asha Patel', companyName: 'Patel Stores', product: 'Neem Face Wash',
      quantity: 10, value: 1200, assignedTo: 'U-1', leadId: 'L7', date: NOW.toISOString(),
    });
    expect(order.items).toBeUndefined();
  });

  it('names a multi-product order by its first item and keeps the line items', () => {
    const items = [
      ...ONE_ITEM,
      { name: 'Aloe Gel', quantity: 5, unitPrice: 80, total: 400 },
      { name: 'Hand Wash', quantity: 2, unitPrice: 60, total: 120 },
    ];
    const order = leadOrderDraft(LEAD, items, {}, NOW);
    expect(order.product).toBe('Neem Face Wash +2 more items');
    expect(order.items).toHaveLength(3);
    expect(order.quantity).toBe(17);
    expect(order.value).toBe(1720);
  });
});

describe('missingDelivery - the Pending → Processing safety net on Orders', () => {
  const addressed = { deliveryAddress: '12 Station Road', deliveryPincode: '388120' };

  it('blocks every status past Pending without both halves of the address', () => {
    for (const status of ['Processing', 'Ready for Dispatch', 'Shipped', 'Delivered']) {
      expect(missingDelivery({}, status)).toBe('a delivery address and a pincode');
    }
  });

  it('lets Pending and Cancelled through without one', () => {
    expect(missingDelivery({}, 'Pending')).toBeNull();
    expect(missingDelivery({}, 'Cancelled')).toBeNull();
  });

  it('does not count whitespace as an address', () => {
    expect(missingDelivery({ deliveryAddress: '   ', deliveryPincode: '388120' }, 'Processing')).toBe('a delivery address');
  });

  it('lets an addressed order through', () => {
    expect(missingDelivery(addressed, 'Processing')).toBeNull();
  });
});
