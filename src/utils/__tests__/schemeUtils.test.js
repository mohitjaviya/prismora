import { describe, it, expect } from 'vitest';
import { isSchemeEligible, getSchemeMatchValue } from '../schemeUtils';

const NOW = new Date('2026-07-01');

const scheme = (over = {}) => ({
  status: 'Active',
  minOrderValue: 50000,
  validFrom: '2026-06-01',
  validTo: '2026-08-31',
  applicableProducts: [],
  ...over,
});

describe('getSchemeMatchValue — which money counts toward a scheme', () => {
  it('counts the whole order when the scheme targets no particular product', () => {
    expect(getSchemeMatchValue(scheme(), { value: 60000 })).toBe(60000);
  });

  // A scheme naming specific products must not be unlocked by unrelated items
  // sharing the cart.
  it('counts only the targeted line items', () => {
    const s = scheme({ applicableProducts: ['Herbal Hair Oil 100ml'] });
    const order = {
      value: 60000,
      items: [
        { name: 'Herbal Hair Oil 100ml', total: 20000 },
        { name: 'Neem Face Wash 100ml', total: 40000 },
      ],
    };
    expect(getSchemeMatchValue(s, order)).toBe(20000);
  });

  it('falls back to quantity × unitPrice when a line has no total', () => {
    const s = scheme({ applicableProducts: ['Tulsi Cough Syrup 100ml'] });
    const order = { value: 0, items: [{ name: 'Tulsi Cough Syrup 100ml', quantity: 10, unitPrice: 70 }] };
    expect(getSchemeMatchValue(s, order)).toBe(700);
  });

  it('treats a single-product order as one line item', () => {
    const s = scheme({ applicableProducts: ['Herbal Hair Oil 100ml'] });
    expect(getSchemeMatchValue(s, { product: 'Herbal Hair Oil 100ml', value: 30000 })).toBe(30000);
  });

  it('returns zero when nothing in the order is targeted', () => {
    const s = scheme({ applicableProducts: ['Triphala Capsules 60s'] });
    expect(getSchemeMatchValue(s, { product: 'Herbal Hair Oil 100ml', value: 30000 })).toBe(0);
  });
});

describe('isSchemeEligible — does this order qualify', () => {
  it('accepts an active in-date order over the minimum', () => {
    expect(isSchemeEligible(scheme(), { value: 60000 }, NOW)).toBe(true);
  });

  it('rejects an order under the minimum', () => {
    expect(isSchemeEligible(scheme(), { value: 49999 }, NOW)).toBe(false);
  });

  it('accepts an order exactly on the minimum', () => {
    expect(isSchemeEligible(scheme(), { value: 50000 }, NOW)).toBe(true);
  });

  it('rejects an inactive scheme', () => {
    expect(isSchemeEligible(scheme({ status: 'Inactive' }), { value: 99999 }, NOW)).toBe(false);
  });

  it('rejects a scheme that has not started', () => {
    expect(isSchemeEligible(scheme({ validFrom: '2026-12-01' }), { value: 60000 }, NOW)).toBe(false);
  });

  it('rejects an expired scheme', () => {
    expect(isSchemeEligible(scheme({ validTo: '2026-06-15' }), { value: 60000 }, NOW)).toBe(false);
  });

  // A big order full of untargeted products must not qualify a product-specific
  // scheme just because the cart total clears the minimum.
  it('rejects when targeted products are absent, however large the order', () => {
    const s = scheme({ applicableProducts: ['Triphala Capsules 60s'], minOrderValue: 1000 });
    const order = { value: 500000, items: [{ name: 'Neem Face Wash 100ml', total: 500000 }] };
    expect(isSchemeEligible(s, order, NOW)).toBe(false);
  });

  it('compares the minimum against the targeted value, not the cart total', () => {
    const s = scheme({ applicableProducts: ['Herbal Hair Oil 100ml'], minOrderValue: 50000 });
    const order = {
      value: 90000,
      items: [
        { name: 'Herbal Hair Oil 100ml', total: 10000 },   // only this counts
        { name: 'Neem Face Wash 100ml', total: 80000 },
      ],
    };
    expect(isSchemeEligible(s, order, NOW)).toBe(false);
  });
});
