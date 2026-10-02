import { describe, it, expect } from 'vitest';
import {
  profitAndLoss, proformaSummary, receivables, partnerBalances, salesCreditNotes, netSalesByMonth, paidExGst,
} from '../financials';

const settled = { id: 'T1', invoiceType: 'tax_invoice', amount: 1000, tax: 120, status: 'Settled', amountPaid: 1120, createdAt: '2026-09-10' };
const partly = { id: 'T2', invoiceType: 'tax_invoice', amount: 2560, tax: 391, status: 'Partially Paid', amountPaid: 280, createdAt: '2026-09-25', dueDate: '2026-10-25' };
const overdue = { id: 'T3', invoiceType: 'tax_invoice', amount: 500, tax: 60, status: 'Overdue', amountPaid: 0, createdAt: '2026-06-01', dueDate: '2026-07-01' };
const proPaid = { id: 'P1', invoiceType: 'auto_draft', amount: 9500, tax: 0, status: 'Settled', amountPaid: 9500, createdAt: '2026-10-01' };
const proOpen = { id: 'P2', invoiceType: 'auto_draft', amount: 770, tax: 0, status: 'Unpaid', amountPaid: 0, createdAt: '2026-10-01' };
const invoices = [settled, partly, overdue, proPaid, proOpen];
const creditNotes = [
  { id: 'C1', invoiceId: 'T1', amount: 100, createdAt: '2026-09-12' },
  { id: 'C2', invoiceId: 'P1', amount: 2000, createdAt: '2026-10-02' }, // against a proforma
  { id: 'C3', invoiceId: null, amount: 50, createdAt: '2026-09-30' },
];
const grn = [{ items: [{ quantity: 10, unitCost: 50 }, { quantity: 2, unitCost: 100 }] }];
const purchaseReturns = [{ value: 70 }];
const expenses = [{ amount: 300 }, { amount: 45 }];
const now = new Date('2026-10-02T12:00:00Z');

describe('profitAndLoss (Accounting\'s definition)', () => {
  const r = profitAndLoss({ invoices, creditNotes, expenses, grn, purchaseReturns });
  it('counts paid tax invoices without GST; proformas never', () => {
    // 1000 settled + 2560 × 280/2951 paid
    expect(r.invoicedPaid).toBeCloseTo(1000 + 2560 * 280 / 2951, 6);
    expect(r.gstCollected).toBeCloseTo(120 + 391 * 280 / 2951, 6);
  });
  it('takes off credit notes, except those against a proforma', () => {
    expect(r.creditNoteValue).toBe(150);
    expect(r.netSales).toBeCloseTo(r.invoicedPaid - 150, 6);
  });
  it('profit is net sales less expenses less goods (received − returned)', () => {
    expect(r.purchaseCost).toBe(630);
    expect(r.netProfit).toBeCloseTo(r.netSales - 345 - 630, 6);
  });
});

describe('proformaSummary', () => {
  it('reports proformas apart, as pending invoicing', () => {
    expect(proformaSummary(invoices)).toEqual({ count: 2, value: 10270, received: 9500, due: 770 });
  });
});

describe('receivables', () => {
  const r = receivables(invoices, now);
  it('is what tax invoices still have due, part-payments taken off', () => {
    expect(r.count).toBe(2);
    expect(r.due).toBe(2951 - 280 + 560);
  });
  it('overdue and ageing use the amount due', () => {
    expect(r.overdue).toBe(560);
    expect(r.buckets['0-30']).toBe(2671);
    expect(r.buckets['90+']).toBe(560);
  });
});

describe('partnerBalances', () => {
  it('owed is positive balances only; credit is held apart, never netted', () => {
    const d = [{ outstandingAmount: -61356.2 }, { outstandingAmount: 15680 }];
    const l = [{ outstandingAmount: 3961 }, { outstandingAmount: -2500 }];
    const rt = [{ outstandingAmount: 0 }];
    expect(partnerBalances(d, l, rt)).toEqual({ owed: 19641, owingCount: 2, creditHeld: 63856.2, creditCount: 2 });
  });
});

describe('helpers', () => {
  it('salesCreditNotes drops notes against proformas', () => {
    expect(salesCreditNotes(creditNotes, invoices).map(c => c.id)).toEqual(['C1', 'C3']);
  });
  it('paidExGst is the goods part of what was paid', () => {
    expect(paidExGst(settled)).toBe(1000);
    expect(paidExGst(overdue)).toBe(0);
  });
  it('netSalesByMonth matches profitAndLoss in total', () => {
    const m = netSalesByMonth(invoices, creditNotes);
    const total = Object.values(m).reduce((s, v) => s + v, 0);
    expect(total).toBeCloseTo(profitAndLoss({ invoices, creditNotes }).netSales, 6);
    expect(m.Oct).toBeUndefined(); // the October rows are proforma ones
  });
});
