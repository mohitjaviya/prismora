import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  PARTY_ID_FIELD, ordersForParty, recentFirst, orderStats, unmatchedValue,
} from '../partnerOrders';

const party = { id: 'D-1', name: 'Mohan Traders' };

const orders = [
  { id: 'O1', dealerId: 'D-1', value: 10000, status: 'Delivered', date: '2026-09-01' },
  { id: 'O2', dealerId: 'D-1', value: 30000, status: 'Pending', date: '2026-09-10' },
  { id: 'O3', dealerId: 'D-1', value: 5000, status: 'Cancelled', date: '2026-09-05' },
  { id: 'O4', dealerId: 'D-2', value: 99999, status: 'Delivered', date: '2026-09-02' },
  // raised from a converted lead: names the dealer, carries no party id
  { id: 'O5', customerName: 'Mohan Traders', value: 7000, status: 'Delivered', date: '2026-08-20' },
];

afterEach(() => { vi.useRealTimers(); });

describe('ordersForParty', () => {
  it('finds the orders linked to this partner', () => {
    expect(ordersForParty(orders, party, 'dealer').linked.map(o => o.id)).toEqual(['O1', 'O2', 'O3']);
  });

  it('does not pick up another partner\'s orders', () => {
    expect(ordersForParty(orders, party, 'dealer').linked.find(o => o.id === 'O4')).toBeUndefined();
  });

  // The one the database cannot prove. Folding it in would overstate what is
  // certain; dropping it would understate the business.
  it('returns a name-matched order with no party id separately', () => {
    expect(ordersForParty(orders, party, 'dealer').unmatched.map(o => o.id)).toEqual(['O5']);
  });

  it('matches on the company name too, ignoring case and space', () => {
    const rows = [{ id: 'O9', companyName: '  MOHAN TRADERS ', value: 1, status: 'Delivered' }];
    expect(ordersForParty(rows, party, 'dealer').unmatched.map(o => o.id)).toEqual(['O9']);
  });

  it('never treats an order already linked elsewhere as unmatched', () => {
    const rows = [{ id: 'O8', distributorId: 'X-1', customerName: 'Mohan Traders', value: 1 }];
    expect(ordersForParty(rows, party, 'dealer').unmatched).toEqual([]);
  });

  it('uses the right id field per partner kind', () => {
    expect(PARTY_ID_FIELD).toEqual({
      distributor: 'distributorId', dealer: 'dealerId', retailer: 'retailerId',
    });
    const rows = [{ id: 'O7', distributorId: 'D-1', value: 1 }];
    expect(ordersForParty(rows, party, 'distributor').linked.map(o => o.id)).toEqual(['O7']);
    expect(ordersForParty(rows, party, 'dealer').linked).toEqual([]);
  });

  it('returns nothing rather than throwing for a partner with no id', () => {
    expect(ordersForParty(orders, null, 'dealer')).toEqual({ linked: [], unmatched: [] });
    expect(ordersForParty(null, party, 'dealer')).toEqual({ linked: [], unmatched: [] });
  });
});

describe('orderStats', () => {
  const linked = ordersForParty(orders, party, 'dealer').linked;

  it('counts every order, including cancelled ones', () => {
    expect(orderStats(linked).total).toBe(3);
    expect(orderStats(linked).cancelled).toBe(1);
  });

  // A cancelled order is not money the partner has spent.
  it('leaves cancelled orders out of lifetime value', () => {
    expect(orderStats(linked).lifetimeValue).toBe(40000);
  });

  it('averages over the orders that make up the value, not all of them', () => {
    // 40,000 over the two live orders, not over three.
    expect(orderStats(linked).averageOrder).toBe(20000);
  });

  it('counts anything not delivered or cancelled as still open', () => {
    expect(orderStats(linked).pending).toBe(1);
    expect(orderStats(linked).delivered).toBe(1);
  });

  it('reports the most recent order date and how long ago it was', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-09-20T00:00:00Z'));
    const s = orderStats(linked);
    expect(s.lastOrderDate.toISOString().slice(0, 10)).toBe('2026-09-10');
    expect(s.daysSinceLastOrder).toBe(10);
  });

  it('says nothing rather than zero days when there are no orders', () => {
    const s = orderStats([]);
    expect(s.lastOrderDate).toBeNull();
    expect(s.daysSinceLastOrder).toBeNull();
    expect(s.averageOrder).toBe(0);
  });

  it('survives rows with no usable date or value', () => {
    const s = orderStats([{ id: 'X', status: 'Delivered' }, { id: 'Y', value: 'abc', date: 'nonsense' }]);
    expect(s.total).toBe(2);
    expect(s.lifetimeValue).toBe(0);
    expect(s.lastOrderDate).toBeNull();
  });
});

describe('recentFirst', () => {
  it('puts the newest order at the top', () => {
    expect(recentFirst(orders).map(o => o.id)[0]).toBe('O2');
  });

  it('does not mutate what it was given', () => {
    const rows = [...orders];
    recentFirst(rows);
    expect(rows.map(o => o.id)).toEqual(orders.map(o => o.id));
  });
});

describe('unmatchedValue', () => {
  it('totals the orders that look like theirs but are not linked', () => {
    expect(unmatchedValue(ordersForParty(orders, party, 'dealer').unmatched)).toBe(7000);
  });

  it('leaves cancelled ones out, as the main total does', () => {
    expect(unmatchedValue([{ value: 100, status: 'Cancelled' }, { value: 50 }])).toBe(50);
  });

  it('copes with nothing', () => {
    expect(unmatchedValue()).toBe(0);
  });
});
