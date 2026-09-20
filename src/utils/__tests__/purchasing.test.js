import { describe, it, expect } from 'vitest';
import {
  returnValue, vendorBalanceAfterReturn, isOverReturn, batchForReturn, stockAfterAdjustment,
} from '../purchasing';

describe('returnValue', () => {
  it('totals quantity against unit cost', () => {
    expect(returnValue([{ quantity: 3, unitCost: 120 }])).toBe(360);
    expect(returnValue([{ quantity: 2, unitCost: 50 }, { quantity: 1, unitCost: 25 }])).toBe(125);
  });

  it('keeps paise rather than drifting on thirds', () => {
    expect(returnValue([{ quantity: 3, unitCost: 33.333 }])).toBe(100);
    expect(returnValue([{ quantity: 1, unitCost: 0.015 }])).toBe(0.02);
  });

  it('is zero for nothing, and ignores lines it cannot read', () => {
    expect(returnValue([])).toBe(0);
    expect(returnValue()).toBe(0);
    expect(returnValue(null)).toBe(0);
    expect(returnValue('not a list')).toBe(0);
    expect(returnValue([{ quantity: 'two', unitCost: 10 }, { quantity: 1, unitCost: 10 }])).toBe(10);
    expect(returnValue([{}, { quantity: 2, unitCost: 5 }])).toBe(10);
  });
});

describe('vendorBalanceAfterReturn', () => {
  it('reduces what is owed by the value going back', () => {
    expect(vendorBalanceAfterReturn(355000, 360)).toBe(354640);
  });

  it('keeps the excess when more goes back than is owed', () => {
    // The bug this replaces used Math.max(0, ...) and returned 0 here,
    // throwing away 500 rupees of credit against the vendor.
    expect(vendorBalanceAfterReturn(1000, 1500)).toBe(-500);
  });

  it('settles exactly to zero', () => {
    expect(vendorBalanceAfterReturn(1000, 1000)).toBe(0);
  });

  it('rounds to paise', () => {
    expect(vendorBalanceAfterReturn(100.005, 0.005)).toBe(100);
  });

  it('treats unreadable input as zero rather than NaN', () => {
    expect(vendorBalanceAfterReturn(undefined, 100)).toBe(-100);
    expect(vendorBalanceAfterReturn(100, undefined)).toBe(100);
    expect(vendorBalanceAfterReturn('x', 'y')).toBe(0);
  });
});

describe('isOverReturn', () => {
  it('is true only when the goods exceed the debt', () => {
    expect(isOverReturn(1000, 1500)).toBe(true);
    expect(isOverReturn(1000, 1000)).toBe(false);
    expect(isOverReturn(1000, 999.99)).toBe(false);
  });

  it('treats a vendor owed nothing as over-returned by any value', () => {
    expect(isOverReturn(0, 1)).toBe(true);
    expect(isOverReturn(0, 0)).toBe(false);
  });
});

describe('batchForReturn', () => {
  const stock = [
    { id: 'A', product: 'Herbal Hair Oil 100ml', quantity: 0 },
    { id: 'B', product: 'Herbal Hair Oil 100ml', quantity: 12 },
    { id: 'C', product: 'Neem Face Wash 100ml', quantity: 5 },
  ];

  it('takes the first batch of that product that actually holds stock', () => {
    expect(batchForReturn(stock, 'Herbal Hair Oil 100ml').id).toBe('B');
  });

  it('matches without regard to case or surrounding space', () => {
    expect(batchForReturn(stock, '  herbal hair oil 100ml ').id).toBe('B');
  });

  it('is null when every batch is empty — which is the live situation today', () => {
    expect(batchForReturn([{ product: 'X', quantity: 0 }], 'X')).toBeNull();
  });

  it('is null for a product that is not stocked, or no product at all', () => {
    expect(batchForReturn(stock, 'Nothing Like This')).toBeNull();
    expect(batchForReturn(stock, '')).toBeNull();
    expect(batchForReturn(stock, null)).toBeNull();
    expect(batchForReturn([], 'Herbal Hair Oil 100ml')).toBeNull();
    expect(batchForReturn(undefined, 'Herbal Hair Oil 100ml')).toBeNull();
  });
});

describe('stockAfterAdjustment', () => {
  it('adds and removes units', () => {
    expect(stockAfterAdjustment(12, -3)).toBe(9);
    expect(stockAfterAdjustment(12, 5)).toBe(17);
  });

  it('floors at zero rather than going negative', () => {
    expect(stockAfterAdjustment(2, -10)).toBe(0);
  });

  it('is null when either side is not a number', () => {
    expect(stockAfterAdjustment(undefined, -1)).toBeNull();
    expect(stockAfterAdjustment(10, 'three')).toBeNull();
    expect(stockAfterAdjustment(NaN, 1)).toBeNull();
  });
});
