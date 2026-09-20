/**
 * What the money writes decide, separated from writing them.
 *
 * Deleting an invoice, issuing a credit note, taking a payment, correcting a
 * balance: each is a small decision followed by a database call. The decisions
 * were inside the provider where nothing could reach them, and every one of
 * them moves money.
 *
 * The rule they share is in guardedWrite.js. What is here is the part that
 * differs: which direction the balance goes, who it belongs to, and what has
 * to be true before anything happens at all.
 */

import { balanceAfterPayment } from './settlement';

/**
 * The balance a party is left with after an invoice is deleted.
 *
 * Deleting a bill has to undo raising it, or the partner goes on owing for an
 * invoice that no longer exists and the ledger stops adding up to their
 * balance. Raising it added the total, so deleting it takes the total off.
 *
 * Not floored at zero. Deleting the only invoice a partner has, after they
 * have paid it, correctly leaves them in credit -- money the business is
 * holding on their behalf, which is exactly what a negative balance means
 * everywhere else in this application.
 */
export function balanceAfterInvoiceDeleted(outstanding, invoiceTotal) {
  return balanceAfterPayment(outstanding, invoiceTotal);
}

/**
 * The balance after a credit note, and after withdrawing one.
 *
 * A credit note is the sales-side mirror of a purchase return: it reduces what
 * the customer owes. Withdrawing it puts that back. Both round to paise and
 * neither clamps, for the same reason -- a credit larger than the balance
 * leaves the customer in credit rather than evaporating.
 */
export function balanceAfterCreditNote(outstanding, amount) {
  return balanceAfterPayment(outstanding, amount);
}

export function balanceAfterCreditNoteWithdrawn(outstanding, amount) {
  return balanceAfterPayment(outstanding, -(Number(amount) || 0));
}

/**
 * Whether a credit note has enough to act on.
 *
 * An amount above zero and somebody to credit. A credit note for nothing is
 * not a correction, it is a row that makes a ledger harder to read.
 */
export function validateCreditNote({ customerName, amount } = {}) {
  const who = String(customerName ?? '').trim();
  if (!who) return { ok: false, error: 'Say who the credit note is for.' };

  const value = Number(amount);
  if (!Number.isFinite(value) || value <= 0) {
    return { ok: false, error: 'Enter an amount above zero.' };
  }
  return { ok: true };
}

/**
 * Which party a credit note or payment is against, matched by name.
 *
 * Distributor, then dealer, then retailer -- the same precedence
 * settleInvoiceAsPayment uses, and the same ambiguity: a name matching at two
 * tiers credits the higher one. Invoices now carry a party id and avoid this
 * entirely; credit notes still do not, so the tie-break still applies and is
 * worth being able to see.
 */
export function partyByName(name, { distributors, dealers, retailers } = {}) {
  const wanted = String(name ?? '').trim().toLowerCase();
  if (!wanted) return { party: null, type: null };

  const tiers = [
    [distributors, 'Distributor'],
    [dealers, 'Dealer'],
    [retailers, 'Retailer'],
  ];
  for (const [list, type] of tiers) {
    const found = (list || []).find(p => String(p?.name ?? '').trim().toLowerCase() === wanted);
    if (found) return { party: found, type };
  }
  return { party: null, type: null };
}

/**
 * The drift between a stored balance and the ledger that should add up to it.
 *
 * Positive means the ledger says they owe more than the stored figure does.
 * Rounded to the rupee, because a balance out by half a paisa is float noise
 * rather than a correction worth making -- and offering to "correct" noise
 * trains people to click through the one that matters.
 */
export function balanceDrift(storedOutstanding, ledgerEntries = []) {
  const derived = ledgerEntries.length
    ? Number(ledgerEntries[ledgerEntries.length - 1]?.balance) || 0
    : 0;
  const stored = Number(storedOutstanding) || 0;
  // `|| 0` normalises negative zero. Math.round(-0.4) is -0, which compares
  // equal to 0 in arithmetic but not under Object.is -- so it passes the
  // needs-correcting check and then surprises anything that inspects it.
  return { derived, stored, drift: Math.round(derived - stored) || 0 };
}

/** Whether a balance is worth correcting at all. */
export function needsCorrection(storedOutstanding, ledgerEntries = []) {
  return balanceDrift(storedOutstanding, ledgerEntries).drift !== 0;
}
