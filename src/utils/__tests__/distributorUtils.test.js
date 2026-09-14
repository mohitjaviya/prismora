import { describe, it, expect } from 'vitest';
import { buildLedgerEntries, buildVendorLedger } from '../distributorUtils';

const DIST = { id: 'DIST-1', name: 'Gujarat Super Stockist' };

const orders = [
  { id: 'O1', distributorId: 'DIST-1' },
  { id: 'O2', distributorId: 'DIST-2' },
  { id: 'O3', dealerId: 'DEAL-1' },
];

describe('buildLedgerEntries — invoices owed by one party', () => {
  it('claims an invoice via the order it was raised against', () => {
    const invoices = [{ id: 'INV-1', orderId: 'O1', customerName: 'anything at all', amount: 1000, createdAt: '2026-01-01' }];
    const rows = buildLedgerEntries(DIST, invoices, [], orders);
    expect(rows).toHaveLength(1);
    expect(rows[0].debit).toBe(1000);
  });

  it('does not claim an invoice belonging to another party', () => {
    const invoices = [{ id: 'INV-2', orderId: 'O2', customerName: 'Gujarat Super Stockist', amount: 5000, createdAt: '2026-01-01' }];
    // Same name, different party — the order link must win over the name.
    expect(buildLedgerEntries(DIST, invoices, [], orders)).toHaveLength(0);
  });

  // The bug this guards: matching on customerName alone meant renaming a
  // distributor orphaned their whole invoice history.
  it('still claims an invoice after the party has been renamed', () => {
    const invoices = [{ id: 'INV-3', orderId: 'O1', customerName: 'Old Trading Name', amount: 800, createdAt: '2026-01-01' }];
    const renamed = { id: 'DIST-1', name: 'Brand New Name Pvt Ltd' };
    expect(buildLedgerEntries(renamed, invoices, [], orders)).toHaveLength(1);
  });

  it('falls back to the name for a manually raised invoice with no order', () => {
    const invoices = [{ id: 'INV-4', customerName: 'gujarat super stockist', amount: 250, createdAt: '2026-01-01' }];
    expect(buildLedgerEntries(DIST, invoices, [], orders)).toHaveLength(1);
  });

  it('ignores surrounding whitespace and case in the name fallback', () => {
    const invoices = [{ id: 'INV-5', customerName: '  GUJARAT SUPER STOCKIST  ', amount: 250, createdAt: '2026-01-01' }];
    expect(buildLedgerEntries(DIST, invoices, [], orders)).toHaveLength(1);
  });

  it('adds tax to the invoice debit', () => {
    const invoices = [{ id: 'INV-6', orderId: 'O1', amount: 1000, tax: 120, createdAt: '2026-01-01' }];
    expect(buildLedgerEntries(DIST, invoices, [], orders)[0].debit).toBe(1120);
  });
});

describe('buildLedgerEntries — payments and running balance', () => {
  const invoices = [
    { id: 'INV-1', orderId: 'O1', amount: 10000, createdAt: '2026-01-01' },
    { id: 'INV-2', orderId: 'O1', amount: 5000, createdAt: '2026-03-01' },
  ];
  const payments = [
    { id: 'PAY-1', distributorId: 'DIST-1', amount: 4000, date: '2026-02-01', method: 'NEFT' },
    { id: 'PAY-2', distributorId: 'DIST-9', amount: 999, date: '2026-02-02' },
  ];

  it('orders entries by date and runs the balance forward', () => {
    const rows = buildLedgerEntries(DIST, invoices, payments, orders);
    expect(rows.map(r => r.balance)).toEqual([10000, 6000, 11000]);
  });

  it('records a payment as a credit, not a debit', () => {
    const rows = buildLedgerEntries(DIST, invoices, payments, orders);
    const pay = rows.find(r => r.type === 'Payment');
    expect(pay.credit).toBe(4000);
    expect(pay.debit).toBe(0);
  });

  it('ignores payments belonging to someone else', () => {
    const rows = buildLedgerEntries(DIST, invoices, payments, orders);
    expect(rows.filter(r => r.type === 'Payment')).toHaveLength(1);
  });

  it('matches dealer and retailer payments by their own id field', () => {
    const dealerPayments = [{ id: 'PAY-3', dealerId: 'DEAL-1', amount: 700, date: '2026-01-05' }];
    const rows = buildLedgerEntries({ id: 'DEAL-1', name: 'Mohan Dealers' }, [], dealerPayments, orders);
    expect(rows).toHaveLength(1);
    expect(rows[0].credit).toBe(700);
  });

  it('returns nothing without a party', () => {
    expect(buildLedgerEntries(null, invoices, payments, orders)).toEqual([]);
  });

  it('still works when no orders are supplied (older callers)', () => {
    const named = [{ id: 'INV-7', customerName: 'Gujarat Super Stockist', amount: 100, createdAt: '2026-01-01' }];
    expect(buildLedgerEntries(DIST, named, [])).toHaveLength(1);
  });
});

describe('buildVendorLedger — what we owe a supplier', () => {
  const vendor = { id: 'V1', name: 'Janki Herbals' };

  it('debits goods received and credits payments and returns', () => {
    const grns = [{ id: 'GRN-1', vendorName: 'Janki Herbals', receivedDate: '2026-01-01', items: [{ quantity: 10, unitCost: 100 }] }];
    const payments = [{ id: 'VP-1', vendorId: 'V1', amount: 400, date: '2026-01-02' }];
    const returns = [{ id: 'PR-1', vendorId: 'V1', value: 100, date: '2026-01-03' }];
    const rows = buildVendorLedger(vendor, grns, payments, returns);
    expect(rows.map(r => r.balance)).toEqual([1000, 600, 500]);
  });

  it('totals every line of a multi-item GRN', () => {
    const grns = [{ id: 'GRN-2', vendorName: 'Janki Herbals', receivedDate: '2026-01-01', items: [{ quantity: 2, unitCost: 50 }, { quantity: 3, unitCost: 10 }] }];
    expect(buildVendorLedger(vendor, grns, [], [])[0].debit).toBe(130);
  });
});
