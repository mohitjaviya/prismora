/**
 * Settling an invoice, from either end.
 *
 * There were two buttons for one event and neither did the other's job.
 * "Mark as Paid" set the invoice status, which is what Accounting counts as
 * income, and left the partner's outstanding balance untouched. "Record
 * Payment" reduced the balance and left the invoice unpaid, so the money never
 * appeared as income. Pressing only the first meant chasing a partner for money
 * already banked; pressing only the second understated profit. Nothing said you
 * had to press both.
 *
 * These are the rules for making either one do the whole job, kept here so they
 * can be tested without a database and so the two directions cannot disagree.
 */

/** What an invoice is actually worth: the goods plus the tax on them. */
export const invoiceTotal = (inv) => (Number(inv?.amount) || 0) + (Number(inv?.tax) || 0);

/**
 * The payment row a settled invoice produces.
 *
 * Derived from the invoice rather than the clock, so marking the same invoice
 * paid twice is refused by the primary key instead of quietly crediting the
 * partner twice. `distributor_payments` has no invoiceId column, so this id is
 * also the only link back.
 */
export const paymentIdForInvoice = (invoiceId) => `PAY-INV-${invoiceId}`;

const norm = (s) => String(s ?? '').trim().toLowerCase();

/**
 * Whether an invoice belongs to a party.
 *
 * Same rule the ledger uses: the order it was raised against carries the link,
 * and a manually raised invoice with no order falls back to the name. Matching
 * on name alone orphaned every invoice the moment a party was renamed.
 */
export const invoiceBelongsToParty = (invoice, party, orders = []) => {
  if (!invoice || !party?.id) return false;

  // The invoice's own party id, where it has one. Nothing to resolve: an id
  // matches one party or none, and a partner renamed tomorrow still owns the
  // invoices raised today.
  const own = invoice.distributorId || invoice.dealerId || invoice.retailerId;
  if (own) return own === party.id;

  // Then the order it was raised from, which is also an id.
  const order = invoice.orderId ? orders.find(o => o?.id === invoice.orderId) : null;
  const linked = order && (order.distributorId || order.dealerId || order.retailerId);
  if (linked) return linked === party.id;

  // And last the spelling, for invoices raised before 025 and for anything
  // entered by hand against a typed name. This is the ambiguous one: a name
  // can match parties at two tiers, which is why partyForInvoice has an order
  // of precedence at all.
  return norm(invoice.customerName) === norm(party.name);
};

/**
 * The party id fields to write on an invoice for a given party.
 *
 * All three are returned, with the two that do not apply set to null, so an
 * invoice moved from one tier to another cannot keep the old link alongside
 * the new one.
 */
export const invoicePartyFields = (party, partyType) => {
  const blank = { distributorId: null, dealerId: null, retailerId: null };
  const field = paymentFieldFor(partyType);
  if (!party?.id || !field) return blank;
  return { ...blank, [field]: party.id };
};

/** The party id field that matches this kind of party record. */
export const paymentFieldFor = (partyType) => ({
  Distributor: 'distributorId',
  Dealer: 'dealerId',
  Retailer: 'retailerId',
}[partyType] || null);

/**
 * Which unpaid invoices a lump payment settles, oldest first.
 *
 * An invoice is only marked paid when the payment covers it in full. Marking a
 * half-covered invoice as Paid would book its whole value as income on money
 * that has not arrived, which is the more expensive of the two mistakes.
 *
 * It stops at the first invoice it cannot cover rather than skipping ahead to a
 * smaller later one: settling October while September is still open is not how
 * a ledger reads, and it would make the remainder impossible to explain.
 */
export const invoicesSettledBy = (amount, unpaidInvoices) => {
  let left = Number(amount) || 0;
  const settled = [];

  const ordered = [...(unpaidInvoices || [])].sort(
    (a, b) => new Date(a?.createdAt || 0) - new Date(b?.createdAt || 0),
  );

  for (const inv of ordered) {
    const total = invoiceTotal(inv);
    if (total <= 0) continue;          // nothing to settle; not a blocker
    if (left < total) break;           // cannot cover it, and will not skip past it
    left -= total;
    settled.push(inv);
  }

  return { settled, remainder: left };
};

/**
 * The balance after a payment.
 *
 * Allowed to go negative. It used to be floored at zero, so paying more than
 * was owed silently discarded the excess -- a partner who paid in advance had
 * that advance forgotten rather than carried. A negative balance is money the
 * business holds on their behalf, and saying so is the whole point of a ledger.
 */
export const balanceAfterPayment = (outstanding, amount) =>
  Math.round(((Number(outstanding) || 0) - (Number(amount) || 0)) * 100) / 100;

/** True when a payment is for more than the party currently owes. */
export const isOverpayment = (outstanding, amount) =>
  (Number(amount) || 0) > (Number(outstanding) || 0);

/**
 * Which party an invoice was raised against, and at which tier.
 *
 * Searched distributor, then dealer, then retailer, and the first match wins.
 * That order is not arbitrary and is not documented anywhere else: an invoice
 * whose customer name matches parties at two tiers is credited to the one
 * higher up the chain, and the other is never considered.
 *
 * Returns { party: null, type: null } for a walk-in sale, which has no ledger
 * to credit and must not be made to have one.
 */
export const partyForInvoice = (invoice, { distributors, dealers, retailers, orders } = {}) => {
  const tiers = [
    [distributors, 'Distributor'],
    [dealers, 'Dealer'],
    [retailers, 'Retailer'],
  ];
  for (const [list, type] of tiers) {
    const found = (list || []).find(party => invoiceBelongsToParty(invoice, party, orders || []));
    if (found) return { party: found, type };
  }
  return { party: null, type: null };
};

/**
 * The payment row written when an invoice is marked paid.
 *
 * `amount` is the invoice total -- goods plus tax -- because that is what the
 * partner was billed and what they will pay. Recording the net here is what
 * put the stored balance and the ledger out of step by exactly the GST, once
 * per invoice, and nobody could see it without adding the column up by hand.
 *
 * The id is derived from the invoice, so a second attempt writes the same row
 * rather than a second payment. The primary key refuses the duplicate; nothing
 * has to remember whether it already ran.
 */
export const settlementRowFor = (invoice, party, partyType, now = new Date().toISOString()) => {
  if (!invoice || !party || !partyType) return null;
  const field = paymentFieldFor(partyType);
  if (!field) return null;

  return {
    id: paymentIdForInvoice(invoice.id),
    [field]: party.id,
    amount: invoiceTotal(invoice),
    method: 'Invoice settled',
    reference: invoice.id,
    date: now,
    notes: `Recorded automatically when invoice ${invoice.id} was marked paid.`,
    recordedBy: null,
    createdAt: now,
  };
};

/**
 * Whether this invoice has already been settled into a payment.
 *
 * Asked of the payments themselves rather than of the invoice's status, so
 * that a status changed by some other path cannot make this answer wrong.
 */
export const alreadySettled = (invoiceId, payments = []) =>
  (payments || []).some(p => p?.id === paymentIdForInvoice(invoiceId));
