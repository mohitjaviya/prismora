/**
 * Who entered this record.
 *
 * Four tables already store it and no screen has ever shown it:
 * purchase_returns, vendor_payments, credit_notes and distributor_payments all
 * carry `recordedBy`, written faithfully by the forms and read by nothing. Two
 * more -- expenses and purchase_orders -- did not store it at all, which is why
 * "who added this expense?" had no answer short of the audit log.
 *
 * The column is not the same word everywhere, and renaming four tables to agree
 * would be a migration with nothing to show for itself. This resolves whichever
 * one a record happens to carry.
 *
 * `assignedTo` is deliberately not among them. On an expense it is who the
 * money is for, and on a purchase order it is who owns the order -- neither is
 * who typed it in, and showing one as the other would put the wrong name beside
 * somebody else's mistake.
 */

/**
 * The columns that mean "the person who entered this", best first.
 *
 * createdBy is 031's, and comes first because it is the one being written from
 * here on. The rest are what the older tables already had.
 */
const WHO_COLUMNS = ['createdBy', 'recordedBy', 'receivedBy'];

/** Rows the system books for itself rather than a person entering them. */
const AUTOMATIC_PREFIXES = ['EXP-INC-', 'EXP-CLM-', 'EXP-FLD-'];

/** The user id credited with entering a record, or null. */
export function recordedById(record) {
  if (!record) return null;
  for (const column of WHO_COLUMNS) {
    const value = String(record[column] ?? '').trim();
    if (value) return value;
  }
  return null;
}

/**
 * Whether a record was booked by the system rather than entered by somebody.
 *
 * Settling a claim, paying an incentive and approving a field expense each
 * write an expense row with a derived id, and no person typed it. Showing those
 * as "Unknown" would read as data lost rather than as a thing working properly.
 */
export function isAutomatic(record) {
  const id = String(record?.id ?? '');
  return AUTOMATIC_PREFIXES.some(prefix => id.startsWith(prefix));
}

/** A person's name from their id, falling back to the id itself. */
export function personName(users, id) {
  const wanted = String(id ?? '').trim();
  if (!wanted) return '';
  const found = (users || []).find(u => u?.id === wanted);
  if (found?.name) return found.name;
  // An id that matches nobody is shown as it is rather than as "Unknown". The
  // account has usually been deleted, and the id is the only thread left back
  // to who it was.
  return wanted;
}

/**
 * What to show in a "Recorded by" column.
 *
 * Returns { name, id, automatic }. `name` is always something printable, so a
 * caller never has to decide what a blank means.
 */
export function attributionFor(record, users = []) {
  if (isAutomatic(record)) {
    return { name: 'Booked automatically', id: null, automatic: true };
  }

  const id = recordedById(record);
  if (!id) {
    // Written before there was anywhere to record it. Saying so is more use
    // than an em dash, which reads as a value somebody failed to enter.
    return { name: 'Not recorded', id: null, automatic: false };
  }

  return { name: personName(users, id), id, automatic: false };
}

/** Everything a new record should carry about who is entering it. */
export function stampCreator(row, userId) {
  const id = String(userId ?? '').trim();
  if (!row || !id) return row;
  // Never overwritten. A form that already said who recorded something knows
  // better than this does -- a goods receipt names the person at the gate, who
  // is not always the person at the keyboard.
  if (recordedById(row)) return row;
  return { ...row, createdBy: id };
}
