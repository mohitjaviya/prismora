/**
 * Who says the goods arrived, and how they know.
 *
 * Receipt could only ever be recorded by the customer, signed in to their own
 * portal: confirmOrderReceipt was reachable from the three portal order pages
 * and nowhere else. A customer created by staff has no login, so for them it
 * could never be recorded at all -- their delivered stock stayed "unconfirmed"
 * for ever, under a prompt telling them to confirm it on a page they cannot
 * open.
 *
 * Staff can now record it on their behalf. What matters is that the two stay
 * distinguishable: the customer saying "it arrived" and an employee saying
 * "they told me it arrived" are different claims, and a year later somebody
 * auditing a disputed delivery needs to know which one this was.
 */

/** Statuses where goods have left the warehouse, so receipt can be asserted. */
export const RECEIPTABLE_STATUSES = ['Shipped', 'Delivered'];

/** How an employee can come to know that a delivery landed. */
export const RECEIPT_EVIDENCE = [
  'Phone call',
  'WhatsApp confirmation',
  'Signed delivery note',
  'Driver proof of delivery',
  'Confirmed in person',
  'Other',
];

/**
 * 'partner' -- the customer confirmed it themselves, in their portal.
 * 'staff'   -- an employee recorded it for them, with evidence.
 * null      -- nobody has said it arrived.
 *
 * Orders confirmed before this existed carry no source; they came from the
 * portal, because that was the only way, so they read as 'partner'.
 */
export function receiptSourceOf(order) {
  if (!order?.receivedByDistributor) return null;
  return order.receiptSource === 'staff' ? 'staff' : 'partner';
}

/** Whether a receipt can still be recorded against this order. */
export function canRecordReceipt(order) {
  if (!order || order.receivedByDistributor) return false;
  return RECEIPTABLE_STATUSES.includes(order.status);
}

/**
 * One line saying who confirmed it and on what basis, for a badge or a tooltip.
 * Returns null when nothing has been recorded, so a caller can render nothing.
 */
export function describeReceipt(order) {
  const source = receiptSourceOf(order);
  if (!source) return null;
  if (source === 'partner') return 'Confirmed by the customer';

  const who = String(order.receiptRecordedBy || '').trim();
  const how = String(order.receiptEvidence || '').trim();
  const parts = ['Recorded by ' + (who || 'staff')];
  if (how) parts.push(how.toLowerCase());
  return parts.join(' — ');
}

/**
 * What a staff-recorded receipt needs before it can be saved.
 *
 * Evidence is required: a tick with nothing behind it is the thing this was
 * built to avoid, and is indistinguishable later from a guess.
 */
export function validateReceipt({ evidence, note } = {}) {
  const chosen = String(evidence || '').trim();
  if (!chosen) return { ok: false, error: 'Say how you know the delivery arrived.' };
  if (!RECEIPT_EVIDENCE.includes(chosen)) return { ok: false, error: 'Choose one of the listed kinds of evidence.' };
  if (chosen === 'Other' && !String(note || '').trim()) {
    return { ok: false, error: 'Describe the evidence, since it is not one of the listed kinds.' };
  }
  return { ok: true };
}
