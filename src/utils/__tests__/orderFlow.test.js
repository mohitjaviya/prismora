import { describe, it, expect } from 'vitest';
import { canStepTo, nextStepsFor, stepRefusal, lockingInvoice } from '../orderFlow';

describe('order stages (062)', () => {
  it('moves one step at a time', () => {
    expect(canStepTo('Pending', 'Processing')).toBe(true);
    expect(canStepTo('Processing', 'Ready for Dispatch')).toBe(true);
    expect(canStepTo('Ready for Dispatch', 'Shipped')).toBe(true);
    expect(canStepTo('Shipped', 'Delivered')).toBe(true);
    expect(canStepTo('Shipped', 'Partially Delivered')).toBe(true);
    expect(canStepTo('Partially Delivered', 'Delivered')).toBe(true);
  });

  it('refuses skipping, going back and reviving', () => {
    expect(canStepTo('Pending', 'Shipped')).toBe(false);
    expect(canStepTo('Processing', 'Delivered')).toBe(false);
    expect(canStepTo('Ready for Dispatch', 'Processing')).toBe(false);
    expect(canStepTo('Cancelled', 'Pending')).toBe(false);
    expect(canStepTo('Delivered', 'Cancelled')).toBe(false);
    expect(canStepTo('Pending', 'Partially Delivered')).toBe(false);
  });

  it('can cancel before delivery, and staying put is fine', () => {
    for (const s of ['Pending', 'Processing', 'Ready for Dispatch', 'Shipped']) expect(canStepTo(s, 'Cancelled')).toBe(true);
    expect(canStepTo('Processing', 'Processing')).toBe(true);
    expect(nextStepsFor('Delivered')).toEqual([]);
  });

  it('explains a refusal the way the database does', () => {
    expect(stepRefusal('O126', 'Processing', 'Shipped'))
      .toBe('Order O126 is Processing; the next step is Ready for Dispatch. It cannot go to Shipped from here.');
  });

  it('finds the invoice that locks an order', () => {
    const invoices = [{ id: 'INV-1', orderId: 'O1' }];
    expect(lockingInvoice({ id: 'O1' }, invoices)?.id).toBe('INV-1');
    expect(lockingInvoice({ id: 'O2' }, invoices)).toBeNull();
    expect(lockingInvoice(null, invoices)).toBeNull();
  });
});
