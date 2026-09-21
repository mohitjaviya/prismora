/**
 * Turning a form's idea of "nothing" into the database's.
 *
 * A React form initialises an optional select to `''`, because that is what an
 * unselected `<select>` holds and what the DOM will give back. A foreign key
 * reads `''` as a value like any other and goes looking for the row whose id is
 * the empty string. There is never such a row, so the whole statement is
 * refused:
 *
 *     insert or update on table "leads" violates foreign key constraint
 *     "fk_leads_territoryid" — Key is not present in table "territories".
 *
 * That is what happened to a lead saved with no territory. The field is
 * genuinely optional; `''` is not how the database spells optional. NULL is.
 *
 * WHY A RULE AND NOT A LIST
 *
 * Every foreign key in this schema is on a column whose name ends in `Id`:
 * territoryId, distributorId, dealerId, retailerId, parentDistributorId,
 * parentDealerId, schemeId, orderId, invoiceId, vendorId, beatId, userId, poId.
 * That is twenty-odd columns across fifteen tables, and a hand-kept list of them
 * would be wrong the first time somebody adds a key and does not think to come
 * here. The naming convention is the thing to lean on.
 *
 * `id` itself is untouched: it is lower-case, so it does not end in `Id`, and a
 * primary key quietly turning into NULL would be a far worse failure than the
 * one this fixes.
 */

/**
 * Whether a column holds a reference to another row.
 *
 * True for `territoryId` and `parentDealerId`, false for `id`, `gstin` and
 * `paid`. The capital I is the whole test — this schema names every foreign key
 * `somethingId` and nothing else ends that way.
 */
export const isIdColumn = (key) => /[a-z0-9]Id$/.test(String(key ?? ''));

/**
 * The same row, with blank references written as NULL.
 *
 * Only blanks are touched. A real id passes through untouched, and so does
 * every column that is not a reference — an empty `notes` or `city` is an empty
 * string on purpose, and turning those into NULL would change what the rest of
 * the application reads back.
 */
export function blankIdsToNull(row) {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return row;

  const out = { ...row };
  for (const key of Object.keys(out)) {
    if (!isIdColumn(key)) continue;
    const value = out[key];
    // `''` and `'   '` both mean "nothing chosen". A number or a real id is
    // left exactly as it came, including `0`, which is falsy and is not blank.
    if (typeof value === 'string' && value.trim() === '') out[key] = null;
  }
  return out;
}
