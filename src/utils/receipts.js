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
 * Gap 19 (096): who may record a staff receipt, mirroring the database's
 * can_record_order_receipt. viewer = { id, role, level, managedUsers,
 * salesFull } where salesFull = Leads or SFA full. Status is checked by
 * canRecordReceipt; this is only "is it yours to record".
 */
export const RECEIPT_RECORDER_ROLES = ['Admin', 'Super Admin', 'Accounts', 'Warehouse Manager', 'Dispatch Team'];
export const RECEIPT_WITHDRAW_ROLES = ['Admin', 'Super Admin'];

export function mayRecordReceiptFor(order, viewer) {
  if (!order || !viewer?.id || viewer.level === 'partner') return false;
  if (RECEIPT_RECORDER_ROLES.includes(viewer.role)) return true;
  if (!viewer.salesFull) return false;
  const people = [order.assignedTo, order.createdBy].filter(Boolean);
  if (viewer.level === 'sales') return people.includes(viewer.id);
  if (viewer.level === 'manager') {
    const team = viewer.managedUsers || [];
    return people.some(p => p === viewer.id || team.includes(p));
  }
  return false;
}

/** Only the person who recorded it (by id), or Admin / Super Admin (096). */
export function mayWithdrawReceipt(order, viewer) {
  if (receiptSourceOf(order) !== 'staff' || !viewer?.id || viewer.level === 'partner') return false;
  if (RECEIPT_WITHDRAW_ROLES.includes(viewer.role)) return true;
  return Boolean(order.receiptRecordedById) && order.receiptRecordedById === viewer.id;
}

/**
 * What a partner is told: that a receipt is on the order, not which employee
 * recorded it or on what evidence (owner, 2026-10-13).
 */
export function partnerReceiptLabel(order) {
  const source = receiptSourceOf(order);
  if (!source) return null;
  return source === 'staff' ? 'Receipt recorded by our team' : 'Receipt confirmed';
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
