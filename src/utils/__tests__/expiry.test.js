import { describe, it, expect } from 'vitest';
import { daysToExpiry, isExpired, isExpiringSoon, sellableQty, expiredQty } from '../expiry';

const NOW = new Date(2026, 8, 28, 15, 0);                 // 28 Sep 2026, afternoon, local
const day = (y, m, d) => new Date(y, m - 1, d).toISOString();

describe('expiry', () => {
  it('is sellable through its expiry day, expired from the next', () => {
    expect(isExpired({ expiryDate: day(2026, 9, 28) }, NOW)).toBe(false);
    expect(isExpired({ expiryDate: day(2026, 9, 27) }, NOW)).toBe(true);
    expect(daysToExpiry({ expiryDate: day(2026, 9, 28) }, NOW)).toBe(0);
  });

  it('a batch with no expiry date never expires', () => {
    expect(isExpired({ expiryDate: null }, NOW)).toBe(false);
    expect(daysToExpiry({}, NOW)).toBeNull();
  });

  it('flags batches expiring within 30 days, not expired ones', () => {
    expect(isExpiringSoon({ expiryDate: day(2026, 10, 28) }, NOW)).toBe(true);    // 30 days
    expect(isExpiringSoon({ expiryDate: day(2026, 10, 29) }, NOW)).toBe(false);   // 31 days
    expect(isExpiringSoon({ expiryDate: day(2026, 9, 1) }, NOW)).toBe(false);     // expired
  });

  // The Phase 1 case: 365 of 690 units of Aloevera Skin Gel were past expiry
  // and still counted as stock.
  it('counts only unexpired, unreserved stock as sellable', () => {
    const inv = [
      { product: 'Gel', quantity: 85, expiryDate: day(2026, 9, 22) },
      { product: 'Gel', quantity: 200, expiryDate: day(2026, 9, 26) },
      { product: 'Gel', quantity: 300, reserved: 20, expiryDate: day(2027, 3, 1) },
      { product: 'Gel', quantity: 25, expiryDate: null },
      { product: 'Other', quantity: 999, expiryDate: day(2027, 1, 1) },
    ];
    expect(sellableQty(inv, 'Gel', NOW)).toBe(305);
    expect(expiredQty(inv, 'Gel', NOW)).toBe(285);
  });
});
