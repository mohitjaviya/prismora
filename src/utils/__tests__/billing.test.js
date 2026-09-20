import { describe, it, expect } from 'vitest';
import {
  gstRateFor, gstForOrder, amountOwedForOrder, partyForOrder, balanceAfterCharge,
} from '../billing';

const CATALOGUE = [
  { name: 'Herbal Hair Oil 100ml', gstPct: 18 },
  { name: 'Tulsi Cough Syrup 100ml', gstPct: 12 },
  { name: 'Neem Face Wash 100ml', gstPct: 5 },
  { name: 'Untaxed Thing', gstPct: 0 },
];

describe('gstRateFor', () => {
  it('reads the rate as a fraction', () => {
    expect(gstRateFor(CATALOGUE, 'Herbal Hair Oil 100ml')).toBeCloseTo(0.18);
    expect(gstRateFor(CATALOGUE, 'Neem Face Wash 100ml')).toBeCloseTo(0.05);
  });

  it('treats a product it cannot find as untaxed rather than guessing', () => {
    expect(gstRateFor(CATALOGUE, 'Not In The Catalogue')).toBe(0);
    expect(gstRateFor(CATALOGUE, undefined)).toBe(0);
    expect(gstRateFor([], 'Herbal Hair Oil 100ml')).toBe(0);
    expect(gstRateFor(undefined, 'Herbal Hair Oil 100ml')).toBe(0);
  });

  it('survives a catalogue row with no usable rate', () => {
    expect(gstRateFor([{ name: 'X', gstPct: null }], 'X')).toBe(0);
    expect(gstRateFor([{ name: 'X', gstPct: 'eighteen' }], 'X')).toBe(0);
    expect(gstRateFor([{ name: 'X' }], 'X')).toBe(0);
  });
});

describe('gstForOrder', () => {
  it('taxes a single-product order at its own rate', () => {
    expect(gstForOrder({ product: 'Herbal Hair Oil 100ml', value: 10000 }, CATALOGUE)).toBe(1800);
  });

  it('taxes each line at its own rate, not the whole order at one', () => {
    // 10000 at 18% + 10000 at 5% = 1800 + 500. Taxing 20000 at either rate
    // would give 3600 or 1000, and both would be wrong.
    const order = {
      items: [
        { name: 'Herbal Hair Oil 100ml', total: 10000 },
        { name: 'Neem Face Wash 100ml', total: 10000 },
      ],
    };
    expect(gstForOrder(order, CATALOGUE)).toBe(2300);
  });

  it('works out a line total from quantity and price when none is given', () => {
    const order = { items: [{ name: 'Herbal Hair Oil 100ml', quantity: 4, unitPrice: 250 }] };
    expect(gstForOrder(order, CATALOGUE)).toBe(180);
  });

  it('prefers the stored line total, because that is what the customer was shown', () => {
    const order = { items: [{ name: 'Herbal Hair Oil 100ml', quantity: 4, unitPrice: 250, total: 900 }] };
    expect(gstForOrder(order, CATALOGUE)).toBe(162);
  });

  it('rounds once at the end, not once per line', () => {
    // Three lines of 33.33 at 18% are 5.9994 each. Rounding per line gives 18;
    // rounding the sum gives 18 as well here, but the intent is one rounding.
    const order = {
      items: [
        { name: 'Herbal Hair Oil 100ml', total: 33.33 },
        { name: 'Herbal Hair Oil 100ml', total: 33.33 },
        { name: 'Herbal Hair Oil 100ml', total: 33.34 },
      ],
    };
    expect(gstForOrder(order, CATALOGUE)).toBe(18);
  });

  it('is zero when there is nothing to tax', () => {
    expect(gstForOrder({ product: 'Untaxed Thing', value: 5000 }, CATALOGUE)).toBe(0);
    expect(gstForOrder({ value: 0 }, CATALOGUE)).toBe(0);
    expect(gstForOrder({ items: [] }, CATALOGUE)).toBe(0);
    expect(gstForOrder(null, CATALOGUE)).toBe(0);
  });

  it('ignores a line it cannot read rather than producing NaN', () => {
    const order = {
      items: [
        { name: 'Herbal Hair Oil 100ml', total: 'lots' },
        { name: 'Herbal Hair Oil 100ml', total: 1000 },
      ],
    };
    expect(gstForOrder(order, CATALOGUE)).toBe(180);
  });

  it('does not tax an unpriced order into NaN', () => {
    expect(gstForOrder({ product: 'Herbal Hair Oil 100ml', value: 'free' }, CATALOGUE)).toBe(0);
    expect(gstForOrder({ product: 'Herbal Hair Oil 100ml' }, CATALOGUE)).toBe(0);
  });
});

