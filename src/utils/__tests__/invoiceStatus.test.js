import { describe, it, expect } from 'vitest';
import { isSettled, isOpen, amountPaid, amountDue, collected, outstanding } from '../invoiceStatus';

const inv = (over) => ({ amount: 1000, tax: 180, status: 'Unpaid', amountPaid: 0, ...over });

describe('invoice status', () => {
  it('reads Settled, and the old name Paid, as settled', () => {
    expect(isSettled(inv({ status: 'Settled', amountPaid: 1180 }))).toBe(true);
    expect(isSettled(inv({ status: 'Paid' }))).toBe(true);
    expect(isOpen(inv({ status: 'Partially Paid', amountPaid: 500 }))).toBe(true);
    expect(isOpen(inv({ status: 'Overdue' }))).toBe(true);
  });

  it('a part-payment counts what was paid, and leaves the rest due', () => {
    const p = inv({ status: 'Partially Paid', amountPaid: 500 });
    expect(amountPaid(p)).toBe(500);
    expect(amountDue(p)).toBe(680);
  });

  it('a settled invoice without a stored figure counts in full', () => {
    expect(amountPaid(inv({ status: 'Paid', amountPaid: undefined }))).toBe(1180);
    expect(amountDue(inv({ status: 'Paid', amountPaid: undefined }))).toBe(0);
  });

  it('collected + outstanding = invoiced', () => {
    const list = [inv({ status: 'Settled', amountPaid: 1180 }), inv({ status: 'Partially Paid', amountPaid: 300 }), inv({ status: 'Overdue' })];
    expect(collected(list)).toBe(1480);
    expect(outstanding(list)).toBe(2060);
    expect(collected(list) + outstanding(list)).toBe(3540);
  });
});
