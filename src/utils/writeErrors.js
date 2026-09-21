/**
 * Saying which value the database actually refused.
 *
 * PostgreSQL normally names it:
 *
 *     Key (territoryId)=(T-123) is not present in table "territories".
 *
 * Through PostgREST, under a role that cannot read the referenced table, it
 * redacts the value instead:
 *
 *     Key is not present in table "territories".
 *
 * That is the message this application has been showing people — a foreign key
 * complaint with the one useful fact removed. It is not recoverable from the
 * error, so it has to come from the payload that was sent.
 *
 * Every constraint here is named `fk_<table>_<column>`, lower-cased, by 021.
 * The older three predate that and use PostgreSQL's own `<table>_<column>_fkey`.
 * Both are handled by looking for a column name inside the constraint name
 * rather than trying to parse either shape.
 */

import { isIdColumn } from './dbRow';

/**
 * Which column of `row` a constraint is about, or null if it cannot be told.
 *
 * Compared case-insensitively because the constraint name is lower-case and
 * the column is camelCase. The longest match wins, so `fk_orders_dealerid`
 * picks `dealerId` and not some shorter column whose name is a substring of it.
 */
export function columnFromConstraint(constraintName, row = {}) {
  const name = String(constraintName ?? '').toLowerCase();
  if (!name) return null;

  const candidates = Object.keys(row || {})
    .filter(isIdColumn)
    .filter(key => name.includes(key.toLowerCase()))
    .sort((a, b) => b.length - a.length);

  return candidates[0] || null;
}

/** The constraint name out of a Postgres foreign-key message. */
export function constraintFromMessage(message) {
  const match = String(message ?? '').match(/violates foreign key constraint "([^"]+)"/i);
  return match ? match[1] : null;
}

/**
 * A sentence naming the column and the value that was refused.
 *
 * Returns null when this is not a foreign-key failure, or when the payload does
 * not explain it — in which case the caller keeps the message it already had.
 * Inventing a column would be worse than saying nothing.
 */
export function explainForeignKey(error, row) {
  if (error?.code !== '23503') return null;

  const constraint = constraintFromMessage(error?.message);
  if (!constraint) return null;

  const column = columnFromConstraint(constraint, row);
  if (!column) return null;

  const value = row[column];
  if (value === null || value === undefined) {
    // Worth saying plainly, because it should be impossible: a NULL reference
    // is not checked by a foreign key at all. Seeing this means the row that
    // reached the database was not the row being looked at here.
    return { column, value, text: `${column} was empty, which a foreign key does not check — so the value the database refused is not the one this browser sent.` };
  }

  return {
    column,
    value,
    text: `${column} was "${String(value)}", and there is no such record. Choose it again from the list — the one that was picked has probably been deleted.`,
  };
}
