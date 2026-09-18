import { describe, it, expect } from 'vitest';
import {
  invoiceTotal, paymentIdForInvoice, invoiceBelongsToParty, paymentFieldFor,
  invoicesSettledBy, balanceAfterPayment, isOverpayment,
} from '../settlement';

describe('invoiceTotal', () => {
  it('is the goods plus the tax on them', () => {
    expect(invoiceTotal({ amount: 30000, tax: 3600 })).toBe(33600);
  });

  it('treats a missing tax as none rather than as NaN', () => {
    expect(invoiceTotal({ amount: 500 })).toBe(500);
    expect(invoiceTotal(null)).toBe(0);
  });
});

describe('paymentIdForInvoice - why paying twice is impossible', () => {
  it('derives the payment from the invoice', () => {
    expect(paymentIdForInvoice('INV-12')).toBe('PAY-INV-INV-12');
  });

  it('is stable, so a second attempt collides instead of crediting twice', () => {
    expect(paymentIdForInvoice('INV-12')).toBe(paymentIdForInvoice('INV-12'));
  });
});

describe('invoiceBelongsToParty', () => {
  const party = { id: 'D-1', name: 'Gujarat Super Stockist' };
  const orders = [
    { id: 'O2', distributorId: 'D-1' },
    { id: 'O9', distributorId: 'D-2' },
  ];

  it('follows the order link', () => {
    expect(invoiceBelongsToParty({ orderId: 'O2' }, party, orders)).toBe(true);
    expect(invoiceBelongsToParty({ orderId: 'O9' }, party, orders)).toBe(false);
  });

  // Matching on name alone orphaned every invoice the moment a party was renamed.
  it('prefers the link over the name when both are present', () => {
    const inv = { orderId: 'O9', customerName: 'Gujarat Super Stockist' };
    expect(invoiceBelongsToParty(inv, party, orders)).toBe(false);
  });

  it('falls back to the name for an invoice raised by hand', () => {
    expect(invoiceBelongsToParty({ customerName: ' gujarat super stockist ' }, party, orders)).toBe(true);
  });

  it('says no rather than throwing when something is missing', () => {
    expect(invoiceBelongsToParty(null, party, orders)).toBe(false);
    expect(invoiceBelongsToParty({ orderId: 'O2' }, null, orders)).toBe(false);
  });
});

describe('paymentFieldFor', () => {
  it('maps each party type to the column that links a payment to it', () => {
    expect(paymentFieldFor('Distributor')).toBe('distributorId');
    expect(paymentFieldFor('Dealer')).toBe('dealerId');
    expect(paymentFieldFor('Retailer')).toBe('retailerId');
    expect(paymentFieldFor('Customer')).toBeNull();
  });
});

describe('invoicesSettledBy', () => {
  const invoices = [
    { id: 'A', amount: 1000, tax: 0, createdAt: '2026-01-01' },
    { id: 'B', amount: 2000, tax: 0, createdAt: '2026-02-01' },
    { id: 'C', amount: 500, tax: 0, createdAt: '2026-03-01' },
  ];

  it('settles the oldest invoices first', () => {
    const { settled } = invoicesSettledBy(3000, invoices);
    expect(settled.map(i => i.id)).toEqual(['A', 'B']);
  });

  it('reports what is left over', () => {
    expect(invoicesSettledBy(3000, invoices).remainder).toBe(0);
    // 3,200 clears A and B, and the 200 left cannot cover C.
    expect(invoicesSettledBy(3200, invoices).remainder).toBe(200);
  });

  it('keeps going while the remainder still covers the next one', () => {
    // 3,500 clears all three exactly: 1,000 + 2,000 + 500.
    const { settled, remainder } = invoicesSettledBy(3500, invoices);
    expect(settled.map(i => i.id)).toEqual(['A', 'B', 'C']);
    expect(remainder).toBe(0);
  });

  // Booking a half-covered invoice as Paid would count its whole value as
  // income on money that has not arrived.
  it('does not settle an invoice the payment only partly covers', () => {
    const { settled, remainder } = invoicesSettledBy(1500, invoices);
    expect(settled.map(i => i.id)).toEqual(['A']);
    expect(remainder).toBe(500);
  });

  // Settling March while January is still open is not how a ledger reads.
  it('stops at the first invoice it cannot cover rather than skipping ahead', () => {
    const { settled } = invoicesSettledBy(1600, invoices);
    expect(settled.map(i => i.id)).toEqual(['A']);
    expect(settled.find(i => i.id === 'C')).toBeUndefined();
  });

  it('counts the tax as part of what has to be covered', () => {
    const withTax = [{ id: 'T', amount: 30000, tax: 3600, createdAt: '2026-01-01' }];
    expect(invoicesSettledBy(30000, withTax).settled).toEqual([]);
    expect(invoicesSettledBy(33600, withTax).settled.map(i => i.id)).toEqual(['T']);
  });

  it('steps over a zero-value invoice instead of stalling on it', () => {
    const rows = [
      { id: 'Z', amount: 0, tax: 0, createdAt: '2026-01-01' },
      { id: 'A', amount: 100, tax: 0, createdAt: '2026-02-01' },
    ];
    expect(invoicesSettledBy(100, rows).settled.map(i => i.id)).toEqual(['A']);
  });

  it('settles nothing when there is nothing to settle', () => {
    expect(invoicesSettledBy(500, []).settled).toEqual([]);
    expect(invoicesSettledBy(0, invoices).settled).toEqual([]);
    expect(invoicesSettledBy(500, undefined).remainder).toBe(500);
  });
});

describe('balanceAfterPayment - an advance is not forgotten', () => {
  it('reduces what is owed', () => {
    expect(balanceAfterPayment(33600, 10000)).toBe(23600);
  });

  it('clears the balance exactly', () => {
    expect(balanceAfterPayment(33600, 33600)).toBe(0);
  });

  // This used to be floored at zero, so paying ten lakh against a thirty-three
  // thousand balance discarded the rest.
  it('goes negative when more is paid than is owed, instead of discarding it', () => {
    expect(balanceAfterPayment(33600, 1000000)).toBe(-966400);
  });

  it('copes with missing numbers', () => {
    expect(balanceAfterPayment(undefined, 500)).toBe(-500);
    expect(balanceAfterPayment(500, undefined)).toBe(500);
  });
});

describe('isOverpayment', () => {
  it('spots a payment larger than the balance', () => {
    expect(isOverpayment(33600, 1000000)).toBe(true);
  });

  it('does not flag an exact settlement', () => {
    expect(isOverpayment(33600, 33600)).toBe(false);
  });

  it('flags any payment against a cleared account', () => {
    expect(isOverpayment(0, 1)).toBe(true);
  });
});
