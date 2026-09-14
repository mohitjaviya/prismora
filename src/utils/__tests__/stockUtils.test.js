import { describe, it, expect } from 'vitest';
import { receivedLines, aggregateReceived } from '../stockUtils';

const DIST = { id: 'DIST-1', name: 'Gujarat Super Stockist' };

describe('receivedLines — what has actually reached the partner', () => {
  it('counts nothing for an order still in the pipeline', () => {
    for (const status of ['Pending', 'Processing', 'Ready for Dispatch', 'Shipped', 'Cancelled']) {
      expect(receivedLines({ status, product: 'Herbal Hair Oil 100ml', quantity: 500 })).toEqual([]);
    }
  });

  it('counts the full quantity once Delivered', () => {
    expect(receivedLines({ status: 'Delivered', product: 'Herbal Hair Oil 100ml', quantity: 500 }))
      .toEqual([{ name: 'Herbal Hair Oil 100ml', quantity: 500 }]);
  });

  // The bug this guards: an order for 500 with only 350 shipped used to report
  // all 500 as being in the partner's hands.
  it('counts only deliveredQty on a part-delivered order', () => {
    expect(receivedLines({
      status: 'Partially Delivered', product: 'Herbal Hair Oil 100ml', quantity: 500, deliveredQty: 350,
    })).toEqual([{ name: 'Herbal Hair Oil 100ml', quantity: 350 }]);
  });

  it('treats a part-delivered order with no deliveredQty as nothing received', () => {
    expect(receivedLines({ status: 'Partially Delivered', product: 'X', quantity: 500 }))
      .toEqual([{ name: 'X', quantity: 0 }]);
  });

  it('expands every line of a delivered multi-item order', () => {
    expect(receivedLines({
      status: 'Delivered',
      items: [{ name: 'Neem Face Wash 100ml', quantity: 20 }, { name: 'Tulsi Cough Syrup 100ml', quantity: 5 }],
    })).toEqual([
      { name: 'Neem Face Wash 100ml', quantity: 20 },
      { name: 'Tulsi Cough Syrup 100ml', quantity: 5 },
    ]);
  });

  // Partial delivery is only tracked for single-product orders, so a
  // part-delivered multi-item order must not guess at what shipped.
  it('counts nothing for a part-delivered multi-item order', () => {
    expect(receivedLines({
      status: 'Partially Delivered', deliveredQty: 10,
      items: [{ name: 'Neem Face Wash 100ml', quantity: 20 }],
    })).toEqual([]);
  });

  it('survives a missing order', () => {
    expect(receivedLines(null)).toEqual([]);
  });
});

describe('aggregateReceived — per-product totals for one party', () => {
  const orders = [
    { id: 'O1', distributorId: 'DIST-1', status: 'Delivered', product: 'Herbal Hair Oil 100ml', quantity: 200, receivedByDistributor: true },
    { id: 'O2', distributorId: 'DIST-1', status: 'Partially Delivered', product: 'Herbal Hair Oil 100ml', quantity: 500, deliveredQty: 350 },
    { id: 'O3', distributorId: 'DIST-1', status: 'Shipped', product: 'Neem Face Wash 100ml', quantity: 99 },
    { id: 'O4', distributorId: 'DIST-2', status: 'Delivered', product: 'Herbal Hair Oil 100ml', quantity: 1000, receivedByDistributor: true },
  ];

  it('sums delivered quantities per product', () => {
    const { byProduct } = aggregateReceived(orders, DIST, 'Distributor');
    expect(byProduct['Herbal Hair Oil 100ml'].received).toBe(550); // 200 + 350
  });

  it('never counts another party’s orders', () => {
    const { totalUnits } = aggregateReceived(orders, DIST, 'Distributor');
    expect(totalUnits).toBe(550); // DIST-2's 1000 excluded
  });

  it('excludes orders that have not been delivered', () => {
    const { byProduct } = aggregateReceived(orders, DIST, 'Distributor');
    expect(byProduct['Neem Face Wash 100ml']).toBeUndefined(); // still Shipped
  });

  it('reports unconfirmed quantities separately without hiding them', () => {
    const { awaitingUnits, byProduct } = aggregateReceived(orders, DIST, 'Distributor');
    expect(awaitingUnits).toBe(350);                                   // O2 not confirmed
    expect(byProduct['Herbal Hair Oil 100ml'].unconfirmed).toBe(350);
    expect(byProduct['Herbal Hair Oil 100ml'].received).toBe(550);     // still counted
  });

  it('counts the orders it drew from', () => {
    expect(aggregateReceived(orders, DIST, 'Distributor').orderCount).toBe(2);
  });

  // Guards the `undefined === undefined` trap: without a party check every
  // order with no distributorId would match every party.
  it('returns nothing when the party cannot be resolved', () => {
    expect(aggregateReceived(orders, null, 'Distributor').totalUnits).toBe(0);
    expect(aggregateReceived(orders, { id: undefined }, 'Distributor').totalUnits).toBe(0);
  });

  it('returns nothing for a role that is not a portal party', () => {
    expect(aggregateReceived(orders, DIST, 'Sales Executive').totalUnits).toBe(0);
  });

  it('reads the right id field for dealers and retailers', () => {
    const mixed = [
      { id: 'O5', dealerId: 'DEAL-1', status: 'Delivered', product: 'A', quantity: 7 },
      { id: 'O6', retailerId: 'RET-1', status: 'Delivered', product: 'B', quantity: 9 },
    ];
    expect(aggregateReceived(mixed, { id: 'DEAL-1' }, 'Dealer').totalUnits).toBe(7);
    expect(aggregateReceived(mixed, { id: 'RET-1' }, 'Retailer').totalUnits).toBe(9);
  });
});
