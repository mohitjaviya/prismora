import { describe, it, expect } from 'vitest';
import { movementEffect, reconcileBatch, reconcileAll, reconciliationExportRows, RECORDS_COMPLETE_FROM } from '../stockReconciliation';

const mv = (kind, quantity, at, extra = {}) => ({ kind, quantity, at, inventoryId: 'B1', ...extra });
const NEW = '2026-10-05T10:00:00Z';

describe('Gap 15: batch stock reconciliation', () => {
  it('knows which way each movement kind moves stock', () => {
    expect(movementEffect(mv('grn', 100))).toEqual({ qty: 100, damaged: 0 });
    expect(movementEffect(mv('delivery', 30))).toEqual({ qty: -30, damaged: 0 });
    expect(movementEffect(mv('adjustment', -2))).toEqual({ qty: -2, damaged: 0 });
    expect(movementEffect(mv('return', 5))).toEqual({ qty: 5, damaged: 0 });
    expect(movementEffect(mv('return', 5, null, { condition: 'Good' }))).toEqual({ qty: 5, damaged: 0 });
    expect(movementEffect(mv('return', 5, null, { condition: 'Damaged' }))).toEqual({ qty: 0, damaged: 5 });
    expect(movementEffect(mv('return', 5, null, { condition: 'Expired' }))).toEqual({ qty: 0, damaged: 5 });
    expect(movementEffect(mv('damaged_write_off', 3))).toEqual({ qty: 0, damaged: -3 });
    expect(movementEffect(mv('mystery', 3))).toBe(null);
  });

  it('owner\'s example: 100 bought, 100 delivered, 50 back damaged, 50 back good = OK', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'N1', quantity: 50, damaged: 50, createdAt: NEW };
    const r = reconcileBatch(batch, [
      mv('grn', 100, NEW), mv('delivery', 100, '2026-10-06T10:00:00Z'),
      mv('return', 50, '2026-10-07T10:00:00Z', { condition: 'Damaged' }), mv('return', 50, '2026-10-07T11:00:00Z', { condition: 'Good' }),
    ]);
    expect(r).toMatchObject({ received: 100, delivered: 100, returnedGood: 50, returnedDamaged: 50,
      expectedQty: 50, expectedDamaged: 50, qtyDiff: 0, damagedDiff: 0, status: 'OK', complete: true });
  });

  it('finds the missing 50 when the damaged count was changed by hand', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'N1', quantity: 50, damaged: 0, createdAt: NEW };
    const r = reconcileBatch(batch, [
      mv('grn', 100, NEW), mv('delivery', 100, '2026-10-06T10:00:00Z'),
      mv('return', 50, '2026-10-07T10:00:00Z', { condition: 'Damaged' }), mv('return', 50, '2026-10-07T11:00:00Z', { condition: 'Good' }),
    ]);
    expect(r).toMatchObject({ status: 'Difference', qtyDiff: 0, damagedDiff: -50 });
  });

  it('marks batches older than the movement records "history incomplete", with no difference', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'OLD', quantity: 40, damaged: 0, createdAt: '2026-09-21T09:15:11Z' };
    const r = reconcileBatch(batch, [mv('delivery', 10, '2026-09-29T10:00:00Z')]);
    expect(r).toMatchObject({ status: 'History incomplete', complete: false, expectedQty: null, qtyDiff: null, delivered: 10 });
    expect(r.note).toMatch(/opening stock was never recorded/);
  });

  it('a batch typed in on Add Batch after the cut-off is still incomplete (no opening row)', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'X', quantity: 10, damaged: 0, createdAt: NEW };
    expect(reconcileBatch(batch, []).note).toMatch(/Add Batch/);
    expect(new Date(NEW) > new Date(RECORDS_COMPLETE_FROM)).toBe(true);
  });

  it('counts from an opening balance (087) and ignores movements before it', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'OLD', quantity: 38, damaged: 2, createdAt: '2026-09-21T09:15:11Z' };
    const r = reconcileBatch(batch, [
      mv('delivery', 10, '2026-09-29T10:00:00Z'),
      mv('opening', 40, '2026-10-06T00:00:00Z'), mv('opening_damaged', 2, '2026-10-06T00:00:00Z'),
      mv('delivery', 2, '2026-10-07T00:00:00Z'),
    ]);
    expect(r).toMatchObject({ complete: true, opening: 42, delivered: 2, expectedQty: 38, expectedDamaged: 2, status: 'OK' });
  });

  it('an unknown movement kind makes the history incomplete rather than wrong', () => {
    const batch = { id: 'B1', product: 'Neem', batchNumber: 'N1', quantity: 5, damaged: 0, createdAt: NEW };
    expect(reconcileBatch(batch, [mv('grn', 5, NEW), mv('teleport', 1, NEW)]).status).toBe('History incomplete');
  });

  it('exports one row per batch with the screen columns', () => {
    const rows = reconcileAll([{ id: 'B1', product: 'Neem', batchNumber: 'N1', quantity: 5, damaged: 0, createdAt: NEW }], [mv('grn', 5, NEW)]);
    const out = reconciliationExportRows(rows);
    expect(Object.keys(out[0])).toContain('Qty Difference');
    expect(out[0]).toMatchObject({ Product: 'Neem', Batch: 'N1', 'Expected Qty': 5, 'Actual Qty': 5, 'Qty Difference': 0, Status: 'OK' });
  });
});

describe('089: an earlier return corrected to damaged', () => {
  it('O319 + O320: 100 opening, two deliveries of 50 each came back on sale, both corrected -> 0 stock, 100 damaged, OK', () => {
    const batch = { id: 'B1', product: 'Neem Face Wash 100ml', batchNumber: '', quantity: 0, damaged: 100, createdAt: '2026-10-01T04:29:33Z' };
    const r = reconcileBatch(batch, [
      mv('opening', 100, '2026-10-06T00:00:00Z'),
      mv('return_reclassified', 50, '2026-10-06T01:00:00Z', { condition: 'Damaged' }),
      mv('return_reclassified', 50, '2026-10-06T01:01:00Z', { condition: 'Damaged' }),
    ]);
    expect(r).toMatchObject({ opening: 100, returnedGood: -100, returnedDamaged: 100, expectedQty: 0, expectedDamaged: 100, status: 'OK' });
  });
  it('the same batch before 087: still History incomplete, never a made-up difference', () => {
    const batch = { id: 'B1', product: 'Neem Face Wash 100ml', batchNumber: '', quantity: 100, damaged: 0, createdAt: '2026-10-01T04:29:33Z' };
    const r = reconcileBatch(batch, [mv('delivery', 50, '2026-10-04T09:33:48Z'), mv('return', 50, '2026-10-04T09:34:17Z')]);
    expect(r).toMatchObject({ status: 'History incomplete', delivered: 50, returnedGood: 50, qtyDiff: null });
  });
});
