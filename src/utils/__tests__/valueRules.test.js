import { describe, it, expect } from 'vitest';
import { schemeProblem, productPriceProblem } from '../valueRules';

describe('schemeProblem', () => {
  it('accepts a normal scheme and blanks', () => {
    expect(schemeProblem({ discountPct: 10, validFrom: '2026-01-01', validTo: '2026-01-01' })).toBeNull();
    expect(schemeProblem({ discountPct: '', validFrom: null, validTo: null })).toBeNull();
    expect(schemeProblem({ discountPct: 0 })).toBeNull();
    expect(schemeProblem({ discountPct: 100 })).toBeNull();
  });
  it('refuses bad discounts, negatives and reversed dates', () => {
    expect(schemeProblem({ discountPct: -1 })).toMatch(/between 0 and 100/);
    expect(schemeProblem({ discountPct: 100.5 })).toMatch(/between 0 and 100/);
    expect(schemeProblem({ freeGoodsQty: -2 })).toMatch(/Free goods/);
    expect(schemeProblem({ minOrderValue: -5 })).toMatch(/Minimum order/);
    expect(schemeProblem({ validFrom: '2026-02-01', validTo: '2026-01-31' })).toMatch(/before Valid From/);
  });
});

describe('productPriceProblem', () => {
  it('allows prices at or below MRP, or no MRP', () => {
    expect(productPriceProblem({ mrp: 100, distributorPrice: 70, dealerPrice: 80, retailerPrice: 100 })).toBeNull();
    expect(productPriceProblem({ mrp: '', distributorPrice: 500 })).toBeNull();
  });
  it('refuses a partner price above MRP', () => {
    expect(productPriceProblem({ mrp: 100, dealerPrice: 101 })).toMatch(/Dealer price/);
    expect(productPriceProblem({ mrp: '100', retailerPrice: '150' })).toMatch(/Retailer price/);
  });
});
