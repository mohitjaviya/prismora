/**
 * An invoice's status, as the database derives it (migration 057).
 *
 *   Unpaid · Partially Paid · Settled · Overdue
 *
 * Settled is covered in full; Overdue is not settled and past its due date.
 * "amountPaid" is how much is covered. The database recalculates both from
 * payments and credit notes, and every night for Overdue — screens only read
 * them. "Paid" is the old name for Settled, still read as such.
 */
export const INVOICE_STATUSES = ['Unpaid', 'Partially Paid', 'Overdue', 'Settled'];

export const invoiceTotal = (inv) => (Number(inv?.amount) || 0) + (Number(inv?.tax) || 0);

export const isSettled = (inv) => inv?.status === 'Settled' || inv?.status === 'Paid';

export const isOpen = (inv) => !isSettled(inv);

/** Covered so far: the stored figure, or the whole invoice when settled without one. */
export const amountPaid = (inv) => {
  const stored = Number(inv?.amountPaid);
  if (Number.isFinite(stored) && stored > 0) return Math.min(stored, invoiceTotal(inv));
  return isSettled(inv) ? invoiceTotal(inv) : 0;
};

export const amountDue = (inv) => Math.max(0, Math.round((invoiceTotal(inv) - amountPaid(inv)) * 100) / 100);

/** Money received against these invoices: settled in full, and the paid part of the rest. */
export const collected = (invoices) => (invoices || []).reduce((s, i) => s + amountPaid(i), 0);

/** What is still owed on these invoices. */
export const outstanding = (invoices) => (invoices || []).reduce((s, i) => s + amountDue(i), 0);
