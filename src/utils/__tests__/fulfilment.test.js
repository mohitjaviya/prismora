import { describe, it, expect } from 'vitest';
import { splitLines, canSplit, planPartialDelivery } from '../fulfilment';

const LINES = [
  { name: 'Herbal Hair Oil 100ml', quantity: 10, unitPrice: 150, total: 1500 },
  { name: 'Neem Face Wash 100ml', quantity: 4, unitPrice: 50, total: 200 },
];

describe('splitLines', () => {
  it('keeps what is asked for and holds back the rest', () => {
    const { keep, split } = splitLines(LINES, { 'Herbal Hair Oil 100ml': 6 }, () => 0);
    expect(keep).toEqual([expect.objectContaining({ name: 'Herbal Hair Oil 100ml', quantity: 6, total: 900 })]);
    expect(split).toEqual([
      expect.objectContaining({ name: 'Herbal Hair Oil 100ml', quantity: 4, total: 600 }),
      expect.objectContaining({ name: 'Neem Face Wash 100ml', quantity: 4, total: 200 }),
    ]);
  });

  it('conserves every unit — the whole point of a split', () => {
    // A split moves units between two orders. Losing one here loses goods a
    // customer is waiting for, and nothing else would notice.
    const { conserved } = splitLines(LINES, { 'Herbal Hair Oil 100ml': 6 }, () => 0);
    expect(conserved).toBe(true);
  });

  it('conserves them however the split falls', () => {
    const cases = [null, {}, { 'Herbal Hair Oil 100ml': 0 }, { 'Herbal Hair Oil 100ml': 999 }];
    cases.forEach(shipNow => {
      expect(splitLines(LINES, shipNow, () => 3).conserved).toBe(true);
    });
  });

  it('falls back to what is in stock for a product not named', () => {
    const { keep } = splitLines(LINES, { 'Herbal Hair Oil 100ml': 10 }, name =>
      name === 'Neem Face Wash 100ml' ? 2 : 0);
    expect(keep.find(i => i.name === 'Neem Face Wash 100ml').quantity).toBe(2);
  });

  it('never keeps more than was ordered', () => {
    const { keep, split } = splitLines(LINES, { 'Herbal Hair Oil 100ml': 999 }, () => 0);
    expect(keep.find(i => i.name === 'Herbal Hair Oil 100ml').quantity).toBe(10);
    expect(split.find(i => i.name === 'Herbal Hair Oil 100ml')).toBeUndefined();
  });

  it('never keeps a negative amount', () => {
    const { keep, split } = splitLines(LINES, { 'Herbal Hair Oil 100ml': -5 }, () => 0);
    expect(keep.find(i => i.name === 'Herbal Hair Oil 100ml')).toBeUndefined();
    expect(split.find(i => i.name === 'Herbal Hair Oil 100ml').quantity).toBe(10);
  });

  it('prices each half from the unit price, not by dividing the total again', () => {
    const { keep, split } = splitLines(
      [{ name: 'X', quantity: 4, total: 1000 }], { X: 1 }, () => 0);
    expect(keep[0].total).toBe(250);
    expect(split[0].total).toBe(750);
    expect(keep[0].total + split[0].total).toBe(1000);
  });

  it('skips lines it cannot read rather than splitting nonsense', () => {
    const messy = [{ name: '', quantity: 5 }, { name: 'X', quantity: 0 }, { name: 'Y', quantity: 'two' }];
    const { keep, split } = splitLines(messy, null, () => 5);
    expect(keep).toEqual([]);
    expect(split).toEqual([]);
  });

  it('handles no lines at all', () => {
    expect(splitLines([], null, () => 0)).toEqual({ keep: [], split: [], conserved: true });
    expect(splitLines(undefined, null, () => 0).conserved).toBe(true);
  });
});

describe('canSplit', () => {
  it('allows a split with something on both sides', () => {
    expect(canSplit({ keep: [{}], split: [{}] })).toEqual({ ok: true });
  });

  it('refuses when everything can ship — that is the order proceeding', () => {
    const r = canSplit({ keep: [{}], split: [] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/nothing to hold back/i);
  });

  it('refuses when nothing can ship — that is the order waiting', () => {
    const r = canSplit({ keep: [], split: [{}] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/nothing to split off/i);
  });

  it('refuses nothing at all', () => {
    expect(canSplit({ keep: [], split: [] }).ok).toBe(false);
    expect(canSplit({}).ok).toBe(false);
    expect(canSplit().ok).toBe(false);
  });
});

describe('planPartialDelivery', () => {
  it('moves what is asked for and says what is left', () => {
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 20, deliverNow: 30, available: 500 });
    expect(r).toMatchObject({ ok: true, moving: 30, deliveredQty: 50, remaining: 50, status: 'Partially Delivered' });
  });

  it('marks it Delivered when the last unit goes', () => {
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 70, deliverNow: 30, available: 500 });
    expect(r.status).toBe('Delivered');
    expect(r.remaining).toBe(0);
  });

  it('never delivers past the order, however much is asked for', () => {
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 90, deliverNow: 999, available: 999 });
    expect(r.deliveredQty).toBe(100);
    expect(r.moving).toBe(10);
  });

  it('refuses more than is in stock, and says how many there are', () => {
    // The screen's max attribute does not prevent this: the input sits outside
    // a form, so the number can be typed past it. Marking an order Delivered
    // bills the customer for goods that never left the warehouse.
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 0, deliverNow: 50, available: 20 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only 20/i);
  });

  it('names the product in the refusal when it knows it', () => {
    // The message reaches an activity log as well as a screen. "Only 3 in
    // stock" is clear beside one order and meaningless a week later.
    const r = planPartialDelivery({ ordered: 100, deliverNow: 50, available: 20, product: 'Herbal Hair Oil 100ml' });
    expect(r.reason).toBe('Only 20 unit(s) of Herbal Hair Oil 100ml in stock — cannot deliver 50.');
  });

  it('refuses when the order is already fully delivered', () => {
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 100, deliverNow: 10, available: 500 });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/nothing left/i);
  });

  it('refuses a quantity that is not a positive number', () => {
    [0, -5, 'ten', null, undefined, NaN].forEach(q => {
      expect(planPartialDelivery({ ordered: 100, deliverNow: q, available: 500 }).ok).toBe(false);
    });
  });

  it('conserves units: what moves plus what remains is what was outstanding', () => {
    const r = planPartialDelivery({ ordered: 100, alreadyDelivered: 20, deliverNow: 30, available: 500 });
    expect(r.moving + r.remaining).toBe(100 - 20);
  });

  it('treats stock as unlimited when none is stated, for callers that check separately', () => {
    expect(planPartialDelivery({ ordered: 10, deliverNow: 10 }).ok).toBe(true);
  });
});
