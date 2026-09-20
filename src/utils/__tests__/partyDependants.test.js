import { describe, it, expect } from 'vitest';
import { partyDependants, describeDependants, deleteWarning } from '../partyDependants';

const DIST = { id: 'DIST-1', name: 'Gujarat Super Stockist' };

const DATA = {
  orders: [
    { id: 'O1', distributorId: 'DIST-1' },
    { id: 'O2', distributorId: 'DIST-1' },
    { id: 'O3', distributorId: 'DIST-2' },
  ],
  invoices: [
    { id: 'INV-1', customerName: 'Gujarat Super Stockist' },
    { id: 'INV-2', customerName: 'Somebody Else' },
  ],
  distributorIncentives: [{ id: 'INC-1', distributorId: 'DIST-1' }],
  distributorPayments: [],
  schemeClaims: [],
  complaints: [{ id: 'CMP-1', distributorId: 'DIST-1' }],
  dealers: [{ id: 'DLR-1', parentDistributorId: 'DIST-1' }],
  retailers: [],
};

describe('partyDependants', () => {
  it('counts everything a foreign key will refuse', () => {
    const r = partyDependants(DIST, DATA);
    expect(r.canDelete).toBe(false);
    expect(r.blocking).toEqual(expect.arrayContaining([
      { count: 2, noun: 'orders' },
      { count: 1, noun: 'incentive' },
      { count: 1, noun: 'invoice' },
      { count: 1, noun: 'dealer' },
    ]));
  });

  it('does not count another party’s rows', () => {
    const r = partyDependants({ id: 'DIST-2', name: 'Other' }, DATA);
    expect(r.blocking).toEqual([{ count: 1, noun: 'order' }]);
  });

  it('matches invoices by customer name, since they carry no party id', () => {
    const r = partyDependants(DIST, { invoices: DATA.invoices });
    expect(r.blocking).toEqual([{ count: 1, noun: 'invoice' }]);
  });

  it('ignores case and surrounding space on that name', () => {
    const r = partyDependants({ id: 'X', name: '  gujarat super stockist ' }, { invoices: DATA.invoices });
    expect(r.blocking).toEqual([{ count: 1, noun: 'invoice' }]);
  });

  it('keeps complaints separate — they are unlinked, not blocked', () => {
    const r = partyDependants(DIST, { complaints: DATA.complaints });
    expect(r.canDelete).toBe(true);
    expect(r.orphaning).toEqual([{ count: 1, noun: 'complaint' }]);
  });

  it('counts the hierarchy below, in both directions', () => {
    expect(partyDependants({ id: 'DIST-1' }, { dealers: DATA.dealers }).blocking)
      .toEqual([{ count: 1, noun: 'dealer' }]);
    expect(partyDependants({ id: 'DLR-1' }, { retailers: [{ id: 'R1', parentDealerId: 'DLR-1' }] }).blocking)
      .toEqual([{ count: 1, noun: 'retailer' }]);
  });

  it('allows the delete when nothing is attached', () => {
    const r = partyDependants({ id: 'DIST-9', name: 'Brand New' }, DATA);
    expect(r).toEqual({ blocking: [], orphaning: [], total: 0, canDelete: true });
  });

  it('survives missing data without throwing', () => {
    expect(partyDependants(DIST, {}).canDelete).toBe(true);
    expect(partyDependants(DIST).canDelete).toBe(true);
    expect(partyDependants(null, DATA).canDelete).toBe(true);
  });

  it('does not match a party whose id is absent from the row', () => {
    const r = partyDependants({ id: 'DIST-1' }, { orders: [{ id: 'O9', distributorId: null }] });
    expect(r.canDelete).toBe(true);
  });
});

describe('describeDependants', () => {
  it('reads as a sentence', () => {
    expect(describeDependants([{ count: 3, noun: 'orders' }])).toBe('3 orders');
    expect(describeDependants([{ count: 3, noun: 'orders' }, { count: 1, noun: 'invoice' }]))
      .toBe('3 orders and 1 invoice');
    expect(describeDependants([
      { count: 3, noun: 'orders' }, { count: 7, noun: 'incentives' }, { count: 1, noun: 'invoice' },
    ])).toBe('3 orders, 7 incentives and 1 invoice');
  });

  it('is empty for nothing', () => {
    expect(describeDependants([])).toBe('');
    expect(describeDependants()).toBe('');
  });
});

describe('deleteWarning', () => {
  it('says what is in the way instead of letting the database refuse', () => {
    const w = deleteWarning(DIST, DATA);
    expect(w.canDelete).toBe(false);
    expect(w.title).toMatch(/cannot be deleted/);
    expect(w.body).toMatch(/2 orders/);
    expect(w.body).toMatch(/1 complaint/);   // mentioned as an also
  });

  it('warns about what would be unlinked when nothing blocks', () => {
    const w = deleteWarning(DIST, { complaints: DATA.complaints });
    expect(w.canDelete).toBe(true);
    expect(w.body).toMatch(/1 complaint/);
    expect(w.body).toMatch(/no longer say who they were about/);
  });

  it('is null when there is nothing to warn about, so the caller just asks', () => {
    expect(deleteWarning({ id: 'DIST-9', name: 'Brand New' }, DATA)).toBeNull();
  });
});
