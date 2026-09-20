import { describe, it, expect } from 'vitest';
import {
  alreadyBooked, expenseForClaim, expenseForFieldExpense, expenseForIncentive, expenseRowFor, incentiveCashValue, linkedExpenseId, unbookedPayouts, unbookedTotal,
} from '../payouts';

describe('linkedExpenseId - why booking twice is impossible', () => {
  it('derives the id from what caused the expense', () => {
    expect(linkedExpenseId('INC-123')).toBe('EXP-INC-123');
    expect(linkedExpenseId('CLM-9')).toBe('EXP-CLM-9');
  });

  // sfa_expenses ids already start with EXP-, which would otherwise read EXP-EXP-…
  it('does not double the prefix for a field expense', () => {
    expect(linkedExpenseId('EXP-1758000000')).toBe('EXP-FLD-1758000000');
  });

  it('is stable, so the same payout always maps to the same row', () => {
    expect(linkedExpenseId('INC-7')).toBe(linkedExpenseId('INC-7'));
  });

  it('copes with a missing id rather than producing undefined', () => {
    expect(linkedExpenseId(undefined)).toBe('EXP-');
  });
});

describe('incentiveCashValue - free goods are not cash', () => {
  it('counts a cash incentive at its value', () => {
    expect(incentiveCashValue({ incentiveType: 'Cash', incentiveValue: 1875 })).toBe(1875);
    expect(incentiveCashValue({ incentiveType: 'Discount', incentiveValue: 500 })).toBe(500);
  });

  // Inventory already carries the cost of the goods; booking it again would
  // count the same stock twice.
  it('counts free goods as nothing, because they cost stock and not money', () => {
    expect(incentiveCashValue({ incentiveType: 'Free Goods', incentiveValue: 100 })).toBe(0);
  });

  it('treats a missing or unusable value as zero', () => {
    expect(incentiveCashValue({ incentiveType: 'Cash' })).toBe(0);
    expect(incentiveCashValue(null)).toBe(0);
  });
});

describe('the expense each payout produces', () => {
  it('describes an incentive by its scheme and order', () => {
    const e = expenseForIncentive({ id: 'INC-1', schemeName: 'Navratri Boost', orderId: 'O2', incentiveValue: 1500 });
    expect(e).toMatchObject({ sourceId: 'INC-1', category: 'Scheme Incentive', amount: 1500 });
    expect(e.description).toBe('Navratri Boost on order O2');
  });

  it('leaves the order out of the description when there is none', () => {
    expect(expenseForIncentive({ id: 'INC-2', schemeName: 'Diwali', incentiveValue: 10 }).description).toBe('Diwali');
  });

  it('produces nothing for a free-goods incentive', () => {
    expect(expenseForIncentive({ id: 'INC-3', incentiveType: 'Free Goods', incentiveValue: 50 })).toBeNull();
  });

  it('produces nothing for a zero or missing amount', () => {
    expect(expenseForClaim({ id: 'CLM-1', amount: 0 })).toBeNull();
    expect(expenseForFieldExpense({ id: 'EXP-1' })).toBeNull();
  });

  it('keeps a field expense under its own category and its own claimant', () => {
    const e = expenseForFieldExpense({
      id: 'EXP-9', category: 'Travel', amount: 450, description: 'Rajkot beat', executiveId: 'U-3', date: '2026-09-01',
    });
    expect(e).toMatchObject({ category: 'Travel', amount: 450, assignedTo: 'U-3', date: '2026-09-01' });
    expect(e.description).toBe('Field expense: Rajkot beat');
  });
});

