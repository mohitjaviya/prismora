import { describe, it, expect } from 'vitest';
import {
  alreadySettled, balanceAfterPayment, invoiceBelongsToParty, invoicePartyFields, invoiceTotal, invoicesSettledBy, isOverpayment, partyForInvoice, paymentFieldFor, paymentIdForInvoice, settlementRowFor,
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

// ── The decisions settleInvoiceAsPayment makes ──────────────────────────
// These lived in the provider and nothing could reach them. Between them they
// decide whose ledger an invoice credits and by how much, which is the pair
// that drifted apart by exactly the GST for every invoice in this database.

describe('partyForInvoice', () => {
  const DISTRIBUTORS = [{ id: 'D1', name: 'Gujarat Super Stockist' }];
  const DEALERS = [{ id: 'DL1', name: 'Shree Ayur Agencies' }];
  const RETAILERS = [{ id: 'R1', name: 'Krishna Pharma' }];
  const LISTS = { distributors: DISTRIBUTORS, dealers: DEALERS, retailers: RETAILERS, orders: [] };

  it('finds the party at each tier', () => {
    expect(partyForInvoice({ customerName: 'Gujarat Super Stockist' }, LISTS))
      .toEqual({ party: DISTRIBUTORS[0], type: 'Distributor' });
    expect(partyForInvoice({ customerName: 'Shree Ayur Agencies' }, LISTS))
      .toEqual({ party: DEALERS[0], type: 'Dealer' });
    expect(partyForInvoice({ customerName: 'Krishna Pharma' }, LISTS))
      .toEqual({ party: RETAILERS[0], type: 'Retailer' });
  });

  it('credits the higher tier when a name matches at two', () => {
    // Undocumented anywhere else, and it decides whose ledger moves.
    const clash = {
      distributors: [{ id: 'D9', name: 'Same Name Ltd' }],
      dealers: [{ id: 'DL9', name: 'Same Name Ltd' }],
      retailers: [],
      orders: [],
    };
    expect(partyForInvoice({ customerName: 'Same Name Ltd' }, clash).type).toBe('Distributor');
  });

  it('finds the party through the order when the name does not match', () => {
    const orders = [{ id: 'O1', distributorId: 'D1' }];
    expect(partyForInvoice({ customerName: 'Typed Differently', orderId: 'O1' },
      { ...LISTS, orders }).type).toBe('Distributor');
  });

  it('is null for a walk-in, which has no ledger to credit', () => {
    expect(partyForInvoice({ customerName: 'Somebody Passing' }, LISTS))
      .toEqual({ party: null, type: null });
  });

  it('is null rather than throwing when the lists are missing', () => {
    expect(partyForInvoice({ customerName: 'X' }, {})).toEqual({ party: null, type: null });
    expect(partyForInvoice({ customerName: 'X' })).toEqual({ party: null, type: null });
  });
});

describe('settlementRowFor', () => {
  const INVOICE = { id: 'INV-1', amount: 10000, tax: 1800, customerName: 'Gujarat Super Stockist' };
  const PARTY = { id: 'D1', name: 'Gujarat Super Stockist' };

  it('records the billed total, not the net — the drift this caused was the GST', () => {
    expect(settlementRowFor(INVOICE, PARTY, 'Distributor').amount).toBe(11800);
  });

  it('puts the party in the column for its tier', () => {
    expect(settlementRowFor(INVOICE, PARTY, 'Distributor').distributorId).toBe('D1');
    expect(settlementRowFor(INVOICE, PARTY, 'Dealer').dealerId).toBe('D1');
    expect(settlementRowFor(INVOICE, PARTY, 'Retailer').retailerId).toBe('D1');
  });

  it('derives the id from the invoice, so a second attempt is the same row', () => {
    const a = settlementRowFor(INVOICE, PARTY, 'Distributor');
    const b = settlementRowFor(INVOICE, PARTY, 'Distributor');
    expect(a.id).toBe(b.id);
    expect(a.id).toBe('PAY-INV-INV-1');
  });

  it('points back at the invoice it came from', () => {
    const row = settlementRowFor(INVOICE, PARTY, 'Distributor');
    expect(row.reference).toBe('INV-1');
    expect(row.notes).toMatch(/INV-1/);
  });

  it('is null when there is nothing to write a payment for', () => {
    expect(settlementRowFor(null, PARTY, 'Distributor')).toBeNull();
    expect(settlementRowFor(INVOICE, null, 'Distributor')).toBeNull();
    expect(settlementRowFor(INVOICE, PARTY, null)).toBeNull();
    expect(settlementRowFor(INVOICE, PARTY, 'Supplier')).toBeNull();
  });

  it('bills nothing for an invoice of nothing', () => {
    expect(settlementRowFor({ id: 'INV-0' }, PARTY, 'Distributor').amount).toBe(0);
  });
});

describe('alreadySettled', () => {
  const PAYMENTS = [{ id: 'PAY-INV-INV-1' }, { id: 'VPAY-123' }];

  it('recognises an invoice that has already been settled', () => {
    expect(alreadySettled('INV-1', PAYMENTS)).toBe(true);
  });

  it('does not confuse it with an unrelated payment', () => {
    expect(alreadySettled('INV-2', PAYMENTS)).toBe(false);
    expect(alreadySettled('123', PAYMENTS)).toBe(false);
  });

  it('is false when there are no payments at all', () => {
    expect(alreadySettled('INV-1', [])).toBe(false);
    expect(alreadySettled('INV-1')).toBe(false);
  });
});

// ── The party id, once 025 has run ──────────────────────────────────────
describe('invoiceBelongsToParty, with a party id on the invoice', () => {
  const PARTY = { id: 'D1', name: 'Gujarat Super Stockist' };
  const OTHER = { id: 'D2', name: 'Maharashtra Prime' };

  it('matches on the invoice’s own id, ahead of everything else', () => {
    expect(invoiceBelongsToParty({ distributorId: 'D1' }, PARTY)).toBe(true);
    expect(invoiceBelongsToParty({ distributorId: 'D1' }, OTHER)).toBe(false);
  });

  it('survives the partner being renamed — the whole point of the id', () => {
    const invoice = { distributorId: 'D1', customerName: 'Their Old Trading Name' };
    expect(invoiceBelongsToParty(invoice, PARTY)).toBe(true);
  });

  it('does not fall back to the name when the id says somebody else', () => {
    // Without this, a renamed partner could reclaim an invoice that had been
    // reassigned away from them.
    const invoice = { distributorId: 'D2', customerName: 'Gujarat Super Stockist' };
    expect(invoiceBelongsToParty(invoice, PARTY)).toBe(false);
  });

  it('matches at any tier', () => {
    expect(invoiceBelongsToParty({ dealerId: 'DL1' }, { id: 'DL1', name: 'x' })).toBe(true);
    expect(invoiceBelongsToParty({ retailerId: 'R1' }, { id: 'R1', name: 'x' })).toBe(true);
  });

  it('still reads the order for invoices raised before the column existed', () => {
    const orders = [{ id: 'O1', distributorId: 'D1' }];
    expect(invoiceBelongsToParty({ orderId: 'O1' }, PARTY, orders)).toBe(true);
  });

  it('still reads the name for invoices with neither', () => {
    expect(invoiceBelongsToParty({ customerName: 'Gujarat Super Stockist' }, PARTY)).toBe(true);
  });

  it('leaves a walk-in belonging to nobody', () => {
    expect(invoiceBelongsToParty({ customerName: 'Somebody Passing' }, PARTY)).toBe(false);
    expect(invoiceBelongsToParty({}, PARTY)).toBe(false);
  });
});

describe('partyForInvoice, once the id is there', () => {
  const LISTS = {
    distributors: [{ id: 'D9', name: 'Same Name Ltd' }],
    dealers: [{ id: 'DL9', name: 'Same Name Ltd' }],
    retailers: [],
    orders: [],
  };

  it('has no tie-break to make — the id picks one', () => {
    // The same clash that needed distributor-before-dealer resolves on its own.
    expect(partyForInvoice({ customerName: 'Same Name Ltd', dealerId: 'DL9' }, LISTS).type)
      .toBe('Dealer');
    expect(partyForInvoice({ customerName: 'Same Name Ltd', distributorId: 'D9' }, LISTS).type)
      .toBe('Distributor');
  });

  it('falls back to the precedence only when there is no id', () => {
    expect(partyForInvoice({ customerName: 'Same Name Ltd' }, LISTS).type).toBe('Distributor');
  });
});

describe('invoicePartyFields', () => {
  it('sets one and clears the other two, so a tier change cannot leave both', () => {
    expect(invoicePartyFields({ id: 'D1' }, 'Distributor'))
      .toEqual({ distributorId: 'D1', dealerId: null, retailerId: null });
    expect(invoicePartyFields({ id: 'R1' }, 'Retailer'))
      .toEqual({ distributorId: null, dealerId: null, retailerId: 'R1' });
  });

  it('clears all three for a walk-in', () => {
    expect(invoicePartyFields(null, null))
      .toEqual({ distributorId: null, dealerId: null, retailerId: null });
    expect(invoicePartyFields({ id: 'X' }, 'Supplier'))
      .toEqual({ distributorId: null, dealerId: null, retailerId: null });
  });
});
