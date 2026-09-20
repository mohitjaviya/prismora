import { describe, it, expect } from 'vitest';
import {
  quantityAfterAdjustment, sameBatchNumber, batchToReceiveInto,
  canTransfer, destinationBatch, applyTransfer,
} from '../stockMoves';

const STOCK = [
  { id: 'A', product: 'Herbal Hair Oil 100ml', batchNumber: 'HHO-1', warehouse: 'Main', quantity: 40 },
  { id: 'B', product: 'Herbal Hair Oil 100ml', batchNumber: 'HHO-1', warehouse: 'Surat', quantity: 10 },
  { id: 'C', product: 'Herbal Hair Oil 100ml', batchNumber: 'HHO-2', warehouse: 'Main', quantity: 5 },
  { id: 'D', product: 'Neem Face Wash 100ml', batchNumber: 'NFW-1', warehouse: 'Main', quantity: 0 },
];

describe('quantityAfterAdjustment', () => {
  it('adds and removes units', () => {
    expect(quantityAfterAdjustment(40, -15)).toBe(25);
    expect(quantityAfterAdjustment(40, 10)).toBe(50);
  });

  it('floors at zero — stock cannot be negative the way a balance can', () => {
    expect(quantityAfterAdjustment(5, -40)).toBe(0);
    expect(quantityAfterAdjustment(0, -1)).toBe(0);
  });

  it('is null when either side is unreadable, rather than NaN', () => {
    expect(quantityAfterAdjustment(undefined, -1)).toBeNull();
    expect(quantityAfterAdjustment(10, 'three')).toBeNull();
    expect(quantityAfterAdjustment(NaN, 1)).toBeNull();
  });
});

describe('sameBatchNumber', () => {
  it('ignores case and surrounding space', () => {
    expect(sameBatchNumber('HHO-1', ' hho-1 ')).toBe(true);
    expect(sameBatchNumber('HHO-1', 'HHO-2')).toBe(false);
  });

  it('treats absent and empty as the same, so unbatched goods pile up together', () => {
    expect(sameBatchNumber(null, '')).toBe(true);
    expect(sameBatchNumber(undefined, null)).toBe(true);
    expect(sameBatchNumber('HHO-1', null)).toBe(false);
  });
});

describe('batchToReceiveInto', () => {
  it('joins the existing batch of that product', () => {
    expect(batchToReceiveInto(STOCK, 'Herbal Hair Oil 100ml', 'HHO-1').id).toBe('A');
  });

  it('matches without regard to case or space', () => {
    expect(batchToReceiveInto(STOCK, '  herbal hair oil 100ml', ' hho-2 ').id).toBe('C');
  });

  it('starts a new row when the batch number differs, rather than inheriting another expiry', () => {
    expect(batchToReceiveInto(STOCK, 'Herbal Hair Oil 100ml', 'HHO-99')).toBeNull();
  });

  it('joins a batch even when it currently holds nothing', () => {
    expect(batchToReceiveInto(STOCK, 'Neem Face Wash 100ml', 'NFW-1').id).toBe('D');
  });

  it('is null for a product not stocked, or no product at all', () => {
    expect(batchToReceiveInto(STOCK, 'Nothing Like This', 'X')).toBeNull();
    expect(batchToReceiveInto(STOCK, '', 'HHO-1')).toBeNull();
    expect(batchToReceiveInto(STOCK, null, 'HHO-1')).toBeNull();
    expect(batchToReceiveInto([], 'Herbal Hair Oil 100ml', 'HHO-1')).toBeNull();
  });
});

describe('canTransfer', () => {
  const source = STOCK[0];   // 40 units, Main

  it('allows a move the source can cover', () => {
    expect(canTransfer(source, 'Surat', 10)).toEqual({ ok: true });
    expect(canTransfer(source, 'Surat', 40)).toEqual({ ok: true });
  });

  it('refuses more than the batch holds, and says how many there are', () => {
    const r = canTransfer(source, 'Surat', 41);
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/only 40/i);
  });

  it('refuses a move to the warehouse it is already in', () => {
    expect(canTransfer(source, 'Main', 5).ok).toBe(false);
    expect(canTransfer(source, 'Main', 5).reason).toMatch(/already in that warehouse/i);
  });

  it('refuses a quantity that is not a positive number', () => {
    [0, -5, 'ten', null, undefined, NaN].forEach(q => {
      expect(canTransfer(source, 'Surat', q).ok).toBe(false);
    });
  });

  it('refuses when there is no batch or no destination', () => {
    expect(canTransfer(null, 'Surat', 5).ok).toBe(false);
    expect(canTransfer(source, '', 5).ok).toBe(false);
    expect(canTransfer(source, null, 5).ok).toBe(false);
  });

  it('gives a reason for every refusal, so a screen can say what was wrong', () => {
    [[null, 'Surat', 5], [source, 'Main', 5], [source, 'Surat', 99], [source, 'Surat', 0]]
      .forEach(args => expect(canTransfer(...args).reason).toBeTruthy());
  });
});

describe('destinationBatch', () => {
  it('finds the same batch already at the destination', () => {
    expect(destinationBatch(STOCK, STOCK[0], 'Surat').id).toBe('B');
  });

  it('is null when the destination has no such batch, so one is created', () => {
    expect(destinationBatch(STOCK, STOCK[0], 'Pune')).toBeNull();
  });

  it('never matches the row being moved from', () => {
    expect(destinationBatch(STOCK, STOCK[0], 'Main')).toBeNull();
  });

  it('does not merge a different batch of the same product', () => {
    expect(destinationBatch(STOCK, STOCK[2], 'Surat')).toBeNull();
  });
});

describe('applyTransfer', () => {
  it('moves units out of one side and into the other', () => {
    expect(applyTransfer({ quantity: 40 }, { quantity: 10 }, 15)).toEqual({ from: 25, to: 25 });
  });

  it('conserves the total — a transfer creates and destroys nothing', () => {
    const before = 40 + 10;
    const after = applyTransfer({ quantity: 40 }, { quantity: 10 }, 15);
    expect(after.from + after.to).toBe(before);
  });

  it('starts the destination at zero when the batch is new there', () => {
    expect(applyTransfer({ quantity: 40 }, null, 15)).toEqual({ from: 25, to: 15 });
  });

  it('empties the source when everything moves', () => {
    expect(applyTransfer({ quantity: 40 }, { quantity: 0 }, 40)).toEqual({ from: 0, to: 40 });
  });

  it('treats unreadable quantities as zero rather than NaN', () => {
    expect(applyTransfer({}, {}, 5)).toEqual({ from: -5, to: 5 });
    expect(applyTransfer({ quantity: 10 }, { quantity: 0 }, 'x')).toEqual({ from: 10, to: 0 });
  });
});
