import { describe, it, expect } from 'vitest';
import { stockValueBreakdown, batchValues } from '../stockValue';

const NOW = new Date('2026-10-04T12:00:00+05:30');
const inv = [
  { id: 'A', quantity: 100, damaged: 0, unitCost: 100, expiryDate: '2027-01-01T00:00:00Z' },   // sellable
  { id: 'B', quantity: 0, damaged: 100, unitCost: 100, expiryDate: null },                      // O319/O320 target
  { id: 'C', quantity: 130, damaged: 2, unitCost: 100, expiryDate: '2026-09-23T00:00:00Z' },   // expired
];

describe('Gap 17: stock value counts sellable units only', () => {
  it('splits sellable, expired and damaged value', () => {
    expect(stockValueBreakdown(inv, NOW)).toEqual({
      sellable: 10000, expired: 13000, damaged: 10200,
      sellableUnits: 100, expiredUnits: 130, damagedUnits: 102,
    });
  });

  it('a batch with no expiry date is sellable; no cost counts as zero', () => {
    expect(stockValueBreakdown([{ quantity: 5, damaged: 0, unitCost: null }], NOW)).toMatchObject({ sellable: 0, sellableUnits: 5 });
  });

  it('per-batch values for the export', () => {
    expect(batchValues(inv[2], NOW)).toEqual({ sellable: 0, expired: 13000, damaged: 200 });
    expect(batchValues(inv[0], NOW)).toEqual({ sellable: 10000, expired: 0, damaged: 0 });
  });
});
