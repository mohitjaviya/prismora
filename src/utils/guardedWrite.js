/**
 * The discipline every money and stock write in this application needs.
 *
 * One bug shape accounted for ten of the sixteen problems found in the write
 * sweep, and it is always the same: a row is written, the result is not looked
 * at, and a balance or a stock level moves anyway on the strength of a record
 * that does not exist.
 *
 *     addDistributorPayment   balance reduced and invoices marked Paid
 *     addCreditNote           customer credited with no note on file
 *     splitOrder              original cut down, backorder never created
 *     deleteInvoice           balance reduced, invoice still in the database
 *
 * Each was fixed by hand, which means each can be broken again by hand. This
 * puts the rule in one place with tests around it, so a function that uses it
 * cannot get the order wrong.
 *
 * THE RULE
 *
 *   1. Write the record.
 *   2. If it was refused, undo whatever was done optimistically and stop.
 *      Nothing downstream runs.
 *   3. Only then apply the effects — the balance, the stock, the status.
 *
 * Step 3 last is the whole point. Effects are separate statements that would
 * succeed on their own, and a refused record with its effects applied is the
 * state that is hardest to notice and hardest to unpick.
 */

/**
 * Run a write, then its effects, rolling back if the write is refused.
 *
 * `write` returns true, false, or anything falsy for a refusal. `rollback`
 * undoes the optimistic local change. `effects` run in order and only after a
 * confirmed write.
 *
 * Returns { ok, error, results } — never throws for a refused write, because
 * a refusal is an outcome rather than an exception, and callers have to be
 * able to tell the user about it.
 */
export async function guardedWrite({ write, rollback, effects = [], label = 'the record' }) {
  if (typeof write !== 'function') {
    return { ok: false, error: 'guardedWrite needs something to write.', results: [] };
  }

  let saved;
  try {
    saved = await write();
  } catch (err) {
    if (typeof rollback === 'function') await rollback();
    return { ok: false, error: `Could not save ${label}.`, cause: err, results: [] };
  }

  if (!saved) {
    if (typeof rollback === 'function') await rollback();
    return { ok: false, error: `Could not save ${label}.`, results: [] };
  }

  // Effects run only now, and a failing one does not unwind the record: it has
  // been written and is real. What it gets is a reported failure, so the caller
  // can say the record exists and something after it did not happen — which is
  // recoverable, unlike a silent half-application.
  const results = [];
  for (const effect of effects) {
    if (typeof effect !== 'function') continue;
    try {
      results.push({ ok: true, value: await effect() });
    } catch (err) {
      results.push({ ok: false, error: err });
    }
  }

  const failed = results.filter(r => !r.ok).length;
  return {
    ok: true,
    partial: failed > 0,
    failedEffects: failed,
    results,
  };
}

/**
 * Undo in the opposite order to doing.
 *
 * A reversal that runs forwards puts things back in the wrong sequence: the
 * purchase-return withdrawal has to restore the vendor balance before deleting
 * the row, because a row that survives a failed restore is a record of
 * something that happened, while a deleted row whose effects are still applied
 * is not.
 *
 * Every step is attempted even if an earlier one fails, because a half-undone
 * reversal is worse than a fully attempted one, and the report says which
 * steps did not take.
 */
export async function reverseInOrder(steps = []) {
  const outcomes = [];
  for (const step of [...steps].reverse()) {
    if (typeof step !== 'function') continue;
    try {
      outcomes.push({ ok: true, value: await step() });
    } catch (err) {
      outcomes.push({ ok: false, error: err });
    }
  }
  return { ok: outcomes.every(o => o.ok), outcomes };
}

/**
 * Has this already been applied?
 *
 * The idempotency check used wherever an operation derives a deterministic id
 * from what it is about -- PAY-INV-<invoice>, EXP-INC-<incentive>. Asking the
 * records rather than a status means a status changed by some other path
 * cannot make the answer wrong, and a retry writes the same row for the
 * primary key to refuse rather than a second one for somebody to find later.
 */
export function alreadyApplied(id, records = []) {
  if (!id) return false;
  return (records || []).some(r => r?.id === id);
}
