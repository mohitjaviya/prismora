/**
 * Money that leaves the business somewhere other than the Accounting screen.
 *
 * Settling a scheme claim, paying an incentive and approving a field expense
 * all move real money, and none of them used to reach the books: Accounting
 * sums the `expenses` table, and the only thing that ever wrote to it was its
 * own Add Expense form. Net profit was overstated by every payout ever made.
 *
 * The rules live here rather than inside DataContext so they can be tested
 * without a database, and so "what counts as a payout" is one answer rather
 * than three.
 *
 * Recognition is on a cash basis: the expense is booked at the moment the
 * money actually goes out, not when the obligation is created. An incentive
 * counts when it is marked Paid, a claim when it is Settled, a field expense
 * when it is Approved.
 */

/** The `expenses` row id derived from whatever caused the expense. */
export const linkedExpenseId = (sourceId) =>
  // sfa_expenses ids already begin with EXP-, so they become EXP-FLD-… rather
  // than the unreadable EXP-EXP-…
  `EXP-${String(sourceId ?? '').replace(/^EXP-/, 'FLD-')}`;

/**
 * Free goods cost stock, not cash.
 *
 * Inventory already carries that cost, so booking it as an expense too would
 * count the same goods twice.
 */
export const incentiveCashValue = (incentive) =>
  (incentive?.incentiveType === 'Free Goods' ? 0 : Number(incentive?.incentiveValue) || 0);

/** The expense a paid incentive should produce, or null if it costs no cash. */
export const expenseForIncentive = (incentive) => {
  const amount = incentiveCashValue(incentive);
  if (!incentive?.id || amount <= 0) return null;
  return {
    sourceId: incentive.id,
    category: 'Scheme Incentive',
    amount,
    description: `${incentive.schemeName || 'Scheme incentive'}${incentive.orderId ? ` on order ${incentive.orderId}` : ''}`,
  };
};

/** The expense a settled claim should produce. */
export const expenseForClaim = (claim) => {
  const amount = Number(claim?.amount) || 0;
  if (!claim?.id || amount <= 0) return null;
  return {
    sourceId: claim.id,
    category: 'Scheme Claim',
    amount,
    description: `${claim.schemeName || 'Scheme claim'}${claim.orderId ? ` on order ${claim.orderId}` : ''}`,
  };
};

/** The expense an approved field expense should produce. */
export const expenseForFieldExpense = (exp) => {
  const amount = Number(exp?.amount) || 0;
  if (!exp?.id || amount <= 0) return null;
  return {
    sourceId: exp.id,
    category: exp.category || 'Field Expense',
    amount,
    description: `Field expense${exp.description ? `: ${exp.description}` : ''}`,
    date: exp.date,
    assignedTo: exp.executiveId || exp.assignedTo || null,
  };
};

/**
 * Payouts that have happened but are not in the books.
 *
 * Everything paid before this was wired up is invisible to Accounting, and no
 * amount of correct behaviour from here on would find it. This is what a
 * reconcile offers to book, and because the expense id is derived from the
 * source it is safe to run repeatedly -- anything already booked is skipped.
 */
export const unbookedPayouts = ({ expenses, incentives, claims, fieldExpenses } = {}) => {
  const booked = new Set((expenses || []).map(e => e?.id));
  const out = [];

  (incentives || [])
    .filter(i => i?.status === 'Paid')
    .forEach(i => { const e = expenseForIncentive(i); if (e) out.push(e); });

  (claims || [])
    .filter(c => c?.status === 'Settled')
    .forEach(c => { const e = expenseForClaim(c); if (e) out.push(e); });

  (fieldExpenses || [])
    .filter(f => f?.status === 'Approved')
    .forEach(f => { const e = expenseForFieldExpense(f); if (e) out.push(e); });

  return out.filter(e => !booked.has(linkedExpenseId(e.sourceId)));
};

/** What a reconcile would add to expenses, for saying so before doing it. */
export const unbookedTotal = (rows) => (rows || []).reduce((sum, r) => sum + (Number(r.amount) || 0), 0);