describe('unbookedPayouts - what the books are missing', () => {
  const incentives = [
    { id: 'INC-1', status: 'Paid', schemeName: 'A', incentiveValue: 1875 },
    { id: 'INC-2', status: 'Earned', schemeName: 'B', incentiveValue: 2700 },
    { id: 'INC-3', status: 'Paid', schemeName: 'C', incentiveType: 'Free Goods', incentiveValue: 20 },
  ];
  const claims = [
    { id: 'CLM-1', status: 'Settled', schemeName: 'A', amount: 500 },
    { id: 'CLM-2', status: 'Pending', schemeName: 'B', amount: 900 },
  ];
  const fieldExpenses = [
    { id: 'EXP-77', status: 'Approved', amount: 450, category: 'Travel' },
    { id: 'EXP-78', status: 'Pending', amount: 100, category: 'Travel' },
  ];

  it('finds only what has actually been paid out', () => {
    const rows = unbookedPayouts({ expenses: [], incentives, claims, fieldExpenses });
    expect(rows.map(r => r.sourceId).sort()).toEqual(['CLM-1', 'EXP-77', 'INC-1']);
  });

  it('leaves out an obligation that has not been paid yet', () => {
    const rows = unbookedPayouts({ expenses: [], incentives, claims, fieldExpenses });
    expect(rows.find(r => r.sourceId === 'INC-2')).toBeUndefined();  // Earned, not Paid
    expect(rows.find(r => r.sourceId === 'CLM-2')).toBeUndefined();  // Pending
    expect(rows.find(r => r.sourceId === 'EXP-78')).toBeUndefined(); // not approved
  });

  it('leaves out free goods, which cost stock rather than money', () => {
    const rows = unbookedPayouts({ expenses: [], incentives, claims: [], fieldExpenses: [] });
    expect(rows.find(r => r.sourceId === 'INC-3')).toBeUndefined();
  });

  // Running it twice must not book anything twice.
  it('skips whatever is already in the books', () => {
    const expenses = [{ id: 'EXP-INC-1' }, { id: 'EXP-CLM-1' }];
    const rows = unbookedPayouts({ expenses, incentives, claims, fieldExpenses });
    expect(rows.map(r => r.sourceId)).toEqual(['EXP-77']);
  });

  it('finds nothing once everything is booked', () => {
    const expenses = [{ id: 'EXP-INC-1' }, { id: 'EXP-CLM-1' }, { id: 'EXP-FLD-77' }];
    expect(unbookedPayouts({ expenses, incentives, claims, fieldExpenses })).toEqual([]);
  });

  it('copes with nothing at all', () => {
    expect(unbookedPayouts()).toEqual([]);
    expect(unbookedPayouts({})).toEqual([]);
  });

  it('totals what a reconcile would add', () => {
    const rows = unbookedPayouts({ expenses: [], incentives, claims, fieldExpenses });
    expect(unbookedTotal(rows)).toBe(1875 + 500 + 450);
    expect(unbookedTotal([])).toBe(0);
    expect(unbookedTotal(undefined)).toBe(0);
  });
});

// ── What bookLinkedExpense and unbookLinkedExpense decide ───────────────
describe('expenseRowFor', () => {
  const PAYOUT = {
    sourceId: 'INC-7', category: 'Scheme Incentive', amount: 450,
    description: 'Navratri Boost on order O2', assignedTo: '1',
  };

  it('builds the row a cash payout books', () => {
    const row = expenseRowFor(PAYOUT, '2026-09-21T00:00:00.000Z');
    expect(row).toMatchObject({
      id: 'EXP-INC-7', category: 'Scheme Incentive', amount: 450, assignedTo: '1',
    });
  });

  it('derives the id from the payout, so booking twice writes the same row', () => {
    expect(expenseRowFor(PAYOUT).id).toBe(expenseRowFor(PAYOUT).id);
  });

  it('books nothing for a payout that costs no cash', () => {
    // Free goods cost stock, which inventory already accounts for. A
    // zero-rupee expense is a row that means nothing and gets explained every
    // month.
    expect(expenseRowFor({ ...PAYOUT, amount: 0 })).toBeNull();
    expect(expenseRowFor({ ...PAYOUT, amount: -5 })).toBeNull();
    expect(expenseRowFor({ ...PAYOUT, amount: 'free' })).toBeNull();
  });

  it('books nothing without something to attribute it to', () => {
    expect(expenseRowFor({ ...PAYOUT, sourceId: null })).toBeNull();
    expect(expenseRowFor({})).toBeNull();
    expect(expenseRowFor()).toBeNull();
  });

  it('dates it now when no date is given', () => {
    const row = expenseRowFor(PAYOUT, '2026-09-21T00:00:00.000Z');
    expect(row.date).toBe('2026-09-21T00:00:00.000Z');
  });

  it('keeps a date that was given', () => {
    const row = expenseRowFor({ ...PAYOUT, date: '2026-01-01' }, '2026-09-21T00:00:00.000Z');
    expect(row.date).toBe('2026-01-01');
  });
});

describe('alreadyBooked', () => {
  const EXPENSES = [{ id: 'EXP-INC-7' }, { id: 'EXP-4' }];

  it('stops a payout being booked twice', () => {
    expect(alreadyBooked('INC-7', EXPENSES)).toBe(true);
  });

  it('does not confuse it with an unrelated payout', () => {
    expect(alreadyBooked('INC-8', EXPENSES)).toBe(false);
    expect(alreadyBooked('CLM-9', EXPENSES)).toBe(false);
  });

  it('shares a namespace with hand-entered expenses, which nothing currently reaches', () => {
    // linkedExpenseId('4') is EXP-4, and addExpense numbers its rows EXP-1,
    // EXP-2 and so on. A payout whose source id were a bare number would
    // therefore collide with a manual expense.
    //
    // It cannot happen today: incentives are INC-<timestamp>-<scheme>, claims
    // and field expenses carry their own prefixes, and nothing produces a bare
    // number. Pinned so that a future id scheme changing to plain numbers
    // fails here rather than silently treating somebody's lunch receipt as a
    // booked incentive.
    expect(alreadyBooked('4', [{ id: 'EXP-4' }])).toBe(true);
  });

  it('is false for nothing to check', () => {
    expect(alreadyBooked(null, EXPENSES)).toBe(false);
    expect(alreadyBooked('INC-7', [])).toBe(false);
    expect(alreadyBooked('INC-7')).toBe(false);
  });
});
