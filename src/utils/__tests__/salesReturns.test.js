import { describe, it, expect } from 'vitest';
import { deliveredUnits, returnsForOrder, returnedUnits, orderReturnState, returnLineRows } from '../salesReturns';

const single = { id: 'O187', product: 'TEST Unrated Balm', quantity: 2, deliveredQty: 2, fulfilledAt: '2026-10-02T10:00:00Z', items: [] };
const ret = (id, orderId, qty, at, extra = {}) => ({
  id, orderId, createdAt: at, creditNoteId: `CN-${id}`, createdBy: 'U1', note: null,
  lines: [{ product: 'TEST Unrated Balm', quantity: qty, batchNumber: 'TEST-P3-B1', reason: 'Excess stock' }], ...extra,
});

describe('Gap 11: sales returns on orders', () => {
  it('counts delivered units like order_returnable', () => {
    expect(deliveredUnits(single)).toBe(2);
    expect(deliveredUnits({ quantity: 10, deliveredQty: 4 })).toBe(4);
    expect(deliveredUnits({ quantity: 10, deliveredQty: 4, fulfilledAt: 'x' })).toBe(10);
    expect(deliveredUnits({ items: [{ name: 'A', quantity: 3 }, { name: 'B', quantity: 2 }], fulfilledAt: 'x' })).toBe(5);
    expect(deliveredUnits({ items: [{ name: 'A', quantity: 3 }] })).toBe(0);
    expect(deliveredUnits(null)).toBe(0);
  });

  it('O187: one of two returned is "Partially returned"', () => {
    const all = [ret('SR-1', 'O187', 1, '2026-10-02T11:00:00Z'), ret('SR-X', 'O999', 5, '2026-10-01T00:00:00Z')];
    expect(orderReturnState(single, all)).toEqual({ returned: 1, delivered: 2, left: 1, label: 'Partially returned' });
  });

  it('the last unit back makes it "Fully returned" with nothing left', () => {
    const all = [ret('SR-1', 'O187', 1, '2026-10-02T11:00:00Z'), ret('SR-2', 'O187', 1, '2026-10-03T11:00:00Z')];
    expect(orderReturnState(single, all)).toEqual({ returned: 2, delivered: 2, left: 0, label: 'Fully returned' });
  });

  it('an order with no returns has no label', () => {
    expect(orderReturnState(single, [])).toEqual({ returned: 0, delivered: 2, left: 2, label: null });
    expect(orderReturnState(single, undefined).label).toBe(null);
  });

  it('lists returns oldest first, a row per line', () => {
    const all = [ret('SR-2', 'O187', 1, '2026-10-03T11:00:00Z', { note: 'second' }), ret('SR-1', 'O187', 1, '2026-10-02T11:00:00Z')];
    const mine = returnsForOrder(all, 'O187');
    expect(mine.map(r => r.id)).toEqual(['SR-1', 'SR-2']);
    expect(returnedUnits(mine)).toBe(2);
    const rows = returnLineRows(mine);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({ returnId: 'SR-2', product: 'TEST Unrated Balm', batch: 'TEST-P3-B1', quantity: 1, reason: 'Excess stock', creditNoteId: 'CN-SR-2', note: 'second', createdBy: 'U1' });
  });
});