describe('amountOwedForOrder', () => {
  it('bills the goods plus the tax — the drift this exists to stop', () => {
    // The bug added 10000 and the ledger counted 11800. That gap, once per
    // invoiced order, is what put Gujarat Super Stockist 10,200 out.
    const order = { product: 'Herbal Hair Oil 100ml', value: 10000 };
    expect(amountOwedForOrder(order, CATALOGUE)).toBe(11800);
  });

  it('matches across itemised and single-product orders of equal value', () => {
    const single = { product: 'Herbal Hair Oil 100ml', value: 10000 };
    const itemised = { value: 10000, items: [{ name: 'Herbal Hair Oil 100ml', total: 10000 }] };
    expect(amountOwedForOrder(itemised, CATALOGUE)).toBe(amountOwedForOrder(single, CATALOGUE));
  });

  it('bills the goods alone when nothing is taxable', () => {
    expect(amountOwedForOrder({ product: 'Untaxed Thing', value: 5000 }, CATALOGUE)).toBe(5000);
  });

  it('treats an unreadable value as nothing rather than NaN', () => {
    expect(amountOwedForOrder({ value: undefined }, CATALOGUE)).toBe(0);
    expect(amountOwedForOrder({}, CATALOGUE)).toBe(0);
    expect(amountOwedForOrder(null, CATALOGUE)).toBe(0);
  });
});

describe('partyForOrder', () => {
  it('charges the distributor first, then the dealer, then the retailer', () => {
    expect(partyForOrder({ distributorId: 'D1' })).toEqual({ kind: 'distributor', id: 'D1' });
    expect(partyForOrder({ dealerId: 'DL1' })).toEqual({ kind: 'dealer', id: 'DL1' });
    expect(partyForOrder({ retailerId: 'R1' })).toEqual({ kind: 'retailer', id: 'R1' });
  });

  it('charges an order carrying two ids once, to the one higher up the chain', () => {
    expect(partyForOrder({ distributorId: 'D1', dealerId: 'DL1', retailerId: 'R1' }))
      .toEqual({ kind: 'distributor', id: 'D1' });
    expect(partyForOrder({ dealerId: 'DL1', retailerId: 'R1' }))
      .toEqual({ kind: 'dealer', id: 'DL1' });
  });

  it('is null for an order belonging to no party, so nothing is charged', () => {
    expect(partyForOrder({ customerName: 'Walk-in' })).toBeNull();
    expect(partyForOrder({ distributorId: null, dealerId: '', retailerId: undefined })).toBeNull();
    expect(partyForOrder(null)).toBeNull();
  });
});

describe('balanceAfterCharge', () => {
  it('adds what is owed to what was owed', () => {
    expect(balanceAfterCharge(190000, 11800)).toBe(201800);
    expect(balanceAfterCharge(0, 11800)).toBe(11800);
  });

  it('keeps paise', () => {
    expect(balanceAfterCharge(100.005, 0.005)).toBe(100.01);
  });

  it('treats unreadable input as zero', () => {
    expect(balanceAfterCharge(undefined, 500)).toBe(500);
    expect(balanceAfterCharge(500, undefined)).toBe(500);
    expect(balanceAfterCharge('x', 'y')).toBe(0);
  });
});
